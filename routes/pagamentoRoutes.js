const express = require('express');
const router = express.Router();
const pagamentoController = require('../controllers/pagamentoController');

// ==========================================
// A NOSSA NOVA LANDING PAGE (Página Inicial)
// ==========================================
router.get('/', (req, res) => {
    if (req.session.userId) {
        if (req.session.userRole === 'rh' || req.session.userRole === 'superadmin') {
            return res.redirect('/rh/dashboard');
        } else {
            return res.redirect('/dashboard');
        }
    }
    res.render('index'); 
});

// ==========================================
// PÁGINA DE PLANOS E CHECKOUT
// ==========================================
router.get('/planos', pagamentoController.renderPlanos); 

// Rotas do Mercado Pago
router.post('/pagamento/checkout', pagamentoController.checkout);
router.post('/pagamento/webhook', pagamentoController.webhook);

// 🚀 ROTA DO RADAR ATUALIZADA (Recebe o ID direto na URL)
router.get('/pagamento/status/:id', pagamentoController.verificarStatus);

// Rota da Tela de Sucesso
router.get('/pagamento/sucesso', pagamentoController.sucesso);

module.exports = router;