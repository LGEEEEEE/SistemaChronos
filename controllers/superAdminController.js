const { Empresa, User } = require('../models/db');
const bcrypt = require('bcryptjs');

exports.renderDashboard = async (req, res) => {
    try {
        // Busca as empresas e conta APENAS quem é 'funcionario'
        const empresas = await Empresa.findAll({
            include: [{
                model: User,
                attributes: ['id', 'role'],
                where: { role: 'funcionario' }, // 👈 O FILTRO CIRÚRGICO!
                required: false // 👈 Importante: Faz a empresa aparecer na lista mesmo se tiver 0 funcionários
            }],
            order: [['createdAt', 'DESC']]
        });

        res.render('superadmin_dashboard', { empresas, query: req.query });
    } catch (error) {
        console.error("Erro no dashboard superadmin:", error);
        res.status(500).render('erro_generico', { titulo: 'Erro', mensagem: 'Falha ao carregar matriz de empresas.', voltarLink: '/' });
    }
};

exports.toggleEmpresaStatus = async (req, res) => {
    try {
        const empresaId = req.params.id;
        const empresa = await Empresa.findByPk(empresaId);

        if (!empresa) return res.status(404).send('Empresa não encontrada.');

        if (empresa.id === 1) {
            return res.status(403).send('A Empresa Matriz não pode ser bloqueada.');
        }

        await empresa.update({ ativo: !empresa.ativo });
        res.redirect('/superadmin/dashboard?msg=status_alterado');
    } catch (error) {
        res.status(500).send("Erro ao alterar o status.");
    }
};

// =========================================================
// O PODER DE DEUS: CADASTRO MANUAL DE CLIENTES ENTERPRISE
// =========================================================
exports.cadastrarEmpresaManual = async (req, res) => {
    try {
        console.log("📥 DADOS RECEBIDOS DO FORMULÁRIO:", req.body); // Vai mostrar no terminal o que chegou

        if (!req.body || Object.keys(req.body).length === 0) {
            throw new Error("O formulário chegou vazio no servidor. Verifique o body-parser no app.js.");
        }

        const { nomeEmpresa, cnpj, emailAdmin, senhaAdmin, limite, valor, planoNome, diasVencimento } = req.body;

        // 🛑 GATEKEEPER 1: Verifica se o e-mail já existe
        const emailExiste = await User.findOne({ where: { email: emailAdmin } });
        if (emailExiste) {
            return res.send(`<script>alert('⚠️ Erro: O e-mail "${emailAdmin}" já está sendo usado!'); window.history.back();</script>`);
        }

        // 🛑 GATEKEEPER 2: Verifica se o CNPJ já está cadastrado
        if (cnpj && cnpj.trim() !== '') {
            const cnpjExiste = await Empresa.findOne({ where: { cnpj: cnpj.trim() } });
            if (cnpjExiste) {
                return res.send(`<script>alert('⚠️ Erro: O CNPJ "${cnpj}" já está cadastrado!'); window.history.back();</script>`);
            }
        }

        // 1. Cria a Empresa
        const novaEmpresa = await Empresa.create({
            nome: nomeEmpresa,
            cnpj: cnpj && cnpj.trim() !== '' ? cnpj.trim() : null,
            plano: planoNome || 'enterprise',
            limiteFuncionarios: parseInt(limite) || 5,
            valorMensalidade: parseFloat(valor) || 0,
            ativo: true,
            dataVencimento: new Date(new Date().setDate(new Date().getDate() + (parseInt(diasVencimento) || 30)))
        });

        // 2. Cria o usuário RH
        const senhaHash = await bcrypt.hash(senhaAdmin || 'Mudar123', 10);
        await User.create({
            nome: `Admin ${nomeEmpresa}`,
            email: emailAdmin,
            senha: senhaHash,
            role: 'rh',
            EmpresaId: novaEmpresa.id,
            termosAceitos: true
        });

        res.redirect('/superadmin/dashboard?msg=empresa_manual_ok');
        
    } catch (error) {
        // ❌ O SEGREDO ESTÁ AQUI: Agora ele NÃO te joga pra tela genérica, ele te mostra o erro na cara!
        console.error("❌ ERRO TÉCNICO NO CADASTRO MANUAL:", error);
        res.send(`<script>alert('❌ Erro no Servidor: ${error.message}'); window.history.back();</script>`);
    }
};