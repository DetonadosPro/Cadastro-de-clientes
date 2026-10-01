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

test('usa artigos e pronomes femininos para Ketlyn e Catiusse', () => {
  assert.match(mensagemContatoDestinatario('KETLYN', 'CATIUSSE'), /É a Catiusse/);
  assert.match(mensagemConfirmacao('ANA', 'KETLYN', 'CATIUSSE'), /é a Catiusse\. Acabei de passar a mensagem para a Ketlyn, ela gostou/);
  assert.match(mensagemRegistrarERemarcar('ANA', 'CATIUSSE', 'KETLYN'), /é a Ketlyn\. Ainda não consegui passar a mensagem para a Catiusse\./);
});

test('inclui a O.S. após duas quebras de linha no contato da Agenda', () => {
  assert.equal(
    mensagemContatoDestinatario('MARIA', 'ENIMAR', '00123'),
    `${mensagemContatoDestinatario('MARIA', 'ENIMAR')}\n\nO.S: 00123`,
  );
});
