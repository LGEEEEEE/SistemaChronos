const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');

router.get('/cadastrar', empresaController.renderCadastro);
router.post('/cadastrar', empresaController.cadastrarEmpresa);

module.exports = router;