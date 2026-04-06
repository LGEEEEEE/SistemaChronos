const { Empresa, User, Configuracao } = require('../models/db');
const bcrypt = require('bcryptjs');

// ==========================================
// RENDERIZAR TELA DE CADASTRO
// ==========================================
exports.renderCadastro = (req, res) => {
    // Se o usuário já estiver logado como RH, não faz sentido ele criar outra empresa
    if (req.session.userId && req.session.userRole === 'rh') {
        return res.redirect('/planos');
    }
    
    // Pega o IP do usuário para preencher o campo de sugestão de segurança
    let userIp = req.ip || req.connection.remoteAddress;
    if (userIp === '::1' || userIp === '::ffff:127.0.0.1') userIp = '127.0.0.1';

    res.render('empresa_cadastro', { 
        userIp,
        error: null,
        formData: {} // Garante que o form comece vazio
    });
};

// ==========================================
// PROCESSAR O CADASTRO (EMPRESA + RH)
// ==========================================
exports.cadastrarEmpresa = async (req, res) => {
    const { nomeEmpresa, cnpj, allowedIps, nomeAdmin, emailAdmin, senhaAdmin } = req.body;

    try {
        // 1. Verifica se o email já existe no sistema para evitar duplicidade
        const adminExistente = await User.findOne({ where: { email: emailAdmin } });
        if (adminExistente) {
            let userIp = req.ip || req.connection.remoteAddress;
            if (userIp === '::1' || userIp === '::ffff:127.0.0.1') userIp = '127.0.0.1';
            
            return res.render('empresa_cadastro', { 
                userIp,
                error: 'Este e-mail já está em uso por outro administrador. Faça login ou use outro e-mail.',
                formData: req.body // Devolve os dados para o usuário não ter que digitar tudo de novo
            });
        }

        // 2. Cria a Empresa no banco de dados
        // 'ativo' começa como false e 'dataVencimento' como null (esperando o pagamento)
        const novaEmpresa = await Empresa.create({
            nome: nomeEmpresa,
            cnpj: cnpj || null,
            ativo: false,
            dataVencimento: null 
        });

        // 3. Salva a configuração de IPs permitidos, se o usuário preencheu
        if (allowedIps && allowedIps.trim() !== '') {
            await Configuracao.create({
                chave: 'allowed_ips',
                valor: allowedIps.trim(),
                EmpresaId: novaEmpresa.id
            });
        }

        // 4. Cria a senha criptografada e o Usuário Admin (RH)
        const senhaHash = await bcrypt.hash(senhaAdmin, 10);
        
        const novoAdmin = await User.create({
            nome: nomeAdmin,
            email: emailAdmin,
            senha: senhaHash,
            role: 'rh',
            EmpresaId: novaEmpresa.id
        });

        // 5. MÁGICA DA SESSÃO: Autentica o usuário automaticamente
        req.session.userId = novoAdmin.id;
        req.session.empresaId = novaEmpresa.id;
        req.session.userRole = 'rh';

        // 6. O GRANDE SEGREDO DO FUNIL DE VENDAS (UX): 
        // Redireciona para os planos com a mensagem de sucesso!
        res.redirect('/planos?msg=conta_criada');

    } catch (error) {
        console.error('Erro Crítico ao cadastrar empresa:', error);
        
        let userIp = req.ip || req.connection.remoteAddress;
        if (userIp === '::1' || userIp === '::ffff:127.0.0.1') userIp = '127.0.0.1';

        res.status(500).render('empresa_cadastro', { 
            userIp,
            error: 'Ocorreu um erro interno ao criar sua conta. Verifique os dados e tente novamente.',
            formData: req.body
        });
    }
};