// =================================================================
// REGRAS DE NEGÓCIO: CÁLCULOS E JORNADA
// Arquivo: controllers/calculosController.js
// =================================================================

function formatarMsParaHorasMinutos(ms) {
    if (ms <= 0) return '00h 00m';
    const horas = Math.floor(ms / 3600000);
    const minutos = Math.floor((ms % 3600000) / 60000);
    return `${horas.toString().padStart(2, '0')}h ${minutos.toString().padStart(2, '0')}m`;
}

function calcularHorasTrabalhadas(registros) {
    const registrosDoDia = registros || [];
    const entrada = registrosDoDia.find(r => r.tipo === 'Entrada');
    const saidaAlmoco = registrosDoDia.find(r => r.tipo === 'Saida Almoço');
    const voltaAlmoco = registrosDoDia.find(r => r.tipo === 'Volta Almoço');
    const saida = registrosDoDia.find(r => r.tipo === 'Saida');

    if (!entrada) return '00h 00m';
    if (!saida && !voltaAlmoco && !saidaAlmoco) return 'Jornada em aberto';

    let totalTrabalhadoMs = 0;
    const agora = new Date();
    const entradaTimestamp = new Date(entrada.timestamp);

    if (saidaAlmoco) {
        totalTrabalhadoMs += (new Date(saidaAlmoco.timestamp) - entradaTimestamp);
        if (voltaAlmoco) {
            const voltaAlmocoTimestamp = new Date(voltaAlmoco.timestamp);
            if (saida) {
                totalTrabalhadoMs += (new Date(saida.timestamp) - voltaAlmocoTimestamp);
            } else {
                totalTrabalhadoMs += (agora - voltaAlmocoTimestamp);
                return formatarMsParaHorasMinutos(totalTrabalhadoMs) + ' (parcial)';
            }
        }
        return formatarMsParaHorasMinutos(totalTrabalhadoMs);
    } else if (saida) {
        totalTrabalhadoMs = (new Date(saida.timestamp) - entradaTimestamp);
    } else {
        totalTrabalhadoMs = (agora - entradaTimestamp);
        return formatarMsParaHorasMinutos(totalTrabalhadoMs) + ' (parcial)';
    }
    return formatarMsParaHorasMinutos(totalTrabalhadoMs);
}

function getHorarioExpediente(usuario, data) {
    const horarioPadrao = { entrada: '09:00:00', saida: '18:00:00' };
    const horario = {
        entrada: usuario.horarioEntrada || horarioPadrao.entrada,
        saida: usuario.horarioSaida || horarioPadrao.saida
    };
    if (!(data instanceof Date && !isNaN(data))) return horario;

    // Regra de saída antecipada às sextas-feiras
    if (data.getDay() === 5) { 
        try {
            const [hE, mE, sE] = horario.entrada.split(':').map(Number);
            const dataEntrada = new Date();
            dataEntrada.setHours(hE, mE, sE || 0, 0);
            dataEntrada.setHours(dataEntrada.getHours() - 1);
            horario.entrada = dataEntrada.toTimeString().split(' ')[0];
        } catch (e) { }
        try {
            const [hS, mS, sS] = horario.saida.split(':').map(Number);
            const dataSaida = new Date();
            dataSaida.setHours(hS, mS, sS || 0, 0);
            dataSaida.setHours(dataSaida.getHours() - 1);
            horario.saida = dataSaida.toTimeString().split(' ')[0];
        } catch (e) { }
    }
    return horario;
}

module.exports = {
    calcularHorasTrabalhadas,
    formatarMsParaHorasMinutos,
    getHorarioExpediente
};