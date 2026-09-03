import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarPedidosPorMesDaMensagem,
  mensagensDoPedidoNoMes,
  mesDaDataMensagem,
} from '../src/utils/filtroMesMensagens.js';

test('reconhece o mês em datas brasileiras antigas e completas', () => {
  assert.equal(mesDaDataMensagem('7/1/2025'), 1);
  assert.equal(mesDaDataMensagem('07/01/25'), 1);
  assert.equal(mesDaDataMensagem('07/01'), 1);
});

test('reconhece também datas salvas no formato ISO', () => {
  assert.equal(mesDaDataMensagem('2025-12-07'), 12);
  assert.equal(mesDaDataMensagem(''), null);
  assert.equal(mesDaDataMensagem('00/00/0000'), null);
});

test('identifica separadamente primeira e segunda mensagens do mês', () => {
  const pedido = { p1_dia: '10/03/2025', p2_dia: '28/03/2026' };
  assert.deepEqual(mensagensDoPedidoNoMes(pedido, 3), [1, 2]);
  assert.deepEqual(mensagensDoPedidoNoMes(pedido, 4), []);
});

test('mantém somente pedidos com alguma mensagem no mês selecionado', () => {
  const pedidos = [
    { id: 1, p1_dia: '10/01/2025', p2_dia: '20/06/2025' },
    { id: 2, p1_dia: '2025-06-18', p2_dia: '' },
    { id: 3, p1_dia: '01/07/2025', p2_dia: '02/08/2025' },
  ];
  assert.deepEqual(filtrarPedidosPorMesDaMensagem(pedidos, 6).map((pedido) => pedido.id), [1, 2]);
  assert.equal(filtrarPedidosPorMesDaMensagem(pedidos, '').length, 3);
});
