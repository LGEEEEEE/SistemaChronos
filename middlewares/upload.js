const multer = require('multer');

// Configura o Multer para usar a Memória RAM (Necessário para o Supabase)
const storage = multer.memoryStorage();

// Cria a instância do upload com limite de tamanho (ex: 5MB para evitar sobrecarga)
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
    }
});

// Exporta DIRETAMENTE a instância (é isso que resolve o seu erro!)
module.exports = upload;