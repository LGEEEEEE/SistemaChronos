const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Rotas de Login e Logout
router.get('/login', authController.renderLoginFuncionario);
router.post('/login', authController.loginFuncionario);
router.get('/rh/login', authController.renderLoginRH);
router.post('/rh/login', authController.loginRH);
router.post('/logout', authController.logout);

module.exports = router;