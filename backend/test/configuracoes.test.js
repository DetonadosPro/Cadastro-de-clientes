const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarConfiguracoes, comConfiguracoes, limiteValido, mesesValidos } = require('../src/utils/configuracoes');
const { temDireitoSegundaMensagem, situacaoSegundaMensagem, validarDataUsoSegundaMensagem } = require('../src/utils/mensagemEmHaver');

test('limite aceita reais e centavos e rejeita valores inválidos', () => {
  for (const valor of [0, 12, 12.01, 25.5]) assert.equal(limiteValido(valor), true);
  for (const valor of [-1, null, '', '12', NaN, Infinity, 12.001, 100001]) assert.equal(limiteValido(valor), false);
});

test('prazo configurável recalcula a validade e respeita o último dia do mês', () => {
  for (const valor of [1, 3, 6, 120]) assert.equal(mesesValidos(valor), true);
  for (const valor of [0, -1, 1.5, 121, '6', null]) assert.equal(mesesValidos(valor), false);
  const pedido = { valor: 12, data_pedido: '31/01/26' };
  comConfiguracoes({ meses_mensagem_em_haver: 1 }, () => {
    assert.equal(situacaoSegundaMensagem(pedido, new Date(2026, 1, 28)).dataExpiracao, '28/02/2026');
    assert.equal(situacaoSegundaMensagem(pedido, new Date(2026, 2, 1)).disponivel, false);
  });
  comConfiguracoes({ meses_mensagem_em_haver: 6 }, () => {
    assert.equal(situacaoSegundaMensagem(pedido, new Date(2026, 2, 1)).disponivel, true);
    assert.equal(situacaoSegundaMensagem(pedido).dataExpiracao, '31/07/2026');
  });
});

test('carrega o limite persistido no banco sem assumir o padrão', async () => {
  const configuracoes = await carregarConfiguracoes(async () => ({ rows: [{ limite_segunda_mensagem: '18.50', versao: 4 }] }));
  assert.equal(configuracoes.limite_segunda_mensagem, 18.5);
  assert.equal(configuracoes.versao, 4);
  await assert.rejects(carregarConfiguracoes(async () => ({ rows: [] })), /indisponíveis/);
});

test('regra por valor ignora DDD e campos antigos p2, e respeita o limite inclusive', () => {
  assert.equal(temDireitoSegundaMensagem({ valor: 12, p1_celular: '11999999999' }), true);
  assert.equal(temDireitoSegundaMensagem({ valor: '12.00' }), true);
  assert.equal(temDireitoSegundaMensagem({ valor: 12.01, p1_celular: '34999999999', p2_tema: 'ANIV' }), false);
  for (const valor of [null, undefined, '', -1, 'inválido']) assert.equal(temDireitoSegundaMensagem({ valor }), false);
});

test('nova configuração altera elegibilidade e mantém requisições concorrentes isoladas', async () => {
  const resultados = await Promise.all([12, 20].map((limite) => comConfiguracoes({ limite_segunda_mensagem: limite }, async () => {
    await new Promise((resolve) => setImmediate(resolve));
    return temDireitoSegundaMensagem({ valor: 15 });
  })));
  assert.deepEqual(resultados, [false, true]);
});

test('pedido acima do limite não tem saldo nem pode utilizar segunda mensagem', () => {
  const pedido = { valor: 12.01, data_pedido: '01/10/26', p1_celular: '34999999999', p2_tema: 'ANIV' };
  const hoje = new Date(2026, 9, 1);
  assert.equal(situacaoSegundaMensagem(pedido, hoje).disponivel, false);
  assert.equal(validarDataUsoSegundaMensagem(pedido, null, hoje).ok, false);
  assert.equal(situacaoSegundaMensagem({ ...pedido, p2_resultado: 'MENSAGEM PASSADA' }, hoje).status, 'UTILIZADA');
});
