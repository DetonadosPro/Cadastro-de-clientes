import { dataHoraBrasilia } from './dataHoraBrasilia.js';
import { filtrarPedidosPorMesDaMensagem } from './filtroMesMensagens.js';

export function textoInformado(valor) {
  const texto = String(valor ?? '').trim();
  return texto && !/^0+$/.test(texto) && texto !== '-' ? texto : '';
}

export function dataPedidoNumero(valor) {
  const partes = String(valor || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!partes) return null;
  const dia = Number(partes[1]), mes = Number(partes[2]);
  const ano = Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia ? data.getTime() : null;
}

export function valorPedido(pedido) {
  const valor = Number(pedido.valor);
  return Number.isFinite(valor) ? valor : 0;
}

export function somarValores(pedidos) {
  return pedidos.reduce((total, pedido) => total + Math.round(valorPedido(pedido) * 100), 0) / 100;
}

export function dataCobrancaPedido(pedido, tipo) {
  if (tipo === 'fonada') return pedido.cobranca_reagendada || pedido.cobranca || '';
  return pedido.data_cobranca || String(pedido.pagamento || '').match(/PRAZO\s*-\s*DIA\s*(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))/i)?.[1] || '';
}

const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filtrarHistorico(pedidos, tipo, { busca = '', pagamento = '', mes = '', ordem = 'recentes' } = {}) {
  const termo = normalizar(busca).trim();
  const noMes = tipo === 'fonada' ? filtrarPedidosPorMesDaMensagem(pedidos, mes) : pedidos;
  return noMes.filter(pedido => {
    if (pagamento === 'pendentes' && pedido.pagou === 'SIM') return false;
    if (pagamento === 'recebidos' && pedido.pagou !== 'SIM') return false;
    return !termo || normalizar([pedido.senha_os, pedido.numero_os, pedido.data_pedido, pedido.p1_para, pedido.p2_para, pedido.para, pedido.p1_dia, pedido.p2_dia, pedido.dia_entrega].join(' ')).includes(termo);
  }).sort((a, b) => {
    if (ordem === 'valor') return valorPedido(b) - valorPedido(a) || Number(b.id) - Number(a.id);
    const da = dataPedidoNumero(a.data_pedido), db = dataPedidoNumero(b.data_pedido);
    if (da == null || db == null) return da == null && db == null ? Number(b.id) - Number(a.id) : da == null ? 1 : -1;
    return (ordem === 'antigos' ? da - db : db - da) || Number(b.id) - Number(a.id);
  });
}

export function resumoFicha(fonada, aoVivo, instante = new Date()) {
  const hoje = dataPedidoNumero(dataHoraBrasilia(instante).data);
  const todos = [...fonada.map(p => ({ ...p, modalidade: 'fonada' })), ...aoVivo.map(p => ({ ...p, modalidade: 'aovivo' }))];
  const pendentes = todos.filter(p => p.pagou !== 'SIM');
  const cobrancas = pendentes.map(p => ({ ...p, dataCobranca: dataCobrancaPedido(p, p.modalidade) }))
    .filter(p => dataPedidoNumero(p.dataCobranca) != null).sort((a, b) => dataPedidoNumero(a.dataCobranca) - dataPedidoNumero(b.dataCobranca));
  const emHaver = fonada.filter(p => p.mensagemEmHaver?.disponivel && !textoInformado(p.p2_dia) && !textoInformado(p.p2_resultado))
    .sort((a, b) => (dataPedidoNumero(a.mensagemEmHaver.dataExpiracao) ?? Infinity) - (dataPedidoNumero(b.mensagemEmHaver.dataExpiracao) ?? Infinity));
  const agendamentos = [
    ...fonada.flatMap(p => [1, 2].flatMap(n => dataPedidoNumero(p[`p${n}_dia`]) != null && !textoInformado(p[`p${n}_resultado`]) ? [{ id: p.id, modalidade: 'fonada', os: p.senha_os || p.id, numero: n, para: p[`p${n}_para`], data: p[`p${n}_dia`], horario: p[`p${n}_horario`] }] : [])),
    ...aoVivo.filter(p => dataPedidoNumero(p.dia_entrega) != null && !textoInformado(p.resultado_entrega).startsWith('ENTREGUE')).map(p => ({ id: p.id, modalidade: 'aovivo', os: p.numero_os || p.id, para: p.para, data: p.dia_entrega, horario: p.horario_entrega, naoEntregue: Boolean(textoInformado(p.resultado_entrega)) })),
  ].sort((a, b) => dataPedidoNumero(a.data) - dataPedidoNumero(b.data) || String(a.horario || '').localeCompare(String(b.horario || '')));
  return {
    total: todos.length, totalComprado: somarValores(todos), valorPendente: somarValores(pendentes), pendentes,
    ticketMedio: todos.length ? somarValores(todos) / todos.length : 0,
    ultimoPedido: filtrarHistorico(todos, 'todos').find(p => dataPedidoNumero(p.data_pedido) != null),
    proximaCobranca: cobrancas.find(p => dataPedidoNumero(p.dataCobranca) >= hoje),
    atrasadas: cobrancas.filter(p => dataPedidoNumero(p.dataCobranca) < hoje),
    emHaver, agendamentos, hoje,
  };
}
