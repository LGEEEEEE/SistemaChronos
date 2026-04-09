const { User, Empresa, RegistroPonto, Ferias, Configuracao, Op } = require('../models/db');
const faceapi = require('@vladmandic/face-api');
const sharp = require('sharp');
const { Image } = require('canvas');
const { calcularHorasTrabalhadas, getHorarioExpediente } = require('./calculosController');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURAÇÃO SUPABASE ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) console.warn("ATENÇÃO: Supabase não configurado. Uploads do RH falharão.");

// --- CONFIGURAÇÃO PUPPETEER (PARA PDF) ---
let puppeteer;
let chromiumArgs = {};
(async () => {
    if (process.env.NODE_ENV === 'production') {
        puppeteer = require('puppeteer-core');
        const chromium = require('@sparticuz/chromium');
        chromiumArgs = { args: chromium.args, executablePath: await chromium.executablePath(), headless: chromium.headless };
    } else {
        puppeteer = require('puppeteer');
    }
})();

// =================================================================
// FUNÇÕES DA DASHBOARD E CONFIGURAÇÕES
// =================================================================

exports.renderDashboard = async (req, res) => {
    try {
        const { empresaId } = req.session;
        const todosUsuarios = await User.findAll({ where: { role: { [Op.in]: ['funcionario', 'rh'] }, EmpresaId: empresaId }, order: [['nome', 'ASC']] });
        const hoje = new Date();
        const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
        const fimDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

        const idsDosFuncionarios = todosUsuarios.map(u => u.id);
        let registrosDeHoje = [], todasFerias = [];

        if (idsDosFuncionarios.length > 0) {
            [registrosDeHoje, todasFerias] = await Promise.all([
                RegistroPonto.findAll({ where: { UserId: idsDosFuncionarios, timestamp: { [Op.between]: [inicioDoDia, fimDoDia] } }, order: [['UserId', 'ASC'], ['timestamp', 'ASC']] }),
                Ferias.findAll({ where: { UserId: idsDosFuncionarios }, order: [['dataInicio', 'DESC']] })
            ]);
        }

        const configAlmoco = await Configuracao.findOne({ where: { chave: 'duracao_almoco_minutos', EmpresaId: empresaId } });
        const duracaoAlmocoAtual = configAlmoco ? configAlmoco.valor : '60';

        const registrosPorUsuario = {};
        registrosDeHoje.forEach(r => { (registrosPorUsuario[r.UserId] = registrosPorUsuario[r.UserId] || []).push(r); });

        const feriasPorUsuario = {};
        todasFerias.forEach(f => { (feriasPorUsuario[f.UserId] = feriasPorUsuario[f.UserId] || []).push(f); });

        const horasPorUsuario = {}, expedientes = {};
        todosUsuarios.forEach(u => {
            horasPorUsuario[u.id] = calcularHorasTrabalhadas(registrosPorUsuario[u.id] || []);
            expedientes[u.id] = getHorarioExpediente(u, hoje);
        });

        res.render('rh_dashboard', {
            usuarios: todosUsuarios,
            registros: registrosPorUsuario,
            horas: horasPorUsuario,
            expedientes,
            ferias: feriasPorUsuario,
            duracaoAlmocoAtual,
            query: req.query,
            userIdLogado: req.session.userId
        });
    } catch (error) {
        console.error("Erro dashboard RH:", error);
        res.status(500).send('Erro ao carregar dashboard.');
    }
};

exports.salvarConfiguracoes = async (req, res) => {
    try {
        await Configuracao.upsert({ chave: 'duracao_almoco_minutos', valor: req.body.duracaoAlmocoMinutos.toString(), EmpresaId: req.session.empresaId });
        res.redirect('/rh/dashboard?msg=config_salva');
    } catch (error) { res.status(500).send('Erro.'); }
};

// =================================================================
// FUNÇÕES DE EMPRESA (DADOS E LOGO)
// =================================================================

