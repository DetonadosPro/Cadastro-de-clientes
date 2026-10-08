import test from 'node:test';
import assert from 'node:assert/strict';
import { dadosMensagemRecall, mensagemEmHaverPrioritaria, camposMensagemRecall } from '../src/utils/pedidoRecall.js';

const pedido = {
  senha_os: '36947',
  p1_tema: 'ANIV GERAL', p1_mensagem: '123', p1_fixo: '3433331111', p1_celular: '34999991111',
  p2_tema: 'ANIV ESPOSA', p2_mensagem: '456', p2_fixo: '3433332222', p2_celular: '34999992222',
  comprador_fixo: '3433334444', comprador_celular: '34999994444',
};

test('mensagem em haver é escolhida pelo vencimento, inclusive na virada do ano', () => {
  const mensagens = [
    { pedidoId: 10, dataExpiracao: '01/01/2027' },
    { pedidoId: 20, dataExpiracao: '31/12/2026' },
  ];
  assert.equal(mensagemEmHaverPrioritaria(mensagens).pedidoId, 20);
  assert.equal(mensagens[0].pedidoId, 10);
  assert.equal(mensagemEmHaverPrioritaria([mensagens[0]]).pedidoId, 10);
  assert.equal(mensagemEmHaverPrioritaria([]), null);
  assert.equal(mensagemEmHaverPrioritaria(null), null);
});

test('vencimentos iguais desempata pelo pedido e datas ausentes ficam por último', () => {
  assert.equal(mensagemEmHaverPrioritaria([
    { pedidoId: 1, dataExpiracao: null },
    { pedidoId: 30, dataExpiracao: '01/11/2026' },
    { pedidoId: 20, dataExpiracao: '01/11/2026' },
  ]).pedidoId, 20);
});

test('preenchimento da mensagem 2 usa os mesmos dados da mensagem 1 sem alterar número de recall', () => {
  const dados = dadosMensagemRecall(pedido, 2, 'DIA_MENSAGEM');
  const campos = camposMensagemRecall(2, 'MARIA', '2026-10-08', dados);
  assert.deepEqual(campos, {
    p2_para: 'MARIA', p2_tema: 'ANIV ESPOSA', p2_fixo: '3433332222',
    p2_celular: '34999992222', p2_dia: '08/10/26',
  });
  assert.deepEqual(camposMensagemRecall(1, 'MARIA', '2026-10-08', dados),
    Object.fromEntries(Object.entries(campos).map(([campo, valor]) => [campo.replace('p2_', 'p1_'), valor])));
  assert.equal(Object.hasOwn(campos, 'recall_codigo'), false);
});

test('Recall copia tema e telefones da mensagem selecionada sem copiar seu número', () => {
  assert.deepEqual(dadosMensagemRecall(pedido, 2, 'DIA_MENSAGEM'), {
    osAnterior: '36947', tema: 'ANIV ESPOSA', fixo: '3433332222', celular: '34999992222',
  });
  assert.deepEqual(dadosMensagemRecall(pedido, 1, 'DIA_MENSAGEM'), {
    osAnterior: '36947', tema: 'ANIV GERAL', fixo: '3433331111', celular: '34999991111',
  });
});

test('pesquisa por aniversário usa os telefones do comprador original, agora destinatário', () => {
  assert.deepEqual(dadosMensagemRecall(pedido, 2, 'ANIVERSARIO', {
    fixo: '3433335555', celular: '34999995555',
  }), { osAnterior: '36947', tema: 'ANIV ESPOSA', fixo: '3433335555', celular: '34999995555' });
  assert.deepEqual(dadosMensagemRecall(pedido, 1, 'ANIVERSARIO'), {
    osAnterior: '36947', tema: 'ANIV GERAL', fixo: '3433334444', celular: '34999994444',
  });
});
