const test = require('node:test');
const assert = require('node:assert/strict');
const { ocasiaoDoTema, agruparAoVivo, domingoDoMes } = require('../src/utils/recallAoVivo');
const base = { id: 1, numero_os: '123', cliente_id: 7, cliente_nome: 'katia EMILLY', comprador: 'Nome antigo', para: 'márcia', dia_entrega: '05/10/25', tema_1: 'ANIV GERAL', cliente_whatsapp: '34999999999', celular_local: '3411111111' };

test('temas reais distinguem aniversário da mãe e Dia das Mães', () => {
  for (const tema of ['ANIV MAE', 'ANIV DE MÃE', 'ANIV ROM']) assert.equal(ocasiaoDoTema(tema), 'ANIVERSARIO');
  for (const tema of ['D MAES GERAL', 'DIA DAS MÃES', 'HOM DIA DAS MAES']) assert.equal(ocasiaoDoTema(tema), 'MAES');
  assert.equal(ocasiaoDoTema('ANIV CASAMENTO'), 'CASAMENTO');
  assert.equal(ocasiaoDoTema('BODAS DE OURO'), 'CASAMENTO');
  assert.equal(ocasiaoDoTema('D NAMORADOS'), 'NAMORADOS');
  for (const tema of ['FORMATURA', '15 ANOS', 'ANIV 15 ANOS', 'DECLARAÇÃO']) assert.equal(ocasiaoDoTema(tema), 'HOMENAGEM');
});

test('agrupa comprador e homenageado, usa telefone do comprador e ordena anos anteriores', () => {
  const itens = agruparAoVivo([base, { ...base, id: 2, dia_entrega: '05/10/24' }, { ...base, id: 3, dia_entrega: '05/10/26' }, { ...base, id: 4, dia_entrega: '05/10/27' }, { ...base, id: 5, dia_entrega: '06/10/25' }], '2026-10-05');
  assert.equal(itens.length, 1); assert.equal(itens[0].quantidade, 2);
  assert.equal(itens[0].clienteNome, 'KATIA EMILLY'); assert.equal(itens[0].aniversariante, 'MÁRCIA');
  assert.equal(itens[0].telefone, '34999999999'); assert.equal(itens[0].ultimoPedido.pedidoId, 1);
  assert.match(itens[0].relacaoChave, /^AOVIVO:/);
});

test('não mistura compradores, destinatários ou comemorações e considera os quatro temas', () => {
  const itens = agruparAoVivo([base, { ...base, id: 2, cliente_id: 8 }, { ...base, id: 3, para: 'ANA' }, { ...base, id: 4, tema_2: 'ANIV CASAMENTO' }, { ...base, id: 5, tema_1: '', tema_4: 'ANIV CASAMENTO' }], '2026-10-05');
  assert.equal(itens.length, 4);
  const casamento = itens.find((i) => i.ocasiao === 'CASAMENTO'); assert.equal(casamento.quantidade, 2);
});

test('Dia das Mães e Pais seguem o calendário de cada ano', () => {
  assert.equal(domingoDoMes(2026, 5, 2), '2026-05-10');
  assert.equal(domingoDoMes(2026, 8, 2), '2026-08-09');
  const maes = { ...base, dia_entrega: '11/05/25', tema_1: 'D MAES GERAL' };
  assert.equal(agruparAoVivo([maes], '2026-05-10').length, 1);
  assert.equal(agruparAoVivo([maes], '2026-05-11').length, 0);
});

test('registros incompletos e datas impossíveis não viram oportunidades', () => {
  const ruins = [{ ...base, para: '000' }, { ...base, comprador: '0', cliente_nome: '' }, { ...base, dia_entrega: '31/02/25' }, { ...base, resultado_entrega: 'NÃO ENTREGUE, 05/10/25' }];
  assert.equal(agruparAoVivo(ruins, '2026-10-05').length, 0);
  assert.equal(agruparAoVivo([{ ...base, cliente_id: null, cliente_whatsapp: null, celular: '34988888888' }], '2026-10-05')[0].telefone, '34988888888');
  assert.equal(agruparAoVivo([{ ...base, cliente_whatsapp: '0', cliente_celular: '34988888888' }], '2026-10-05')[0].telefone, '34988888888');
});
