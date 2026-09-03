export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function mesDaDataMensagem(valor) {
  const texto = String(valor || '').trim();
  const brasileira = texto.match(/^\d{1,2}\/(\d{1,2})(?:\/\d{2,4})?$/);
  const iso = texto.match(/^\d{4}-(\d{1,2})-\d{1,2}$/);
  const mes = Number((brasileira || iso)?.[1]);
  return mes >= 1 && mes <= 12 ? mes : null;
}

export function mensagensDoPedidoNoMes(pedido, mes) {
  const numeroMes = Number(mes);
  if (!numeroMes) return [];
  return [1, 2].filter((numero) => mesDaDataMensagem(pedido?.[`p${numero}_dia`]) === numeroMes);
}

export function filtrarPedidosPorMesDaMensagem(pedidos, mes) {
  if (!Number(mes)) return pedidos;
  return pedidos.filter((pedido) => mensagensDoPedidoNoMes(pedido, mes).length > 0);
}
