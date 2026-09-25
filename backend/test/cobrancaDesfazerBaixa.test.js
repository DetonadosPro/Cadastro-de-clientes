const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { db } = require('../src/db/database');
const cobranca = require('../src/routes/cobranca');

test('desfaz somente a baixa de uma Fonada recebida', async () => {
  const original = db.query;
  const pedidos = new Map([[10, { pagou: 'SIM', recebi: 'entregue', data_pagamento: '24/09/26', versao: 1 }], [11, { pagou: null, versao: 1 }]]);
  db.query = async (sql, valores) => {
    const pedido = pedidos.get(Number(valores[0]));
    if (sql.includes('UPDATE fonadas')) {
      if (!pedido || pedido.pagou !== 'SIM' || pedido.versao !== valores[1]) return { rows: [] };
      pedido.pagou = 'NÃO';
      pedido.recebi = null;
      pedido.data_pagamento = null;
      pedido.versao += 1;
      return { rows: [{ id: Number(valores[0]), versao: pedido.versao }] };
    }
    return { rows: pedido ? [{ pagou: pedido.pagou, versao: pedido.versao }] : [] };
  };
  const app = express();
  app.use(express.json());
  app.use('/api/cobranca', cobranca);
  const servidor = app.listen(0);
  try {
    const base = `http://127.0.0.1:${servidor.address().port}/api/cobranca`;
    const opcoes = (versao) => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao }) });
    const pago = await fetch(`${base}/10/desfazer-baixa`, opcoes(1));
    assert.equal(pago.status, 200);
    assert.deepEqual(pedidos.get(10), { pagou: 'NÃO', recebi: null, data_pagamento: null, versao: 2 });

    const repetido = await fetch(`${base}/10/desfazer-baixa`, opcoes(2));
    assert.equal(repetido.status, 409);
    const obsoleto = await fetch(`${base}/10/desfazer-baixa`, opcoes(1));
    assert.equal(obsoleto.status, 409);
    const pendente = await fetch(`${base}/11/desfazer-baixa`, opcoes(1));
    assert.equal(pendente.status, 409);
    const ausente = await fetch(`${base}/12/desfazer-baixa`, opcoes(1));
    assert.equal(ausente.status, 404);
    const invalido = await fetch(`${base}/abc/desfazer-baixa`, opcoes(1));
    assert.equal(invalido.status, 400);
    const semVersao = await fetch(`${base}/10/desfazer-baixa`, { method: 'PUT' });
    assert.equal(semVersao.status, 400);
  } finally {
    db.query = original;
    await new Promise((resolve) => servidor.close(resolve));
  }
});
