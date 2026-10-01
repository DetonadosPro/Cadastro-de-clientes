const test = require('node:test');
const assert = require('node:assert/strict');
const { anexarMensagensEmHaver } = require('../src/utils/recallMensagensEmHaver');

test('Recall conta somente mensagens disponíveis em todos os pedidos do cliente', async () => {
  const referencia = new Date(2026, 9, 1);
  const grupos = [{ clienteId: 1 }, { clienteId: 2 }, { clienteId: null }, { clienteId: 1 }];
  const pedido = { valor: 12, cliente_id: 1, data_pedido: '01/09/26', p1_celular: '34999991111', p2_resultado: '' };
  let consultas = 0;
  const resultado = await anexarMensagensEmHaver(grupos, async (_sql, valores) => {
    consultas++;
    assert.deepEqual(valores, [[1, 2]]);
    return { rows: [
      { ...pedido, id: 10, senha_os: '0010' },
      { ...pedido, id: 11, data_pedido: '01/05/26' },
      { ...pedido, id: 12, p2_resultado: 'MENSAGEM PASSADA' },
      { ...pedido, id: 13, valor: 12.01 },
      { ...pedido, id: 14, data_pedido: 'inválida' },
    ] };
  }, referencia);
  assert.equal(consultas, 1);
  assert.deepEqual(resultado[0].mensagensEmHaver, [{ pedidoId: 10, os: '0010', dataExpiracao: '01/12/2026' }]);
  assert.deepEqual(resultado[1].mensagensEmHaver, []);
  assert.equal(resultado[2].mensagensEmHaver, null);
  assert.deepEqual(resultado[3].mensagensEmHaver, resultado[0].mensagensEmHaver);
});

test('pessoa sem cadastro não recebe saldo de outra pessoa e não exige consulta', async () => {
  const resultado = await anexarMensagensEmHaver([{ clienteId: null }], async () => { throw new Error('Consulta inesperada'); });
  assert.equal(resultado[0].mensagensEmHaver, null);
});
