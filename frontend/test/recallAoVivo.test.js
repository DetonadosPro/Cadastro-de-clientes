import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecallAoVivoMessage, buildRecallAoVivoUrl } from '../src/utils/mensagemRecall.js';
import { dadosPedidoAoVivoRecall } from '../src/utils/pedidoRecall.js';
const base = { contato: 'KÁTIA EMILLY', homenageado: 'MÁRCIA', usuario: 'ENIMAR', dataReferencia: '2026-10-05', numeroOs: '123' };
test('novo pedido aproveita destinatário e temas, com outra data e sem códigos, O.S. ou cobrança antiga', () => {
  assert.deepEqual(dadosPedidoAoVivoRecall({ para: 'MÁRCIA', tema_1: 'ANIV GERAL', tema_2: null, numero_os: '123', mensagem_codigo_1: '777', pagou: 'SIM', valor: 120 }, '2026-10-05'), { para: 'MÁRCIA', tema_1: 'ANIV GERAL', tema_2: '', tema_3: '', tema_4: '', dia_entrega: '05/10/26' });
});
test('convite de aniversário usa o novo texto e concordância do destinatário', () => {
  for (const [homenageado, contracao, nome, objeto, pronome] of [
    ['MÁRCIA', 'da', 'Márcia', 'la', 'ela'],
    ['CLAUDEAN PEREIRA', 'do', 'Claudean', 'lo', 'ele'],
    ['CATIUSSE', 'da', 'Catiusse', 'la', 'ela'],
    ['LUCA', 'do', 'Luca', 'lo', 'ele'],
  ]) {
    const mensagem = buildRecallAoVivoMessage({ ...base, homenageado, ocasiao: 'ANIVERSARIO' });
    assert.match(mensagem, new RegExp(`Oi, Kátia! 😊 Amanhã é aniversário ${contracao} ${nome}! 🎂`));
    assert.ok(mensagem.includes(`surpreendê-${objeto} *novamente* com uma linda *Mensagem ao Vivo*? 🎶✨`));
    assert.ok(mensagem.includes('*toda a homenagem é filmada e você recebe o vídeo sem custo adicional!* ❤️'));
    assert.ok(mensagem.includes(`Quer reservar uma homenagem para ${pronome}?`));
    assert.match(mensagem, /\n\nO\.S\.: 123$/);
    assert.doesNotMatch(mensagem, /ele\(a\)|la\(o\)|oportunidade de celebrar/);
  }
});
test('gênero informado prevalece sobre a inferência pelo nome', () => {
  const mensagem = buildRecallAoVivoMessage({ ...base, homenageado: 'ARIEL', generoHomenageado: 'feminino', ocasiao: 'ANIVERSARIO' });
  assert.match(mensagem, /aniversário da Ariel/);
  assert.match(mensagem, /surpreendê-la/);
  assert.match(mensagem, /para ela\?/);
});
test('link de aniversário preserva parágrafos, emojis e destaques do convite', () => {
  const dados = { ...base, ocasiao: 'ANIVERSARIO' };
  const url = new URL(buildRecallAoVivoUrl('(34) 99999-9999', dados));
  assert.equal(url.searchParams.get('text'), buildRecallAoVivoMessage(dados));
  assert.ok(url.searchParams.get('text').includes('🎂\n\nQue tal'));
});
test('demais mensagens de Ao Vivo correspondem ao tema e data, sem afirmar amanhã', () => {
  for (const [ocasiao, texto] of [['CASAMENTO', 'aniversário de casamento'], ['MAES', 'Dia das Mães'], ['PAIS', 'Dia dos Pais'], ['NAMORADOS', 'Dia dos Namorados']]) {
    const mensagem = buildRecallAoVivoMessage({ ...base, ocasiao });
    assert.match(mensagem, new RegExp(texto)); assert.match(mensagem, /05\/10/);
    assert.doesNotMatch(mensagem, /amanhã/); assert.match(mensagem, /O.S.: 123$/);
  }
});
test('tema desconhecido ou pontual usa convite sem repetir aniversário', () => {
  const mensagem = buildRecallAoVivoMessage({ ...base, ocasiao: 'HOMENAGEM', tema: 'FORMATURA' });
  assert.match(mensagem, /FORMATURA/); assert.doesNotMatch(mensagem, /aniversário/);
});
test('link contém comprador e mensagem codificada, e recusa telefone inválido', () => {
  const url = new URL(buildRecallAoVivoUrl('(34) 99999-9999', { ...base, ocasiao: 'MAES' }));
  assert.equal(url.searchParams.get('phone'), '5534999999999');
  assert.match(url.searchParams.get('text'), /Oi Kátia/);
  assert.equal(buildRecallAoVivoUrl('0', base), null);
});
