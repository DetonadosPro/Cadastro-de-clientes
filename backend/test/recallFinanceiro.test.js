const test = require('node:test');
const assert = require('node:assert/strict');
const { anexarFinanceiroRecall } = require('../src/utils/recallFinanceiro');

test('soma cada pedido uma vez, reúne modalidades e preserva a identidade do contato', async () => {
  let consultas = 0;
  const grupos = [{ clienteId: 7 }, { clienteId: 7 }, { clienteId: 8 }, { clienteId: null }];
  const resposta = await anexarFinanceiroRecall(grupos, async (sql, params) => {
    consultas++;
    assert.deepEqual(params, [[7, 8]]);
    assert.match(sql, /f\.excluido_em IS NULL/);
    assert.match(sql, /a\.excluido_em IS NULL/);
    assert.match(sql, /COALESCE\(f\.pagou,''\)<>'SIM' AND f\.valor>0/);
    assert.match(sql, /COALESCE\(a\.pagou,''\)<>'SIM' AND a\.valor>0/);
    assert.match(sql, /cobranca_reagendada/);
    assert.ok(sql.includes('PRAZO\\s*-\\s*DIA'));
    return { rows: [
      { id: 1, cliente_id: 7, tipo: 'FONADA', os: '100', valor: '35.15', mensagens: 2, data: '29/10/26' },
      { id: 1, cliente_id: 7, tipo: 'AOVIVO', os: '200', valor: '60.20', mensagens: 1, data: '01/11/26' },
      { id: 2, cliente_id: 7, tipo: 'FONADA', valor: '0.10', mensagens: 1, data: '' },
      { id: 3, cliente_id: 999, tipo: 'FONADA', valor: '300', mensagens: 1 },
    ] };
  });
  assert.equal(consultas, 1);
  assert.equal(resposta[0].financeiro.valorTotal, 95.45);
  assert.equal(resposta[0].financeiro.quantidadeMensagens, 4);
  assert.equal(resposta[0].financeiro.proximaData, '29/10/26');
  assert.equal(resposta[0].financeiro.pedidos.length, 3);
  assert.deepEqual(resposta[0].financeiro, resposta[1].financeiro);
  assert.equal(resposta[0].financeiro.pedidos[2].data, null);
  assert.deepEqual(resposta[2].financeiro, { valorTotal: 0, quantidadeMensagens: 0, proximaData: null, pedidos: [] });
  assert.equal(resposta[3].financeiro, null);
});

test('fila vazia ou sem cadastro não consulta nem atribui dívida por nome', async () => {
  const consultar = () => { throw new Error('Não deveria consultar'); };
  assert.deepEqual(await anexarFinanceiroRecall([], consultar), []);
  const itens = await anexarFinanceiroRecall([{ clienteNome: 'Maria', clienteId: null }], consultar);
  assert.equal(itens[0].financeiro, null);
});
