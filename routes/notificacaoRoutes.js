// Arquivo: rotas/notificacaoRoutes.js
const express = require('express');
const router = express.Router();
const notificacaoController = require('../controllers/notificacaoController');
const { checarAutenticacao, checarAutorizacaoRH } = require('../middlewares/auth');

// ROTA TEMPORÁRIA PARA TESTE RÁPIDO
router.get('/notificacao/teste-agora', checarAutenticacao, async (req, res) => {
    // Simulamos o "body" da requisição como se alguém tivesse enviado um formulário
    req.body = {
        userId: req.session.userId, 
        titulo: "🚀 Teste do Chronos!",
        mensagem: "As notificações Web Push estão funcionando perfeitamente."
    };
    
    // Chamamos o seu controller diretamente
    await notificacaoController.dispararNotificacao(req, res);
});

// Rota que o Chrome chama para salvar a inscrição do usuário no banco.
// Qualquer usuário logado pode se inscrever.
router.post('/notificacao/inscrever', checarAutenticacao, notificacaoController.salvarInscricao);

// Rota para disparar a notificação.
// Aqui, estou assumindo que apenas o RH tem permissão para disparar notificações manuais.
router.post('/notificacao/disparar', checarAutenticacao, checarAutorizacaoRH, notificacaoController.dispararNotificacao);

module.exports = router;