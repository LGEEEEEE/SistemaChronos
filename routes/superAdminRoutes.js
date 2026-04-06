const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { checarAutenticacao, checarAutorizacaoSuperAdmin } = require('../middlewares/auth');

// Aplica segurança máxima em todas as rotas do Super Admin
router.use(checarAutenticacao, checarAutorizacaoSuperAdmin);

router.get('/dashboard', superAdminController.renderDashboard);
router.post('/empresa/:id/toggle-status', superAdminController.toggleEmpresaStatus);

module.exports = router;