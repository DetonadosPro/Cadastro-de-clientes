import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarVendasFonada, resumirVendasFonada, vendasFonadaDoDia } from '../src/utils/vendasFonada.js';

test('conferência diária exclui mensagens de hoje vendidas antes e soma apenas vendas deste dia', () => {
  const lista = [
    { id: 1, data_pedido: '10/10/26', p1_dia: '15/10/26', valor: 12 },
    { id: 2, data_pedido: '10/10/2026', p2_dia: '20/10/26', valor: 20 },
    { id: 3, data_pedido: '09/10/26', p1_dia: '10/10/26', valor: 40 },
    { id: 4, data_pedido: '08/10/26', p2_dia: '10/10/26', valor: 50 },
    { id: 5, p1_dia: '10/10/26', valor: 30 },
    { id: 6, data_pedido: '10/10/26', excluido_em: '2026-10-10', valor: 10 },
  ];
  const resultado = vendasFonadaDoDia(lista, '10/10/26');
  assert.deepEqual(resultado.map(p => p.id), [1, 2]);
  assert.equal(resumirVendasFonada(resultado).total, 32);
  assert.deepEqual(vendasFonadaDoDia(lista, ''), []);
  assert.equal(lista.length, 6);
});

const vendas = [
  { id: 1, cliente_id: 7, nome_comprador: 'MÁRCIA', senha_os: '0010', comprador_celular: '(34) 9 9999-1111', valor: '12.10', pagou: 'SIM', recall: 'SIM', horario_pedido: '09:00', vendedor_usuario: 'ana', vendedor_nome: 'Ana' },
  { id: 2, cliente_id: 7, nome_comprador: 'MÁRCIA', valor: '20.20', pagou: 'NÃO', horario_pedido: '11:00', vendedor_usuario: 'joao', vendedor_nome: 'João' },
  { id: 3, nome_comprador: 'CARLOS', p2_para: 'Fernanda', valor: 0.10, pagou: ' sim ', horario_pedido: '', vendedor_usuario: 'ana', vendedor_nome: 'Ana' },
];

test('resumo separa vendas quitadas de valores a receber e conta clientes sem duplicar compras', () => {
  const resumo = resumirVendasFonada(vendas);
  assert.deepEqual({ ...resumo, vendedores: undefined }, {
    quantidade: 3, total: 32.40, quitado: 12.20, aReceber: 20.20, quitadas: 2,
    emAberto: 1, ticketMedio: 10.80, clientes: 2, recalls: 1, vendedores: undefined,
  });
  assert.deepEqual(resumo.vendedores, [
    { chave: 'joao', nome: 'João', quantidade: 1, total: 20.20 },
    { chave: 'ana', nome: 'Ana', quantidade: 2, total: 12.20 },
  ]);
});

test('totais incluem todas as vendas, mesmo além das primeiras cinquenta exibidas', () => {
  const resumo = resumirVendasFonada(Array.from({ length: 101 }, (_, id) => ({ id, valor: 0.1, pagou: id < 51 ? 'SIM' : 'NÃO' })));
  assert.equal(resumo.quantidade, 101);
  assert.equal(resumo.total, 10.10);
  assert.equal(resumo.quitado, 5.10);
  assert.equal(resumo.aReceber, 5);
});

test('dia vazio e dados legados não produzem valores inválidos ou vendedor ausente', () => {
  assert.equal(resumirVendasFonada([]).ticketMedio, 0);
  const resumo = resumirVendasFonada([{ valor: 'inválido' }, { valor: null }]);
  assert.equal(resumo.total, 0);
  assert.equal(resumo.vendedores[0].nome, 'Não informado');
  assert.equal(resumo.vendedores[0].quantidade, 2);
});

test('busca reconhece acentos, telefone sem máscara, senha e segundo destinatário', () => {
  assert.equal(filtrarVendasFonada(vendas, { busca: 'marcia' }).length, 2);
  assert.equal(filtrarVendasFonada(vendas, { busca: '34999991111' })[0].id, 1);
  assert.equal(filtrarVendasFonada(vendas, { busca: '0010' })[0].id, 1);
  assert.equal(filtrarVendasFonada(vendas, { busca: 'fernanda' })[0].id, 3);
});

test('combina situação e vendedor e ordena sem modificar a lista original', () => {
  assert.deepEqual(filtrarVendasFonada(vendas).map((p) => p.id), [2, 1, 3]);
  assert.deepEqual(filtrarVendasFonada(vendas, { status: 'abertas', vendedor: 'joao' }).map((p) => p.id), [2]);
  assert.deepEqual(filtrarVendasFonada(vendas, { status: 'recall' }).map((p) => p.id), [1]);
  assert.deepEqual(filtrarVendasFonada(vendas, { ordem: 'cliente' }).map((p) => p.id), [3, 2, 1]);
  assert.deepEqual(vendas.map((p) => p.id), [1, 2, 3]);
});
