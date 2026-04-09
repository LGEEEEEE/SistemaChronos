const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { checarAutenticacao, checarAutorizacaoSuperAdmin } = require('../middlewares/auth');

// Aplica segurança máxima em todas as rotas do Super Admin
router.use(checarAutenticacao, checarAutorizacaoSuperAdmin);

// Rota para carregar o painel
router.get('/dashboard', superAdminController.renderDashboard);

// Rota para bloquear/desbloquear empresas
router.post('/empresa/:id/toggle-status', superAdminController.toggleEmpresaStatus);

// 🚀 A ROTA QUE PROVAVELMENTE ESTAVA FALTANDO!
router.post('/empresa/manual', superAdminController.cadastrarEmpresaManual);

module.exports = router;