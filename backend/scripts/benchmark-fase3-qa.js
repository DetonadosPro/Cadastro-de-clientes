// Carga sintética exclusivamente no banco QA local. Execute preparar, medir e limpar.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const modo = process.argv[2];
if (!['preparar', 'medir', 'limpar'].includes(modo)) throw new Error('Use preparar, medir ou limpar.');
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Somente PostgreSQL local.');
url.pathname = '/pombo_correio_qa_auditoria';
const pool = new Pool({ connectionString: url.toString() });
const prefixo = 'TESTE_QA_PERF_FASE3_';

async function contagens(client) {
  const clientes = await client.query('SELECT COUNT(*)::int AS n FROM clientes WHERE nome LIKE $1', [`${prefixo}%`]);
  const fonadas = await client.query('SELECT COUNT(*)::int AS n FROM fonadas WHERE senha_os LIKE $1', [`${prefixo}%`]);
  const aoVivo = await client.query('SELECT COUNT(*)::int AS n FROM ao_vivo WHERE numero_os LIKE $1', [`${prefixo}%`]);
  return { clientes: clientes.rows[0].n, fonadas: fonadas.rows[0].n, aoVivo: aoVivo.rows[0].n };
}

async function executar() {
  const client = await pool.connect();
  try {
    const banco = await client.query('SELECT current_database() AS nome');
    if (banco.rows[0].nome !== 'pombo_correio_qa_auditoria') throw new Error('Banco não é QA.');
    if (modo === 'preparar') {
      const antes = await contagens(client);
      if (Object.values(antes).some(Boolean)) throw new Error('Massa de performance anterior ainda existe.');
      await client.query('BEGIN');
      try {
        await client.query(`INSERT INTO clientes (nome, whatsapp)
          SELECT $1 || LPAD(i::text, 5, '0'), '34999999999' FROM generate_series(1, 1000) AS i`, [prefixo]);
        await client.query(`WITH c AS (
          SELECT id, nome, row_number() OVER (ORDER BY id) AS n FROM clientes WHERE nome LIKE $1 || '%'
        ) INSERT INTO fonadas (senha_os, cliente_id, nome_comprador, valor, cobranca, periodo, pagou)
          SELECT $1 || 'F_' || i, c.id, c.nome, (i % 9999 + 1)::real / 100, '01/12/26', 'MANHÃ', 'NÃO'
          FROM generate_series(1, 5000) AS i JOIN c ON c.n = ((i - 1) % 1000) + 1`, [prefixo]);
        await client.query(`WITH c AS (
          SELECT id, nome, row_number() OVER (ORDER BY id) AS n FROM clientes WHERE nome LIKE $1 || '%'
        ) INSERT INTO ao_vivo (numero_os, cliente_id, comprador, valor, dia_entrega, pagou)
          SELECT $1 || 'A_' || i, c.id, c.nome, (i % 9999 + 1)::real / 100, '01/12/26', 'NÃO'
          FROM generate_series(1, 5000) AS i JOIN c ON c.n = ((i - 1) % 1000) + 1`, [prefixo]);
        await client.query('COMMIT');
      } catch (erro) { await client.query('ROLLBACK'); throw erro; }
      console.log(JSON.stringify({ banco: banco.rows[0].nome, criados: await contagens(client) }));
    } else if (modo === 'limpar') {
      await client.query('BEGIN');
      try {
        await client.query('DELETE FROM fonadas WHERE senha_os LIKE $1', [`${prefixo}%`]);
        await client.query('DELETE FROM ao_vivo WHERE numero_os LIKE $1', [`${prefixo}%`]);
        await client.query('DELETE FROM clientes WHERE nome LIKE $1', [`${prefixo}%`]);
        await client.query('COMMIT');
      } catch (erro) { await client.query('ROLLBACK'); throw erro; }
      console.log(JSON.stringify({ banco: banco.rows[0].nome, restantes: await contagens(client) }));
    } else {
      const massa = await contagens(client);
      if (massa.clientes !== 1000 || massa.fonadas !== 5000 || massa.aoVivo !== 5000) throw new Error('Massa QA incompleta.');
      const login = await fetch('http://127.0.0.1:3001/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario: 'QA_AUDITOR', senha: 'QA_TESTE_2026!' }) });
      if (!login.ok) throw new Error(`Login QA: ${login.status}`);
      const token = (await login.json()).token;
      const casos = [
        ['clientes', `/api/clientes?busca=${prefixo}&pagina=1`],
        ['fonadas', `/api/fonadas?busca=${prefixo}&pagina=1`],
        ['aoVivo', `/api/ao-vivo?busca=${prefixo}&pagina=1`],
        ['cobranca', `/api/cobranca?nome=${prefixo}&pagou=TODOS`],
        ['relatorios', '/api/relatorios/desempenho?inicio=01/09/26&fim=31/12/26'],
      ];
      const medidas = {};
      for (const [nome, rota] of casos) {
        const duracoes = [];
        let bytes = 0;
        for (let i = 0; i < 20; i++) {
          const inicio = performance.now();
          const resposta = await fetch(`http://127.0.0.1:3001${rota}`, { headers: { Authorization: `Bearer ${token}` } });
          const texto = await resposta.text();
          if (!resposta.ok) throw new Error(`${nome}: HTTP ${resposta.status}`);
          duracoes.push(performance.now() - inicio);
          bytes = Buffer.byteLength(texto);
        }
        duracoes.sort((a, b) => a - b);
        medidas[nome] = { requisicoes: 20, p50Ms: Number(duracoes[9].toFixed(1)), p95Ms: Number(duracoes[18].toFixed(1)), maxMs: Number(duracoes[19].toFixed(1)), bytesResposta: bytes };
      }
      const resultado = { banco: banco.rows[0].nome, massa, medidas, medidoEm: new Date().toISOString() };
      fs.writeFileSync(path.resolve(__dirname, '../../docs/auditoria/evidencias/benchmark-qa.json'), JSON.stringify(resultado, null, 2));
      console.log(JSON.stringify(resultado));
    }
  } finally { client.release(); await pool.end(); }
}

executar().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
