const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarReais = (valor) => moeda.format(Number(valor) || 0);
export const normalizarBuscaVenda = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const vendaQuitada = (pedido) => String(pedido.pagou || '').trim().toUpperCase() === 'SIM';
export const vendaRecall = (pedido) => String(pedido.recall || '').trim().toUpperCase() === 'SIM';
export const chaveVendedor = (pedido) => String(pedido.vendedor_usuario || '').trim() || '__sem_vendedor__';

function diaVenda(valor) {
  const partes = String(valor || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!partes) return '';
  const [, dia, mes, ano] = partes;
  return `${ano.length === 2 ? `20${ano}` : ano}-${mes}-${dia}`;
}

export function vendasFonadaDoDia(pedidos = [], data) {
  const dia = diaVenda(data);
  if (!dia) return [];
  // A data de envio (primeira ou segunda mensagem) não define uma venda.
  return pedidos.filter(pedido => !pedido.excluido_em && diaVenda(pedido.data_pedido) === dia);
}

function centavos(pedido) {
  const numero = Number(pedido.valor);
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) : 0;
}

export function resumirVendasFonada(pedidos = []) {
  let total = 0, quitado = 0, quitadas = 0, recalls = 0;
  const clientes = new Set();
  const equipe = new Map();
  for (const pedido of pedidos) {
    const valor = centavos(pedido);
    total += valor;
    if (vendaQuitada(pedido)) { quitado += valor; quitadas++; }
    if (vendaRecall(pedido)) recalls++;
    const cliente = pedido.cliente_id ? `id:${pedido.cliente_id}` : normalizarBuscaVenda(pedido.nome_comprador);
    if (cliente) clientes.add(cliente);
    const chave = chaveVendedor(pedido);
    if (!equipe.has(chave)) equipe.set(chave, {
      chave, nome: pedido.vendedor_nome || pedido.vendedor_usuario || 'Não informado', quantidade: 0, centavos: 0,
    });
    const vendedor = equipe.get(chave);
    vendedor.quantidade++;
    vendedor.centavos += valor;
  }
  return {
    quantidade: pedidos.length, total: total / 100, quitado: quitado / 100,
    aReceber: (total - quitado) / 100, quitadas, emAberto: pedidos.length - quitadas,
    ticketMedio: pedidos.length ? Math.round(total / pedidos.length) / 100 : 0,
    clientes: clientes.size, recalls,
    vendedores: [...equipe.values()].map(({ centavos, ...vendedor }) => ({ ...vendedor, total: centavos / 100 }))
      .sort((a, b) => b.total - a.total || b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

export function filtrarVendasFonada(pedidos, { busca = '', status = '', vendedor = '', ordem = 'recentes' } = {}) {
  const termo = normalizarBuscaVenda(busca);
  const compacto = (texto) => texto.replace(/[^a-z0-9]/g, '');
  const horario = (pedido) => /^([01]\d|2[0-3]):[0-5]\d$/.test(pedido.horario_pedido || '') ? pedido.horario_pedido : '';
  return pedidos.filter((pedido) => {
    if (status === 'abertas' && vendaQuitada(pedido)) return false;
    if (status === 'quitadas' && !vendaQuitada(pedido)) return false;
    if (status === 'recall' && !vendaRecall(pedido)) return false;
    if (vendedor && chaveVendedor(pedido) !== vendedor) return false;
    const texto = normalizarBuscaVenda([
      pedido.senha_os, pedido.nome_comprador, pedido.comprador_fixo, pedido.comprador_celular,
      pedido.comprador_whatsapp, pedido.p1_para, pedido.p2_para, pedido.p1_tema, pedido.p2_tema,
      pedido.vendedor_nome, pedido.vendedor_usuario,
    ].join(' '));
    return !termo || texto.includes(termo) || (compacto(termo) && compacto(texto).includes(compacto(termo)));
  }).sort((a, b) => {
    if (ordem === 'valor') return centavos(b) - centavos(a) || b.id - a.id;
    if (ordem === 'cliente') return String(a.nome_comprador || '').localeCompare(String(b.nome_comprador || ''), 'pt-BR') || b.id - a.id;
    return horario(b).localeCompare(horario(a)) || b.id - a.id;
  });
}
