export function dadosMensagemRecall(pedido, numeroMensagem, modoFila, cadastroComprador = null) {
  const prefixo = numeroMensagem === 2 ? 'p2' : 'p1';
  const invertido = modoFila === 'ANIVERSARIO';
  return {
    osAnterior: String(pedido.senha_os || ''),
    tema: pedido[`${prefixo}_tema`] || '',
    fixo: invertido
      ? (cadastroComprador?.fixo || pedido.comprador_fixo || '')
      : (pedido[`${prefixo}_fixo`] || ''),
    celular: invertido
      ? (cadastroComprador?.celular || cadastroComprador?.whatsapp || pedido.comprador_celular || pedido.comprador_whatsapp || '')
      : (pedido[`${prefixo}_celular`] || ''),
  };
}

export function dadosPedidoAoVivoRecall(pedido, dataIso) {
  return {
    para: pedido.para || '',
    ...Object.fromEntries([1, 2, 3, 4].map((n) => [`tema_${n}`, pedido[`tema_${n}`] || ''])),
    dia_entrega: `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}/${dataIso.slice(2, 4)}`,
  };
}
