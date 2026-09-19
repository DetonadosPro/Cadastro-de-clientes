import test from 'node:test';
import assert from 'node:assert/strict';

import { mensagemContatoDestinatario } from '../src/utils/mensagemAgenda.js';

test('monta a mensagem ao destinatário no feminino para Enimar', () => {
  assert.equal(
    mensagemContatoDestinatario('MARIA DA SILVA', 'ENIMAR'),
    'Oi Maria, tudo bem?\nÉ a Enimar do Pombo-Correio Mensagens\nNós temos uma mensagem pra você.\nAssim que estiver disponível, você pode avisar?',
  );
});

test('monta a mensagem ao destinatário no masculino para Victor', () => {
  assert.equal(
    mensagemContatoDestinatario('joão', 'victor'),
    'Oi João, tudo bem?\nÉ o Victor do Pombo-Correio Mensagens\nNós temos uma mensagem pra você.\nAssim que estiver disponível, você pode avisar?',
  );
});
