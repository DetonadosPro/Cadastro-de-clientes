// src/server.js
// Ponto de entrada do backend. Roda o servidor Express.
//
// Migrado para PostgreSQL: iniciarBanco() agora é assíncrona (cria as
// tabelas via consultas ao Postgres), então o servidor só começa a
// aceitar conexões DEPOIS que o banco estiver pronto — antes disso não
// tinha problema porque SQLite era síncrono e instantâneo, mas com
// Postgres a conexão de rede pode levar um instante.

// Carrega variáveis do arquivo .env (só tem efeito localmente — no
// Railway, as variáveis já vêm do próprio ambiente). Em uma worktree, o
// .env não é copiado pelo Git; nesse caso, localiza com segurança o .env
// do checkout principal por meio do ponteiro do arquivo .git.
// Precisa rodar antes de qualquer require que dependa de process.env.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function localizarArquivoEnv() {
  const envLocal = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envLocal)) return envLocal;

  const ponteiroGit = path.resolve(__dirname, '../../.git');
  try {
    if (!fs.statSync(ponteiroGit).isFile()) return envLocal;
    const conteudo = fs.readFileSync(ponteiroGit, 'utf8').trim();
    const correspondencia = conteudo.match(/^gitdir:\s*(.+)$/i);
    if (!correspondencia) return envLocal;

    const diretorioGit = path.resolve(path.dirname(ponteiroGit), correspondencia[1]);
    const marcadorWorktree = `${path.sep}.git${path.sep}worktrees${path.sep}`;
    const indiceWorktree = diretorioGit.toLowerCase().lastIndexOf(marcadorWorktree.toLowerCase());
    if (indiceWorktree < 0) return envLocal;

    const raizPrincipal = diretorioGit.slice(0, indiceWorktree);
    const envPrincipal = path.join(raizPrincipal, 'backend', '.env');
    return fs.existsSync(envPrincipal) ? envPrincipal : envLocal;
  } catch (erro) {
    return envLocal;
  }
}

dotenv.config({ path: localizarArquivoEnv() });

const express = require('express');
const cors = require('cors');
const { iniciarBanco } = require('./db/database');
const { router: authRouter } = require('./routes/auth');
const fonadasRouter = require('./routes/fonadas');
const aoVivoRouter = require('./routes/aoVivo');
const clientesRouter = require('./routes/clientes');
const agendaRouter = require('./routes/agenda');
const cobrancaRouter = require('./routes/cobranca');
const relatoriosRouter = require('./routes/relatorios');
const recallRouter = require('./routes/recall');
const autenticar = require('./middleware/autenticar');
const { iniciarAgendador } = require('./tarefas/agendador');

async function iniciar() {
  try {
    await iniciarBanco();
    console.log('✅ Banco de dados conectado e tabelas verificadas.');
  } catch (erro) {
    console.error('❌ Não foi possível conectar ao banco de dados:', erro.message);
    console.error('   Verifique se a variável DATABASE_URL está configurada corretamente.');
    process.exit(1);
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/status', (req, res) => {
    res.json({ ok: true, sistema: 'Pombo-Correio', hora: new Date().toISOString() });
  });

  // Rotas para disparar as tarefas agendadas manualmente (útil para
  // testar sem esperar o cron rodar no horário certo) — exigem login,
  // igual o resto do sistema.
  app.post('/api/tarefas/backup-agora', autenticar, async (req, res) => {
    const { rodarBackupSemanal } = require('./tarefas/backupSemanal');
    await rodarBackupSemanal();
    res.json({ ok: true, mensagem: 'Backup disparado — confira o email em alguns instantes.' });
  });
  app.post('/api/tarefas/resumo-agora', autenticar, async (req, res) => {
    const { rodarResumoDiario } = require('./tarefas/resumoDiario');
    await rodarResumoDiario();
    res.json({ ok: true, mensagem: 'Resumo disparado — confira o email em alguns instantes.' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/fonadas', autenticar, fonadasRouter);
  app.use('/api/ao-vivo', autenticar, aoVivoRouter);
  app.use('/api/clientes', autenticar, clientesRouter);
  app.use('/api/agenda', autenticar, agendaRouter);
  app.use('/api/cobranca', autenticar, cobrancaRouter);
  app.use('/api/relatorios', autenticar, relatoriosRouter);
  app.use('/api/recall', autenticar, recallRouter);

  const PORTA = process.env.PORTA || process.env.PORT || 3001;
  app.listen(PORTA, () => {
    console.log(`\n✅ Servidor Pombo-Correio rodando na porta ${PORTA}\n`);
  });

  iniciarAgendador();
}

iniciar();
