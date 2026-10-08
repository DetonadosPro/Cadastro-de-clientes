const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const dataHora = require('../src/utils/dataHora');
const arquivoData = require.resolve('../src/utils/dataHora');
require.cache[arquivoData].exports = { ...dataHora, hojeIsoBrasilia: () => dataHora.hojeIsoBrasilia(new Date('2026-10-08T01:30:00Z')) };
const arquivoBanco = require.resolve('../src/db/database');
const consultas = [];
const pedidos = [
  { id: 1, data_pedido: '07/10/26', p1_dia: '09/10/26', horario_pedido: '10:00' },
  { id: 2, data_pedido: '07/10/2026', p2_dia: '10/10/26', horario_pedido: '12:00' },
  { id: 3, data_pedido: '06/10/26', p1_dia: '07/10/26' },
  { id: 4, data_pedido: '06/10/26', p2_dia: '07/10/26' },
  { id: 5, data_pedido: '08/10/26', p1_dia: '07/10/26' },
  { id: 6, data_pedido: '07/10/26', excluido_em: '2026-10-07' },
];
let falhar = false;
require.cache[arquivoBanco] = { id: arquivoBanco, filename: arquivoBanco, loaded: true, exports: { db: { query: async (sql, valores) => {
  consultas.push({ sql, valores });
  if (falhar) throw new Error('Falha simulada');
  assert.match(sql, /WHERE f\.data_pedido IN \(\$1, \$2\) AND f\.excluido_em IS NULL/);
  assert.match(sql, /LEFT JOIN usuarios/);
  assert.doesNotMatch(sql, /WHERE[^]*p[12]_dia/);
  return { rows: pedidos.filter((p) => valores.includes(p.data_pedido) && !p.excluido_em) };
} } } };
const router = require('../src/routes/fonadas');

test('vendas de hoje usam a compra em Brasília, incluindo entregas futuras e excluindo mensagens de vendas antigas', async () => {
  const app = express(); app.use('/fonadas', router);
  const servidor = app.listen(0, '127.0.0.1'); await once(servidor, 'listening');
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/fonadas/hoje`);
    assert.equal(resposta.status, 200);
    const dados = await resposta.json();
    assert.equal(dados.data, '07/10/26');
    assert.deepEqual(dados.fonadas.map((p) => p.id), [1, 2]);
    assert.deepEqual(consultas[0].valores, ['07/10/26', '07/10/2026']);
    assert.match(consultas[0].sql, /horario_pedido END DESC NULLS LAST, f\.id DESC/);
  } finally { await new Promise((resolve) => servidor.close(resolve)); }
});

test('falha na consulta não aparece como um dia sem vendas', async (t) => {
  falhar = true;
  t.mock.method(console, 'error', () => {});
  const app = express(); app.use('/fonadas', router);
  const servidor = app.listen(0, '127.0.0.1'); await once(servidor, 'listening');
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/fonadas/hoje`);
    assert.equal(resposta.status, 500);
    assert.match((await resposta.json()).erro, /vendas de Fonada/);
  } finally { falhar = false; await new Promise((resolve) => servidor.close(resolve)); }
});
