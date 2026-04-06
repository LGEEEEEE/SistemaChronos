const { User, RegistroPonto, Ferias, Configuracao, Op } = require('../models/db');
const { calcularHorasTrabalhadas, getHorarioExpediente } = require('./calculosController');
const faceapi = require('@vladmandic/face-api');
const { Image } = require('canvas');


exports.renderDashboard = async (req, res) => {
    try {
        const user = await User.findByPk(req.session.userId);
        if (!user) {
            return req.session.destroy(() => res.redirect('/login?erro=usuario_invalido'));
        }
        const hoje = new Date();
        const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
        const fimDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

        const registros = await RegistroPonto.findAll({
            where: {
                UserId: req.session.userId,
                timestamp: { [Op.between]: [inicioDoDia, fimDoDia] }
            },
            order: [['timestamp', 'ASC']],
            raw: true,
            nest: true
        });
        res.render('dashboard', { user, registros, query: req.query });
    } catch (error) {
        console.error("Erro dashboard:", error);
        res.status(500).send("Erro ao carregar dashboard.");
    }
};

exports.registrarPonto = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { latitude, longitude } = req.body; // 📍 Pegando GPS do formulário

        if (!req.file) {
            return res.status(400).render('erro_generico', { titulo: 'Foto Obrigatória', mensagem: 'Você precisa permitir a câmera e enviar uma foto.', voltarLink: '/dashboard' });
        }

        const user = await User.findByPk(userId);
        
        if (!user.fotoReferenciaUrl) {
            return res.status(403).render('erro_generico', { titulo: 'Foto Base Ausente', mensagem: 'Sua foto de referência não está cadastrada. Procure o RH.', voltarLink: '/dashboard' });
        }

        const hoje = new Date();
        const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
        const fimDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

        const registrosDoDia = await RegistroPonto.findAll({
            where: { UserId: userId, timestamp: { [Op.between]: [inicioDoDia, fimDoDia] } },
            order: [['timestamp', 'ASC']]
        });

        let tipoDeBatida = '';
        switch (registrosDoDia.length) {
            case 0: tipoDeBatida = 'Entrada'; break;
            case 1: tipoDeBatida = 'Saida Almoço'; break;
            case 2: tipoDeBatida = 'Volta Almoço'; break;
            case 3: tipoDeBatida = 'Saida'; break;
            default: return res.redirect('/dashboard?mensagem=ciclo_finalizado');
        }

        // ==========================================
        // INÍCIO DA DEPURAÇÃO (DEBUG)
        // ==========================================
        console.log("\n[DEBUG IA] Iniciando validação facial...");

        const fs = require('fs');
        const path = require('path');
        const debugPath = path.join(__dirname, '..', 'debug_selfie.jpg');
        fs.writeFileSync(debugPath, req.file.buffer);

        const imgSelfie = new Image();
        imgSelfie.src = req.file.buffer;

        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
        const detSelfie = await faceapi.detectSingleFace(imgSelfie, options).withFaceLandmarks().withFaceDescriptor();

        if (!detSelfie) {
            console.error("[DEBUG IA] ❌ Falha! A IA não achou um rosto na selfie recebida.");
            return res.status(400).render('erro_generico', { titulo: 'Rosto Não Detectado', mensagem: 'A IA não encontrou um rosto na sua selfie. Ilumine o rosto e tente novamente.', voltarLink: '/dashboard' });
        }
        console.log("[DEBUG IA] ✅ Rosto na selfie detectado com sucesso!");

        // ==========================================
        // COMPARANDO COM O ROSTO SALVO (ULTRARRÁPIDO)
        // ==========================================
        if (!user.faceDescriptor) {
            console.error("[DEBUG IA] ❌ Falha! O funcionário não tem o DNA facial (Descriptor) salvo no banco.");
            return res.status(400).render('erro_generico', { titulo: 'Biometria Ausente', mensagem: 'Sua biometria facial ainda não foi processada pelo sistema. Peça ao RH para editar o seu cadastro e salvar novamente a sua foto.', voltarLink: '/dashboard' });
        }

        // Transforma o Texto (JSON) do banco de volta na Matriz Matemática da IA
        const descriptorArray = JSON.parse(user.faceDescriptor);
        const refDescriptor = new Float32Array(descriptorArray);

        // Compara a Selfie que acabou de ser tirada com a Matriz
        const distancia = faceapi.euclideanDistance(detSelfie.descriptor, refDescriptor);
        console.log(`[DEBUG IA] 📏 Distância Euclidiana entre os rostos: ${distancia.toFixed(4)} (O limite é 0.5)`);
        
        if (distancia > 0.5) {
            console.warn(`[DEBUG IA] ⚠️ REJEITADO! Distância maior que 0.5. Rosto não reconhecido.`);
            return res.status(403).render('erro_generico', { titulo: 'Acesso Negado', mensagem: 'Rosto não reconhecido pela Inteligência Artificial.', voltarLink: '/dashboard' });
        }

        console.log("[DEBUG IA] ✅ Ponto aprovado! Gravando no banco...");
        
        // 📍 Salvando Latitude e Longitude
        await RegistroPonto.create({ 
            UserId: userId, 
            tipo: tipoDeBatida, 
            timestamp: new Date(),
            fotoUrl: 'Validado por IA (Sem armazenamento)',
            latitude: latitude || null,
            longitude: longitude || null
        }); 
        
        // Se deu tudo certo, apaga a foto de debug
        if (fs.existsSync(debugPath)) fs.unlinkSync(debugPath);

        res.redirect('/dashboard?msg=ponto_registrado');

    } catch (error) {
        console.error("Erro IA:", error);
        res.status(500).render('erro_generico', { titulo: 'Erro no Servidor', mensagem: 'Falha interna de processamento.', voltarLink: '/dashboard' });
    }
};

