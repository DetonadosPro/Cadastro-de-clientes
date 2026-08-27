function normalizarTexto(valor) {
  return String(valor || '').trim().toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Regra única para todo o sistema. Todo tipo de aniversário entra no Recall:
// pessoa, namoro, casamento, empresa etc. A palavra precisa continuar
// reconhecível no início para evitar falsos positivos de um includes("ANI").
function ehTemaAniversario(tema) {
  const texto = normalizarTexto(tema);
  return /^(ANIV|ANIVERSARIO|ANI|NIVER)(?:\s|$)/.test(texto)
    || /^FELIZ ANIVERSARIO(?:\s|$)/.test(texto);
}

function chavePessoa(valor) {
  return normalizarTexto(valor).replace(/\s+/g, '-');
}

// Cadastros antigos usavam sequências de zero para inutilizar campos. Uma
// pessoa válida precisa ter ao menos uma letra; assim "0", "00000" e sinais
// isolados nunca viram relações ou contatos no Recall.
function nomePessoaValido(valor) {
  const texto = normalizarTexto(valor);
  return /[A-Z]/.test(texto) && !/\d/.test(texto);
}

function dataBrParaIso(valor) {
  const m = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2]}-${m[1]}`;
}

module.exports = { normalizarTexto, ehTemaAniversario, chavePessoa, nomePessoaValido, dataBrParaIso };
