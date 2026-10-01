import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatarCelular } from '../mascaras.js';

const ACOES = [
  { id: 'configuracoes', titulo: 'Abrir Configurações', detalhe: 'Regras da Fonada e informações do sistema', rota: '/configuracoes', grupo: 'Navegação', termos: 'configuracoes limite segunda mensagem ajustes' },
  { id: 'agenda', titulo: 'Abrir Agenda', detalhe: 'Compromissos e entregas do dia', rota: '/agenda', grupo: 'Navegação', termos: 'hoje compromissos agenda' },
  { id: 'clientes', titulo: 'Ver clientes', detalhe: 'Pesquisar e consultar cadastros', rota: '/clientes', grupo: 'Navegação', termos: 'clientes contatos cadastros' },
  { id: 'novo-cliente', titulo: 'Novo cliente', detalhe: 'Iniciar um novo cadastro', rota: '/clientes/novo', grupo: 'Ações rápidas', termos: 'cadastrar adicionar novo cliente' },
  { id: 'cobranca', titulo: 'Abrir Cobrança', detalhe: 'Pendências e recebimentos', rota: '/cobranca', grupo: 'Navegação', termos: 'financeiro cobrar recebimentos' },
  { id: 'relatorios', titulo: 'Abrir Relatórios', detalhe: 'Vendas, recebimentos e desempenho', rota: '/relatorios', grupo: 'Navegação', termos: 'relatorios vendas desempenho' },
  { id: 'recall', titulo: 'Abrir Recall', detalhe: 'Retornos e pesquisas', rota: '/recall', grupo: 'Navegação', termos: 'recall retornos pesquisas' },
  { id: 'fonada', titulo: 'Abrir Fonada', detalhe: 'Pedidos de mensagens', rota: '/fonada', grupo: 'Navegação', termos: 'fonada pedidos mensagens' },
  { id: 'ao-vivo', titulo: 'Abrir Ao vivo', detalhe: 'Pedidos de entrega', rota: '/ao-vivo', grupo: 'Navegação', termos: 'ao vivo pedidos entrega' },
];

function IconeBusca() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
}

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function ehTermoDeTelefone(valor) {
  const texto = String(valor || '').trim();
  return /\d/.test(texto) && /^[\d\s()+.\-]+$/.test(texto);
}

function formatarTermo(valor) {
  if (!ehTermoDeTelefone(valor)) return valor;
  let digitos = somenteDigitos(valor);
  const informouDdi = /^\s*\+55/.test(valor) || (digitos.length > 11 && digitos.startsWith('55'));
  if (informouDdi) digitos = digitos.slice(2);
  return formatarCelular(digitos);
}

function contatoCorrespondente(cliente, termo) {
  const procurado = somenteDigitos(termo);
  if (!procurado) return null;
  return [cliente.whatsapp, cliente.celular]
    .find((contato) => somenteDigitos(contato).includes(procurado)) || null;
}

