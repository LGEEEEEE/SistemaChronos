const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 👇 A LINHA QUE FALTAVA (Importando o segurança do arquivo de middlewares)
const { checarAutenticacao } = require('../middlewares/auth');

// Rotas de Login e Logout
router.get('/login', authController.renderLoginFuncionario);
router.post('/login', authController.loginFuncionario);
router.get('/rh/login', authController.renderLoginRH);
router.post('/rh/login', authController.loginRH);
router.post('/logout', authController.logout);

// ==========================================
// Rotas da Política de Privacidade (LGPD)
// ==========================================
router.get('/termos', checarAutenticacao, authController.renderTermos);
router.post('/termos/aceitar', checarAutenticacao, authController.aceitarTermos);

module.exports = router;