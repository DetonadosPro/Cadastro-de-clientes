// src/api.js
// Funções auxiliares para conversar com o backend.
// Guarda o token de login no localStorage do navegador.

// Em produção (Railway), frontend e backend rodam em serviços/domínios
// separados — por isso a URL da API precisa ser absoluta, configurada
// via variável de ambiente (VITE_API_URL). Localmente, sem essa
// variável definida, cai no caminho relativo "/api" (funciona porque o
// backend serve tudo junto na mesma porta em desenvolvimento).
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function getToken() {
  return localStorage.getItem('pombo_token');
}

const ID_TELA = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

export function getIdTela() {
  return ID_TELA;
}

export function setToken(token, usuario, nome) {
  localStorage.setItem('pombo_token', token);
  localStorage.setItem('pombo_usuario', usuario);
  localStorage.setItem('pombo_nome', nome || usuario);
  window.dispatchEvent(new Event('pombo:sessao-alterada'));
}

export function limparSessao() {
  localStorage.removeItem('pombo_token');
  localStorage.removeItem('pombo_usuario');
  localStorage.removeItem('pombo_nome');
  window.dispatchEvent(new Event('pombo:sessao-alterada'));
}

export function getUsuarioLogado() {
  return localStorage.getItem('pombo_usuario');
}

// Nome de exibição (nome completo cadastrado) — usado na interface, como
// no rodapé do menu lateral. Diferente de getUsuarioLogado(), que
// retorna o usuário de login e é usado para checagens de autenticação.
export function getNomeExibicao() {
  return localStorage.getItem('pombo_nome') || getUsuarioLogado();
}

async function buscarComMensagem(url, opcoes) {
  try {
    return await fetch(url, opcoes);
  } catch (erro) {
    if (erro?.name === 'AbortError') throw erro;
    throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
  }
}

async function chamar(caminho, opcoes = {}) {
  const token = getToken();
  const cabecalhos = {
    'Content-Type': 'application/json',
    'x-pombo-tela': getIdTela(),
    ...(opcoes.headers || {}),
  };
  if (token) {
    cabecalhos.Authorization = `Bearer ${token}`;
  }

  const resposta = await buscarComMensagem(`${API_BASE}${caminho}`, {
    ...opcoes,
    headers: cabecalhos,
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    if (resposta.status === 401 && !caminho.startsWith('/auth/')) {
      limparSessao();
      // Sessão expirada (token inválido/vencido) — manda de volta pro
      // login em vez de deixar a pessoa numa tela travada fazendo
      // chamadas que sempre vão falhar. Usa window.location (não
      // useNavigate) porque este arquivo não é um componente React e
      // fica fora da árvore do react-router; a recarga completa também
      // garante que todo estado da aplicação é limpo junto.
      // Evita redirecionar de novo se já está no login (ex: senha
      // errada ao tentar entrar, que também retorna 401).
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        const parametros = new URLSearchParams({ motivo: 'sessao-expirada', retorno: window.location.pathname + window.location.search + window.location.hash });
        window.location.replace(`/login?${parametros}`);
      }
    }
    const erro = new Error(dados.erro || 'Erro ao comunicar com o servidor.');
    erro.status = resposta.status;
    erro.campo = dados.campo;
    throw erro;
  }

  return dados;
}

