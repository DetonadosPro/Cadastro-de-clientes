export function dadosMensagemRecall(pedido, numeroMensagem, modoFila, cadastroComprador = null) {
  const prefixo = numeroMensagem === 2 ? 'p2' : 'p1';
  const invertido = modoFila === 'ANIVERSARIO';
  return {
    tema: pedido[`${prefixo}_tema`] || '',
    fixo: invertido
      ? (cadastroComprador?.fixo || pedido.comprador_fixo || '')
      : (pedido[`${prefixo}_fixo`] || ''),
    celular: invertido
      ? (cadastroComprador?.celular || cadastroComprador?.whatsapp || pedido.comprador_celular || pedido.comprador_whatsapp || '')
      : (pedido[`${prefixo}_celular`] || ''),
  };
}
