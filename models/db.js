// =================================================================
// BANCO DE DADOS E MODELOS (SEQUELIZE)
// Arquivo: models/db.js
// =================================================================

const { Sequelize, DataTypes, Op } = require('sequelize');
require('dotenv').config();

let sequelize;

if (process.env.NODE_ENV === 'production') {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        protocol: 'postgres',
        dialectOptions: {
            ssl: { require: true, rejectUnauthorized: false }
        },
        timezone: '-03:00'
    });
} else {
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './database.sqlite'
    });
}

const Empresa = sequelize.define('Empresa', {
    nome: { type: DataTypes.STRING, allowNull: false },
    cnpj: { type: DataTypes.STRING, allowNull: true, unique: true },
    logoPath: { type: DataTypes.STRING, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
    dataVencimento: { type: DataTypes.DATE, defaultValue: null },
    plano: { type: DataTypes.STRING, defaultValue: 'starter' },
    // 🚀 AS NOVAS COLUNAS PARA O SUPERADMIN:
    limiteFuncionarios: { type: DataTypes.INTEGER, defaultValue: 5 },
    valorMensalidade: { type: DataTypes.DECIMAL(10, 2), defaultValue: 49.90 }
});

const User = sequelize.define('User', {
    nome: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    senha: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false }, // 'funcionario', 'rh', 'superadmin'
    horarioEntrada: { type: DataTypes.TIME, allowNull: true },
    horarioSaida: { type: DataTypes.TIME, allowNull: true },
    fotoReferenciaUrl: { type: DataTypes.STRING, allowNull: true },
    faceDescriptor: { type: DataTypes.TEXT, allowNull: true },
    termosAceitos: { type: DataTypes.BOOLEAN, defaultValue: false },
    EmpresaId: { type: DataTypes.INTEGER, allowNull: true },
    diasTrabalho: { type: DataTypes.STRING, defaultValue: '1,2,3,4,5' } // 0=Dom, 1=Seg, 2=Ter... 6=Sáb
});

const RegistroPonto = sequelize.define('RegistroPonto', {
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    tipo: { type: DataTypes.STRING, allowNull: false },
    fotoUrl: { type: DataTypes.STRING, allowNull: true },
    latitude: { type: DataTypes.STRING, allowNull: true },
    longitude: { type: DataTypes.STRING, allowNull: true },
    UserId: { type: DataTypes.INTEGER, allowNull: true } 
});

const Ferias = sequelize.define('Ferias', {
    dataInicio: { type: DataTypes.DATEONLY, allowNull: false },
    dataFim: { type: DataTypes.DATEONLY, allowNull: false },
    UserId: { type: DataTypes.INTEGER, allowNull: true }
});

const Configuracao = sequelize.define('Configuracao', {
    chave: { type: DataTypes.STRING, allowNull: false },
    valor: { type: DataTypes.STRING, allowNull: false },
    EmpresaId: { type: DataTypes.INTEGER, allowNull: true }
});

Empresa.hasMany(User);
User.belongsTo(Empresa);

module.exports = { sequelize, User, Empresa, RegistroPonto, Ferias, Configuracao, Op };