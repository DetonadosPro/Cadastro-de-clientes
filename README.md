# Pombo-Correio

Sistema online de Clientes, pedidos Fonada e Ao Vivo, Agenda, Cobrança, Recall e Relatórios. O backend usa **PostgreSQL**; o frontend é uma aplicação React.

## Requisitos

- Node.js 22.5 ou superior.
- Um banco PostgreSQL acessível pelo backend.
- Duas pastas de dependências: execute `npm ci` em `backend` e `frontend`.

## Configuração

Crie `backend/.env` com base em `backend/.env.example` e configure, no mínimo, `DATABASE_URL`, `JWT_SECRET` e `SENHA_MESTRA`. Guarde os segredos fora do repositório. O backend cria e atualiza as tabelas na inicialização; confira a conexão antes de iniciar para evitar apontar para o banco errado.

Para uso local, inicie o backend com `npm start` na pasta `backend` e o frontend com `npm run dev` na pasta `frontend`. O backend usa a porta 3001 por padrão; o Vite informa a URL local do frontend. Configure `VITE_API_URL` no frontend quando a API estiver em outra origem.

Para publicação no Railway, siga [DEPLOY.md](DEPLOY.md). A interface de administração na tela de login permite criar usuários mediante a senha mestra. Dois operadores podem usar o sistema simultaneamente; alterações concorrentes em um mesmo registro são rejeitadas com aviso para recarregar.

## Dados e recuperação

Os dados ficam no **PostgreSQL indicado por `DATABASE_URL`**, não em `backend/data/pombo.db`. Não apague arquivos locais para reiniciar importações ou recuperar dados.

O backup automático compacta as dez tabelas persistentes em arquivos `.json.gz` e as envia ao endereço configurado por `EMAIL_DESTINATARIO` quando o serviço de email está configurado. Os anexos incluem dados de clientes e hashes de senhas: guarde o email em local seguro. A restauração automatizada disponível em `backend/scripts/restaurar-backup-qa.js` é **exclusiva para o banco descartável de auditoria**; não execute restauração diretamente no banco principal sem um plano de recuperação validado.

Os scripts de importação de planilha são legados e devem ser revisados antes de qualquer execução contra o banco atual.

## Verificação

- `npm test` em `backend` e `frontend` executa os testes de unidade.
- `npm run build` em `frontend` verifica a compilação.
- `npm run test:relatorios` em `frontend` verifica comparações, gráficos interativos, filtros, paginação e telas de 320 a 1440 pixels com dados simulados, sem acessar o banco. Usa o Microsoft Edge instalado.
- `npm run test:agenda` em `frontend` verifica a agenda moderna, seus filtros, lembretes, baixas e remarcações com dados simulados, sem acessar o banco. Inclui teclado, toque, telas de 320 a 1920 pixels, alturas reduzidas, rolagem dos painéis e preservação da posição ao selecionar pedidos e voltar pelo histórico; usa o Microsoft Edge instalado.
- A suíte de navegação fica em `frontend/e2e` e exige o banco QA isolado. Consulte [docs/auditoria/INVENTARIO_E_COBERTURA.md](docs/auditoria/INVENTARIO_E_COBERTURA.md) antes de executá-la.
