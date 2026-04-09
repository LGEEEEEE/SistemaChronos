const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { Empresa } = require('../models/db');

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

exports.checkout = async (req, res) => {
    try {
        const token = (process.env.MP_ACCESS_TOKEN || '').trim();
        const client = new MercadoPagoConfig({ accessToken: token });
        const preference = new Preference(client);
        const { plano, empresaId } = req.body;

        const preco = plano === 'pro' ? 2.00 : 1.00;
        const titulo = plano === 'pro' ? 'Plano Profissional - Chronos' : 'Plano Starter - Chronos';
        const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').trim().replace(/\/$/, '');

        const response = await preference.create({
            body: {
                items: [
                    { id: plano, title: titulo, quantity: 1, unit_price: preco, currency_id: 'BRL' }
                ],
                // 🚀 AQUI ESTÁ A MÁGICA: Mandamos o ID e o Plano juntos, separados por ':::'
                external_reference: empresaId ? `${empresaId}:::${plano}` : 'sem_id_ainda',
                back_urls: {
                    success: `${baseUrl}/pagamento/sucesso`,
                    failure: `${baseUrl}/planos?msg=pagamento_falhou`,
                    pending: `${baseUrl}/rh/dashboard?msg=pagamento_pendente`
                },
                auto_return: 'approved',
                notification_url: `${baseUrl}/pagamento/webhook`
            }
        });

        res.json({ preferenceId: response.id, init_point: response.init_point });
    } catch (error) {
        console.error("Erro checkout:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};

exports.webhook = async (req, res) => {
    try {
        res.status(200).send('OK');
        const { type, action, data } = req.body;
        const paymentId = data?.id || req.query.id || req.query['data.id'];

        if ((type === 'payment' || action === 'payment.created') && paymentId) {
            const token = (process.env.MP_ACCESS_TOKEN || '').trim();
            const client = new MercadoPagoConfig({ accessToken: token });
            const payment = new Payment(client);
            const paymentData = await payment.get({ id: paymentId });

            if (paymentData.status === 'approved') {
                const referencia = paymentData.external_reference;

                if (referencia && referencia !== 'sem_id_ainda') {
                    // 🚀 AQUI RECEBEMOS DE VOLTA E SEPARAMOS!
                    const [empresaId, planoComprado] = referencia.split(':::');
                    const empresa = await Empresa.findByPk(empresaId);

                    if (empresa) {
                        const hoje = new Date();
                        const novaDataVencimento = new Date(hoje.setDate(hoje.getDate() + 30));

                        await empresa.update({
                            ativo: true,
                            dataVencimento: novaDataVencimento,
                            plano: planoComprado || 'starter' // 👈 Agora sim, salva no banco!
                        });
                        console.log(`✅ [SUCESSO] Empresa ${empresaId} fez upgrade para o plano ${planoComprado}!`);
                    }
                }
            }
        }
    } catch (error) { console.error("❌ Erro Webhook:", error); }
};

exports.verificarStatus = async (req, res) => {
    try {
        const empresaId = req.params.id;
        if (!empresaId) return res.json({ ativo: false, plano: null });

        const empresa = await Empresa.findByPk(empresaId);

        // 🚀 AGORA ELE DEVOLVE O PLANO TAMBÉM!
        res.json({
            ativo: empresa ? empresa.ativo : false,
            plano: empresa ? empresa.plano : 'starter'
        });
    } catch (error) {
        res.json({ ativo: false, plano: null });
    }
};

exports.sucesso = (req, res) => {
    res.send(`<!DOCTYPE html><html lang="pt-BR">
        <head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pagamento Aprovado - Chronos</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body class="d-flex align-items-center justify-content-center vh-100" style="background-color: #f4f6f9;">
        <div class="text-center bg-white p-5 rounded-4 shadow-lg" style="max-width: 500px; width: 100%;">
        <h1 style="font-size: 5rem; margin-bottom: 0;">✅</h1>
        <h2 class="fw-bold text-success mt-3">Pagamento Recebido!</h2>
        <p class="text-muted fs-5 mb-4">Sua assinatura foi ativada com sucesso. Você já pode acessar o sistema e gerenciar seus funcionários.</p><a href="/rh/login" class="btn btn-primary btn-lg fw-bold shadow-sm w-100">Fazer Login no Painel</a><p class="text-muted small mt-3">Você já pode fechar a guia do Mercado Pago.</p></div></body></html>`);
};