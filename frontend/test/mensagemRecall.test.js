import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecallWhatsAppMessage, buildRecallWhatsAppUrl } from '../src/utils/mensagemRecall.js';

const base = {
  contato: '  BRUNA LUIZA PRESOTTO  ',
  aniversariante: 'CLAUDEAN PEREIRA',
  usuario: 'ENIMAR BENEDETTI',
};

test('Pesquisa 1: usuária mulher e aniversariante homem', () => {
  assert.equal(
    buildRecallWhatsAppMessage({ ...base, modoFila: 'DIA_MENSAGEM', generoUsuario: 'feminino', generoAniversariante: 'masculino' }),
    'Oi Bruna, é a Enimar do Pombo Correio. Amanhã é aniversário do Claudean🥳. Você gostaria de passar uma mensagem pra ele?'
  );
});

test('Pesquisa 1: usuário homem e aniversariante mulher', () => {
  assert.equal(
    buildRecallWhatsAppMessage({ ...base, modoFila: 'DIA_MENSAGEM', usuario: 'vIcToR henrique', aniversariante: 'ADRIANA SILVA', generoUsuario: 'homem', generoAniversariante: 'mulher' }),
    'Oi Bruna, é o Victor do Pombo Correio. Amanhã é aniversário da Adriana🥳. Você gostaria de passar uma mensagem pra ela?'
  );
});

test('Pesquisa 2: usuária mulher e aniversariante mulher', () => {
  assert.equal(
    buildRecallWhatsAppMessage({ ...base, modoFila: 'ANIVERSARIO', aniversariante: 'ADRIANA DE SOUZA', generoUsuario: 'f', generoAniversariante: 'f' }),
    'Oi Bruna, é a Enimar do Pombo Correio Mensagens. Vimos em nosso cadastro que amanhã é aniversário da Adriana🥳. Você gostaria de passar uma mensagem de aniversário pra ela?'
  );
});

test('Pesquisa 2: usuário homem e aniversariante homem', () => {
  assert.equal(
    buildRecallWhatsAppMessage({ ...base, modoFila: 'ANIVERSARIO', usuario: 'VICTOR HENRIQUE', generoUsuario: 'm', generoAniversariante: 'm' }),
    'Oi Bruna, é o Victor do Pombo Correio Mensagens. Vimos em nosso cadastro que amanhã é aniversário do Claudean🥳. Você gostaria de passar uma mensagem de aniversário pra ele?'
  );
});

test('troca de pesquisa e contato não conserva dados antigos', () => {
  const primeira = buildRecallWhatsAppMessage({ ...base, modoFila: 'DIA_MENSAGEM' });
  const segunda = buildRecallWhatsAppMessage({ ...base, modoFila: 'ANIVERSARIO', contato: 'MARIA DE FÁTIMA', aniversariante: 'ÉRICA ALVES' });
  assert.match(primeira, /^Oi Bruna,.*Pombo Correio\./);
  assert.match(segunda, /^Oi Maria,.*Pombo Correio Mensagens\./);
  assert.match(segunda, /aniversário da Érica🥳/);
  assert.doesNotMatch(segunda, /Bruna|Claudean/);
});

test('URL preserva acentos, pontuação, espaços e emoji', () => {
  const mensagem = buildRecallWhatsAppMessage({ ...base, modoFila: 'DIA_MENSAGEM' });
  const url = buildRecallWhatsAppUrl('(34) 99999-9999', { ...base, modoFila: 'DIA_MENSAGEM' }, () => 'https://api.whatsapp.com/send?phone=5534999999999');
  assert.equal(url, `https://api.whatsapp.com/send?phone=5534999999999&text=${encodeURIComponent(mensagem)}`);
  assert.equal(decodeURIComponent(new URL(url).searchParams.get('text')), mensagem);
});

test('telefone inválido não cria URL', () => {
  assert.equal(buildRecallWhatsAppUrl('', base, () => null), null);
});
