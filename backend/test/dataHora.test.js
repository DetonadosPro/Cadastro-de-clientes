const test = require('node:test');
const assert = require('node:assert/strict');
const { hojeIsoBrasilia } = require('../src/utils/dataHora');

test('Recall usa o dia de Brasília nas horas próximas à meia-noite UTC', () => {
  assert.equal(hojeIsoBrasilia(new Date('2026-09-23T01:30:00Z')), '2026-09-22');
  assert.equal(hojeIsoBrasilia(new Date('2026-09-23T03:30:00Z')), '2026-09-23');
});
