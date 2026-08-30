const { escaparHtml } = require('./telegram');

function texto(valor, fallback = 'Não informado') {
  const normalizado = String(valor ?? '').trim();
  return normalizado || fallback;
}

function reais(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function limitar(valor, limite = 320) {
  const conteudo = String(valor ?? '').trim();
  return conteudo.length > limite ? `${conteudo.slice(0, limite - 1).trim()}…` : conteudo;
}

function linha(rotulo, valor) {
  const conteudo = limitar(valor);
  if (!conteudo) return null;
  return `<b>${escaparHtml(rotulo)}:</b> ${escaparHtml(conteudo)}`;
}

function statusPagamento(pedido) {
  if (pedido.pagou === 'SIM') {
    return ['Recebido', pedido.formaPagamento, pedido.dataPagamento].filter(Boolean).join(' · ');
  }
  const partes = ['Pendente', pedido.formaPagamento];
  if (pedido.dataCobranca) partes.push(`cobrança ${pedido.dataCobranca}`);
  return partes.filter(Boolean).join(' · ');
}

function cabecalhoPedido(pedido) {
  const tipo = pedido.tipo === 'FONADA' ? 'FONADA' : 'AO VIVO';
  const complemento = pedido.mensagem ? ` · ${pedido.mensagem}ª MENSAGEM` : '';
  return `<b>${tipo} · O.S. ${escaparHtml(texto(pedido.os, '—'))}${complemento}</b>`;
}

function formatarPedido(pedido) {
  const linhas = [
    cabecalhoPedido(pedido),
    linha('Horário', [pedido.data, pedido.horario].filter(Boolean).join(' · ')),
    linha('Cliente', pedido.cliente),
    linha('Destinatário', pedido.destinatario),
    linha('Tema', pedido.tema),
    linha('Contato', pedido.telefone),
    linha('Responsável', pedido.responsavel),
    linha('Status', pedido.status),
    linha('Pagamento', statusPagamento(pedido)),
    linha('Observação', pedido.observacoes),
  ].filter(Boolean);
  return linhas.join('\n');
}

function blocoServico(titulo, icone, resumo) {
  return [
    `${icone} <b>${titulo}</b>`,
    `Vendido: <b>${resumo.quantidadeVendida}</b> · ${reais(resumo.valorVendido)}`,
    `Recebido: <b>${resumo.quantidadeRecebida}</b> · ${reais(resumo.valorRecebido)}`,
    `Pendente: <b>${resumo.quantidadePendente}</b> · ${reais(resumo.valorPendente)}`,
  ].join('\n');
}

function montarCabecalhoResumo(resumo) {
  const { fonada, aoVivo, total } = resumo;
  return [
    `📋 <b>FECHAMENTO DO DIA · ${escaparHtml(resumo.dia)}</b>`,
    '<i>Pombo-Correio · resumo operacional</i>',
    '',
    '<b>VISÃO GERAL</b>',
    `💼 Vendido: <b>${total.quantidadeVendida} pedido(s)</b> · ${reais(total.valorVendido)}`,
    `✅ Recebido: <b>${total.quantidadeRecebida} pagamento(s)</b> · ${reais(total.valorRecebido)}`,
    `⏳ Pendente: <b>${total.quantidadePendente} pedido(s)</b> · ${reais(total.valorPendente)}`,
    '',
    '<b>POR SERVIÇO</b>',
    blocoServico('FONADA', '☎️', fonada),
    '',
    blocoServico('AO VIVO', '📣', aoVivo),
  ].join('\n');
}

function montarBlocosAgenda(resumo) {
  const pedidos = [...(resumo.agenda?.fonadas || []), ...(resumo.agenda?.aoVivo || [])]
    .sort((a, b) => String(a.horario || '99:99').localeCompare(String(b.horario || '99:99')));

  if (pedidos.length === 0) {
    return ['🗓 <b>OPERAÇÃO DO DIA</b>\nNenhuma transmissão ou entrega estava agendada para hoje.'];
  }

  const abertura = [
    '🗓 <b>OPERAÇÃO DO DIA</b>',
    `${resumo.agenda.fonadas.length} mensagem(ns) fonada(s) · ${resumo.agenda.aoVivo.length} entrega(s) ao vivo`,
  ].join('\n');

  return [abertura, ...pedidos.map(formatarPedido)];
}

function montarMensagensTelegram(resumo) {
  return [montarCabecalhoResumo(resumo), montarBlocosAgenda(resumo).join('\n\n')];
}

function pedidoTextoSimples(pedido) {
  return [
    `${pedido.tipo} · O.S. ${texto(pedido.os, '—')}${pedido.mensagem ? ` · ${pedido.mensagem}ª MENSAGEM` : ''}`,
    linhaTexto('Horário', [pedido.data, pedido.horario].filter(Boolean).join(' · ')),
    linhaTexto('Cliente', pedido.cliente),
    linhaTexto('Destinatário', pedido.destinatario),
    linhaTexto('Tema', pedido.tema),
    linhaTexto('Contato', pedido.telefone),
    linhaTexto('Responsável', pedido.responsavel),
    linhaTexto('Status', pedido.status),
    linhaTexto('Pagamento', statusPagamento(pedido)),
    linhaTexto('Observação', pedido.observacoes),
  ].filter(Boolean).join('\n');
}

function linhaTexto(rotulo, valor) {
  const conteudo = limitar(valor);
  return conteudo ? `${rotulo}: ${conteudo}` : null;
}

function montarTextoEmail(resumo) {
  const pedidos = [...(resumo.agenda?.fonadas || []), ...(resumo.agenda?.aoVivo || [])]
    .sort((a, b) => String(a.horario || '99:99').localeCompare(String(b.horario || '99:99')));
  return [
    `FECHAMENTO DO DIA · ${resumo.dia}`,
    'Pombo-Correio · resumo operacional',
    '',
    `Vendido: ${resumo.total.quantidadeVendida} pedido(s) · ${reais(resumo.total.valorVendido)}`,
    `Recebido: ${resumo.total.quantidadeRecebida} pagamento(s) · ${reais(resumo.total.valorRecebido)}`,
    `Pendente: ${resumo.total.quantidadePendente} pedido(s) · ${reais(resumo.total.valorPendente)}`,
    '',
    'OPERAÇÃO DO DIA',
    pedidos.length ? pedidos.map(pedidoTextoSimples).join('\n\n') : 'Nenhuma transmissão ou entrega estava agendada para hoje.',
  ].join('\n');
}

module.exports = { montarMensagensTelegram, montarTextoEmail, formatarPedido, statusPagamento };
