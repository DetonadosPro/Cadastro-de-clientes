const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { DATA_PEDIDO_ORDENACAO_SQL } = require('../src/utils/dataPedidoSql');

test('PostgreSQL tolera datas legadas inválidas e ordena compras válidas sem usar a importação', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const banco = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await banco.connect();
    await banco.query('BEGIN READ ONLY');
    const casos = [
      ['00/30/32', null], ['00/00/0000', null], ['31/04/26', null], ['29/02/2025', null],
      ['29/02/1900', null], ['29/02/2000', 20000229], ['29/02/24', 20240229],
      ['31/12/26', 20261231], ['01/01/99', 20990101], [' 25/09/2026 ', 20260925],
      ['10/13/26', null], ['52/60/92', null], ['10/10/0000', null],
      [null, null], ['', null], ['sem data', null], ['01/02/2a', null],
    ];
    for (const [data, esperado] of casos) {
      const r = await banco.query(`SELECT ${DATA_PEDIDO_ORDENACAO_SQL} AS ordem FROM (SELECT $1::text AS data_pedido) compra`, [data]);
      assert.equal(r.rows[0].ordem, esperado, `Data: ${data}`);
    }
    const r = await banco.query(`SELECT id, ${DATA_PEDIDO_ORDENACAO_SQL} AS ordem FROM (VALUES
      (1, '00/30/32', '2026-10-10'), (2, '25/09/26', '2026-08-20'),
      (3, '24/08/26', '2026-10-10'), (4, '', '2026-10-11')
    ) compras(id, data_pedido, criado_em) ORDER BY ordem DESC NULLS LAST, criado_em DESC, id DESC LIMIT 3`);
    assert.deepEqual(r.rows.map(p => p.id), [2, 3, 4]);
  } finally {
    if (banco._connected) await banco.query('ROLLBACK');
    await banco.end();
  }
});
