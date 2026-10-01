export function normalizarNome(nome) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0];
  if (!primeiro) return '';
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

// Exceções e terminações comuns em nomes brasileiros que a regra a/o não cobre.
const nomesFemininos = new Set([
  'alice', 'beatriz', 'carmen', 'catiusse', 'enimar', 'ellen', 'ester',
  'isabel', 'ketlyn', 'kethlyn', 'kelly', 'marian', 'miriam', 'raquel',
  'simone', 'sueli', 'yasmim',
]);
const nomesMasculinos = new Set(['claudean', 'luca', 'noah', 'victor']);

export function generoPorNome(nome) {
  const primeiro = normalizarNome(nome);
  const chave = primeiro.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const feminino = nomesFemininos.has(chave) || (!nomesMasculinos.has(chave) && (
    chave.endsWith('a') || /(?:lyn|lyne|line|lene|elle|ette|isse|ice|ine)$/.test(chave)
  ));
  return feminino ? { artigo: 'a', pronome: 'ela' } : { artigo: 'o', pronome: 'ele' };
}

export function artigoUsuario(nome) {
  return generoPorNome(nome).artigo;
}

export function mensagemContatoDestinatario(destinatario, usuario, numeroOs) {
  const nomeDestinatario = normalizarNome(destinatario) || 'cliente';
  const nomeUsuario = normalizarNome(usuario) || 'usuário';
  const mensagem = `Oi ${nomeDestinatario}, tudo bem?\nÉ ${artigoUsuario(nomeUsuario)} ${nomeUsuario} do Pombo-Correio Mensagens\nNós temos uma mensagem pra você.\nAssim que estiver disponível, você pode avisar?`;
  const os = String(numeroOs ?? '').trim();
  return os ? `${mensagem}\n\nO.S: ${os}` : mensagem;
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
