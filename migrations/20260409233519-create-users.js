'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Tabela de Empresas
    await queryInterface.createTable('Empresas', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      nome: { type: Sequelize.STRING, allowNull: false },
      cnpj: { type: Sequelize.STRING, allowNull: true, unique: true },
      logoPath: { type: Sequelize.STRING, allowNull: true },
      ativo: { type: Sequelize.BOOLEAN, defaultValue: true },
      dataVencimento: { type: Sequelize.DATE, defaultValue: null },
      plano: { type: Sequelize.STRING, defaultValue: 'starter' },
      limiteFuncionarios: { type: Sequelize.INTEGER, defaultValue: 5 },
      valorMensalidade: { type: Sequelize.DECIMAL(10, 2), defaultValue: 49.90 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 2. Tabela de Usuários (Depende de Empresa)
    await queryInterface.createTable('Users', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      nome: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      senha: { type: Sequelize.STRING, allowNull: false },
      role: { type: Sequelize.STRING, allowNull: false },
      horarioEntrada: { type: Sequelize.TIME, allowNull: true },
      horarioSaida: { type: Sequelize.TIME, allowNull: true },
      fotoReferenciaUrl: { type: Sequelize.STRING, allowNull: true },
      faceDescriptor: { type: Sequelize.TEXT, allowNull: true },
      termosAceitos: { type: Sequelize.BOOLEAN, defaultValue: false }, // <-- Aqui está a coluna que faltava!
      diasTrabalho: { type: Sequelize.STRING, defaultValue: '1,2,3,4,5' },
      EmpresaId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Empresas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 3. Tabela de Ponto (Depende de Users)
    await queryInterface.createTable('RegistroPontos', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      timestamp: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      tipo: { type: Sequelize.STRING, allowNull: false },
      fotoUrl: { type: Sequelize.STRING, allowNull: true },
      latitude: { type: Sequelize.STRING, allowNull: true },
      longitude: { type: Sequelize.STRING, allowNull: true },
      UserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 4. Tabela de Férias (Depende de Users)
    await queryInterface.createTable('Ferias', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      dataInicio: { type: Sequelize.DATEONLY, allowNull: false },
      dataFim: { type: Sequelize.DATEONLY, allowNull: false },
      UserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    // 5. Tabela de Configurações (Depende de Empresa)
    await queryInterface.createTable('Configuracaos', { 
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      chave: { type: Sequelize.STRING, allowNull: false },
      valor: { type: Sequelize.STRING, allowNull: false },
      EmpresaId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Empresas', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  },

  down: async (queryInterface, Sequelize) => {
    // No "down", a ordem de exclusão deve ser inversa para não ferir as Foreign Keys
    await queryInterface.dropTable('Configuracaos');
    await queryInterface.dropTable('Ferias');
    await queryInterface.dropTable('RegistroPontos');
    await queryInterface.dropTable('Users');
    await queryInterface.dropTable('Empresas');
  }
};