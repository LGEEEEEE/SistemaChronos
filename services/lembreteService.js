const cron = require('node-cron');
const { User, sequelize, Op } = require('../models/db');
const webpush = require('web-push');

// Configuração do Web Push (mesma do seu controller)
webpush.setVapidDetails(
    'mailto:sistemachronosapp@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// Função para enviar a notificação
async function enviarPush(usuario, titulo, mensagem) {
    if (!usuario.pushSubscription) return;
    try {
        const subscription = JSON.parse(usuario.pushSubscription);
        const payload = JSON.stringify({ title: titulo, body: mensagem });
        await webpush.sendNotification(subscription, payload);
        console.log(`🔔 Lembrete enviado para: ${usuario.nome}`);
    } catch (error) {
        console.error(`❌ Erro ao enviar para ${usuario.nome}:`, error.statusCode);
    }
}

// Agendamento: Roda a cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
    const agora = new Date();
    const horaAtual = agora.getHours().toString().padStart(2, '0');
    const minutoAtual = agora.getMinutes().toString().padStart(2, '0');
    const horarioFormatado = `${horaAtual}:${minutoAtual}`;

    console.log(`[CRON] Checando lembretes para ${horarioFormatado}...`);

    try {
        const usuarios = await User.findAll({ 
            where: { pushSubscription: { [Op.ne]: null } } 
        });

        usuarios.forEach(user => {
            if (user.horarioEntrada && user.horarioSaida) {
                // Separa horas e minutos da entrada
                const [hEntrada, mEntrada] = user.horarioEntrada.split(':');
                const horaE = parseInt(hEntrada);
                
                // 1. Lembrete de Entrada (1 hora antes da entrada)
                const lembreteEntrada = (horaE - 1).toString().padStart(2, '0');
                if (horarioFormatado === `${lembreteEntrada}:${mEntrada}`) {
                    enviarPush(user, "Chronos: Bom dia!", "Falta 1 hora para iniciar o seu turno. Não se esqueça de picar o ponto.");
                }

                // 2. Lembrete de Saída para Almoço (Assumimos 4h após a entrada. O lembrete é 1 hora antes)
                // Exemplo: Entra às 8h, almoça às 12h. Lembrete às 11h. (8 + 4 - 1 = 11)
                const lembreteAlmoco = (horaE + 3).toString().padStart(2, '0');
                if (horarioFormatado === `${lembreteAlmoco}:${mEntrada}`) {
                    enviarPush(user, "Chronos: Quase na hora de almoço!", "Não se esqueça de bater o ponto antes de sair.");
                }

                // 3. Lembrete de Regresso do Almoço (Assumimos 1h de almoço. Ex: Sai às 12h, volta às 13h)
                // Vamos enviar o lembrete 10 minutos antes dele ter de voltar!
                // Para simplificar, enviamos exatamente na hora do início do almoço, que dá 1h de aviso.
                const lembreteVolta = (horaE + 4).toString().padStart(2, '0');
                if (horarioFormatado === `${lembreteVolta}:${mEntrada}`) {
                    enviarPush(user, "Chronos: Aproveite a pausa!", "Lembre-se de bater o ponto quando regressar do almoço (daqui a 1 hora).");
                }

                // 4. Lembrete de Fim de Expediente (1 hora antes da saída)
                const [hSaida, mSaida] = user.horarioSaida.split(':');
                const lembreteSaida = (parseInt(hSaida) - 1).toString().padStart(2, '0');
                if (horarioFormatado === `${lembreteSaida}:${mSaida}`) {
                    enviarPush(user, "Chronos: Fim de turno a chegar!", "Falta 1 hora para o fim do expediente. Lembre-se de registar a saída.");
                }
            }
        });
    } catch (error) {
        console.error("Erro no Cron Job:", error);
    }
});