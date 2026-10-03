import test from 'node:test';
import assert from 'node:assert/strict';
import { dadosMensagemRecall } from '../src/utils/pedidoRecall.js';

const pedido = {
  senha_os: '36947',
  p1_tema: 'ANIV GERAL', p1_mensagem: '123', p1_fixo: '3433331111', p1_celular: '34999991111',
  p2_tema: 'ANIV ESPOSA', p2_mensagem: '456', p2_fixo: '3433332222', p2_celular: '34999992222',
  comprador_fixo: '3433334444', comprador_celular: '34999994444',
};

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
