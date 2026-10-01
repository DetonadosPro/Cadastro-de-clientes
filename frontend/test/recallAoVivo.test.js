import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecallAoVivoMessage, buildRecallAoVivoUrl } from '../src/utils/mensagemRecall.js';
import { dadosPedidoAoVivoRecall } from '../src/utils/pedidoRecall.js';
const base = { contato: 'KÁTIA EMILLY', homenageado: 'MÁRCIA', usuario: 'ENIMAR', dataReferencia: '2026-10-05', numeroOs: '123' };
test('novo pedido aproveita destinatário e temas, com outra data e sem códigos, O.S. ou cobrança antiga', () => {
  assert.deepEqual(dadosPedidoAoVivoRecall({ para: 'MÁRCIA', tema_1: 'ANIV GERAL', tema_2: null, numero_os: '123', mensagem_codigo_1: '777', pagou: 'SIM', valor: 120 }, '2026-10-05'), { para: 'MÁRCIA', tema_1: 'ANIV GERAL', tema_2: '', tema_3: '', tema_4: '', dia_entrega: '05/10/26' });
});
test('mensagem de Ao Vivo corresponde ao tema e data, sem afirmar amanhã', () => {
  for (const [ocasiao, texto] of [['ANIVERSARIO', 'aniversário de MÁRCIA'], ['CASAMENTO', 'aniversário de casamento'], ['MAES', 'Dia das Mães'], ['PAIS', 'Dia dos Pais'], ['NAMORADOS', 'Dia dos Namorados']]) {
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
