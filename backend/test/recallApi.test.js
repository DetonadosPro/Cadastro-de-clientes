const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const consultas = [];
const linha = { pedido_id: 1, cliente_id: 1, senha_os: '123', cliente_nome: 'katia EMILLY', aniversariante: 'márcia', tema: 'Aniversário', dia_mensagem: '05/10/25', numero_mensagem: 1 };
const banco = require.resolve('../src/db/database');
require.cache[banco] = { id: banco, filename: banco, loaded: true, exports: { db: { query: async (sql, valores) => {
  consultas.push({ sql, valores });
  return { rows: sql.includes('SELECT f.id pedido_id, f.cliente_id') ? [{ ...linha }] : [] };
} } } };
const router = require('../src/routes/recall');

test('fila de 05/10/26 e busca devolvem nomes uniformes e preservam relação e histórico', async () => {
  const app = express(); app.use('/recall', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/recall`;
  try {
    const fila = await (await fetch(`${base}/fila?data=2026-10-05`)).json();
    assert.equal(fila.porDiaMensagem[0].clienteNome, 'KATIA EMILLY');
    assert.equal(fila.porDiaMensagem[0].aniversariante, 'MÁRCIA');
    assert.equal(fila.porDiaMensagem[0].ultimoPedido.os, '123');
    for (const termo of ['márcia', 'MARCIA', 'Ma\u0301rcia']) {
      consultas.length = 0;
      const resultado = await (await fetch(`${base}/buscar?termo=${encodeURIComponent(termo)}`)).json();
      assert.equal(resultado.recebeuDe[0].aniversariante, 'MÁRCIA');
      const buscas = consultas.filter((q) => q.sql.includes('LIKE $1'));
      assert.equal(buscas.length, 2);
      for (const busca of buscas) {
        assert.equal(busca.valores[0], '%MARCIA%');
        assert.match(busca.sql, /normalize\(COALESCE/);
      }
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
