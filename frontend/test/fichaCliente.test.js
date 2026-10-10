import test from 'node:test';
import assert from 'node:assert/strict';
import { resumoFicha, filtrarHistorico, dataPedidoNumero } from '../src/utils/fichaCliente.js';

test('saldo inclui pedido sem cobrança e próxima cobrança exclui os já recebidos', () => {
  const resumo = resumoFicha([
    { id: 1, valor: '12.10', pagou: '', data_pedido: '09/10/26' },
    { id: 2, valor: '20.20', pagou: 'SIM', data_pedido: '01/10/26', cobranca: '10/10/26' },
    { id: 3, valor: 30, pagou: '', cobranca: '08/10/26', cobranca_reagendada: '11/10/26' },
  ], [{ id: 4, valor: '80', pagou: '', pagamento: 'PRAZO - DIA 12/10/26 - MP - PIX' }], new Date('2026-10-10T03:00:00Z'));
  assert.equal(resumo.valorPendente, 122.1);
  assert.equal(resumo.totalComprado, 142.3);
  assert.equal(resumo.proximaCobranca.id, 3);
  assert.equal(resumo.ultimoPedido.id, 1);
  assert.deepEqual(resumo.atrasadas, []);
});

test('Brasília define hoje, haver vence em ordem e mensagem agendada não fica disponível para reutilizar', () => {
  const resumo = resumoFicha([
    { id: 1, mensagemEmHaver: { disponivel: true, dataExpiracao: '20/10/2026' } },
    { id: 2, mensagemEmHaver: { disponivel: true, dataExpiracao: '10/10/2026' } },
    { id: 3, p2_dia: '11/10/26', mensagemEmHaver: { disponivel: true, dataExpiracao: '15/10/2026' } },
    { id: 4, mensagemEmHaver: { disponivel: false, dataExpiracao: '08/10/2026' } },
    { id: 5, cobranca: '09/10/26', valor: 10 },
  ], [], new Date('2026-10-10T02:55:00Z'));
  assert.equal(resumo.hoje, dataPedidoNumero('09/10/26'));
  assert.deepEqual(resumo.emHaver.map(p => p.id), [2, 1]);
  assert.equal(resumo.proximaCobranca.id, 5);
});

test('histórico combina busca sem acentos, mês das mensagens e pagamento, sem alterar a lista de origem', () => {
  const pedidos = [
    { id: 1, senha_os: '100', p1_para: 'JOSÉ', p1_dia: '05/10/26', data_pedido: '01/10/26', valor: 10, pagou: '' },
    { id: 2, senha_os: '200', p2_para: 'JOSÉ', p2_dia: '06/11/26', data_pedido: '09/10/26', valor: 20, pagou: 'SIM' },
    { id: 3, senha_os: '300', p1_para: 'ANA', data_pedido: '31/02/26', valor: 30, pagou: '' },
  ];
  assert.deepEqual(filtrarHistorico(pedidos, 'fonada', { busca: 'jose', mes: '10', pagamento: 'pendentes' }).map(p => p.id), [1]);
  assert.deepEqual(filtrarHistorico(pedidos, 'fonada').map(p => p.id), [2, 1, 3]);
  assert.deepEqual(filtrarHistorico(pedidos, 'fonada', { ordem: 'valor' }).map(p => p.id), [3, 2, 1]);
  assert.deepEqual(pedidos.map(p => p.id), [1, 2, 3]);
  assert.equal(dataPedidoNumero('31/02/26'), null);
});

test('entregas e mensagens confirmadas não aparecem entre os agendamentos a atender', () => {
  const resumo = resumoFicha([{ id: 1, p1_dia: '11/10/26', p1_resultado: 'OK', p2_dia: '12/10/26', p2_para: 'ANA' }], [
    { id: 2, dia_entrega: '10/10/26', resultado_entrega: 'ENTREGUE' },
    { id: 3, dia_entrega: '13/10/26', horario_entrega: '10:00' },
    { id: 4, dia_entrega: '14/10/26', resultado_entrega: 'NÃO ENTREGUE' },
  ]);
  assert.deepEqual(resumo.agendamentos.map(p => p.id), [1, 3, 4]);
  assert.equal(resumo.agendamentos[2].naoEntregue, true);
  assert.equal(resumo.agendamentos[0].numero, 2);
});
