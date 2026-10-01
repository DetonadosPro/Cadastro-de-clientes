const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarConfiguracoes, comConfiguracoes, limiteValido } = require('../src/utils/configuracoes');
const { temDireitoSegundaMensagem, situacaoSegundaMensagem, validarDataUsoSegundaMensagem } = require('../src/utils/mensagemEmHaver');

test('limite aceita reais e centavos e rejeita valores inválidos', () => {
  for (const valor of [0, 12, 12.01, 25.5]) assert.equal(limiteValido(valor), true);
  for (const valor of [-1, null, '', '12', NaN, Infinity, 12.001, 100001]) assert.equal(limiteValido(valor), false);
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
