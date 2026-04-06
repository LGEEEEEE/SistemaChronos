⏳ Chronos - Sistema de Ponto com Reconhecimento Facial (IA)
O Chronos é uma plataforma SaaS (Software as a Service) de última geração para controle de jornada de trabalho. Utilizando Inteligência Artificial para reconhecimento facial, o sistema elimina fraudes, reduz custos com hardware e automatiza a gestão de RH para empresas de todos os tamanhos.

🚀 Funcionalidades Principais
Para Empresas (RH) 🏢
Gestão de Colaboradores: Cadastro completo com upload de foto base para a IA via Supabase.

Painel de Controle: Visualização em tempo real de quem está trabalhando, em almoço ou ausente.

Configurações Flexíveis: Definição de horários de entrada/saída, tempo de almoço e saída antecipada às sextas-feiras.

Segurança por IP: Restrição de batida de ponto apenas para redes Wi-Fi ou locais autorizados.

Relatórios Inteligentes: Geração de relatório de faltas (CSV) e Espelho de Ponto mensal (PDF) usando Puppeteer.

Para Colaboradores 👤
Batida de Ponto com IA: Registro de entrada/saída através de selfie com validação facial em tempo real (TensorFlow.js + Face-api.js).

Extrato Individual: Acesso ao histórico completo de horas trabalhadas e saldo de banco de horas.

Módulo SaaS (Super Admin) 👑
Gestão de Clientes: Painel para monitorar todas as empresas cadastradas e número de usuários.

Controle de Acesso: Ativação ou bloqueio instantâneo de empresas (ex: por falta de pagamento).

🛠️ Tecnologias Utilizadas
Backend: Node.js com Express.

Banco de Dados: PostgreSQL (Produção) / SQLite (Desenvolvimento) com Sequelize ORM.

Inteligência Artificial: Face-api.js e TensorFlow.js.

Cloud Storage: Supabase (Armazenamento de fotos de referência).

Pagamentos: Integração com Mercado Pago.

PDF: Puppeteer para geração de documentos.

📦 Como Instalar e Rodar
1. Pré-requisitos
Node.js instalado (versão 18 ou superior).

Uma conta no Supabase (para as fotos).

Uma conta de desenvolvedor no Mercado Pago (para as assinaturas).

2. Clonar e Instalar
Bash
# Clone o repositório
git clone https://github.com/LGEEEEEE/chronos-ponto.git

# Entre na pasta
cd chronos-ponto

# Instale as dependências
npm install
3. Configurar Variáveis de Ambiente
Crie um arquivo .env na raiz do projeto e preencha as chaves:

Snippet de código
PORT=3000
SESSION_SECRET=uma_chave_muito_segura
DATABASE_URL=seu_link_do_postgres

# Supabase
SUPABASE_URL=sua_url_do_supabase
SUPABASE_KEY=sua_chave_do_supabase

# Mercado Pago
MP_ACCESS_TOKEN=seu_token_mp
MP_PUBLIC_KEY=sua_chave_publica_mp
BASE_URL=http://localhost:3000

# Admin Padrão
ADMIN_EMAIL=rh@empresa.com
ADMIN_SENHA=senha123
SUPER_ADMIN_EMAIL=dono@sistema.com
4. Rodar o Servidor
Bash
# Para desenvolvimento (reinicia automaticamente)
npm run dev

# Para produção
npm start
O sistema estará disponível em http://localhost:3000.

📂 Estrutura de Pastas (MVC)
/models: Definição das tabelas do banco de dados (Sequelize).

/controllers: Toda a lógica de negócio (cálculos, IA, pagamentos).

/routes: Definição das URLs do sistema.

/middlewares: Travas de segurança, autenticação e upload.

/views: Telas em HTML/EJS estilizadas com a marca Chronos.

/public: Arquivos estáticos (CSS, ícone, logomarca).

🛡️ Segurança e Boas Práticas
Senhas: Todas as senhas são criptografadas com bcryptjs antes de irem para o banco.

Sessões: Gerenciadas de forma persistente para evitar desconexões indesejadas.

IA Local: O processamento facial ocorre na memória RAM do servidor, garantindo privacidade e custo zero de armazenamento de selfies.

Desenvolvido com ❤️ por LG.