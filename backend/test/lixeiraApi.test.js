const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

const consultas = [];
const banco = require.resolve('../src/db/database');
require.cache[banco] = {
  id: banco, filename: banco, loaded: true,
  exports: { unaccentEstaDisponivel: () => true, db: { query: async (sql, valores) => {
    consultas.push({ sql, valores });
    return { rows: sql.includes('COUNT(*) as n') ? [{ n: '31' }] : [{ id: 15, nome: 'JOÃO', total_fonada: '2', total_aovivo: '1' }] };
  } } },
};
const router = require('../src/routes/clientes');

test('lixeira combina busca parametrizada, pedidos removidos e paginação em contagem e lista', async () => {
  const app = express(); app.use('/clientes', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/clientes/lixeira`;
  try {
    for (const situacao of ['com_pedidos', 'sem_pedidos']) {
      consultas.length = 0;
      const r = await fetch(`${base}?busca=${encodeURIComponent("João' OR true --")}&situacao=${situacao}&ordenarPor=antigos&pagina=2`);
      assert.equal(r.status, 200);
      const resultado = await r.json();
      assert.equal(resultado.total, 31); assert.equal(resultado.pagina, 2);
      assert.equal(resultado.clientes[0].total_aovivo, '1');
      assert.equal(consultas.length, 2);
      for (const { sql, valores } of consultas) {
        assert.match(sql, /c\.excluido_em IS NOT NULL/);
        assert.match(sql, /unaccent\(c\.nome\) ILIKE unaccent\(\$1\)/);
        assert.match(sql, /f\.cliente_id=c\.id AND f\.excluido_em IS NOT NULL/);
        assert.match(sql, /a\.cliente_id=c\.id AND a\.excluido_em IS NOT NULL/);
        assert.equal(sql.includes('AND NOT (EXISTS'), situacao === 'sem_pedidos');
        assert.equal(valores[0], "%João' OR true --%");
        assert.ok(!sql.includes("João'"));
      }
      assert.match(consultas[1].sql, /ORDER BY c\.excluido_em ASC, c\.id ASC/);
      assert.deepEqual(consultas[1].valores.slice(1), [30, 30]);
    }
    for (const ordenarPor of ['__proto__', 'nome; DROP TABLE clientes']) {
      consultas.length = 0;
      const r = await fetch(`${base}?ordenarPor=${encodeURIComponent(ordenarPor)}`);
      assert.equal(r.status, 200);
      assert.match(consultas[1].sql, /ORDER BY c\.excluido_em DESC, c\.id DESC/);
      assert.ok(!consultas[1].sql.includes(ordenarPor));
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
