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

export function mensagemEmHaverPrioritaria(mensagens = []) {
  const vencimento = (mensagem) => {
    const partes = String(mensagem.dataExpiracao || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (!partes) return Infinity;
    const ano = partes[3].length === 2 ? `20${partes[3]}` : partes[3];
    return Number(`${ano}${partes[2]}${partes[1]}`);
  };
  return [...(mensagens || [])].sort((a, b) =>
    vencimento(a) - vencimento(b) || a.pedidoId - b.pedidoId
  )[0] || null;
}

export function camposMensagemRecall(numeroMensagem, para, dataIso, dados = {}) {
  const prefixo = numeroMensagem === 2 ? 'p2' : 'p1';
  return {
    [`${prefixo}_para`]: para || '',
    [`${prefixo}_tema`]: dados.tema ?? 'ANIV GERAL',
    [`${prefixo}_fixo`]: dados.fixo || '',
    [`${prefixo}_celular`]: dados.celular || '',
    [`${prefixo}_dia`]: /^\d{4}-\d{2}-\d{2}$/.test(dataIso || '')
      ? `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}/${dataIso.slice(2, 4)}` : '',
  };
}

export function dadosPedidoAoVivoRecall(pedido, dataIso) {
  return {
    para: pedido.para || '',
    ...Object.fromEntries([1, 2, 3, 4].map((n) => [`tema_${n}`, pedido[`tema_${n}`] || ''])),
    dia_entrega: `${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}/${dataIso.slice(2, 4)}`,
  };
}