// Chamada específica para a área de gerenciamento de usuários — usa a
// senha mestra (enviada a cada chamada, nunca guardada) em vez do token
// de sessão normal, já que essa área é acessada sem estar logado.
async function chamarComSenhaMestra(caminho, senhaMestra, opcoes = {}) {
  const cabecalhos = {
    'Content-Type': 'application/json',
    'x-senha-mestra': senhaMestra,
    ...(opcoes.headers || {}),
  };

  const resposta = await buscarComMensagem(`${API_BASE}${caminho}`, {
    ...opcoes,
    headers: cabecalhos,
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const erro = new Error(dados.erro || 'Erro ao comunicar com o servidor.');
    erro.status = resposta.status;
    throw erro;
  }

  return dados;
}

export const api = {
  configuracoes: {
    buscar: () => chamar('/configuracoes'),
    salvar: (dados) => chamar('/configuracoes', { method: 'PUT', body: JSON.stringify(dados) }),
  },
  login: (usuario, senha) =>
    chamar('/auth/login', { method: 'POST', body: JSON.stringify({ usuario, senha }) }),

  // ---------- Gerenciamento de usuários (protegido por senha mestra) ----------
  usuarios: {
    verificarSenha: (senha) =>
      chamar('/auth/verificar-senha-mestra', { method: 'POST', body: JSON.stringify({ senha }) }),
    listar: (senhaMestra) =>
      chamarComSenhaMestra('/auth/usuarios', senhaMestra),
    criar: (senhaMestra, dados) =>
      chamarComSenhaMestra('/auth/usuarios', senhaMestra, { method: 'POST', body: JSON.stringify(dados) }),
    remover: (senhaMestra, id) =>
      chamarComSenhaMestra(`/auth/usuarios/${id}`, senhaMestra, { method: 'DELETE' }),
    redefinirSenha: (senhaMestra, id, senha) =>
      chamarComSenhaMestra(`/auth/usuarios/${id}/senha`, senhaMestra, { method: 'PUT', body: JSON.stringify({ senha }) }),
  },

  // ---------- Mensagem fonada (telefone) ----------
  fonada: {
    listar: (busca = '', pagina = 1, campo = '', opcoes = {}) =>
      chamar(`/fonadas?busca=${encodeURIComponent(busca)}&pagina=${pagina}&campo=${encodeURIComponent(campo)}`, opcoes),
    hoje: (opcoes = {}) => chamar('/fonadas/hoje', opcoes),
    proximaOs: () => chamar('/fonadas/proxima-os'),
    buscar: (id) => chamar(`/fonadas/${id}`),
    criar: (dados) => chamar('/fonadas', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => chamar(`/fonadas/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    apagar: (id) => chamar(`/fonadas/${id}`, { method: 'DELETE' }),
  },

  // ---------- Mensagem ao vivo (carro de som) ----------
  aoVivo: {
    listar: (busca = '', pagina = 1, campo = '', opcoes = {}) =>
      chamar(`/ao-vivo?busca=${encodeURIComponent(busca)}&pagina=${pagina}&campo=${encodeURIComponent(campo)}`, opcoes),
    hoje: () => chamar('/ao-vivo/hoje'),
    proximaOs: () => chamar('/ao-vivo/proxima-os'),
    buscar: (id) => chamar(`/ao-vivo/${id}`),
    criar: (dados) => chamar('/ao-vivo', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => chamar(`/ao-vivo/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    apagar: (id) => chamar(`/ao-vivo/${id}`, { method: 'DELETE' }),
    buscarParaImpressao: (ids) => chamar(`/ao-vivo/imprimir?ids=${ids.join(',')}`),
    darBaixa: (id, entregue, versao) => chamar(`/ao-vivo/${id}/baixa`, { method: 'POST', body: JSON.stringify({ entregue, versao }) }),
    desfazerBaixa: (id, versao) => chamar(`/ao-vivo/${id}/desfazer-baixa`, { method: 'POST', body: JSON.stringify({ versao }) }),
    marcarPagou: (id, pagou, versao) => chamar(`/ao-vivo/${id}/pagou`, { method: 'POST', body: JSON.stringify({ pagou, versao }) }),
    naoRecebeu: (id, observacao, remarcadoDia, versao) =>
      chamar(`/ao-vivo/${id}/nao-recebeu`, { method: 'POST', body: JSON.stringify({ observacao, remarcadoDia, versao }) }),
    buscarTentativasPrazo: (id) => chamar(`/ao-vivo/${id}/tentativas-prazo`),
  },

  // ---------- Clientes (cadastro único, compartilhado) ----------
  clientes: {
    listar: (busca = '', pagina = 1, campo = '', ordenarPor = '', direcao = '', extras = {}) => {
      const params = new URLSearchParams({ busca, pagina: String(pagina), campo, ordenarPor, direcao });
      if (extras.telefone) params.set('telefone', extras.telefone);
      if (extras.aniversario) params.set('aniversario', extras.aniversario);
      if (extras.situacao) params.set('situacao', extras.situacao);
      if (extras.modo) params.set('modo', extras.modo);
      if (extras.porPagina) params.set('porPagina', String(extras.porPagina));
      return chamar(`/clientes?${params.toString()}`, { signal: extras.signal });
    },
    listarLixeira: (busca = '', pagina = 1, extras = {}) => {
      const params=new URLSearchParams({busca,pagina:String(pagina)});
      if(extras.situacao)params.set('situacao',extras.situacao);
      if(extras.ordenarPor)params.set('ordenarPor',extras.ordenarPor);
      return chamar(`/clientes/lixeira?${params.toString()}`,{signal:extras.signal});
    },
    buscar: (id) => chamar(`/clientes/${id}`),
    buscarCadastro: (id) => chamar(`/clientes/${id}?historico=nao`),
    buscarResumo: (id) => chamar(`/clientes/${id}/resumo`),
    criar: (dados) => chamar('/clientes', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => chamar(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluir: (id) => chamar(`/clientes/${id}`, { method: 'DELETE' }),
    restaurar: (id) => chamar(`/clientes/${id}/restaurar`, { method: 'POST' }),
    pedidosLixeira: (id) => chamar(`/clientes/${id}/pedidos-lixeira`),
    apagarDefinitivo: (id) => chamar(`/clientes/${id}/definitivo`, { method: 'DELETE' }),
    mesclar: (destinoId, origemId, dadosFinais, versaoDestino, versaoOrigem) =>
      chamar(`/clientes/${destinoId}/mesclar`, { method: 'POST', body: JSON.stringify({ origemId, dadosFinais, versaoDestino, versaoOrigem }) }),
    verificarDuplicidade: (nome, nascimento) =>
      chamar(`/clientes/verificar-duplicidade?nome=${encodeURIComponent(nome)}&nascimento=${encodeURIComponent(nascimento)}`),
    possiveisDuplicatas: () => chamar('/clientes/possiveis-duplicatas'),
    descartarDuplicata: (clienteAId, clienteBId) =>
      chamar('/clientes/descartar-duplicata', { method: 'POST', body: JSON.stringify({ clienteAId, clienteBId }) }),
    mesclarAutomatico: (clienteAId, clienteBId) =>
      chamar('/clientes/mesclar-automatico', { method: 'POST', body: JSON.stringify({ clienteAId, clienteBId }) }),
    bloquear: (id, bloqueado, motivo) =>
      chamar(`/clientes/${id}/bloqueio`, { method: 'PUT', body: JSON.stringify({ bloqueado, motivo }) }),
  },

  // ---------- Agenda (mensagens de hoje, fonada + ao vivo) ----------
  agenda: {
    hoje: (data) => chamar(`/agenda/hoje${data ? `?data=${encodeURIComponent(data)}` : ''}`),
    contagens: (datas) => chamar(`/agenda/contagens?datas=${encodeURIComponent(datas.join(','))}`),
    darBaixaFonada: (pedidoId, mensagem, versao, mensagens) =>
      chamar(`/agenda/fonada/${pedidoId}/baixa`, { method: 'POST', body: JSON.stringify({ mensagem, versao, mensagens }) }),
    desfazerBaixaFonada: (pedidoId, mensagem, versao, mensagens) =>
      chamar(`/agenda/fonada/${pedidoId}/desfazer-baixa`, { method: 'POST', body: JSON.stringify({ mensagem, versao, mensagens }) }),
    naoAtendeuFonada: (pedidoId, mensagem, observacao, remarcadoDia, remarcadoHorario, mensagens, versao) =>
      chamar(`/agenda/fonada/${pedidoId}/nao-atendeu`, {
        method: 'POST',
        body: JSON.stringify({ mensagem, mensagens, observacao, remarcadoDia, remarcadoHorario, versao }),
      }),
    buscarTentativas: (pedidoId) => chamar(`/agenda/fonada/${pedidoId}/tentativas`),
    criarLembrete: (dados) => chamar('/agenda/lembretes', { method: 'POST', body: JSON.stringify(dados) }),
    atualizarLembrete: (id, dados) => chamar(`/agenda/lembretes/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluirLembrete: (id) => chamar(`/agenda/lembretes/${id}`, { method: 'DELETE' }),
  },

  // ---------- Cobrança (baixa de pagamento fonada) ----------
  cobranca: {
    buscar: (cobrarDia, pagou, nome, os, extras = {}) => {
      const params = new URLSearchParams();
      if (cobrarDia) params.set('cobrarDia', cobrarDia);
      if (pagou) params.set('pagou', pagou);
      if (nome) params.set('nome', nome);
      if (os) params.set('os', os);
      if (extras.recebidasInicio) params.set('recebidasInicio', extras.recebidasInicio);
      if (extras.recebidasFim) params.set('recebidasFim', extras.recebidasFim);
      return chamar(`/cobranca?${params.toString()}`);
    },
    darBaixa: (pedidoId, pagou, recebi, dataPagamento, versao) =>
      chamar(`/cobranca/${pedidoId}/baixa`, { method: 'PUT', body: JSON.stringify({ pagou, recebi, dataPagamento, versao }) }),
    desfazerBaixa: (pedidoId, versao) =>
      chamar(`/cobranca/${pedidoId}/desfazer-baixa`, { method: 'PUT', body: JSON.stringify({ versao }) }),
    darBaixaEmLote: (ids, recebi, dataPagamento, versoes) =>
      chamar('/cobranca/acoes/baixa-lote', { method: 'PUT', body: JSON.stringify({ ids, recebi, dataPagamento, versoes }) }),
    reagendarEmLote: (ids, cobrarDia, versoes) =>
      chamar('/cobranca/acoes/reagendar-lote', { method: 'PUT', body: JSON.stringify({ ids, cobrarDia, versoes }) }),
    marcarImpressos: (ids) =>
      chamar('/cobranca/acoes/marcar-impressos', { method: 'PUT', body: JSON.stringify({ ids }) }),
    buscarAoVivo: (pagou = 'NAO', nome = '', os = '', extras = {}) => {
      const params = new URLSearchParams({ pagou });
      if (nome) params.set('nome', nome);
      if (os) params.set('os', os);
      if (extras.recebidasInicio) params.set('recebidasInicio', extras.recebidasInicio);
      if (extras.recebidasFim) params.set('recebidasFim', extras.recebidasFim);
      return chamar(`/cobranca/ao-vivo?${params.toString()}`);
    },
    darBaixaAoVivo: (pedidoId, dados) =>
      chamar(`/cobranca/ao-vivo/${pedidoId}/baixa`, { method: 'PUT', body: JSON.stringify(dados) }),
    desfazerBaixaAoVivo: (pedidoId, versao) =>
      chamar(`/cobranca/ao-vivo/${pedidoId}/desfazer-baixa`, { method: 'PUT', body: JSON.stringify({ versao }) }),
    reagendarAoVivo: (pedidoId, dataCobranca, versao) =>
      chamar(`/cobranca/ao-vivo/${pedidoId}/reagendar`, { method: 'PUT', body: JSON.stringify({ dataCobranca, versao }) }),
  },

  // ---------- Relatórios financeiros por período ----------
  relatorios: {
    vendas: (inicio, fim, sistema = 'TODOS', opcoes = {}) => {
      const params = new URLSearchParams({ inicio, fim: fim || '', sistema, ...opcoes });
      return chamar(`/relatorios/vendas?${params}`);
    },
    recebimentos: (inicio, fim, sistema = 'TODOS', opcoes = {}) => {
      const params = new URLSearchParams({ inicio, fim: fim || '', sistema, ...opcoes });
      return chamar(`/relatorios/recebimentos?${params}`);
    },
    desempenho: (inicio, fim, sistema = 'TODOS', opcoes = {}) => {
      const params = new URLSearchParams({ inicio, fim: fim || '', sistema, ...opcoes });
      return chamar(`/relatorios/desempenho?${params}`);
    },
  },

  // ---------- Recall (fila de relacionamento cliente ↔ aniversariante) ----------
  recall: {
    filaAoVivo: (data) => chamar(`/recall/ao-vivo/fila?data=${encodeURIComponent(data)}`),
    fila: (data) => chamar(`/recall/fila?data=${encodeURIComponent(data)}`),
    buscar: (termo) => chamar(`/recall/buscar?termo=${encodeURIComponent(termo)}`),
    historico: () => chamar('/recall/historico'),
    status: (dados) => chamar('/recall/status', { method: 'PUT', body: JSON.stringify(dados) }),
    pedidoCriado: (dados) => chamar('/recall/pedido-criado', { method: 'PUT', body: JSON.stringify(dados) }),
  },
};
