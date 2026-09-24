export function normalizarNome(nome) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0];
  if (!primeiro) return '';
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

export function generoPorNome(nome) {
  const primeiro = normalizarNome(nome);
  const final = primeiro.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (final === 'enimar') return { artigo: 'a', pronome: 'ela' };
  if (final === 'victor') return { artigo: 'o', pronome: 'ele' };
  return null;
}

export function artigoUsuario(nome) {
  const primeiro = normalizarNome(nome);
  const chave = primeiro.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (chave === 'enimar') return 'a';
  if (chave === 'victor') return 'o';
  return generoPorNome(primeiro)?.artigo || null;
}

function apresentacaoUsuario(nome) {
  const artigo = artigoUsuario(nome);
  return artigo ? `é ${artigo} ${nome}` : `aqui é ${nome}`;
}

export function mensagemContatoDestinatario(destinatario, usuario) {
  const nomeDestinatario = normalizarNome(destinatario) || 'cliente';
  const nomeUsuario = normalizarNome(usuario) || 'usuário';
  const apresentacao = apresentacaoUsuario(nomeUsuario);
  return `Oi ${nomeDestinatario}, tudo bem?\n${apresentacao.charAt(0).toUpperCase()}${apresentacao.slice(1)} do Pombo-Correio Mensagens\nNós temos uma mensagem pra você.\nAssim que estiver disponível, você pode avisar?`;
}

export function mensagemConfirmacao(comprador, destinatario, usuario) {
  const cliente = normalizarNome(comprador) || 'cliente';
  const nomeDestinatario = normalizarNome(destinatario) || 'cliente';
  const nomeUsuario = normalizarNome(usuario) || 'usuário';
  return `Olá ${cliente}, ${apresentacaoUsuario(nomeUsuario)}. Acabei de passar a mensagem para ${nomeDestinatario}. A pessoa gostou muito😍`;
}

export function mensagemRegistrarERemarcar(comprador, destinatario, usuario) {
  const cliente = normalizarNome(comprador) || 'cliente';
  const nomeDestinatario = normalizarNome(destinatario) || 'cliente';
  const nomeUsuario = normalizarNome(usuario) || 'usuário';
  return `Oi ${cliente}, ${apresentacaoUsuario(nomeUsuario)}. Ainda não consegui passar a mensagem para ${nomeDestinatario}. Assim que der certo te aviso😉😊`;
}
