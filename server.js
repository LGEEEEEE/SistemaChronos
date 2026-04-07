require('dotenv').config(); // <-- AGORA SIM, NA LINHA 1 ABSOLUTA!
process.env.TZ = 'America/Sao_Paulo'; // <-- A BALA DE PRATA DO FUSO HORÁRIO
// =================================================================
// INICIALIZAÇÃO DO SERVIDOR (ARQUITETURA MVC)
// =================================================================

// --- HACK PARA RODAR IA NO NODE 24 (WINDOWS) ---
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (request) {
    if (request === '@tensorflow/tfjs-node') return require('@tensorflow/tfjs');
    return originalRequire.apply(this, arguments);
};

// --- IMPORTAÇÕES GERAIS ---
const pagamentoRoutes = require('./routes/pagamentoRoutes');
const tf = require('@tensorflow/tfjs');
const faceapi = require('@vladmandic/face-api');
const { Canvas, Image, ImageData } = require('canvas');
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const pg = require('pg');
const PgStore = require('connect-pg-simple')(session);

// --- BANCO DE DADOS E ROTAS ---
const { sequelize, Empresa, User, Configuracao } = require('./models/db');
const authRoutes = require('./routes/authRoutes');
const funcionarioRoutes = require('./routes/funcionarioRoutes');
const rhRoutes = require('./routes/rhRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const empresaRoutes = require('./routes/empresaRoutes');

const app = express();
const port = process.env.PORT || 3000;

// =================================================================
// CONFIGURAÇÃO DO EXPRESS E SESSÃO
// =================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

if (process.env.NODE_ENV === 'production') {
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    app.use(session({
        store: new PgStore({ pool: pool, tableName: 'session' }),
        secret: process.env.SESSION_SECRET || 'segredo-padrao-super-forte',
        resave: false, saveUninitialized: false,
        cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
    }));
} else {
    // 🚀 MODO DEV: Sessão na memória RAM (Apaga sozinha toda vez que você reinicia o servidor!)
    app.use(session({
        secret: 'segredo-dev',
        resave: false, 
        saveUninitialized: false,
        cookie: { maxAge: 24 * 60 * 60 * 1000 }
    }));
}

// =================================================================
// LIGAÇÃO DAS ROTAS (A ordem é VITAL para o SaaS funcionar)
// =================================================================

// 1º NÍVEL: Totalmente Livre (Vitrine e Cadastro)
app.use('/', pagamentoRoutes); 
app.use('/empresa', empresaRoutes); 

// 2º NÍVEL: Autenticação (Login)
app.use('/', authRoutes);

// 3º NÍVEL: Áreas Protegidas
// 1º O VIP passa primeiro (Ninguém barra o dono do sistema)
app.use('/superadmin', superAdminRoutes); 

// 2º As rotas do peão
app.use('/', funcionarioRoutes); 

// 3º O leão de chácara do RH fica por último para pegar o resto
app.use('/', rhRoutes);          

// =================================================================
// FUNÇÕES DE INICIALIZAÇÃO
// =================================================================
async function iniciarSistema() {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'rh@empresa.com';
        const adminSenha = process.env.ADMIN_SENHA || 'senha123';

        let empresa = await Empresa.findOne();
        if (!empresa) {
            empresa = await Empresa.create({ nome: 'Empresa Matriz (Padrão)' });
            await Configuracao.bulkCreate([
                { chave: 'allowed_ips', valor: '', EmpresaId: empresa.id },
                { chave: 'duracao_almoco_minutos', valor: '60', EmpresaId: empresa.id }
            ]);
        }

        const [userAdmin] = await User.findOrCreate({
            where: { email: adminEmail },
            defaults: {
                nome: 'Admin RH',
                senha: await bcrypt.hash(adminSenha, 10),
                role: 'rh',
                EmpresaId: empresa.id
            }
        });

        if (userAdmin.EmpresaId !== empresa.id) await userAdmin.update({ EmpresaId: empresa.id, role: 'rh' });

        const [linhasAtualizadas] = await User.update(
            { EmpresaId: empresa.id },
            { where: { EmpresaId: null, role: 'funcionario' } }
        );
        if (linhasAtualizadas > 0) console.log(`[AUTO-FIX] 🚀 ${linhasAtualizadas} funcionário(s) resgatado(s)!`);

        const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'dono@sistema.com';
        const superAdminSenha = process.env.SUPER_ADMIN_SENHA || 'dono123';
        await User.findOrCreate({
            where: { email: superAdminEmail },
            defaults: {
                nome: 'LG (Super Admin)',
                senha: await bcrypt.hash(superAdminSenha, 10),
                role: 'superadmin',
                EmpresaId: empresa.id
            }
        });
    } catch (error) { console.error("Erro iniciarSistema:", error); }
}

async function criarTabelaDeSessaoSeNaoExistir() {
    if (process.env.NODE_ENV !== 'production') return;
    const query = `
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL
    ) WITH (OIDS=FALSE);
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid"); END IF; END; $$;
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `;
    try { await sequelize.query(query); } catch (error) { console.error('Erro tabela sessao:', error); }
}

async function carregarModelosIA() {
    const modelsPath = path.join(__dirname, 'models');
    console.log("Carregando modelos de IA de reconhecimento facial...");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
    console.log("Modelos de IA carregados com sucesso!");
}

// =================================================================
// START DO SERVIDOR
// =================================================================
(async () => {
    try {
        // CORREÇÃO: Desliga o alter se estiver usando o SQLite local para não perder dados
        const isProduction = process.env.NODE_ENV === 'production';
        await sequelize.sync({ alter: isProduction }); 
        
        console.log('DB Sincronizado.');
        await iniciarSistema();
        await criarTabelaDeSessaoSeNaoExistir();
        await carregarModelosIA();
        app.listen(port, () => {
            console.log(`🚀 Sistema rodando na porta ${port}`);
        });
    } catch (err) {
        console.error('Erro fatal DB:', err);
        process.exit(1);
    }
})();