exports.renderEditarEmpresa = async (req, res) => {
    try {
        const empresaId = req.session.empresaId;
        const empresa = await Empresa.findByPk(empresaId);
        const configIp = await Configuracao.findOne({ where: { chave: 'allowed_ips', EmpresaId: empresaId } });

        let userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
        if (typeof userIp === 'string') userIp = userIp.split(',')[0].trim();
        if (userIp === '::1' || userIp === '::ffff:127.0.0.1') userIp = '127.0.0.1';

        res.render('editar_empresa', {
            empresa,
            allowedIps: configIp ? configIp.valor : '',
            userIp,
            query: req.query
        });
    } catch (error) {
        console.error("Erro ao carregar empresa:", error);
        res.status(500).send("Erro ao carregar dados.");
    }
};

exports.editarEmpresa = async (req, res) => {
    try {
        const { nome, cnpj, allowedIps } = req.body;
        if (!nome || nome.trim() === '') return res.redirect('/rh/empresa?erro=nome_vazio');

        const configExistente = await Configuracao.findOne({ where: { chave: 'allowed_ips', EmpresaId: req.session.empresaId } });

        if (configExistente) {
            await configExistente.update({ valor: (allowedIps || '').trim() });
        } else {
            await Configuracao.create({ chave: 'allowed_ips', valor: (allowedIps || '').trim(), EmpresaId: req.session.empresaId });
        }

        await Empresa.update({ nome, cnpj }, { where: { id: req.session.empresaId } });
        res.redirect('/rh/empresa?msg=dados_salvos');
    } catch (error) {
        res.status(500).send('Erro ao guardar.');
    }
};

exports.atualizarLogo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('Nenhuma imagem enviada.');
        const empresaId = req.session.empresaId;
        const empresa = await Empresa.findByPk(empresaId);

        if (supabase) {
            const bufferComprimido = await sharp(req.file.buffer)
                .resize({ width: 500, height: 500, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer();

            const fileName = `logo_${empresaId}_${Date.now()}.webp`;

            const { error } = await supabase.storage
                .from('ponto-comprovantes')
                .upload(fileName, bufferComprimido, { contentType: 'image/webp' });

            if (error) throw error;

            const { data } = supabase.storage.from('ponto-comprovantes').getPublicUrl(fileName);
            await empresa.update({ logoPath: data.publicUrl });
        }
        res.redirect('/rh/empresa?msg=logo_atualizada');
    } catch (error) {
        console.error("Erro ao atualizar logo:", error);
        if (error.statusCode === '413' || error.status === 400) {
            return res.redirect('/rh/empresa?erro=arquivo_muito_grande');
        }
        res.status(500).send('Erro interno ao atualizar a logo da empresa.');
    }
};

// =================================================================
// FUNÇÕES DE FUNCIONÁRIOS E REGISTROS
// =================================================================

exports.renderCadastro = (req, res) => res.render('cadastro');

