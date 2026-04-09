const express = require('express');
const router = express.Router();
const funcionarioController = require('../controllers/funcionarioController');

const upload = require('../middlewares/upload'); 

// 🚀 AQUI ESTAVA FALTANDO IMPORTAR O 'checarStatusEmpresa'
const { checarAutenticacao, restringirPorIP, checarTermos, checarStatusEmpresa } = require('../middlewares/auth');

// Adicionamos o 'checarStatusEmpresa' no meio de TODAS as rotas do funcionário
router.get('/dashboard', checarAutenticacao, checarStatusEmpresa, checarTermos, funcionarioController.renderDashboard);

router.get('/meu_relatorio', checarAutenticacao, checarStatusEmpresa, checarTermos, funcionarioController.renderMeuRelatorio);

router.post('/registrar', checarAutenticacao, checarStatusEmpresa, checarTermos, restringirPorIP, upload.single('foto'), funcionarioController.registrarPonto);

module.exports = router;