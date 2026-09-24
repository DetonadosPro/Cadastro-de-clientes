const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function executar() {
  if (process.env.QA_E2E_ISOLATED_DB !== '1') throw new Error('Exige QA_E2E_ISOLATED_DB=1.');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Exige PostgreSQL local.');
  url.pathname = '/pombo_correio_qa_auditoria';
  const pool = new Pool({ connectionString: url.toString() });
  try {
    const banco = (await pool.query('SELECT current_database() AS nome')).rows[0].nome;
    if (banco !== 'pombo_correio_qa_auditoria') throw new Error('Banco QA não selecionado.');
    const contagens = (await pool.query(`SELECT
      (SELECT count(*)::int FROM clientes WHERE nome LIKE 'TESTE_QA_PERF_FASE3_%') AS clientes,
      (SELECT count(*)::int FROM fonadas WHERE senha_os LIKE 'TESTE_QA_PERF_FASE3_%') AS fonadas,
      (SELECT count(*)::int FROM ao_vivo WHERE numero_os LIKE 'TESTE_QA_PERF_FASE3_%') AS ao_vivo`)).rows[0];
    if (contagens.clientes !== 1000 || contagens.fonadas !== 5000 || contagens.ao_vivo !== 5000) throw new Error('Massa de performance QA incompleta.');
    const login = await fetch('http://127.0.0.1:3001/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario: 'QA_AUDITOR', senha: process.env.QA_E2E_PASSWORD }) });
    if (!login.ok) throw new Error(`Login QA HTTP ${login.status}`);
    const token = (await login.json()).token;
    const resposta = await fetch('http://127.0.0.1:3001/api/cobranca?nome=TESTE_QA_PERF_FASE3_&pagou=TODOS', { headers: { Authorization: `Bearer ${token}` } });
    if (!resposta.ok) throw new Error(`Cobrança HTTP ${resposta.status}`);
    const buffer = Buffer.from(await resposta.arrayBuffer());
    const dados = JSON.parse(buffer.toString('utf8'));
    const pedidos = dados.pedidos || [];
    if (pedidos.length !== 5000 || pedidos.some((pedido) => !String(pedido.nome || '').startsWith('TESTE_QA_PERF_FASE3_'))) throw new Error('Resposta contém pedidos fora da massa QA.');
    const campos = {};
    for (const pedido of pedidos) for (const [chave, valor] of Object.entries(pedido)) {
      const item = campos[chave] ||= { bytesAproximados: 0, nulos: 0, valoresUnicos: new Set() };
      item.bytesAproximados += Buffer.byteLength(JSON.stringify(chave)) + 1 + Buffer.byteLength(JSON.stringify(valor));
      if (valor == null) item.nulos += 1;
      item.valoresUnicos.add(JSON.stringify(valor));
    }
    const porCampo = Object.fromEntries(Object.entries(campos).sort((a, b) => b[1].bytesAproximados - a[1].bytesAproximados).map(([chave, item]) => [chave, { bytesAproximados: item.bytesAproximados, nulos: item.nulos, valoresUnicos: item.valoresUnicos.size }]));
    const resultado = { banco, contagens, pedidosRetornados: pedidos.length, bytesResposta: buffer.length, bytesGzip: gzipSync(buffer).length,
      temPaginacao: false, camposPorPedido: Object.keys(pedidos[0] || {}).length, porCampo,
      medidoEm: new Date().toISOString() };
    fs.writeFileSync(path.resolve(__dirname, '../../docs/auditoria/evidencias/cobranca-payload-fase4-qa.json'), JSON.stringify(resultado, null, 2));
    console.log(JSON.stringify({ pedidosRetornados: resultado.pedidosRetornados, bytesResposta: resultado.bytesResposta, bytesGzip: resultado.bytesGzip, camposPorPedido: resultado.camposPorPedido, maioresCampos: Object.entries(porCampo).slice(0, 12) }, null, 2));
  } finally { await pool.end(); }
}

executar().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