exports.cadastrarFuncionario = async (req, res) => {

    const { nome, email, senha } = req.body;
    try {
        // ==========================================
        // 🛑 TRAVA DE LIMITE DINÂMICA (Gatekeeper SuperAdmin)
        // ==========================================
        const empresa = await Empresa.findByPk(req.session.empresaId);

        // Mantendo a tradição: A Empresa Matriz (ID 1) tem recursos infinitos
        if (empresa.id !== 1) {
            const contagemFuncionarios = await User.count({
                where: {
                    EmpresaId: req.session.empresaId,
                    role: 'funcionario' // 👈 AGORA ELE IGNORA O RH NA CONTAGEM DO LIMITE!
                }
            });

            // Agora o leão de chácara olha o limite que foi definido no banco!
            if (contagemFuncionarios >= empresa.limiteFuncionarios) {
                return res.status(403).render('erro_generico', {
                    titulo: 'Limite de Plano Atingido',
                    mensagem: `O seu plano atual permite até ${empresa.limiteFuncionarios} colaboradores. Acesse "Definições da Empresa" para fazer o upgrade.`,
                    voltarLink: '/rh/dashboard'
                });
            }
        }
        // ==========================================

        const senhaHash = await bcrypt.hash(senha, 10);
        let fotoReferenciaUrl = null;
        const diasTrabalhoStr = req.body.diasTrabalho ? req.body.diasTrabalho.join(',') : '1,2,3,4,5';

        if (req.file) {
            if (!supabase) throw new Error("Supabase nulo. As chaves não foram carregadas do .env.");
            const fileName = `ref_novo_${Date.now()}.jpg`;
            const { data, error } = await supabase.storage.from('ponto-comprovantes').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
            if (error) throw new Error(`Erro do Supabase: ${error.message}`);
            const { data: publicData } = supabase.storage.from('ponto-comprovantes').getPublicUrl(fileName);
            fotoReferenciaUrl = publicData.publicUrl;

            try {
                const imgRef = new Image();
                imgRef.src = req.file.buffer;
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
                const detRef = await faceapi.detectSingleFace(imgRef, options).withFaceLandmarks().withFaceDescriptor();

                if (detRef) {
                    req.body.faceDescriptorTexto = JSON.stringify(Array.from(detRef.descriptor));
                } else {
                    throw new Error("Rosto não detectado. Tente uma foto com iluminação melhor.");
                }
            } catch (errIA) {
                throw new Error("Falha na Inteligência Artificial ao ler o rosto: " + errIA.message);
            }
        }

        await User.create({
            nome, email, senha: senhaHash, role: 'funcionario',
            EmpresaId: req.session.empresaId,
            fotoReferenciaUrl,
            diasTrabalho: diasTrabalhoStr,
            faceDescriptor: req.body.faceDescriptorTexto || null
        });
        res.redirect('/rh/dashboard?msg=func_cadastrado');

    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).render('erro_generico', { titulo: 'Email já em uso', mensagem: 'Já existe um funcionário cadastrado com este email.', voltarLink: '/cadastro' });
        }
        res.status(500).render('erro_generico', { titulo: 'Falha Técnica', mensagem: `Erro retornado: ${error.message}`, voltarLink: '/cadastro' });
    }
};

exports.deletarFuncionario = async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id) === req.session.userId) {
            return res.redirect('/rh/dashboard?erro=auto_exclusao');
        }

        const funcionario = await User.findOne({ where: { id: id, EmpresaId: req.session.empresaId, role: { [Op.in]: ['funcionario', 'rh'] } } });
        if (!funcionario) return res.status(404).send('Funcionário não encontrado ou não pertence à sua empresa.');

        await funcionario.destroy();
        res.redirect('/rh/dashboard?msg=func_deletado');
    } catch (error) {
        res.status(500).send('Erro interno ao excluir.');
    }
};

exports.renderEditarFuncionario = async (req, res) => {
    try {
        const funcionario = await User.findOne({ where: { id: req.params.id, EmpresaId: req.session.empresaId, role: { [Op.in]: ['funcionario', 'rh'] } } });
        if (!funcionario) return res.status(404).send('Funcionário não encontrado.');
        res.render('editar_funcionario', { funcionario });
    } catch (error) { res.status(500).send('Erro.'); }
};

exports.editarFuncionario = async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const diasTrabalhoStr = req.body.diasTrabalho ? req.body.diasTrabalho.join(',') : '1,2,3,4,5';
        const dadosParaAtualizar = { nome, email, diasTrabalho: diasTrabalhoStr };
        if (senha && senha.trim() !== '') dadosParaAtualizar.senha = await bcrypt.hash(senha, 10);

        if (req.file) {
            if (!supabase) throw new Error("Supabase não configurado!");
            const fileName = `ref_${req.params.id}_${Date.now()}.jpg`;
            const { error } = await supabase.storage.from('ponto-comprovantes').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
            if (error) throw new Error("Falha no upload.");
            const { data } = supabase.storage.from('ponto-comprovantes').getPublicUrl(fileName);
            dadosParaAtualizar.fotoReferenciaUrl = data.publicUrl;

            try {
                const imgRef = new Image();
                imgRef.src = req.file.buffer;
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
                const detRef = await faceapi.detectSingleFace(imgRef, options).withFaceLandmarks().withFaceDescriptor();

                if (detRef) {
                    dadosParaAtualizar.faceDescriptor = JSON.stringify(Array.from(detRef.descriptor));
                } else {
                    throw new Error("Rosto não detectado na nova foto.");
                }
            } catch (errIA) {
                throw new Error("Falha na IA ao ler o novo rosto: " + errIA.message);
            }
        }

        await User.update(dadosParaAtualizar, { where: { id: req.params.id, EmpresaId: req.session.empresaId, role: { [Op.in]: ['funcionario', 'rh'] } } });
        res.redirect('/rh/dashboard?msg=func_editado');
    } catch (error) {
        res.status(500).send('Erro ao salvar os dados: ' + error.message);
    }
};

