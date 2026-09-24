export function numeroWhatsAppBrasil(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  const nacional = digitos.startsWith('55') && [12, 13].includes(digitos.length)
    ? digitos.slice(2)
    : digitos;
  if (!/^\d{10,11}$/.test(nacional)) return null;
  if (!/^[1-9]\d[2-9]/.test(nacional)) return null;
  if (nacional.length === 11 && nacional[2] !== '9') return null;
  return `55${nacional}`;
}
