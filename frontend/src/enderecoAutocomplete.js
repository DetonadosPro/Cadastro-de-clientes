export function termoDeBuscaEndereco(valor) {
  const termo = String(valor || '').split(',')[0].trim();
  return termo.replace(/^av(?:\.|\b)\s*/iu, 'Avenida ');
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

export function separarEnderecoNumero(endereco) {
  const texto = String(endereco || '').trim();
  const ultimaVirgula = texto.lastIndexOf(',');
  if (ultimaVirgula < 0) return { logradouro: texto, numero: '' };

  const logradouro = texto.slice(0, ultimaVirgula).trim();
  const numero = texto.slice(ultimaVirgula + 1).trim();
  if (!logradouro || !numero) return { logradouro: texto, numero: '' };
  return { logradouro, numero };
}

function semAcentos(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function numeroInteiro(valor) {
  const encontrado = String(valor || '').match(/\d+/);
  return encontrado ? Number(encontrado[0]) : null;
}

export function faixaCompativelComNumero(complemento, numero) {
  const numeroInformado = numeroInteiro(numero);
  const descricao = semAcentos(complemento);
  if (numeroInformado === null || !descricao) return null;
  if (descricao.includes('lado par') && numeroInformado % 2 !== 0) return false;
  if (descricao.includes('lado impar') && numeroInformado % 2 === 0) return false;

  const numeros = [...descricao.matchAll(/\d+/g)].map(([valor]) => Number(valor));
  if (/^ate\b/.test(descricao) && numeros.length > 0) return numeroInformado <= Math.max(...numeros);
  if (/^de\b/.test(descricao) && /ao fim/.test(descricao) && numeros.length > 0) return numeroInformado >= Math.min(...numeros);
  if (/^de\b/.test(descricao) && numeros.length >= 2) {
    return numeroInformado >= Math.min(...numeros) && numeroInformado <= Math.max(...numeros);
  }
  return null;
}

export function filtrarSugestoesPorNumero(sugestoes, numero) {
  if (numeroInteiro(numero) === null) return sugestoes;
  const compativeis = sugestoes.filter((sugestao) => faixaCompativelComNumero(sugestao.complemento, numero) === true);
  return compativeis.length > 0 ? compativeis : sugestoes;
}