exports.definirHorario = async (req, res) => {
    try {
        await User.update({ horarioEntrada: req.body.horarioEntrada, horarioSaida: req.body.horarioSaida }, { where: { id: req.params.id, EmpresaId: req.session.empresaId } });
        res.redirect('/rh/dashboard?msg=horario_definido');
    } catch (error) { res.status(500).send('Erro.'); }
};

exports.agendarFerias = async (req, res) => {
    try {
        await Ferias.create({ dataInicio: req.body.dataInicio, dataFim: req.body.dataFim, UserId: req.body.funcionarioId, EmpresaId: req.session.empresaId });
        res.redirect('/rh/dashboard?msg=func_editado');
    } catch (error) { res.status(500).send('Erro.'); }
};

exports.excluirRegistroPonto = async (req, res) => {
    try {
        await RegistroPonto.destroy({ where: { id: req.params.id } });
        res.redirect((req.header('Referer') || '/rh/dashboard') + '?msg=registro_excluido');
    } catch (error) { res.status(500).send('Erro.'); }
};

exports.renderRegistroManual = async (req, res) => {
    try {
        const funcionario = await User.findOne({ where: { id: req.params.id, EmpresaId: req.session.empresaId } });
        res.render('registro_manual', { funcionario });
    } catch (error) { res.status(500).send("Erro ao abrir a tela de registro manual."); }
};

exports.salvarRegistroManual = async (req, res) => {
    try {
        const funcionarioId = req.params.id;
        const { data, entrada, saidaAlmoco, voltaAlmoco, saida } = req.body;
        if (!data) return res.status(400).send("A data do registro é obrigatória!");

        const criarTs = (h) => h ? new Date(`${data}T${h}:00-03:00`) : null;
        const timestamps = { 'Entrada': criarTs(entrada), 'Saida Almoço': criarTs(saidaAlmoco), 'Volta Almoço': criarTs(voltaAlmoco), 'Saida': criarTs(saida) };

        await RegistroPonto.destroy({ where: { UserId: funcionarioId, timestamp: { [Op.between]: [new Date(`${data}T00:00:00-03:00`), new Date(`${data}T23:59:59-03:00`)] } } });

        for (const tipo in timestamps) {
            if (timestamps[tipo] && !isNaN(timestamps[tipo])) {
                await RegistroPonto.create({ UserId: funcionarioId, tipo: tipo, timestamp: timestamps[tipo], fotoUrl: 'Lançamento Manual (RH)' });
            }
        }
        res.redirect('/rh/dashboard?msg=registro_manual_ok');
    } catch (error) { res.status(500).send(`Erro ao salvar manual: ${error.message}`); }
};

// =================================================================
// RELATÓRIOS E PDF
// =================================================================

