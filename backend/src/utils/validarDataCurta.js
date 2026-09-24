function dataCurtaValida(valor) {
  const match = String(valor ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return false;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= new Date(ano, mes, 0).getDate();
}

module.exports = { dataCurtaValida };
