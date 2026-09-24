import test from 'node:test';
import assert from 'node:assert/strict';

import { mensagemContatoDestinatario, mensagemConfirmacao, mensagemRegistrarERemarcar } from '../src/utils/mensagemAgenda.js';

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

test('evita artigos e pronomes presumidos em nomes sem gênero cadastrado', () => {
  assert.match(mensagemContatoDestinatario('KETLYN', 'CATIUSSE'), /Aqui é Catiusse/);
  assert.match(mensagemConfirmacao('ANA', 'KETLYN', 'CATIUSSE'), /aqui é Catiusse\. Acabei de passar a mensagem para Ketlyn\. A pessoa gostou/);
  assert.match(mensagemRegistrarERemarcar('ANA', 'CATIUSSE', 'KETLYN'), /aqui é Ketlyn\. Ainda não consegui passar a mensagem para Catiusse\./);
});