exports.renderRelatorios = async (req, res) => {
    try {
        const { empresaId } = req.session;
        const { dataInicio, dataFim, funcionarioId } = req.query;
        const hoje = new Date();
        const inicio = dataInicio || new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fim = dataFim || hoje.toISOString().split('T')[0];
        const funcIdSelecionado = funcionarioId || 'todos';

        const listaFuncionarios = await User.findAll({ where: { role: { [Op.in]: ['funcionario', 'rh'] }, EmpresaId: empresaId }, order: [['nome', 'ASC']] });
        let funcionariosParaProcessar = funcIdSelecionado !== 'todos' ? listaFuncionarios.filter(f => f.id == funcIdSelecionado) : listaFuncionarios;

        const ids = funcionariosParaProcessar.map(u => u.id);
        let registrosNoPeriodo = [], todasFerias = [];
        if (ids.length > 0) {
            const dtInicio = new Date(`${inicio}T00:00:00-03:00`);
            const dtFim = new Date(`${fim}T23:59:59-03:00`);
            [registrosNoPeriodo, todasFerias] = await Promise.all([
                RegistroPonto.findAll({ where: { UserId: ids, timestamp: { [Op.between]: [dtInicio, dtFim] } } }),
                Ferias.findAll({ where: { UserId: ids } })
            ]);
        }

        const faltas = [];
        let dataAtualLoop = new Date(`${inicio}T00:00:00-03:00`);
        const dataFinalObj = new Date(`${fim}T00:00:00-03:00`);

        while (dataAtualLoop <= dataFinalObj) {
            const diaSemana = dataAtualLoop.getDay();
            const dataFormatada = dataAtualLoop.toISOString().split('T')[0];

            for (const func of funcionariosParaProcessar) {
                const diasTrabalhoFunc = func.diasTrabalho || '1,2,3,4,5';
                if (!diasTrabalhoFunc.includes(diaSemana.toString())) continue;

                const estaDeFerias = todasFerias.some(f => {
                    const i = new Date(f.dataInicio + 'T00:00:00-03:00');
                    const final = new Date(f.dataFim + 'T23:59:59-03:00');
                    return dataAtualLoop >= i && dataAtualLoop <= final;
                });
                if (estaDeFerias) continue;

                const temRegistro = registrosNoPeriodo.some(r => r.UserId === func.id && new Date(r.timestamp).toISOString().split('T')[0] === dataFormatada);
                if (!temRegistro) faltas.push({ nome: func.nome, data: dataFormatada });
            }
            dataAtualLoop.setDate(dataAtualLoop.getDate() + 1);
        }

        res.render('relatorios', { faltas, dataInicio: inicio, dataFim: fim, listaFuncionarios, funcionarioIdSelecionado: funcIdSelecionado });
    } catch (error) { res.render('relatorios', { error: "Erro.", faltas: [], dataInicio: '', dataFim: '', listaFuncionarios: [], funcionarioIdSelecionado: '' }); }
};

