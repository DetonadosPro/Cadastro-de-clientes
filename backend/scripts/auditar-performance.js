// Somente leitura; executa as rotas reais contra o PostgreSQL local.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  throw new Error('A auditoria exige um banco local.');
}
process.env.PGOPTIONS = '-c default_transaction_read_only=on';
const express = require('express');
const { db, pool } = require('../src/db/database');
const app = express();
let consultas = [];
const query = db.query;
db.query = async (sql, params) => {
  const inicio = performance.now();
  const resposta = await query(sql, params);
  consultas.push({ ms: +(performance.now() - inicio).toFixed(2), linhas: resposta.rowCount });
  return resposta;
};
app.use('/clientes', require('../src/routes/clientes'));
async function executar() {
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise(resolve => servidor.once('listening', resolve));
  try {
    const contagem = await query('SELECT (SELECT count(*) FROM clientes) clientes, (SELECT count(*) FROM fonadas) fonadas, (SELECT count(*) FROM ao_vivo) ao_vivo');
    const resultados = [];
    for (const caminho of ['/clientes', '/clientes?pagina=2', '/clientes?busca=ana&campo=nome', '/clientes?situacao=pendencia', '/clientes?ordenarPor=total_pedidos', '/clientes?ordenarPor=ultimo_pedido', '/clientes/possiveis-duplicatas']) {
      const amostras = [];
      for (let i = 0; i < 5; i++) {
        consultas = [];
        const inicio = performance.now();
        const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`);
        const corpo = await resposta.text();
        if (!resposta.ok) throw new Error(`Falha ${resposta.status}: ${caminho}`);
        amostras.push({ ms: +(performance.now() - inicio).toFixed(2), bytes: Buffer.byteLength(corpo), consultas: [...consultas], hash: crypto.createHash('sha256').update(corpo).digest('hex') });
      }
      resultados.push({ caminho, amostras });
    }
    const resultado = { data: new Date().toISOString(), ambiente: 'PostgreSQL local, somente leitura, HTTP loopback, cinco amostras', registros: contagem.rows[0], resultados };
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(resultado, null, 2));
    console.log(JSON.stringify({ registros: resultado.registros, resultados: resultados.map(r => ({ caminho: r.caminho, medianaMs: r.amostras.map(a => a.ms).sort((a,b) => a-b)[2], bytes: r.amostras[0].bytes, consultas: r.amostras[0].consultas.length })) }, null, 2));
  } finally {
    servidor.close();
    await pool.end();
  }
}
executar().catch(e => { console.error(e.message); process.exitCode = 1; });
