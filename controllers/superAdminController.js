const { Empresa, User } = require('../models/db');

exports.renderDashboard = async (req, res) => {
    try {
        // Busca todas as empresas e conta quantos funcionários cada uma tem
        const empresas = await Empresa.findAll({
            include: [{
                model: User,
                attributes: ['id']
            }],
            order: [['createdAt', 'DESC']]
        });

        res.render('superadmin_dashboard', { empresas });
    } catch (error) {
        console.error("Erro no dashboard superadmin:", error);
        res.status(500).render('erro_generico', { titulo: 'Erro', mensagem: 'Falha ao carregar matriz de empresas.', voltarLink: '/' });
    }
};

exports.toggleEmpresaStatus = async (req, res) => {
    try {
        const empresaId = req.params.id;
        const empresa = await Empresa.findByPk(empresaId);
        
        if (!empresa) return res.status(404).send('Empresa não encontrada.');

        // Se o seu ID for 1 (Empresa Matriz), você não pode bloquear a si mesmo
        if (empresa.id === 1) {
            return res.status(403).send('A Empresa Matriz não pode ser bloqueada.');
        }

        // Inverte o status atual
        await empresa.update({ ativo: !empresa.ativo });

        res.redirect('/superadmin/dashboard?msg=status_alterado');
    } catch (error) {
        console.error("Erro ao alterar status da empresa:", error);
        res.status(500).send('Erro ao atualizar status.');
    }
};