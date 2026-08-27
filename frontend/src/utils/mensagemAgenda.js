function normalizarNome(nome) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0];
  if (!primeiro) return '';
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

function generoPorNome(nome) {
  const primeiro = normalizarNome(nome);
  const final = primeiro.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (final.endsWith('a')) return { artigo: 'a', pronome: 'ela' };
  if (final.endsWith('o')) return { artigo: 'o', pronome: 'ele' };
  return { artigo: 'o', pronome: 'ele' };
}

function artigoUsuario(nome) {
  const primeiro = normalizarNome(nome);
  const chave = primeiro.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (chave === 'enimar') return 'a';
  if (chave === 'victor') return 'o';
  return generoPorNome(primeiro).artigo;
}

export function mensagemConfirmacao(comprador, destinatario, usuario) {
  const cliente = normalizarNome(comprador) || 'cliente';
  const nomeDestinatario = normalizarNome(destinatario) || 'cliente';
  const generoDestinatario = generoPorNome(nomeDestinatario);
  const nomeUsuario = normalizarNome(usuario) || 'usuário';
  return `Olá ${cliente}, é ${artigoUsuario(nomeUsuario)} ${nomeUsuario}. Acabei de passar a mensagem para ${generoDestinatario.artigo} ${nomeDestinatario}, ${generoDestinatario.pronome} gostou muito😍`;
}

export function mensagemRegistrarERemarcar(comprador, destinatario, usuario) {
  const cliente = normalizarNome(comprador) || 'cliente';
  const nomeDestinatario = normalizarNome(destinatario) || 'cliente';
  const generoDestinatario = generoPorNome(nomeDestinatario);
  const nomeUsuario = normalizarNome(usuario) || 'usuário';
  return `Oi ${cliente}, é ${artigoUsuario(nomeUsuario)} ${nomeUsuario}. Ainda não consegui passar a mensagem para ${generoDestinatario.artigo} ${nomeDestinatario}. Assim que der certo te aviso😉😊`;
}
