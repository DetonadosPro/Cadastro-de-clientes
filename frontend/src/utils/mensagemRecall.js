import { artigoUsuario, generoPorNome, normalizarNome } from './mensagemAgenda.js';

function generoEstruturado(valor) {
  const chave = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (['f', 'feminino', 'mulher'].includes(chave)) return { artigo: 'a', contracao: 'da', pronome: 'ela' };
  if (['m', 'masculino', 'homem'].includes(chave)) return { artigo: 'o', contracao: 'do', pronome: 'ele' };
  return null;
}

function generoDoAniversariante(nome, genero) {
  const estruturado = generoEstruturado(genero);
  if (estruturado) return estruturado;

  // O cadastro histórico guarda o destinatário como texto livre e ainda
  // não possui sexo/gênero estruturado. Mantemos aqui, em um único lugar,
  // o mesmo fallback gramatical já usado nas mensagens da Agenda.
  const legado = generoPorNome(nome);
  return {
    artigo: legado.artigo,
    contracao: legado.artigo === 'a' ? 'da' : 'do',
    pronome: legado.pronome,
  };
}

function artigoDoUsuario(nome, genero) {
  return generoEstruturado(genero)?.artigo || artigoUsuario(nome);
}

export function buildRecallWhatsAppMessage({
  modoFila,
  contato,
  aniversariante,
  usuario,
  generoAniversariante,
  generoUsuario,
  numeroOs,
}) {
  const nomeContato = normalizarNome(contato) || 'Cliente';
  const nomeAniversariante = normalizarNome(aniversariante) || 'Cliente';
  const nomeUsuario = normalizarNome(usuario) || 'Usuário';
  const generoAniversario = generoDoAniversariante(nomeAniversariante, generoAniversariante);
  const artigoUsuarioAtual = artigoDoUsuario(nomeUsuario, generoUsuario);
  const rodapeOs = String(numeroOs ?? '').trim() ? `\n\nO.S.: ${String(numeroOs).trim()}` : '';
  // Escape Unicode evita que o emoji seja corrompido ao passar por
  // editores/ambientes Windows com codificações de arquivo diferentes.
  const emojiFesta = '\u{1F973}';

  if (modoFila === 'ANIVERSARIO') {
    return `Oi ${nomeContato}, é ${artigoUsuarioAtual} ${nomeUsuario} do Pombo Correio Mensagens. Vimos em nosso cadastro que amanhã é aniversário ${generoAniversario.contracao} ${nomeAniversariante}${emojiFesta}. Você gostaria de passar uma mensagem de aniversário pra ${generoAniversario.pronome}?${rodapeOs}`;
  }

  return `Oi ${nomeContato}, é ${artigoUsuarioAtual} ${nomeUsuario} do Pombo Correio. Amanhã é aniversário ${generoAniversario.contracao} ${nomeAniversariante}${emojiFesta}. Você gostaria de passar uma mensagem pra ${generoAniversario.pronome}?${rodapeOs}`;
}

export function buildRecallWhatsAppUrl(telefone, dadosMensagem, criarLinkTelefone) {
  const base = criarLinkTelefone(telefone);
  if (!base) return null;
  const separador = base.includes('?') ? '&' : '?';
  return `${base}${separador}text=${encodeURIComponent(buildRecallWhatsAppMessage(dadosMensagem))}`;
}
