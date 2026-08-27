const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dataBrParaDate,
  somarMesesCalendario,
  situacaoSegundaMensagem,
  validarDataUsoSegundaMensagem,
} = require('../src/utils/mensagemEmHaver');

function pedido(data_pedido, extras = {}) {
  return { data_pedido, p1_celular: '(34) 99999-9999', p2_resultado: '', ...extras };
}

function referencia(data) {
  return dataBrParaDate(data);
}

test('soma três meses de calendário com ajuste do último dia', () => {
  assert.equal(somarMesesCalendario(dataBrParaDate('31/01/2026'), 3).toISOString().slice(0, 10), '2026-04-30');
  assert.equal(somarMesesCalendario(dataBrParaDate('30/11/2025'), 3).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(somarMesesCalendario(dataBrParaDate('29/11/2023'), 3).toISOString().slice(0, 10), '2024-02-29');
});

test('mensagem nova e próxima do vencimento permanecem disponíveis', () => {
  assert.equal(situacaoSegundaMensagem(pedido('27/08/2026'), referencia('27/08/2026')).status, 'DISPONIVEL');
  assert.equal(situacaoSegundaMensagem(pedido('28/05/2026'), referencia('27/08/2026')).status, 'DISPONIVEL');
});

test('o próprio dia do limite de três meses ainda é válido', () => {
  const situacao = situacaoSegundaMensagem(pedido('10/05/2026'), referencia('10/08/2026'));
  assert.equal(situacao.status, 'DISPONIVEL');
  assert.equal(situacao.dataExpiracao, '10/08/2026');
});

test('depois do limite a mensagem fica expirada sem sumir do pedido', () => {
  const situacao = situacaoSegundaMensagem(pedido('10/05/2026'), referencia('11/08/2026'));
  assert.equal(situacao.status, 'EXPIRADA');
  assert.equal(situacao.disponivel, false);
});

test('resultado da segunda mensagem prevalece como utilizada', () => {
  const situacao = situacaoSegundaMensagem(
    pedido('10/01/2026', { p2_resultado: 'OK operador 10/02/26 14:00' }),
    referencia('27/08/2026')
  );
  assert.equal(situacao.status, 'UTILIZADA');
});

test('pedido interurbano sem campos p2 não concede segunda mensagem', () => {
  const situacao = situacaoSegundaMensagem(
    pedido('10/08/2026', { p1_celular: '(11) 99999-9999' }),
    referencia('27/08/2026')
  );
  assert.equal(situacao.status, 'NAO_CONCEDIDA');
});

test('campos p2 preservam o direito de pedidos históricos', () => {
  const situacao = situacaoSegundaMensagem(
    pedido('10/08/2026', { p1_celular: '(11) 99999-9999', p2_tema: 'Aniversário' }),
    referencia('27/08/2026')
  );
  assert.equal(situacao.status, 'DISPONIVEL');
});

test('data original inválida produz estado indeterminado e nunca disponível', () => {
  const situacao = situacaoSegundaMensagem(pedido('data antiga'), referencia('27/08/2026'));
  assert.equal(situacao.status, 'INDETERMINADA');
  assert.equal(situacao.disponivel, false);
});

test('validação de negócio rejeita uso e agendamento depois do limite', () => {
  const atual = pedido('27/08/2026');
  const hoje = referencia('27/08/2026');
  assert.equal(validarDataUsoSegundaMensagem(atual, '27/11/2026', hoje).ok, true);
  assert.equal(validarDataUsoSegundaMensagem(atual, '28/11/2026', hoje).ok, false);
});

test('validação de negócio rejeita segunda mensagem já utilizada', () => {
  const validacao = validarDataUsoSegundaMensagem(pedido('27/08/2026', { p2_resultado: 'OK' }), null, referencia('27/08/2026'));
  assert.equal(validacao.ok, false);
  assert.match(validacao.erro, /já foi utilizada/);
});
