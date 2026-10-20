const test = require('node:test');
const assert = require('node:assert/strict');
const { recebimentosAgenda } = require('../src/utils/recebimentosAgenda');

test('recebimento aparece na data combinada ou reagendada e sai ao receber ou excluir', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE ao_vivo (id int, numero_os text, comprador text,
      cliente_id int, para text, valor numeric, pagamento text, data_cobranca text, pagou text, excluido_em timestamp)`);
    await client.query(`INSERT INTO ao_vivo (id, pagamento, data_cobranca, pagou, excluido_em) VALUES
      (1, 'PRAZO - DIA 20/10/26 - PIX', NULL, NULL, NULL),
      (2, 'PRAZO - DIA 20/10/2026 - MP', NULL, 'NÃO', NULL),
      (3, 'PRAZO - DIA 20/10/26 - PIX', '21/10/26', '', NULL),
      (4, 'PRAZO - DIA 20/10/26 - PIX', NULL, 'SIM', NULL),
      (5, 'PIX', NULL, '', NULL),
      (6, 'PRAZO - DIA 20/10/26', NULL, '', NOW()),
      (7, 'PRAZO - DIA 31/02/26', NULL, '', NULL)`);
    const itens = await recebimentosAgenda(client, ['20/10/26', '20/10/2026']);
    assert.deepEqual(itens.map(i => i.id).sort(), [1, 2]);
    assert.ok(itens.every(i => i.ehCobranca && !i.passada && i.horario_entrega === ''));
    assert.deepEqual((await recebimentosAgenda(client, ['21/10/26'])).map(i => i.id), [3]);
    assert.deepEqual(await recebimentosAgenda(client, ['31/02/26']), []);
    await client.query("UPDATE ao_vivo SET pagou = 'SIM' WHERE id = 1");
    assert.deepEqual((await recebimentosAgenda(client, ['20/10/26', '20/10/2026'])).map(i => i.id), [2]);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
