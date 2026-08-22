// src/api.js
// Funções auxiliares para conversar com o backend.
// Guarda o token de login no localStorage do navegador.

// Em produção (Railway), frontend e backend rodam em serviços/domínios
// separados — por isso a URL da API precisa ser absoluta, configurada
// via variável de ambiente (VITE_API_URL). Localmente, sem essa
// variável definida, cai no caminho relativo "/api" (funciona porque o
// backend serve tudo junto na mesma porta em desenvolvimento).
const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('pombo_token');
}

export function setToken(token, usuario, nome) {
  localStorage.setItem('pombo_token', token);
  localStorage.setItem('pombo_usuario', usuario);
  localStorage.setItem('pombo_nome', nome || usuario);
}

export function limparSessao() {
  localStorage.removeItem('pombo_token');
  localStorage.removeItem('pombo_usuario');
  localStorage.removeItem('pombo_nome');
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

async function chamar(caminho, opcoes = {}) {
  const token = getToken();
  const cabecalhos = {
    'Content-Type': 'application/json',
    ...(opcoes.headers || {}),
  };
  if (token) {
    cabecalhos.Authorization = `Bearer ${token}`;
  }

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: cabecalhos,
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    if (resposta.status === 401) {
      limparSessao();
    }
    throw new Error(dados.erro || 'Erro ao comunicar com o servidor.');
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

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: cabecalhos,
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new Error(dados.erro || 'Erro ao comunicar com o servidor.');
  }

  return dados;
}

export const api = {
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
  },

  // ---------- Mensagem fonada (telefone) ----------
  fonada: {
    listar: (busca = '', pagina = 1, campo = '') =>
      chamar(`/fonadas?busca=${encodeURIComponent(busca)}&pagina=${pagina}&campo=${encodeURIComponent(campo)}`),
    hoje: () => chamar('/fonadas/hoje'),
    proximaOs: () => chamar('/fonadas/proxima-os'),
    buscar: (id) => chamar(`/fonadas/${id}`),
    criar: (dados) => chamar('/fonadas', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => chamar(`/fonadas/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    apagar: (id) => chamar(`/fonadas/${id}`, { method: 'DELETE' }),
  },

  // ---------- Mensagem ao vivo (carro de som) ----------
  aoVivo: {
    listar: (busca = '', pagina = 1, campo = '') =>
      chamar(`/ao-vivo?busca=${encodeURIComponent(busca)}&pagina=${pagina}&campo=${encodeURIComponent(campo)}`),
    hoje: () => chamar('/ao-vivo/hoje'),
    proximaOs: () => chamar('/ao-vivo/proxima-os'),
    buscar: (id) => chamar(`/ao-vivo/${id}`),
    criar: (dados) => chamar('/ao-vivo', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => chamar(`/ao-vivo/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    apagar: (id) => chamar(`/ao-vivo/${id}`, { method: 'DELETE' }),
    buscarParaImpressao: (ids) => chamar(`/ao-vivo/imprimir?ids=${ids.join(',')}`),
    darBaixa: (id, entregue) => chamar(`/ao-vivo/${id}/baixa`, { method: 'POST', body: JSON.stringify({ entregue }) }),
    desfazerBaixa: (id) => chamar(`/ao-vivo/${id}/desfazer-baixa`, { method: 'POST' }),
    marcarPagou: (id, pagou) => chamar(`/ao-vivo/${id}/pagou`, { method: 'POST', body: JSON.stringify({ pagou }) }),
    naoRecebeu: (id, observacao, remarcadoDia) =>
      chamar(`/ao-vivo/${id}/nao-recebeu`, { method: 'POST', body: JSON.stringify({ observacao, remarcadoDia }) }),
    buscarTentativasPrazo: (id) => chamar(`/ao-vivo/${id}/tentativas-prazo`),
  },

  // ---------- Clientes (cadastro único, compartilhado) ----------
  clientes: {
    listar: (busca = '', pagina = 1, campo = '', ordenarPor = '', direcao = '') =>
      chamar(`/clientes?busca=${encodeURIComponent(busca)}&pagina=${pagina}&campo=${encodeURIComponent(campo)}&ordenarPor=${encodeURIComponent(ordenarPor)}&direcao=${encodeURIComponent(direcao)}`),
    listarLixeira: (busca = '', pagina = 1) =>
      chamar(`/clientes/lixeira?busca=${encodeURIComponent(busca)}&pagina=${pagina}`),
    buscar: (id) => chamar(`/clientes/${id}`),
    criar: (dados) => chamar('/clientes', { method: 'POST', body: JSON.stringify(dados) }),
    atualizar: (id, dados) => chamar(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
    excluir: (id) => chamar(`/clientes/${id}`, { method: 'DELETE' }),
    restaurar: (id) => chamar(`/clientes/${id}/restaurar`, { method: 'POST' }),
    pedidosLixeira: (id) => chamar(`/clientes/${id}/pedidos-lixeira`),
    apagarDefinitivo: (id) => chamar(`/clientes/${id}/definitivo`, { method: 'DELETE' }),
    mesclar: (destinoId, origemId) =>
      chamar(`/clientes/${destinoId}/mesclar`, { method: 'POST', body: JSON.stringify({ origemId }) }),
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
    darBaixaFonada: (pedidoId, mensagem) =>
      chamar(`/agenda/fonada/${pedidoId}/baixa`, { method: 'POST', body: JSON.stringify({ mensagem }) }),
    desfazerBaixaFonada: (pedidoId, mensagem) =>
      chamar(`/agenda/fonada/${pedidoId}/desfazer-baixa`, { method: 'POST', body: JSON.stringify({ mensagem }) }),
    naoAtendeuFonada: (pedidoId, mensagem, observacao, remarcadoDia, remarcadoHorario) =>
      chamar(`/agenda/fonada/${pedidoId}/nao-atendeu`, {
        method: 'POST',
        body: JSON.stringify({ mensagem, observacao, remarcadoDia, remarcadoHorario }),
      }),
    buscarTentativas: (pedidoId) => chamar(`/agenda/fonada/${pedidoId}/tentativas`),
  },

  // ---------- Cobrança (baixa de pagamento fonada) ----------
  cobranca: {
    buscar: (cobrarDia, pagou, nome, os) => {
      const params = new URLSearchParams();
      if (cobrarDia) params.set('cobrarDia', cobrarDia);
      if (pagou) params.set('pagou', pagou);
      if (nome) params.set('nome', nome);
      if (os) params.set('os', os);
      return chamar(`/cobranca?${params.toString()}`);
    },
    darBaixa: (pedidoId, pagou, recebi, dataPagamento) =>
      chamar(`/cobranca/${pedidoId}/baixa`, { method: 'PUT', body: JSON.stringify({ pagou, recebi, dataPagamento }) }),
  },

  // ---------- Relatórios financeiros por período ----------
  relatorios: {
    vendas: (inicio, fim, sistema = 'TODOS') =>
      chamar(`/relatorios/vendas?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}&sistema=${encodeURIComponent(sistema)}`),
    recebimentos: (inicio, fim, sistema = 'TODOS') =>
      chamar(`/relatorios/recebimentos?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}&sistema=${encodeURIComponent(sistema)}`),
    desempenho: (inicio, fim, sistema = 'TODOS') =>
      chamar(`/relatorios/desempenho?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}&sistema=${encodeURIComponent(sistema)}`),
  },
};
