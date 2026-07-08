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

// Formata valor monetário como "R$ 1.234,56" enquanto o usuário digita
// — funciona como campo de banco/PIX: os dígitos digitados preenchem
// da direita para a esquerda (sempre os 2 últimos são os centavos), sem
// precisar digitar vírgula. Ex: "5" → "R$ 0,05", "50" → "R$ 0,50",
// "100" → "R$ 1,00", "10050" → "R$ 100,50".
export function formatarValorMonetario(valor) {
  const n = apenasNumeros(valor).replace(/^0+(?=\d)/, '');
  if (!n) return '';
  const centavos = n.padStart(3, '0');
  const inteiro = centavos.slice(0, -2);
  const decimais = centavos.slice(-2);
  const inteiroComPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${inteiroComPontos},${decimais}`;
}

// Converte o texto de um campo formatado com formatarValorMonetario de
// volta para número puro (ex: "R$ 1.234,56" → 1234.56), pronto para
// enviar ao backend. Retorna null se o campo estiver vazio.
export function valorMonetarioParaNumero(valorFormatado) {
  const n = apenasNumeros(valorFormatado);
  if (!n) return null;
  return parseInt(n, 10) / 100;
}

// Converte um número (vindo do backend) para o texto já formatado, para
// preencher o campo ao abrir um pedido existente para edição.
export function numeroParaValorMonetario(numero) {
  if (numero === null || numero === undefined || numero === '') return '';
  const centavos = Math.round(parseFloat(numero) * 100);
  if (isNaN(centavos)) return '';
  return formatarValorMonetario(String(centavos));
}
