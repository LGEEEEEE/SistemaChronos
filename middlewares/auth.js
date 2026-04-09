// =================================================================
// MIDDLEWARES DE SEGURANÇA E AUTENTICAÇÃO
// Arquivo: middlewares/auth.js
// =================================================================

// Importamos os modelos necessários do nosso novo arquivo de base de dados
const { User, Empresa, Configuracao } = require('../models/db');

// --- 1. VERIFICAÇÃO DE SESSÃO BÁSICA ---
function checarAutenticacao(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}
async function checarTermos(req, res, next) {
    try {
        const user = await User.findByPk(req.session.userId);
        if (!user) return res.redirect('/login');

        // Se o usuário ainda não aceitou os termos, joga ele para a tela da LGPD
        if (!user.termosAceitos) {
            return res.redirect('/termos');
        }

        next();
    } catch (error) {
        res.status(500).send("Erro ao validar política de privacidade.");
    }
}

// --- 2. AUTORIZAÇÃO DE RECURSOS HUMANOS (RH) ---
async function checarAutorizacaoRH(req, res, next) {
    try {
        const user = await User.findByPk(req.session.userId, { include: Empresa });
        if (user && user.role === 'rh') {
            if (user.EmpresaId === req.session.empresaId) {
                next();
            } else {
                req.session.destroy(() => {
                    res.status(403).render('erro_generico', {
                        titulo: 'Sessão Inválida',
                        mensagem: 'A sua sessão de empresa foi corrompida ou alterada. Por favor, inicie sessão novamente.',
                        voltarLink: '/rh/login'
                    });
                });
            }
        } else {
            res.status(403).render('erro_generico', {
                titulo: 'Acesso Negado',
                mensagem: 'A sua sessão atual não tem permissão de administrador. Se iniciou sessão como colaborador noutra aba, a sua sessão de RH foi terminada.',
                voltarLink: '/rh/login'
            });
        }
    } catch (e) {
        res.status(500).render('erro_generico', {
            titulo: 'Erro Interno',
            mensagem: 'Ocorreu um erro ao verificar as suas permissões no sistema.',
            voltarLink: '/'
        });
    }
}

// --- 3. AUTORIZAÇÃO DO SUPER ADMIN (SAAS) ---
async function checarAutorizacaoSuperAdmin(req, res, next) {
    try {
        const user = await User.findByPk(req.session.userId);
        if (user && user.role === 'superadmin') {
            next();
        } else {
            res.status(403).render('erro_generico', {
                titulo: 'Acesso Restrito',
                mensagem: 'Área de segurança máxima. Apenas o administrador do sistema pode aceder a esta rota.',
                voltarLink: '/'
            });
        }
    } catch (error) {
        res.status(500).render('erro_generico', {
            titulo: 'Erro Interno',
            mensagem: 'Ocorreu um erro ao verificar as permissões master.',
            voltarLink: '/'
        });
    }
}

