const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

const caminhoData = require.resolve('../src/utils/dataHora');
const dataReal = require(caminhoData);
require.cache[caminhoData].exports = { ...dataReal, agoraBrasilia: () => new Date(2026, 9, 10) };
const caminhoBanco = require.resolve('../src/db/database');
const consultas = [];
const haver = [
  { id: 4, senha_os: '104', valor: 12, data_pedido: '09/09/26', p2_dia: '' },
  { id: 2, senha_os: '102', valor: 12, data_pedido: '10/08/26', p2_dia: '11/10/26' },
  { id: 1, senha_os: '101', valor: 12, data_pedido: '10/07/26', p2_dia: '' },
  { id: 5, senha_os: '105', valor: 20, data_pedido: '10/09/26', p2_dia: '' },
  { id: 6, senha_os: '106', valor: 12, data_pedido: '09/07/26', p2_dia: '' },
  { id: 7, senha_os: '107', valor: 12, data_pedido: '10/08/26', p2_resultado: 'OK' },
  { id: 3, senha_os: '103', valor: 12, data_pedido: '10/08/26', p2_dia: '  ' },
];
require.cache[caminhoBanco] = { id: caminhoBanco, filename: caminhoBanco, loaded: true, exports: { db: { query: async (sql, valores) => {
  consultas.push({ sql, valores });
  if (sql.startsWith('SELECT * FROM clientes')) return { rows: valores[0] === '1' ? [{ id: 1, nome: 'MARIA', bloqueado: false }] : [] };
  if (sql.includes('AS total_pedidos')) return { rows: [{ total_pedidos: 50, total_fonada: 40, total_aovivo: 10, pedidos_pendentes: 3, total_comprado: '700.00', valor_pendente: '60.00' }] };
  if (sql.includes('LIMIT 5')) return { rows: Array.from({ length: 5 }, (_, i) => ({ id: i + 20, tipo: 'Fonada', os: String(i + 120), data_pedido: '10/10/26', valor: 12, pagou: i ? '' : 'SIM' })) };
  return { rows: haver };
} } } };
const router = require('../src/routes/clientes');

test('resumo entrega totais globais, pagamento e somente haver disponível em ordem de vencimento', async () => {
  const app = express(); app.use('/clientes', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const resposta = await fetch(`${base}/clientes/1/resumo`);
    assert.equal(resposta.status, 200);
    const dados = await resposta.json();
    assert.equal(dados.resumo.total_pedidos, 50);
    assert.equal(dados.resumo.total_comprado, '700.00');
    assert.equal(dados.resumo.pedidos_pendentes, 3);
    assert.equal(dados.ultimasCompras.length, 5);
    assert.equal(dados.ultimasCompras[0].pagou, 'SIM');
    assert.deepEqual(dados.mensagensEmHaver.map(p => p.id), [1, 3, 4]);
    assert.equal(dados.mensagensEmHaver[0].dataExpiracao, '10/10/2026');
    assert.equal(dados.mensagensEmHaver[0].rota, '/fonada/1');
    assert.equal(consultas.length, 4);
    assert.ok(consultas.every(c => c.valores[0] === '1' && /^\s*SELECT\b/.test(c.sql)));
    const agregacao = consultas.find(c => c.sql.includes('AS total_pedidos')).sql;
    assert.match(agregacao, /SUM\(valor\), 0\) AS total_comprado/);
    assert.match(agregacao, /COUNT\(\*\) FILTER \(WHERE COALESCE\(pagou, ''\) != 'SIM'\)::integer AS pedidos_pendentes/);
    assert.equal((agregacao.match(/excluido_em IS NULL/g) || []).length, 2);
    const recentes = consultas.find(c => c.sql.includes('LIMIT 5')).sql;
    assert.equal((recentes.match(/valor, pagou/g) || []).length, 2);
    assert.equal((await fetch(`${base}/clientes/2/resumo`)).status, 404);
    assert.equal((await fetch(`${base}/clientes/0/resumo`)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
