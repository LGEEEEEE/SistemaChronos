const webpush = require('web-push');
const { User } = require('../models/db'); 

// 1. Configuração do VAPID (As chaves de segurança)
// Você vai gerar essas chaves depois e colocar no seu arquivo .env
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

// Avisa aos servidores do Google/Mozilla quem está enviando a notificação
webpush.setVapidDetails(
    'mailto:sistemachronosapp@gmail.com', // Coloque um e-mail válido da sua empresa
    publicVapidKey,
    privateVapidKey
);

// 2. Rota que o Chrome do funcionário vai chamar para se inscrever
exports.salvarInscricao = async (req, res) => {
    try {
        const subscription = req.body;
        const userId = req.session.userId; // Pega o ID do funcionário logado

        if (!userId) {
            return res.status(401).json({ erro: 'Usuário não autenticado.' });
        }

        // Salva o objeto de inscrição (que o Chrome gerou) no banco de dados
        // Vamos precisar criar uma coluna 'pushSubscription' na tabela User
        await User.update(
            { pushSubscription: JSON.stringify(subscription) }, 
            { where: { id: userId } }
        );

        res.status(201).json({ sucesso: true, mensagem: 'Inscrição de notificação salva!' });
    } catch (error) {
        console.error('Erro ao salvar inscrição push:', error);
        res.status(500).json({ erro: 'Erro interno ao salvar inscrição.' });
    }
};

// 3. Função para disparar a notificação (Pode ser chamada pelo RH ou por um Cron Job)
exports.dispararNotificacao = async (req, res) => {
    try {
        const { userId, titulo, mensagem } = req.body;

        const funcionario = await User.findByPk(userId);

        if (!funcionario || !funcionario.pushSubscription) {
            return res.status(404).json({ erro: 'Funcionário não habilitou as notificações no Chrome.' });
        }

        // Transforma a string salva no banco de volta num objeto que o web-push entende
        const subscription = JSON.parse(funcionario.pushSubscription);

        // Monta o visual da notificação que vai pular na tela
        const payload = JSON.stringify({
            title: titulo || 'Chronos - Lembrete de Ponto',
            body: mensagem || 'Não se esqueça de registrar seu ponto agora!',
            icon: '/caminho/para/sua/logo.png', // Opcional: ícone do Chronos
            badge: '/caminho/para/seu/badge.png' // Opcional: ícone menorzinho
        });

        // Envia para o servidor do Chrome, que entrega pro usuário final
        await webpush.sendNotification(subscription, payload);

        res.status(200).json({ sucesso: true, mensagem: 'Notificação enviada!' });

    } catch (error) {
        console.error("Falha ao enviar push:", error);
        if (error.statusCode === 410) {
            // O código 410 significa que o usuário bloqueou a notificação ou limpou o cache do Chrome
            // Idealmente, você limpa a coluna no banco aqui para não tentar enviar de novo.
        }
        res.status(500).json({ erro: 'Falha técnica ao disparar notificação.' });
    }
};