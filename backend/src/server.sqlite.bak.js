// src/server.js
// Ponto de entrada do backend. Roda o servidor Express na porta 3001.

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
const autenticar = require('./middleware/autenticar');

iniciarBanco();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/status', (req, res) => {
  res.json({ ok: true, sistema: 'Pombo-Correio', hora: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/fonadas', autenticar, fonadasRouter);
app.use('/api/ao-vivo', autenticar, aoVivoRouter);
app.use('/api/clientes', autenticar, clientesRouter);
app.use('/api/agenda', autenticar, agendaRouter);
app.use('/api/cobranca', autenticar, cobrancaRouter);
app.use('/api/relatorios', autenticar, relatoriosRouter);

const PORTA = process.env.PORTA || 3001;
app.listen(PORTA, () => {
  console.log(`\n✅ Servidor Pombo-Correio rodando em http://localhost:${PORTA}`);
  console.log(`   Para outras pessoas na sua rede acessarem, use o IP deste computador.\n`);
});
