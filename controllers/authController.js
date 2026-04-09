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

        // 1. Busca o usuário E a Empresa dele
        const { Empresa } = require('../models/db'); // Garante que a Empresa está importada
        const user = await User.findOne({
            where: { email },
            include: [{ model: Empresa }] // Traz os dados da empresa junto!
        });

        // 2. Se não achar ou a senha não bater
        if (!user || !(await bcrypt.compare(senha, user.senha))) {
            return res.render(telaOrigem, { error: 'E-mail ou senha incorretos.' });
        }

        // 🛑 A TRAVA NOVA: Se a empresa não estiver ativa, bloqueia na hora!
        if (user.Empresa && !user.Empresa.ativo) {
            return res.render(telaOrigem, { error: 'O acesso da sua empresa está suspenso. Procure o seu RH.' });
        }

        // 3. Cria a sessão
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.empresaId = user.EmpresaId;

        // 4. Redirecionamento
        if (user.role === 'funcionario') {
            return res.redirect('/dashboard');
        } else if (user.role === 'rh') {
            return res.redirect('/rh/dashboard');
        } else if (user.role === 'superadmin') {
            return res.redirect('/superadmin/dashboard');
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

// ==========================================
// POLÍTICA DE PRIVACIDADE E LGPD
// ==========================================
exports.renderTermos = async (req, res) => {
    try {
        const user = await User.findByPk(req.session.userId);
        // Se ele já aceitou e tentou forçar a rota pela URL, manda ele de volta pro dashboard
        if (user && user.termosAceitos) {
            return res.redirect(req.session.userRole === 'funcionario' ? '/dashboard' : '/rh/dashboard');
        }
        res.render('termos', { user });
    } catch (error) {
        console.error("Erro ao renderizar termos:", error);
        res.status(500).send("Erro interno ao carregar a política de privacidade.");
    }
};

exports.aceitarTermos = async (req, res) => {
    try {
        await User.update({ termosAceitos: true }, { where: { id: req.session.userId } });
        res.redirect(req.session.userRole === 'funcionario' ? '/dashboard' : '/rh/dashboard');
    } catch (error) {
        console.error("Erro ao aceitar termos:", error);
        res.status(500).send("Erro ao processar o aceite.");
    }
};