import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './menu-lateral.css';

function Icone({ tipo, ...props }) {
  const linhas = {
    marca: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6M4 18l6-6m10 6-6-6" /></>,
    agenda: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-11 5h4" /></>,
    clientes: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5" /></>,
    recall: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /><path d="M12 7v5l3 2" /></>,
    fonada: <path d="m6 3 3 5-2 2a15 15 0 0 0 7 7l2-2 5 3c-1 5-5 4-8 2C7 17 3 12 3 7c0-2 1-4 3-4Z" />,
    aovivo: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3m-3 0h6" /></>,
    cobranca: <><rect x="2" y="5" width="20" height="14" rx="3" /><circle cx="12" cy="12" r="3" /><path d="M5 12h1m12 0h1" /></>,
    relatorios: <><path d="M4 4v16h16M8 15l4-5 4 2 5-7" /></>,
    vendas: <><path d="M4 4h16v16H4zM4 9h16M8 2v4m8-4v4m-8 9 3 3 5-5" /></>,
    busca: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    mais: <path d="M12 5v14M5 12h14" />,
    recolher: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16m7-11-3 3 3 3" /></>,
    expandir: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16m4-11 3 3-3 3" /></>,
    fechar: <path d="m6 6 12 12M6 18 18 6" />,
    rascunho: <><path d="M14 3H5v18h14V8Z" /><path d="M14 3v5h5M8 12h8m-8 4h5" /></>,
    seta: <path d="m9 5 7 7-7 7" />,
    configuracoes: <><path d="m9 3-1 3-3 1-2 4 2 2v3l3 2 1 3h6l1-3 3-2v-3l2-2-2-4-3-1-1-3Z" /><circle cx="12" cy="12" r="3" /></>,
    lixeira: <><path d="M4 7h16M9 7V3h6v4M6 7l1 14h10l1-14M10 11v6m4-6v6" /></>,
    sair: <><path d="M9 4H4v16h5m4-13 5 5-5 5m-6-5h14" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{linhas[tipo]}</svg>;
}

export function nomeDoRascunho(rascunho) {
  const cliente = rascunho.cliente?.nome || rascunho.dados.nome || 'Novo cliente';
  if (rascunho.chave.startsWith('editar-')) return `${cliente} · pedido ${rascunho.dados.senha_os || rascunho.dados.numero_os || rascunho.chave.slice(7)}`;
  return `${cliente} · ${new Date(rascunho.criadoEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
}

function rotaDoRascunho(prefixo, rascunho) {
  if (!rascunho.chave.startsWith('novo-')) return `${prefixo}/${rascunho.chave.slice(7)}`;
  const params = new URLSearchParams(rascunho.busca);
  if (rascunho.dados.cliente_id) params.set('clienteId', String(rascunho.dados.cliente_id));
  params.set('rascunho', rascunho.chave.slice(5));
  return `${prefixo}/novo?${params}`;
}

export default function MenuLateral({ aberto, compacto, onFechar, onCompactar, onBusca, onNovoCliente, onClientes, onSecao, onSair, nome, usuario, alertaAgenda, rascunhos, onDescartar }) {
  const location = useLocation();
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [rascunhosAbertos, setRascunhosAbertos] = useState(false);
  const painelRef = useRef(null);
  const fecharRef = useRef(null);
  const onFecharRef = useRef(onFechar);
  onFecharRef.current = onFechar;
  const compactoAgora = compacto && !mobile;
  const inicial = (nome || usuario || 'U').trim().charAt(0).toUpperCase();
  const alertaTexto = alertaAgenda === 'vermelho' ? 'Há mensagens atrasadas na Agenda' : 'Há mensagens próximas do horário na Agenda';

  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 900px)');
    const atualizar = () => { setMobile(consulta.matches); if (!consulta.matches) onFecharRef.current(); };
    consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);

  useEffect(() => {
    if (!aberto || !mobile) return undefined;
    const focoAnterior = document.activeElement;
    const fundos = Array.from(document.querySelectorAll('.layout-conteudo,.layout-topbar')).map(elemento => ({ elemento, inert: elemento.inert }));
    fundos.forEach(({ elemento }) => { elemento.inert = true; });
    document.body.classList.add('menu-mobile-aberto');
    const quadro = requestAnimationFrame(() => fecharRef.current?.focus());
    const aoTeclar = e => {
      if (document.querySelector('.command-overlay,.modal-fundo,.drawer-cliente-overlay')) return;
      if (e.key === 'Escape') { e.preventDefault(); onFecharRef.current(); return; }
      if (e.key !== 'Tab') return;
      const itens = Array.from(painelRef.current?.querySelectorAll('button,[href]') || []).filter(el => !el.disabled && el.getClientRects().length > 0);
      const primeiro = itens[0], ultimo = itens.at(-1);
      const fora = !painelRef.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === primeiro || fora)) { e.preventDefault(); ultimo?.focus(); }
      else if (!e.shiftKey && (document.activeElement === ultimo || fora)) { e.preventDefault(); primeiro?.focus(); }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      cancelAnimationFrame(quadro);
      document.removeEventListener('keydown', aoTeclar);
      fundos.forEach(({ elemento, inert }) => { elemento.inert = inert; });
      document.body.classList.remove('menu-mobile-aberto');
      requestAnimationFrame(() => {
        if (!document.querySelector('.command-overlay,.modal-fundo,.drawer-cliente-overlay') && focoAnterior?.isConnected) focoAnterior.focus();
      });
    };
  }, [aberto, mobile]);

  const fecharAoNavegar = () => { if (mobile) onFechar(); };
  function link(rota, titulo, tipo, extra = '') {
    const ativo = rota === '/fonada' ? location.pathname.startsWith('/fonada') && location.pathname !== '/fonada/hoje' : location.pathname === rota || location.pathname.startsWith(`${rota}/`);
    return <NavLink to={rota} aria-label={titulo} title={titulo} aria-current={ativo ? 'page' : false} className={`ml-link ${ativo ? 'ml-ativo' : ''} ${extra}`} onClick={e => { fecharAoNavegar(); onSecao(e, rota); }}>
      <span className="ml-icone"><Icone tipo={tipo} /></span><span className="ml-texto">{titulo}</span>
      {rota === '/agenda' && alertaAgenda && <span className={`ml-alerta ${alertaAgenda}`} role="img" aria-label={alertaTexto} title={alertaTexto} />}
      {ativo && <span className="ml-selecionado" aria-hidden="true" />}
    </NavLink>;
  }

  return <>
    <aside ref={painelRef} id="menu-principal" className={`layout-sidebar sidebar-renovada nao-imprimir ${aberto ? 'aberto' : ''} ${compacto ? 'compacta' : ''}`} role={mobile && aberto ? 'dialog' : undefined} aria-modal={mobile && aberto ? true : undefined} aria-label="Menu principal">
      <header className="ml-marca"><span className="ml-logo" aria-hidden="true"><Icone tipo="marca" /></span><span className="ml-texto ml-marca-texto"><strong>Pombo-Correio</strong><small>Gestão e atendimento</small></span>
        {mobile ? <button ref={fecharRef} type="button" className="ml-controle" aria-label="Fechar menu" onClick={onFechar}><Icone tipo="fechar" /></button> : <button type="button" className="ml-controle ml-compactar" aria-label={compacto ? 'Expandir menu' : 'Recolher menu'} title={compacto ? 'Expandir menu' : 'Recolher menu'} onClick={onCompactar}><Icone tipo={compacto ? 'expandir' : 'recolher'} /></button>}
      </header>
      <div className="ml-atalhos">
        <button type="button" className="ml-busca" aria-label="Buscar no sistema" title="Buscar no sistema (Ctrl K)" onClick={() => { fecharAoNavegar(); onBusca(); }}><Icone tipo="busca" /><span className="ml-texto">Buscar no sistema</span><kbd className="ml-texto">Ctrl K</kbd></button>
        <button type="button" className="ml-novo" aria-label="Cadastrar novo cliente" title="Cadastrar novo cliente" onClick={() => { fecharAoNavegar(); onNovoCliente(); }}><Icone tipo="mais" /><span className="ml-texto">Novo cliente</span><kbd className="ml-texto">N</kbd></button>
      </div>
      <nav className="layout-nav ml-navegacao" aria-label="Navegação principal">
        <div className="ml-grupo"><span className="ml-grupo-titulo">Atendimento</span>
          {link('/agenda', 'Agenda', 'agenda')}
          <button type="button" className={`ml-link ${location.pathname.startsWith('/clientes') && location.pathname !== '/clientes/lixeira' ? 'ml-ativo' : ''}`} aria-label="Clientes" title="Clientes" aria-current={location.pathname.startsWith('/clientes') && location.pathname !== '/clientes/lixeira' ? 'page' : undefined} onClick={() => { fecharAoNavegar(); onClientes(); }}><span className="ml-icone"><Icone tipo="clientes" /></span><span className="ml-texto">Clientes</span>{location.pathname.startsWith('/clientes') && location.pathname !== '/clientes/lixeira' && <span className="ml-selecionado" aria-hidden="true" />}</button>
          {link('/recall', 'Recall', 'recall')}
        </div>
        <div className="ml-grupo"><span className="ml-grupo-titulo">Pedidos</span>{link('/fonada', 'Fonada', 'fonada')}{link('/ao-vivo', 'Ao vivo', 'aovivo')}{link('/fonada/hoje', 'Vendas de hoje', 'vendas', 'ml-vendas')}</div>
        <div className="ml-grupo"><span className="ml-grupo-titulo">Gestão</span>{link('/cobranca', 'Cobrança', 'cobranca')}{link('/relatorios', 'Relatórios', 'relatorios')}</div>
        <div className="ml-rascunhos">
          <button type="button" className="ml-link ml-rascunhos-toggle" title={`${rascunhos.length} rascunho(s) em andamento`} aria-label={`Em andamento, ${rascunhos.length} rascunho(s)`} aria-expanded={rascunhosAbertos && !compactoAgora} aria-controls="menu-rascunhos" onClick={() => { if (compactoAgora) { onCompactar(); setRascunhosAbertos(true); } else setRascunhosAbertos(valor => !valor); }}><span className="ml-icone"><Icone tipo="rascunho" /></span><span className="ml-texto">Em andamento</span><span className={`ml-contador ${rascunhos.length ? 'ml-tem-rascunho' : ''}`}>{rascunhos.length}</span><span className={`ml-seta ml-texto ${rascunhosAbertos ? 'ml-girada' : ''}`}><Icone tipo="seta" /></span></button>
          <div id="menu-rascunhos" hidden={!rascunhosAbertos || compactoAgora}>{rascunhos.length ? rascunhos.map(({ prefixo, tipo, rascunho }) => <div className="ml-rascunho" key={`${prefixo}-${rascunho.chave}`}><NavLink to={rotaDoRascunho(prefixo, rascunho)} state={rascunho.estado} title={`Continuar ${tipo}: ${nomeDoRascunho(rascunho)}`} onClick={fecharAoNavegar}><small>{tipo}</small><strong>{nomeDoRascunho(rascunho)}</strong></NavLink><button type="button" title={`Fechar rascunho ${tipo}: ${nomeDoRascunho(rascunho)}`} aria-label={`Fechar rascunho ${tipo}: ${nomeDoRascunho(rascunho)}`} onClick={() => { fecharAoNavegar(); onDescartar({ prefixo, tipo, rascunho }); }}><Icone tipo="fechar" /></button></div>) : <p>Cadastros e pedidos ainda não salvos aparecem aqui.</p>}</div>
        </div>
      </nav>
      <footer className="ml-rodape">
        <nav className="ml-utilidades" aria-label="Administração do sistema">{link('/configuracoes', 'Configurações', 'configuracoes')}{link('/clientes/lixeira', 'Lixeira', 'lixeira')}</nav>
        <div className="ml-usuario"><span className="ml-avatar" title={nome || usuario}>{inicial}</span><div className="ml-texto"><small>Logado como</small><strong title={nome || usuario}>{nome || usuario}</strong></div><button type="button" className="ml-sair" aria-label="Sair da conta" title="Sair da conta" onClick={onSair}><Icone tipo="sair" /></button></div>
      </footer>
    </aside>
    {aberto && mobile && <div className="layout-overlay ml-overlay nao-imprimir" onClick={onFechar} aria-hidden="true" />}
  </>;
}
