const test = require('node:test');
const assert = require('node:assert/strict');
const { dataCurtaValida } = require('../src/utils/validarDataCurta');

test('aceita dia bissexto real e formatos com dois ou quatro dígitos de ano', () => {
  assert.equal(dataCurtaValida('29/02/2000'), true);
  assert.equal(dataCurtaValida('29/02/24'), true);
});

test('rejeita datas inexistentes, incompletas e em ano não bissexto', () => {
  for (const data of ['31/04/26', '29/02/1900', '29/02/25', '00/12/26', '01/13/26', '1/1/26', '']) {
    assert.equal(dataCurtaValida(data), false, data);
  }
});
