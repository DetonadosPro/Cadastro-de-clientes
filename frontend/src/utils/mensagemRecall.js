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

  // Sem gênero cadastrado, só usamos artigo para nomes explicitamente conhecidos.
  const legado = generoPorNome(nome);
  if (!legado) return null;
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
  const apresentacao = artigoUsuarioAtual ? `é ${artigoUsuarioAtual} ${nomeUsuario}` : `aqui é ${nomeUsuario}`;
  const aniversario = generoAniversario ? `aniversário ${generoAniversario.contracao} ${nomeAniversariante}` : `aniversário de ${nomeAniversariante}`;
  const convite = generoAniversario ? `pra ${generoAniversario.pronome}` : 'de aniversário';
  const rodapeOs = String(numeroOs ?? '').trim() ? `\n\nO.S.: ${String(numeroOs).trim()}` : '';
  // Escape Unicode evita que o emoji seja corrompido ao passar por
  // editores/ambientes Windows com codificações de arquivo diferentes.
  const emojiFesta = '\u{1F973}';

  if (modoFila === 'ANIVERSARIO') {
    return `Oi ${nomeContato}, ${apresentacao} do Pombo Correio Mensagens. Vimos em nosso cadastro que amanhã é ${aniversario}${emojiFesta}. Você gostaria de passar uma mensagem ${generoAniversario ? `de aniversário pra ${generoAniversario.pronome}` : 'de aniversário'}?${rodapeOs}`;
  }

  return `Oi ${nomeContato}, ${apresentacao} do Pombo Correio. Amanhã é ${aniversario}${emojiFesta}. Você gostaria de passar uma mensagem ${convite}?${rodapeOs}`;
}

export function buildRecallWhatsAppUrl(telefone, dadosMensagem, criarLinkTelefone) {
  const base = criarLinkTelefone(telefone);
  if (!base) return null;
  const separador = base.includes('?') ? '&' : '?';
  return `${base}${separador}text=${encodeURIComponent(buildRecallWhatsAppMessage(dadosMensagem))}`;
}