exports.downloadRelatorioCsv = async (req, res) => {
    try {
        const { empresaId } = req.session;
        const { dataInicio, dataFim, funcionarioId } = req.query;
        if (!dataInicio || !dataFim) return res.status(400).send("Datas vazias.");
        const funcIdSelecionado = funcionarioId || 'todos';

        const listaFuncionarios = await User.findAll({ where: { role: { [Op.in]: ['funcionario', 'rh'] }, EmpresaId: empresaId } });
        let funcionariosParaProcessar = funcIdSelecionado !== 'todos' ? listaFuncionarios.filter(f => f.id == funcIdSelecionado) : listaFuncionarios;

        const ids = funcionariosParaProcessar.map(u => u.id);
        const dtInicio = new Date(`${dataInicio}T00:00:00-03:00`);
        const dtFim = new Date(`${dataFim}T23:59:59-03:00`);

        const [registros, ferias] = await Promise.all([
            RegistroPonto.findAll({ where: { UserId: ids, timestamp: { [Op.between]: [dtInicio, dtFim] } } }),
            Ferias.findAll({ where: { UserId: ids } })
        ]);

        const faltas = [];
        let dataAtualLoop = new Date(dtInicio);

        while (dataAtualLoop <= dtFim) {
            const diaSemana = dataAtualLoop.getDay();
            const dataStr = dataAtualLoop.toISOString().split('T')[0];

            for (const func of funcionariosParaProcessar) {
                const diasTrabalhoFunc = func.diasTrabalho || '1,2,3,4,5';
                if (!diasTrabalhoFunc.includes(diaSemana.toString())) continue;

                const feriasFunc = ferias.some(f => {
                    const i = new Date(f.dataInicio + 'T00:00:00-03:00');
                    const final = new Date(f.dataFim + 'T23:59:59-03:00');
                    return dataAtualLoop >= i && dataAtualLoop <= final;
                });
                if (feriasFunc) continue;

                const temPonto = registros.some(r => r.UserId === func.id && new Date(r.timestamp).toISOString().split('T')[0] === dataStr);
                if (!temPonto) faltas.push({ nome: func.nome, data: dataAtualLoop.toLocaleDateString('pt-BR') });
            }
            dataAtualLoop.setDate(dataAtualLoop.getDate() + 1);
        }

        const csv = "\uFEFF" + "Funcionario,Data da Falta\n" + faltas.map(f => `"${f.nome}",${f.data}`).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="faltas_${dataInicio}_${dataFim}.csv"`);
        res.send(Buffer.from(csv));
    } catch (error) { res.status(500).send('Erro.'); }
};

exports.renderFolhaPonto = async (req, res) => {
    try {
        const { empresaId } = req.session;
        const { dataInicio, dataFim, funcionarioId } = req.query;

        const listaFuncionarios = await User.findAll({ where: { role: { [Op.in]: ['funcionario', 'rh'] }, EmpresaId: empresaId }, order: [['nome', 'ASC']] });
        if (!funcionarioId) return res.render('folha_ponto_semanal', { relatorioAgrupado: null, listaFuncionarios, dataInicioSelecionada: dataInicio || '', dataFimSelecionada: dataFim || '', funcionarioIdSelecionado: null });

        const dataInicioObj = new Date(`${dataInicio}T00:00:00-03:00`);
        const dataFimObj = new Date(`${dataFim}T23:59:59-03:00`);

        let funcionariosParaProcessar = funcionarioId === 'todos' ? listaFuncionarios : listaFuncionarios.filter(f => f.id == funcionarioId);
        const ids = funcionariosParaProcessar.map(f => f.id);

        const [registros, ferias, configAlmoco] = await Promise.all([
            RegistroPonto.findAll({ where: { UserId: ids, timestamp: { [Op.between]: [dataInicioObj, dataFimObj] } }, order: [['timestamp', 'ASC']] }),
            Ferias.findAll({ where: { UserId: ids } }),
            Configuracao.findOne({ where: { chave: 'duracao_almoco_minutos', EmpresaId: empresaId } })
        ]);
        const duracaoAlmoco = configAlmoco ? parseInt(configAlmoco.valor) : 60;

        const relatorioAgrupado = [];

        for (const func of funcionariosParaProcessar) {
            const dadosFunc = { id: func.id, nome: func.nome, semanas: [] };
            let semanaAtual = {};
            let dataLoop = new Date(dataInicioObj);
            const diasTrabalhoFunc = func.diasTrabalho || '1,2,3,4,5';

            while (dataLoop <= dataFimObj) {
                const diaSemana = dataLoop.getDay();
                const diaStr = dataLoop.toISOString().split('T')[0];

                if (diasTrabalhoFunc.includes(diaSemana.toString())) {
                    const regsDia = registros.filter(r => r.UserId === func.id && new Date(r.timestamp).toISOString().split('T')[0] === diaStr);
                    const diaInfo = { data: new Date(dataLoop), registros: regsDia, horasTrabalhadas: '00h 00m', saldoHoras: '', observacao: '' };

                    const emFerias = ferias.some(f => {
                        const i = new Date(f.dataInicio + 'T00:00:00-03:00');
                        const final = new Date(f.dataFim + 'T23:59:59-03:00');
                        const dNorm = new Date(diaStr + 'T00:00:00-03:00');
                        return dNorm >= i && dNorm <= final;
                    });

                    if (emFerias) { diaInfo.observacao = 'Férias'; diaInfo.saldoHoras = '-'; diaInfo.horasTrabalhadas = '-'; }
                    else if (regsDia.length === 0) {
                        diaInfo.observacao = 'Falta'; diaInfo.horasTrabalhadas = 'Falta';
                        try {
                            const exp = getHorarioExpediente(func, dataLoop);
                            const [hE, mE] = exp.entrada.split(':').map(Number);
                            const [hS, mS] = exp.saida.split(':').map(Number);
                            const jornadaMin = ((hS - hE) * 60) + (mS - mE) - duracaoAlmoco;
                            const hSaldo = Math.floor(jornadaMin / 60).toString().padStart(2, '0');
                            const mSaldo = (jornadaMin % 60).toString().padStart(2, '0');
                            diaInfo.saldoHoras = `-${hSaldo}h ${mSaldo}m`;
                        } catch { diaInfo.saldoHoras = '-'; }
                    } else {
                        diaInfo.horasTrabalhadas = calcularHorasTrabalhadas(regsDia);
                        if (!diaInfo.horasTrabalhadas.includes('Jornada em aberto') && !diaInfo.horasTrabalhadas.includes('(parcial)')) {
                            try {
                                const exp = getHorarioExpediente(func, dataLoop);
                                const [hE, mE] = exp.entrada.split(':').map(Number);
                                const [hS, mS] = exp.saida.split(':').map(Number);
                                const jornadaMin = ((hS - hE) * 60) + (mS - mE) - duracaoAlmoco;
                                const match = diaInfo.horasTrabalhadas.match(/(\d{2})h (\d{2})m/);
                                if (match) {
                                    const hT = parseInt(match[1]), mT = parseInt(match[2]);
                                    const tMin = (hT * 60) + mT;
                                    const sMin = tMin - jornadaMin;
                                    const sig = sMin >= 0 ? '+' : '-';
                                    const hSald = Math.floor(Math.abs(sMin) / 60).toString().padStart(2, '0');
                                    const mSald = (Math.abs(sMin) % 60).toString().padStart(2, '0');
                                    diaInfo.saldoHoras = `${sig}${hSald}h ${mSald}m`;
                                } else diaInfo.saldoHoras = 'Erro';
                            } catch { diaInfo.saldoHoras = 'Erro'; }
                        } else diaInfo.saldoHoras = '-';
                    }
                    const diasArr = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
                    semanaAtual[diasArr[diaSemana]] = diaInfo;
                }

                if (diaSemana === 6 || diaStr === dataFim) {
                    if (Object.keys(semanaAtual).length > 0) {
                        semanaAtual.dataInicioSemana = Object.values(semanaAtual)[0]?.data;
                        dadosFunc.semanas.push(semanaAtual);
                    }
                    semanaAtual = {};
                }
                dataLoop.setDate(dataLoop.getDate() + 1);
            }
            dadosFunc.semanas.sort((a, b) => (a.dataInicioSemana || 0) - (b.dataInicioSemana || 0));
            relatorioAgrupado.push(dadosFunc);
        }
        res.render('folha_ponto_semanal', { relatorioAgrupado, listaFuncionarios, dataInicioSelecionada: dataInicio, dataFimSelecionada: dataFim, funcionarioIdSelecionado: funcionarioId });
    } catch (error) { res.status(500).send("Erro."); }
};

exports.downloadFolhaPontoPdf = async (req, res) => {
    try {
        const { empresaId } = req.session;
        const { dataInicio, dataFim, funcionarioId } = req.query;

        const listaFuncionarios = await User.findAll({ where: { role: { [Op.in]: ['funcionario', 'rh'] }, EmpresaId: empresaId } });
        let funcionariosParaProcessar = funcionarioId === 'todos' ? listaFuncionarios : listaFuncionarios.filter(u => u.id == funcionarioId);

        const ids = funcionariosParaProcessar.map(f => f.id);
        const [registros, ferias, configAlmoco, empresa] = await Promise.all([
            RegistroPonto.findAll({ where: { UserId: ids, timestamp: { [Op.between]: [new Date(dataInicio + 'T00:00:00-03:00'), new Date(dataFim + 'T23:59:59-03:00')] } }, order: [['timestamp', 'ASC']] }),
            Ferias.findAll({ where: { UserId: ids } }),
            Configuracao.findOne({ where: { chave: 'duracao_almoco_minutos', EmpresaId: empresaId } }),
            Empresa.findByPk(empresaId)
        ]);
        const duracaoAlmoco = configAlmoco ? parseInt(configAlmoco.valor) : 60;

        const relatorioAgrupado = [];
        for (const func of funcionariosParaProcessar) {
            const dadosFunc = { id: func.id, nome: func.nome, semanas: [] };
            let semanaAtual = {};
            let dataLoop = new Date(dataInicio + 'T00:00:00-03:00');
            const dataFimObj = new Date(dataFim + 'T23:59:59-03:00');
            const diasTrabalhoFunc = func.diasTrabalho || '1,2,3,4,5';

            while (dataLoop <= dataFimObj) {
                const diaSemana = dataLoop.getDay();
                const diaStr = dataLoop.toISOString().split('T')[0];

                if (diasTrabalhoFunc.includes(diaSemana.toString())) {
                    const regsDia = registros.filter(r => r.UserId === func.id && new Date(r.timestamp).toISOString().split('T')[0] === diaStr);
                    const diaInfo = { data: new Date(dataLoop), registros: regsDia, horasTrabalhadas: '00h 00m', saldoHoras: '', observacao: '' };
                    const emFerias = ferias.some(f => { const i = new Date(f.dataInicio); const final = new Date(f.dataFim); const d = new Date(diaStr); return d >= i && d <= final; });
                    if (emFerias) { diaInfo.observacao = 'Férias'; diaInfo.horasTrabalhadas = '-'; diaInfo.saldoHoras = '-'; }
                    else if (regsDia.length === 0) { diaInfo.observacao = 'Falta'; diaInfo.horasTrabalhadas = 'Falta'; diaInfo.saldoHoras = '-'; }
                    else { diaInfo.horasTrabalhadas = calcularHorasTrabalhadas(regsDia); diaInfo.saldoHoras = '-'; }
                    const diasArr = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
                    semanaAtual[diasArr[diaSemana]] = diaInfo;
                }

                if (diaSemana === 6 || diaStr === dataFim) {
                    if (Object.keys(semanaAtual).length > 0) {
                        semanaAtual.dataInicioSemana = Object.values(semanaAtual)[0]?.data;
                        dadosFunc.semanas.push(semanaAtual);
                    }
                    semanaAtual = {};
                }
                dataLoop.setDate(dataLoop.getDate() + 1);
            }
            dadosFunc.semanas.sort((a, b) => (a.dataInicioSemana || 0) - (b.dataInicioSemana || 0));
            relatorioAgrupado.push(dadosFunc);
        }

        let logoBase64 = null;
        if (empresa && empresa.logoPath) {
            try {
                if (empresa.logoPath.startsWith('http')) {
                    const response = await fetch(empresa.logoPath);
                    const buffer = await response.arrayBuffer();
                    const mimeType = empresa.logoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
                    logoBase64 = `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
                } else {
                    const p = path.join(__dirname, '..', 'public', empresa.logoPath);
                    if (fs.existsSync(p)) logoBase64 = `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
                }
            } catch (error) {
                console.error("Erro ao embutir a logo no PDF:", error);
            }
        }

        const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'espelho_ponto_pdf.ejs'), { relatorioAgrupado, dataInicio, dataFim, empresa: { nome: empresa ? empresa.nome : '', cnpj: empresa ? empresa.cnpj : '', logoBase64 } });
        if (!puppeteer) throw new Error("Puppeteer não carregado.");
        const browser = await puppeteer.launch({ ...chromiumArgs, args: [...(chromiumArgs.args || []), '--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="espelho.pdf"`);
        res.send(pdf);
    } catch (e) {
        console.error("Erro na geração do PDF:", e);
        res.status(500).send("Erro ao gerar o PDF.");
    }
};