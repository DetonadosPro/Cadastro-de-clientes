const { agoraBrasilia } = require('./dataHora');

const CAMPOS_SEGUNDA_MENSAGEM = [
  'p2_dia', 'p2_para', 'p2_tema', 'p2_mensagem', 'p2_fixo',
  'p2_celular', 'p2_horario', 'p2_quem_oferece', 'p2_resultado',
];

function dataBrParaDate(valor) {
  const partes = String(valor || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!partes) return null;
  const ano = Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]);
  const mes = Number(partes[2]);
  const dia = Number(partes[1]);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  data.setHours(0, 0, 0, 0);
  return data;
}

function formatarDataBr(data) {
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
}

// Soma meses de calendário preservando o dia quando ele existe no mês de
// destino e usando o último dia do mês nos casos 29/30/31.
function somarMesesCalendario(data, quantidade) {
  const resultado = new Date(data.getFullYear(), data.getMonth(), 1);
  resultado.setMonth(resultado.getMonth() + quantidade);
  const ultimoDia = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(data.getDate(), ultimoDia));
  resultado.setHours(0, 0, 0, 0);
  return resultado;
}

function telefoneTemDdd34(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  const semDdi = digitos.startsWith('55') && digitos.length >= 12 ? digitos.slice(2) : digitos;
  return semDdi.startsWith('34');
}

function temDireitoSegundaMensagem(pedido) {
  // Essa é a regra já existente no formulário. Campos p2 preenchidos também
  // comprovam o direito em pedidos históricos, mesmo que o telefone tenha
  // sido posteriormente corrigido.
  return telefoneTemDdd34(pedido.p1_celular)
    || telefoneTemDdd34(pedido.p1_fixo)
    || CAMPOS_SEGUNDA_MENSAGEM.some((campo) => String(pedido[campo] || '').trim());
}

function hojeSemHora() {
  const hoje = agoraBrasilia();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}

function situacaoSegundaMensagem(pedido, referencia = hojeSemHora()) {
  const concedida = temDireitoSegundaMensagem(pedido);
  const utilizada = Boolean(String(pedido.p2_resultado || '').trim());
  const compra = dataBrParaDate(pedido.data_pedido);
  const expiracao = compra ? somarMesesCalendario(compra, 3) : null;

  let status = 'NAO_CONCEDIDA';
  if (utilizada) status = 'UTILIZADA';
  else if (concedida && !compra) status = 'INDETERMINADA';
  else if (concedida && referencia.getTime() <= expiracao.getTime()) status = 'DISPONIVEL';
  else if (concedida) status = 'EXPIRADA';

  return {
    concedida,
    utilizada,
    status,
    disponivel: status === 'DISPONIVEL',
    dataExpiracao: expiracao ? formatarDataBr(expiracao) : null,
  };
}

function validarDataUsoSegundaMensagem(pedido, dataUso, referencia = hojeSemHora()) {
  const situacao = situacaoSegundaMensagem(pedido, referencia);
  if (!situacao.concedida) return { ok: false, erro: 'Este pedido não concede uma segunda mensagem.' };
  if (situacao.utilizada) return { ok: false, erro: 'A segunda mensagem deste pedido já foi utilizada.' };
  if (!situacao.dataExpiracao) return { ok: false, erro: 'A data original da compra é inválida; não é possível utilizar a segunda mensagem.' };
  if (situacao.status === 'EXPIRADA') {
    return { ok: false, erro: `A segunda mensagem expirou em ${situacao.dataExpiracao}.` };
  }

  const uso = dataBrParaDate(dataUso) || referencia;
  const limite = dataBrParaDate(situacao.dataExpiracao);
  if (uso.getTime() > limite.getTime()) {
    return { ok: false, erro: `A segunda mensagem expirou em ${situacao.dataExpiracao}.` };
  }
  return { ok: true, situacao };
}

function houveAlteracaoP2(atual, novosDados) {
  return CAMPOS_SEGUNDA_MENSAGEM.some((campo) =>
    Object.prototype.hasOwnProperty.call(novosDados, campo)
    && String(novosDados[campo] ?? '') !== String(atual[campo] ?? '')
  );
}

module.exports = {
  CAMPOS_SEGUNDA_MENSAGEM,
  dataBrParaDate,
  formatarDataBr,
  somarMesesCalendario,
  temDireitoSegundaMensagem,
  situacaoSegundaMensagem,
  validarDataUsoSegundaMensagem,
  houveAlteracaoP2,
};
