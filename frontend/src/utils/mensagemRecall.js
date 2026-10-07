import { artigoUsuario, generoPorNome, normalizarNome } from './mensagemAgenda.js';
import { numeroWhatsAppBrasil } from './telefoneWhatsApp.js';

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

export function buildRecallAoVivoMessage({ contato, homenageado, generoHomenageado, usuario, ocasiao, tema, dataReferencia, numeroOs, modoFila }) {
  const nome = normalizarNome(contato) || 'Cliente';
  const para = String(homenageado || '').trim();
  if (ocasiao === 'ANIVERSARIO') {
    const genero = generoDoAniversariante(para, generoHomenageado);
    const destinatario = normalizarNome(para) || (genero.artigo === 'a' ? 'destinatária' : 'destinatário');
    const objeto = genero.artigo === 'a' ? 'la' : 'lo';
    return `Oi, ${nome}! 😊 Amanhã é aniversário ${genero.contracao} ${destinatario}! 🎂\n\nQue tal surpreendê-${objeto}${modoFila === 'ANIVERSARIO' ? '' : ' *novamente*'} com uma linda *Mensagem ao Vivo*? 🎶✨\n\nE tem um presente nosso: *toda a homenagem é filmada e você recebe o vídeo sem custo adicional!* ❤️\n\nQuer reservar uma homenagem para ${genero.pronome}?${numeroOs ? `\n\nO.S.: ${numeroOs}` : ''}`;
  }
  const apresentacao = `Oi ${nome}, é ${artigoUsuario(usuario)} ${normalizarNome(usuario) || 'equipe'} do Pombo Correio.`;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(dataReferencia || '') ? `${dataReferencia.slice(8, 10)}/${dataReferencia.slice(5, 7)}` : 'esta época';
  const convites = {
    CASAMENTO: `No dia ${data}, podemos celebrar novamente o aniversário de casamento de ${para}. Que tal uma homenagem ao vivo para comemorar essa união?`,
    ANIVERSARIO_NAMORO: `No dia ${data}, podemos celebrar o aniversário de namoro de ${para}. Você gostaria de preparar uma nova homenagem ao vivo?`,
    EMPRESA: `No dia ${data}, podemos celebrar mais um aniversário de ${para}. Que tal uma nova homenagem ao vivo?`,
    MAES: `O Dia das Mães será em ${data}. Você gostaria de surpreender ${para} com uma nova homenagem ao vivo nessa data especial?`,
    PAIS: `O Dia dos Pais será em ${data}. Que tal preparar uma nova homenagem ao vivo para ${para}?`,
    NAMORADOS: `O Dia dos Namorados será em ${data}. Você gostaria de surpreender ${para} com uma nova homenagem ao vivo?`,
    MULHER: `O Dia da Mulher será em ${data}. Que tal uma nova homenagem ao vivo para ${para}?`,
    NATAL: `Para este Natal, que tal surpreender ${para} com uma nova homenagem ao vivo?`,
  };
  const lembranca = `Você já escolheu uma homenagem ao vivo para ${para} com a gente.`;
  const convite = convites[ocasiao] || `Na homenagem anterior, você escolheu o tema “${tema || 'homenagem especial'}”. Gostaria de preparar uma nova surpresa para ${para}?`;
  return `${apresentacao} ${lembranca} ${convite}${numeroOs ? `\n\nO.S.: ${numeroOs}` : ''}`;
}

export function buildRecallAoVivoUrl(telefone, dados) {
  const numero = numeroWhatsAppBrasil(telefone);
  return numero ? `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(buildRecallAoVivoMessage(dados))}` : null;
}
