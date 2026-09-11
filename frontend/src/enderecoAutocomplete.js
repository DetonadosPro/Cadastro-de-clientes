export function termoDeBuscaEndereco(valor) {
  return String(valor || '').split(',')[0].trim();
}

export function numeroDoEnderecoDigitado(valor) {
  const partes = String(valor || '').split(',');
  if (partes.length < 2) return '';
  return partes.slice(1).join(',').trim();
}

export function enderecoComNumero(logradouro, numero) {
  const rua = String(logradouro || '').trim();
  const numeroInformado = String(numero || '').trim();
  if (!numeroInformado) return rua;
  return `${rua}${rua ? ', ' : ''}${numeroInformado}`;
}
