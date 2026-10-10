const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const relogio = require('../src/utils/dataHora');
require.cache[require.resolve('../src/utils/dataHora')].exports = { ...relogio, registroPedidoBrasilia: () => relogio.registroPedidoBrasilia(new Date('2026-10-10T02:55:00Z')) };
const registros = new Map();
const consultar = async (sql, valores = []) => {
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
  const tabela = sql.includes('fonadas') ? 'fonadas' : 'ao_vivo';
  if (sql.startsWith('INSERT')) {
    const colunas = sql.match(/\(([^)]+)\)/)[1].split(',').map(c => c.trim());
    const pedido = { id: 1, versao: 1, ...Object.fromEntries(colunas.map((c, i) => [c, valores[i]])) };
    registros.set(tabela, pedido); return { rows: [pedido] };
  }
  if (sql.startsWith('SELECT')) return { rows: [registros.get(tabela)] };
  if (sql.startsWith('UPDATE')) {
    assert.doesNotMatch(sql, /(?:data_pedido|horario_pedido)\s*=/);
    const campos = [...sql.matchAll(/(\w+) = \$(\d+)/g)].filter(([_, campo]) => !['id', 'versao'].includes(campo));
    const pedido = { ...registros.get(tabela), ...Object.fromEntries(campos.map(([_, campo, n]) => [campo, valores[Number(n) - 1]])) };
    registros.set(tabela, pedido); return { rows: [pedido] };
  }
  throw new Error('Consulta inesperada');
};
const arquivoBanco = require.resolve('../src/db/database');
require.cache[arquivoBanco] = { id: arquivoBanco, filename: arquivoBanco, loaded: true, exports: { db: { query: consultar }, pool: { connect: async () => ({ query: consultar, release() {} }) } } };
const fonadas = require('../src/routes/fonadas');
const aoVivo = require('../src/routes/aoVivo');

test('novas vendas usam relógio do servidor e edição preserva o registro original em ambas as modalidades', async () => {
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.usuario = { usuario: 'QA' }; next(); });
  app.use('/fonadas', fonadas); app.use('/ao-vivo', aoVivo);
  const servidor = app.listen(0, '127.0.0.1'); await once(servidor, 'listening');
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const enviar = (caminho, method, dados) => fetch(`${base}${caminho}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
  try {
    for (const [caminho, dados] of [
      ['/fonadas', { senha_os: 'QA-1', nome_comprador: 'CLIENTE QA', valor: 12, cobranca: '10/10/26', periodo: 'PIX' }],
      ['/ao-vivo', { numero_os: 'QA-2', comprador: 'CLIENTE QA', valor: 150, dia_entrega: '12/10/26' }],
    ]) {
      const nova = await enviar(caminho, 'POST', { ...dados, data_pedido: '10/10/26', horario_pedido: '10:25' });
      assert.equal(nova.status, 201);
      const pedido = await nova.json();
      assert.equal(pedido.data_pedido, '09/10/26'); assert.equal(pedido.horario_pedido, '23:55');
      const editada = await enviar(`${caminho}/1`, 'PUT', { versao: 1, valor: dados.valor + 1, data_pedido: '20/10/26', horario_pedido: '12:00' });
      assert.equal(editada.status, 200);
      const resultado = await editada.json();
      assert.equal(resultado.data_pedido, '09/10/26'); assert.equal(resultado.horario_pedido, '23:55');
      assert.equal(Number(resultado.valor), dados.valor + 1);
    }
  } finally { await new Promise(resolve => servidor.close(resolve)); }
});
