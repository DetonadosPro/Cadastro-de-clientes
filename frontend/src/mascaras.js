// src/mascaras.js
// Funções de formatação automática para campos de telefone e data.
// Aplicadas enquanto o usuário digita (onChange), sem bibliotecas externas.

function apenasNumeros(valor) {
  return (valor || '').replace(/\D/g, '');
}

// Formata celular como (00) 0 0000-0000 (11 dígitos: DDD + 9 + número).
export function formatarCelular(valor) {
  const n = apenasNumeros(valor).slice(0, 11);
  if (n.length <= 2) return n.length ? `(${n}` : '';
  if (n.length <= 3) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3, 7)}-${n.slice(7, 11)}`;
}

// Formata telefone fixo como (00) 0000-0000 (10 dígitos: DDD + número).
export function formatarFixo(valor) {
  const n = apenasNumeros(valor).slice(0, 10);
  if (n.length <= 2) return n.length ? `(${n}` : '';
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6, 10)}`;
}

// Formata data como dd/mm/aa enquanto o usuário digita (6 dígitos).
export function formatarData(valor) {
  const n = apenasNumeros(valor).slice(0, 6);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4, 6)}`;
}

// Formata horário como hh:mm enquanto o usuário digita (4 dígitos).
export function formatarHorario(valor) {
  const n = apenasNumeros(valor).slice(0, 4);
  if (n.length <= 2) return n;
  return `${n.slice(0, 2)}:${n.slice(2, 4)}`;
}

// Mantém só números, limitado a uma quantidade de dígitos — usado em
// códigos de referência simples (ex: código de recall de 5 dígitos).
export function formatarCodigoNumerico(valor, maxDigitos) {
  return apenasNumeros(valor).slice(0, maxDigitos);
}