// --- 4. RESTRIÇÃO E VALIDAÇÃO POR IP ---
async function restringirPorIP(req, res, next) {
    try {
        console.log(`[DEBUG IP] Iniciando verificação para UserID: ${req.session.userId}`);

        // 1. Tenta pegar da sessão
        let empresaId = req.session.empresaId;

        // 2. AUTO-CORREÇÃO: Se não tiver na sessão, busca no Banco
        if (!empresaId && req.session.userId) {
            console.warn("[DEBUG IP] EmpresaId não encontrado na sessão. Tentando recuperar do Banco...");
            const user = await User.findByPk(req.session.userId);

            if (user && user.EmpresaId) {
                req.session.empresaId = user.EmpresaId; // Salva na sessão para a próxima
                empresaId = user.EmpresaId;
                console.log(`[DEBUG IP] Recuperado com sucesso! EmpresaId: ${empresaId}`);
            } else {
                console.error("[DEBUG IP] ERRO CRÍTICO: Usuário existe mas não tem Empresa vinculada no BD.");
            }
        }

        // 3. Se ainda assim não tiver empresa, falha
        if (!empresaId) {
            console.error("[DEBUG IP] Falha total. Redirecionando para login.");
            return req.session.destroy(() => {
                res.redirect('/login?erro=sessao_invalida_sem_empresa');
            });
        }

        // 4. Busca Configuração de IP
        const configIp = await Configuracao.findOne({
            where: { chave: 'allowed_ips', EmpresaId: empresaId }
        });

        // Se não há configuração de IP ou está vazia, permite o acesso
        if (!configIp || !configIp.valor || configIp.valor.trim() === '') {
            console.log("[DEBUG IP] Sem restrição de IP configurada. Acesso liberado.");
            return next();
        }

        // 5. Validação do IP
        const allowedIps = configIp.valor.split(',').map(ip => ip.trim()).filter(ip => ip);
        const userIp = req.ip;
        // Adiciona ::1 e 127.0.0.1 para garantir que local funcione
        const devIps = ['::1', '127.0.0.1', '::ffff:127.0.0.1'];

        console.log(`[DEBUG IP] IP do Usuário: ${userIp} | IPs Permitidos: ${allowedIps.join(', ')}`);

        const isDev = process.env.NODE_ENV !== 'production';
        const ipPermitido = allowedIps.includes(userIp);
        const isLocalhost = devIps.includes(userIp);

        if (ipPermitido || (isDev && isLocalhost)) {
            next(); // SUCESSO
        } else {
            console.warn(`[DEBUG IP] BLOQUEADO. IP ${userIp} não está na lista.`);
            res.status(403).render('erro_generico', {
                titulo: 'Acesso Negado por Rede',
                mensagem: `O registo de ponto não é permitido a partir desta localização (${userIp}).`,
                voltarLink: '/dashboard'
            });
        }
    } catch (error) {
        console.error("Erro CRÍTICO ao verificar restrição de IP:", error);
        res.status(500).render('erro_generico', {
            titulo: 'Erro Interno',
            mensagem: 'Falha ao verificar permissão de acesso pela rede.',
            voltarLink: '/dashboard'
        });
    }
}

// --- 5. VERIFICAÇÃO DE STATUS DA EMPRESA (SAAS POR VENCIMENTO) ---
async function checarStatusEmpresa(req, res, next) {
    try {
        const empresaId = req.session.empresaId;
        if (!empresaId) return next(); // Sem empresa na sessão, segue o jogo

        const empresa = await Empresa.findByPk(empresaId);
        if (!empresa) return next();

        // 🛡️ IMUNIDADE DA MATRIZ: A empresa 1 (A sua) nunca é bloqueada!
        if (empresa.id === 1) {
            return next();
        }

        const hoje = new Date();
        const vencimento = empresa.dataVencimento ? new Date(empresa.dataVencimento) : new Date(0); // Se nulo, venceu em 1970

        // 🛑 LÓGICA DE BLOQUEIO (VENCIDO)
        if (hoje > vencimento) {
            if (req.session.userRole === 'rh') {
                return res.redirect('/planos?erro=assinatura_pendente');
            } else {
                return res.status(403).render('erro_generico', {
                    titulo: 'Acesso Suspenso',
                    mensagem: 'O acesso da sua empresa está temporariamente suspenso. Por favor, contacte o seu RH.',
                    voltarLink: '/login'
                });
            }
        }

        // ⚠️ LÓGICA DE AVISO (FALTAM 5 DIAS OU MENOS)
        const umDiaEmMs = 1000 * 60 * 60 * 24;
        const diferencaDias = Math.ceil((vencimento - hoje) / umDiaEmMs);

        if (diferencaDias <= 5 && req.session.userRole === 'rh') {
            // Cria uma variável local que o EJS vai conseguir ler em qualquer tela
            res.locals.avisoVencimento = diferencaDias;
        }

        next();
    } catch (error) {
        res.status(500).send('Erro ao verificar status da conta.');
    }
}

// Exportamos tudo para ser usado nas rotas
module.exports = {
    checarAutenticacao,
    checarAutorizacaoRH,
    checarAutorizacaoSuperAdmin,
    restringirPorIP,
    checarStatusEmpresa, // AQUI ESTÁ O GUARDIÃO EXPORTADO!
    checarTermos
};