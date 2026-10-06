const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { db } = require('../src/db/database');
const cobranca = require('../src/routes/cobranca');

test('consulta de cobrança retorna destinatários das duas mensagens, sem nomes vazios ou repetidos', async () => {
  const original = db.query;
  db.query = async (sql) => {
    assert.match(sql, /SELECT[\s\S]*p1_para, p2_para[\s\S]*FROM fonadas/);
    return { rows: [
      { id: 1, p1_para: ' Fernanda ', p2_para: 'Carlos', valor: 50 },
      { id: 2, p1_para: 'Victor', p2_para: 'Victor', valor: 70 },
      { id: 3, p1_para: null, p2_para: '  ', valor: 80 },
      { id: 4, p1_para: '', p2_para: 'Maria', valor: 90 },
    ] };
  };
  const app = express();
  app.use('/api/cobranca', cobranca);
  const servidor = app.listen(0);
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/api/cobranca?pagou=TODOS`);
    assert.equal(resposta.status, 200);
    const dados = await resposta.json();
    assert.deepEqual(dados.pedidos.map(p => p.destinatarios), [['Fernanda', 'Carlos'], ['Victor'], [], ['Maria']]);
    assert.deepEqual(dados.pedidos.map(p => p.valor), [50, 70, 80, 90]);
  } finally {
    db.query = original;
    await new Promise(resolve => servidor.close(resolve));
  }
});