export default function CommandPalette({ aberta, onFechar, onNavegar }) {
  const [termo, setTermo] = useState('');
  const [clientes, setClientes] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [indice, setIndice] = useState(0);
  const inputRef = useRef(null);
  const paletteRef = useRef(null);
  const buscaPorTelefone = ehTermoDeTelefone(termo);
  const telefoneBuscado = buscaPorTelefone ? somenteDigitos(termo) : '';

  useEffect(() => {
    if (!aberta) return undefined;
    const focoAnterior = document.activeElement;
    return () => requestAnimationFrame(() => focoAnterior?.isConnected && focoAnterior.focus());
  }, [aberta]);

  const acoesFiltradas = useMemo(() => {
    const normalizado = termo.trim().toLocaleLowerCase('pt-BR');
    if (!normalizado) return ACOES;
    return ACOES.filter((acao) => `${acao.titulo} ${acao.detalhe} ${acao.termos}`.toLocaleLowerCase('pt-BR').includes(normalizado));
  }, [termo]);

  const resultados = useMemo(() => [
    ...acoesFiltradas.map((acao) => ({ ...acao, tipo: 'acao' })),
    ...clientes.map((cliente) => ({
      id: `cliente-${cliente.id}`,
      titulo: cliente.nome,
      detalhe: contatoCorrespondente(cliente, termo) || cliente.whatsapp || cliente.celular || cliente.fixo || 'Cliente cadastrado',
      rota: `/clientes/${cliente.id}`,
      grupo: 'Clientes',
      tipo: 'cliente',
    })),
  ], [acoesFiltradas, clientes, termo]);

  useEffect(() => {
    if (!aberta) return;
    setTermo(''); setClientes([]); setIndice(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [aberta]);

  useEffect(() => {
    const termoValido = buscaPorTelefone ? telefoneBuscado.length >= 3 : termo.trim().length >= 2;
    if (!aberta || !termoValido) { setClientes([]); setBuscando(false); return undefined; }
    let ativo = true;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const resposta = await api.clientes.listar(
          buscaPorTelefone ? '' : termo.trim(),
          1,
          buscaPorTelefone ? '' : 'nome',
          'nome',
          'asc',
          { modo: 'contatos', porPagina: 6, ...(buscaPorTelefone ? { telefone: telefoneBuscado } : {}) }
        );
        if (ativo) setClientes((resposta.clientes || []).slice(0, 6));
      } catch {
        if (ativo) setClientes([]);
      } finally {
        if (ativo) setBuscando(false);
      }
    }, 220);
    return () => { ativo = false; clearTimeout(timer); };
  }, [aberta, buscaPorTelefone, telefoneBuscado, termo]);

  useEffect(() => { setIndice(0); }, [termo]);

  if (!aberta) return null;

  function executar(item) {
    if (!item) return;
    onNavegar(item.rota);
    onFechar();
  }

  function aoTeclar(e) {
    if (e.key === 'Tab') {
      const focaveis = Array.from(paletteRef.current?.querySelectorAll('input, button, [href], [tabindex]:not([tabindex="-1"])') || [])
        .filter((elemento) => !elemento.disabled && elemento.getClientRects().length > 0);
      if (focaveis.length) {
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((atual) => Math.min(atual + 1, resultados.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((atual) => Math.max(atual - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); executar(resultados[indice]); }
  }

  let ultimoGrupo = '';
  return (
    <div className="command-overlay nao-imprimir" onMouseDown={onFechar} role="presentation">
      <div ref={paletteRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Busca global" onMouseDown={(e) => e.stopPropagation()} onKeyDown={aoTeclar}>
        <div className="command-input-wrap">
          <IconeBusca />
          <input ref={inputRef} value={termo} onChange={(e) => setTermo(formatarTermo(e.target.value))} placeholder="Nome, celular, WhatsApp, página ou ação…" aria-label="Buscar no sistema por nome, celular, WhatsApp, página ou ação" />
          <kbd>ESC</kbd>
        </div>
        <div className="command-resultados">
          {resultados.length === 0 && !buscando && <div className="command-vazio">Nenhum resultado. Busque pelo nome, celular, WhatsApp ou por uma ação.</div>}
          {resultados.map((item, posicao) => {
            const mostrarGrupo = item.grupo !== ultimoGrupo;
            ultimoGrupo = item.grupo;
            return (
              <React.Fragment key={item.id}>
                {mostrarGrupo && <div className="command-grupo">{item.grupo}</div>}
                <button type="button" className={`command-item ${posicao === indice ? 'ativo' : ''}`} onMouseEnter={() => setIndice(posicao)} onClick={() => executar(item)}>
                  <span className={`command-item-icone ${item.tipo}`}>{item.tipo === 'cliente' ? item.titulo.slice(0, 1).toUpperCase() : '↗'}</span>
                  <span><strong>{item.titulo}</strong><small>{item.detalhe}</small></span>
                  <span className="command-enter">↵</span>
                </button>
              </React.Fragment>
            );
          })}
          {buscando && <div className="command-buscando"><span /> Buscando clientes…</div>}
        </div>
        <div className="command-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span>Busca global <strong>Ctrl K</strong></span></div>
      </div>
    </div>
  );
}
