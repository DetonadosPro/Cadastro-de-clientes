import { normalizarNome } from './mensagemAgenda.js';
import { numeroWhatsAppBrasil } from './telefoneWhatsApp.js';

export function mensagemCobrancaPix(nome, valor) {
  const cliente = normalizarNome(nome) || 'cliente';
  const valorFormatado = Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  return `Oi ${cliente}, tudo bem?\nAbaixo nossa chave PIX:\n11348702000187\n*CNPJ* - NUBANK (Enimar A dos Santos)\nValor: *${valorFormatado}*`;
}

export function linkWhatsAppCobranca(numero, nome, valor) {
  const digitos = numeroWhatsAppBrasil(numero);
  if (!digitos) return null;
  return `https://api.whatsapp.com/send?phone=${digitos}&text=${encodeURIComponent(mensagemCobrancaPix(nome, valor))}`;
}
