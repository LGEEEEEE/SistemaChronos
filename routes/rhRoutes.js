const express = require('express');
const router = express.Router();
const rhController = require('../controllers/rhController');
const upload = require('../middlewares/upload');

// 👇 IMPORTAÇÃO CENTRALIZADA (Corrigida para evitar o SyntaxError)
const { 
    checarAutenticacao, 
    checarAutorizacaoRH, 
    checarStatusEmpresa, 
    checarTermos 
} = require('../middlewares/auth');

// Aplica os 4 seguranças em TODAS as rotas do RH daqui para baixo
// O 'checarTermos' garante que o RH também aceite a LGPD antes de usar o painel
router.use(checarAutenticacao, checarAutorizacaoRH, checarStatusEmpresa, checarTermos);

// Dashboard Principal
router.get('/rh/dashboard', rhController.renderDashboard);

// ==========================================
// Gestão de Funcionários
// ==========================================
router.get('/cadastro', rhController.renderCadastro); 
router.post('/cadastro', upload.single('fotoReferencia'), rhController.cadastrarFuncionario); 

router.post('/rh/funcionario/deletar/:id', rhController.deletarFuncionario);
router.get('/rh/funcionario/editar/:id', rhController.renderEditarFuncionario);
router.post('/rh/funcionario/editar/:id', upload.single('fotoReferencia'), rhController.editarFuncionario);

// Ações Rápidas da Dashboard (Férias e Horários)
router.post('/rh/funcionario/:id/horario', rhController.definirHorario);
router.post('/rh/funcionario/ferias', rhController.agendarFerias);

// ==========================================
// Ajuste Manual e Exclusão de Ponto
// ==========================================
router.get('/rh/registro-manual/:id', rhController.renderRegistroManual);
router.post('/rh/registro-manual/:id', rhController.salvarRegistroManual);
router.post('/rh/registro-ponto/excluir/:id', rhController.excluirRegistroPonto);

// ==========================================
// ROTAS DA EMPRESA
// ==========================================
router.get('/rh/empresa', rhController.renderEditarEmpresa);
router.post('/rh/empresa/editar', rhController.editarEmpresa);
router.post('/rh/empresa/logo', upload.single('logo'), rhController.atualizarLogo);

// ==========================================
// Relatórios e PDF
// ==========================================
router.get('/rh/relatorios', rhController.renderRelatorios);
router.get('/rh/relatorios/download', rhController.downloadRelatorioCsv);
router.get('/rh/relatorios/folha-ponto', rhController.renderFolhaPonto);
router.get('/rh/relatorios/folha-ponto/pdf', rhController.downloadFolhaPontoPdf);

module.exports = router;