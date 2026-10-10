export function destinoSeguro(retorno) {
  if (typeof retorno !== 'string' || !retorno.startsWith('/') || retorno.startsWith('//') || retorno.includes('\\')) return '/agenda';
  try {
    const url = new URL(retorno, 'https://pombo.local');
    const caminho = decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase();
    if (url.origin !== 'https://pombo.local' || ['/login', '/gerenciar-usuarios'].includes(caminho)) return '/agenda';
    return url.pathname + url.search + url.hash;
  } catch { return '/agenda'; }
}

export function normalizarBuscaAcesso(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
