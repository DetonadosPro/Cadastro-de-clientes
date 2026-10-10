const test = require('node:test');
const assert = require('node:assert/strict');
const { hojeIsoBrasilia, registroPedidoBrasilia } = require('../src/utils/dataHora');

test('Recall usa o dia de Brasília nas horas próximas à meia-noite UTC', () => {
  assert.equal(hojeIsoBrasilia(new Date('2026-09-23T01:30:00Z')), '2026-09-22');
  assert.equal(hojeIsoBrasilia(new Date('2026-09-23T03:30:00Z')), '2026-09-23');
});

test('registro da venda usa Brasília, inclusive na virada do dia UTC', () => {
  assert.deepEqual(registroPedidoBrasilia(new Date('2026-10-10T02:55:00Z')), { data_pedido: '09/10/26', horario_pedido: '23:55' });
  assert.deepEqual(registroPedidoBrasilia(new Date('2026-10-10T03:00:00Z')), { data_pedido: '10/10/26', horario_pedido: '00:00' });
});
