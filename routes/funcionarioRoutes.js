const express = require('express');
const router = express.Router();
const funcionarioController = require('../controllers/funcionarioController');

// Importação CORRETA do nosso middleware de upload (sem chaves!)
const upload = require('../middlewares/upload'); 

// Importa os seguranças
const { checarAutenticacao, restringirPorIP } = require('../middlewares/auth');

// Telas do Funcionário
router.get('/dashboard', checarAutenticacao, funcionarioController.renderDashboard);

// O endpoint de bater o ponto
router.post('/registrar', checarAutenticacao, restringirPorIP, upload.single('foto'), funcionarioController.registrarPonto);

// O extrato de horas
router.get('/meu_relatorio', checarAutenticacao, funcionarioController.renderMeuRelatorio);

module.exports = router;