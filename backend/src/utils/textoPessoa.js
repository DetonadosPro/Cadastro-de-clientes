function formatarNome(valor) {
  return String(valor || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

function normalizarBusca(valor) {
  return formatarNome(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Sem dependência de extensões; normaliza também acentos Unicode decompostos.
function sqlBuscaNome(coluna, indice = 1) {
  return `regexp_replace(upper(normalize(COALESCE(${coluna}, ''), NFD)), U&'[\\0300-\\036f]', '', 'g') LIKE $${indice}`;
}

module.exports = { formatarNome, normalizarBusca, sqlBuscaNome };
