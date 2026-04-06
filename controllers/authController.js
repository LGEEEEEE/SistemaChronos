const { User } = require('../models/db');
const bcrypt = require('bcryptjs');

// ==========================================
// RENDERIZAR AS TELAS DE LOGIN
// ==========================================
exports.renderLoginFuncionario = (req, res) => {
    res.render('login', { error: req.query.erro, query: req.query });
};

exports.renderLoginRH = (req, res) => {
    res.render('rh_login', { error: req.query.erro, query: req.query });
};

// ==========================================
// PROCESSAR O LOGIN (INTELIGÊNCIA DE ROTEAMENTO)
// ==========================================
exports.loginFuncionario = async (req, res) => {
    await processarLogin(req, res, 'login');
};

exports.loginRH = async (req, res) => {
    await processarLogin(req, res, 'rh_login');
};

// Função central que processa qualquer login e joga o usuário pro lugar certo
async function processarLogin(req, res, telaOrigem) {
    try {
        const { email, senha } = req.body;
        
        // 1. Busca o usuário no banco
        const user = await User.findOne({ where: { email } });

        // 2. Se não achar ou a senha não bater, devolve o erro na tela que ele estava
        if (!user || !(await bcrypt.compare(senha, user.senha))) {
            return res.render(telaOrigem, { error: 'Erro: Email ou senha incorretos.' });
        }

        // 3. Autenticação Sucesso! Salva os dados na sessão
        req.session.userId = user.id;
        req.session.empresaId = user.EmpresaId;
        req.session.userRole = user.role;

        // 4. ROTEAMENTO MÁGICO BASEADO NO CARGO (ROLE)
        if (user.role === 'superadmin') {
            return res.redirect('/superadmin/dashboard'); // Dono do SaaS
        } else if (user.role === 'rh') {
            return res.redirect('/rh/dashboard'); // Dono da Empresa
        } else {
            return res.redirect('/dashboard'); // Peão
        }

    } catch (error) {
        console.error("Erro interno no login:", error);
        res.render(telaOrigem, { error: 'Erro interno do servidor. Tente novamente.' });
    }
}

// ==========================================
// LOGOUT
// ==========================================
exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
};