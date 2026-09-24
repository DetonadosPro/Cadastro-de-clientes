import test from 'node:test';
import assert from 'node:assert/strict';
import { numeroWhatsAppBrasil } from '../src/utils/telefoneWhatsApp.js';

test('normaliza celulares com e sem DDI, máscara e DDD', () => {
  for (const valor of ['11999999999', '(11) 9 9999-9999', '+55 (11) 9 9999-9999']) {
    assert.equal(numeroWhatsAppBrasil(valor), '5511999999999');
  }
  assert.equal(numeroWhatsAppBrasil('34999999999'), '5534999999999');
  assert.equal(numeroWhatsAppBrasil('(11) 3333-4444'), '551133334444');
});

test('não cria destino para número incompleto, zero ou com DDI estranho', () => {
  for (const valor of ['', '111', '00000000000', '0011999999999', '5511999999999999', '11999999999999']) {
    assert.equal(numeroWhatsAppBrasil(valor), null, valor);
  }
});
