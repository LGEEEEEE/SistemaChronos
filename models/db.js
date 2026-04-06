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
    dataVencimento: { type: DataTypes.DATE, defaultValue: null }
});

const User = sequelize.define('User', {
    nome: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    senha: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'funcionario' },
    horarioEntrada: { type: DataTypes.TIME, allowNull: true },
    horarioSaida: { type: DataTypes.TIME, allowNull: true },
    fotoReferenciaUrl: { type: DataTypes.STRING, allowNull: true },
    faceDescriptor: { type: DataTypes.TEXT, allowNull: true }, // 🧠 NOVO: DNA do Rosto!
    EmpresaId: { type: DataTypes.INTEGER, allowNull: true },
    diasTrabalho: { type: DataTypes.STRING, defaultValue: '1,2,3,4,5' } // 0=Dom, 1=Seg, 2=Ter... 6=Sáb
});

const RegistroPonto = sequelize.define('RegistroPonto', {
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    tipo: { type: DataTypes.STRING, allowNull: false },
    fotoUrl: { type: DataTypes.STRING, allowNull: true },
    latitude: { type: DataTypes.STRING, allowNull: true },  // 📍 NOVO
    longitude: { type: DataTypes.STRING, allowNull: true }, // 📍 NOVO
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

Empresa.hasMany(Configuracao);
Configuracao.belongsTo(Empresa);

User.hasMany(RegistroPonto);
RegistroPonto.belongsTo(User);

User.hasMany(Ferias);
Ferias.belongsTo(User);

module.exports = {
    sequelize,
    Empresa,
    User,
    RegistroPonto,
    Ferias,
    Configuracao,
    Op
};