exports.renderMeuRelatorio = async (req, res) => {
    try {
        const { userId, empresaId } = req.session;
        const { dataInicio, dataFim } = req.query;

        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const hojeStr = hoje.toISOString().split('T')[0];

        const dataInicioSelecionada = dataInicio || inicioMes;
        const dataFimSelecionada = dataFim || hojeStr;

        const funcionario = await User.findByPk(userId);
        if (!funcionario) return res.status(404).send("Funcionário não encontrado.");

        const dataInicioObj = new Date(`${dataInicioSelecionada}T00:00:00-03:00`);
        const dataFimObj = new Date(`${dataFimSelecionada}T23:59:59-03:00`);

        if (isNaN(dataInicioObj) || isNaN(dataFimObj)) {
            return res.render('erro_generico', {
                titulo: 'Data Inválida',
                mensagem: 'As datas fornecidas para o relatório são inválidas.',
                voltarLink: '/dashboard'
            });
        }

        const [registros, ferias, configAlmoco] = await Promise.all([
            RegistroPonto.findAll({ where: { UserId: userId, timestamp: { [Op.between]: [dataInicioObj, dataFimObj] } }, order: [['timestamp', 'ASC']] }),
            Ferias.findAll({ where: { UserId: userId } }),
            Configuracao.findOne({ where: { chave: 'duracao_almoco_minutos', EmpresaId: empresaId } })
        ]);

        const duracaoAlmoco = configAlmoco ? parseInt(configAlmoco.valor, 10) : 60;

        const dadosFuncionario = { semanas: [] };
        let semanaAtual = {};
        let dataAtualLoop = new Date(dataInicioObj);
        const diasTrabalho = funcionario.diasTrabalho || '1,2,3,4,5';

        while (dataAtualLoop <= dataFimObj) {
            const diaDaSemana = dataAtualLoop.getDay();
            const diaString = dataAtualLoop.toISOString().split('T')[0];

            if (diasTrabalho.includes(diaDaSemana.toString())) {
                const registrosDoDia = registros.filter(r => new Date(r.timestamp).toISOString().split('T')[0] === diaString);

                const diaInfo = {
                    data: new Date(dataAtualLoop),
                    registros: registrosDoDia,
                    horasTrabalhadas: '00h 00m',
                    saldoHoras: '',
                    observacao: ''
                };

                const estaDeFerias = ferias.some(f => {
                    const inicioF = new Date(f.dataInicio + 'T00:00:00-03:00');
                    const fimF = new Date(f.dataFim + 'T23:59:59-03:00');
                    const diaAtualNormalizado = new Date(diaString + 'T00:00:00-03:00');
                    return diaAtualNormalizado >= inicioF && diaAtualNormalizado <= fimF;
                });

                if (estaDeFerias) {
                    diaInfo.observacao = 'Férias';
                    diaInfo.horasTrabalhadas = '-';
                    diaInfo.saldoHoras = '-';
                } else if (registrosDoDia.length === 0) {
                    diaInfo.observacao = 'Falta';
                    diaInfo.horasTrabalhadas = 'Falta';
                    try {
                        const expediente = getHorarioExpediente(funcionario, dataAtualLoop);
                        const [hE, mE] = expediente.entrada.split(':').map(Number);
                        const [hS, mS] = expediente.saida.split(':').map(Number);
                        const jornadaMin = ((hS - hE) * 60) + (mS - mE) - duracaoAlmoco;
                        const hSaldo = Math.floor(jornadaMin / 60).toString().padStart(2, '0');
                        const mSaldo = (jornadaMin % 60).toString().padStart(2, '0');
                        diaInfo.saldoHoras = `-${hSaldo}h ${mSaldo}m`;
                    } catch { diaInfo.saldoHoras = '-'; }
                } else {
                    diaInfo.horasTrabalhadas = calcularHorasTrabalhadas(registrosDoDia);
                    if (!diaInfo.horasTrabalhadas.includes('Jornada em aberto') && !diaInfo.horasTrabalhadas.includes('(parcial)')) {
                        try {
                            const expediente = getHorarioExpediente(funcionario, dataAtualLoop);
                            const [hE, mE] = expediente.entrada.split(':').map(Number);
                            const [hS, mS] = expediente.saida.split(':').map(Number);
                            const jornadaMin = ((hS - hE) * 60) + (mS - mE) - duracaoAlmoco;

                            const match = diaInfo.horasTrabalhadas.match(/(\d{2})h (\d{2})m/);
                            if (match) {
                                const hT = parseInt(match[1], 10);
                                const mT = parseInt(match[2], 10);
                                const trabalhadoMin = (hT * 60) + mT;
                                const saldoMin = trabalhadoMin - jornadaMin;

                                const sinal = saldoMin >= 0 ? '+' : '-';
                                const hSaldo = Math.floor(Math.abs(saldoMin) / 60).toString().padStart(2, '0');
                                const mSaldo = (Math.abs(saldoMin) % 60).toString().padStart(2, '0');
                                diaInfo.saldoHoras = `${sinal}${hSaldo}h ${mSaldo}m`;
                            } else {
                                diaInfo.saldoHoras = 'Erro Calc';
                            }
                        } catch (calcError) {
                            diaInfo.saldoHoras = 'Erro Calc';
                        }
                    } else {
                        diaInfo.saldoHoras = '-';
                    }
                }

                const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
                semanaAtual[dias[diaDaSemana]] = diaInfo;
            }

            if (diaDaSemana === 6 || diaString === dataFimSelecionada) {
                if (Object.keys(semanaAtual).length > 0) {
                    const primeiraDataDaSemana = Object.values(semanaAtual)[0].data;
                    semanaAtual.dataInicioSemana = primeiraDataDaSemana;
                    dadosFuncionario.semanas.push(semanaAtual);
                }
                semanaAtual = {};
            }

            dataAtualLoop.setDate(dataAtualLoop.getDate() + 1);
        }

        dadosFuncionario.semanas.sort((a, b) => a.dataInicioSemana - b.dataInicioSemana);

        res.render('meu_relatorio', {
            relatorioAgrupado: dadosFuncionario,
            dataInicioSelecionada: dataInicioSelecionada,
            dataFimSelecionada: dataFimSelecionada
        });

    } catch (error) {
        console.error("Erro ao gerar relatório do funcionário:", error);
        res.status(500).render('erro_generico', {
            titulo: 'Erro',
            mensagem: "Ocorreu um erro interno ao gerar o relatório. Tente novamente.",
            voltarLink: '/dashboard'
        });
    }
};