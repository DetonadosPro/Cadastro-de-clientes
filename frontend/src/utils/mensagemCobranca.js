import { normalizarNome } from './mensagemAgenda.js';

export function mensagemCobrancaPix(nome, valor) {
  const cliente = normalizarNome(nome) || 'cliente';
  const valorFormatado = Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  return `Oi ${cliente}, tudo bem?\nAbaixo nossa chave PIX:\n11348702000187\n*CNPJ* - NUBANK (Enimar A dos Santos)\nValor: *${valorFormatado}*`;
}

export function linkWhatsAppCobranca(numero, nome, valor) {
  let digitos = String(numero || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  if (digitos.length <= 11) digitos = `55${digitos}`;
  return `https://api.whatsapp.com/send?phone=${digitos}&text=${encodeURIComponent(mensagemCobrancaPix(nome, valor))}`;
}
