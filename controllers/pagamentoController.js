const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { Empresa } = require('../models/db');

// 1. Renderiza a página de planos (Landing Page)
exports.renderPlanos = async (req, res) => {
    if (req.session.userId && req.session.userRole === 'funcionario') {
        return res.redirect('/dashboard');
    }

    let empresaAtiva = false;
    if (req.session.empresaId) {
        const empresa = await Empresa.findByPk(req.session.empresaId);
        if (empresa) empresaAtiva = empresa.ativo;
    }
    
    res.render('planos', { 
        empresaId: req.session.empresaId || '', 
        userRole: req.session.userRole || 'visitante',
        empresaAtiva, 
        mpPublicKey: (process.env.MP_PUBLIC_KEY || '').trim(),
        query: req.query 
    });
};

// 2. Cria a intenção de pagamento e devolve o ID para o Frontend
exports.checkout = async (req, res) => {
    try {
        const token = (process.env.MP_ACCESS_TOKEN || '').trim();
        const client = new MercadoPagoConfig({ accessToken: token });
        const preference = new Preference(client);

        const { plano, empresaId } = req.body;

        const preco = plano === 'pro' ? 149.90 : 49.90;
        const titulo = plano === 'pro' ? 'Plano Profissional - Chronos' : 'Plano Starter - Chronos';

        const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').trim().replace(/\/$/, '');

        const response = await preference.create({
            body: {
                items: [
                    {
                        id: plano,
                        title: titulo,
                        quantity: 1,
                        unit_price: preco,
                        currency_id: 'BRL',
                    }
                ],
                external_reference: empresaId ? empresaId.toString() : 'sem_id_ainda', 
                back_urls: {
                    success: `${baseUrl}/pagamento/sucesso`,
                    failure: `${baseUrl}/planos?msg=pagamento_falhou`,
                    pending: `${baseUrl}/rh/dashboard?msg=pagamento_pendente`
                },
                auto_return: 'approved',
                notification_url: `${baseUrl}/pagamento/webhook` 
            }
        });

        res.json({ 
            preferenceId: response.id,
            init_point: response.init_point 
        });

    } catch (error) {
        console.error("Erro ao gerar link de pagamento:", error);
        res.status(500).json({ error: "Erro interno ao processar o checkout." });
    }
};

// 3. Webhook (A magia que liberta o sistema automaticamente)
exports.webhook = async (req, res) => {
    try {
        res.status(200).send('OK');

        const { type, action, data } = req.body;
        const paymentId = data?.id || req.query.id || req.query['data.id'];

        if ((type === 'payment' || action === 'payment.created') && paymentId) {
            console.log(`[WEBHOOK] Investigando pagamento ID: ${paymentId}...`);
            
            const token = (process.env.MP_ACCESS_TOKEN || '').trim();
            const client = new MercadoPagoConfig({ accessToken: token });
            const payment = new Payment(client);

            const paymentData = await payment.get({ id: paymentId });

            if (paymentData.status === 'approved') {
                const empresaId = paymentData.external_reference;

                if (empresaId && empresaId !== 'sem_id_ainda') {
                    const empresa = await Empresa.findByPk(empresaId);
                    
                    if (empresa) {
                        const hoje = new Date();
                        const novaDataVencimento = new Date(hoje.setDate(hoje.getDate() + 30));

                        await empresa.update({
                            ativo: true,
                            dataVencimento: novaDataVencimento
                        });

                        console.log(`✅ [SUCESSO] Empresa ${empresaId} pagou! Acesso liberado até ${novaDataVencimento.toLocaleDateString('pt-BR')}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error("❌ Erro ao processar Webhook:", error);
    }
};

// 4. VERIFICAR STATUS (RADAR À PROVA DE FALHAS)
exports.verificarStatus = async (req, res) => {
    try {
        // Pega o ID diretamente da URL em vez da sessão!
        const empresaId = req.params.id; 
        
        if (!empresaId) return res.json({ ativo: false });
        
        const empresa = await Empresa.findByPk(empresaId);
        res.json({ ativo: empresa ? empresa.ativo : false });
    } catch (error) {
        res.json({ ativo: false });
    }
};

// 5. TELA DE FEEDBACK DE SUCESSO
exports.sucesso = (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pagamento Aprovado - Chronos</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body class="d-flex align-items-center justify-content-center vh-100" style="background-color: #f4f6f9;">
            <div class="text-center bg-white p-5 rounded-4 shadow-lg" style="max-width: 500px; width: 100%;">
                <h1 style="font-size: 5rem; margin-bottom: 0;">✅</h1>
                <h2 class="fw-bold text-success mt-3">Pagamento Recebido!</h2>
                <p class="text-muted fs-5 mb-4">Sua assinatura foi ativada com sucesso. Você já pode acessar o sistema e gerenciar seus funcionários.</p>
                <a href="/rh/login" class="btn btn-primary btn-lg fw-bold shadow-sm w-100">Fazer Login no Painel</a>
                <p class="text-muted small mt-3">Você já pode fechar a guia do Mercado Pago.</p>
            </div>
        </body>
        </html>
    `);
};