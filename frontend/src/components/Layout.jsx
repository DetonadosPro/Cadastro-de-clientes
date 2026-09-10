import React, { Suspense, useState, useEffect, useRef } from 'react';
import { EstadoCarregando } from './Interface.jsx';
import LimitePagina from './LimitePagina.jsx';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { getUsuarioLogado, getNomeExibicao, limparSessao } from '../api.js';
import { useRascunhos } from '../RascunhosContext.jsx';
import { useAgendaAlerta } from '../AgendaAlertaContext.jsx';
import CommandPalette from './CommandPalette.jsx';
import { useAtualizacaoTempoReal } from '../TempoRealContext.jsx';
import { useToast } from '../ToastContext.jsx';

// Converte a chave do rascunho ("novo" ou "editar-123") na rota do formulário correspondente.
function rotaDoRascunho(prefixoRota, chave) {
  if (chave === 'novo') return `${prefixoRota}/novo`;
  const id = chave.replace('editar-', '');
  return `${prefixoRota}/${id}`;
}

// Ícones do menu — traço fino (1.6px), 18x18, sem preenchimento sólido,
// para não competir visualmente com o texto e ficarem leves no fundo
// azul-carimbo da barra lateral.
function IconeAgenda() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M8 2.5v4M16 2.5v4" />
    </svg>
  );
}
function IconeClientes() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" />
      <path d="M16 8.5a3 3 0 1 1 0-5.6" />
      <path d="M19 20c0-2.6-1.6-4.8-3.7-5.6" />
    </svg>
  );
}
function IconeCobranca() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2c0-1.2 1.1-2.1 2.5-2.1s2.5.9 2.5 2c0 2-3 1.9-3 4M12 16.4v.1" />
    </svg>
  );
}
function IconeRecall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.5 8.5 0 1 1-2.5-6" /><path d="M21 4v7h-7" />
      <path d="M9.5 8.5c.7 2.5 2.5 4.3 5 5" />
    </svg>
  );
}
function IconeRelatorios() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}
function IconeFonada() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4.5c0-.8.6-1.4 1.4-1.4H9c.6 0 1.1.4 1.3 1l1 2.6c.2.5 0 1.1-.4 1.5L9.6 9.5c1 2.3 2.9 4.2 5.2 5.2l1.3-1.3c.4-.4 1-.5 1.5-.4l2.6 1c.6.2 1 .7 1 1.3v2.6c0 .8-.6 1.4-1.4 1.4C11.9 19.3 4.7 12.1 5 4.5Z" />
    </svg>
  );
}
function IconeAoVivo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path d="M6.5 11a5.5 5.5 0 0 0 11 0" />
      <path d="M12 16.5V20M9 20h6" />
    </svg>
  );
}
function IconeLixeira() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v2" />
      <path d="M6 7l1 12.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5L18 7" />
    </svg>
  );
}

function topicosTempoRealDaRota(caminho) {
  if (caminho.startsWith('/agenda')) return ['agenda'];
  if (caminho.startsWith('/cobranca')) return ['cobranca'];
  if (caminho.startsWith('/relatorios')) return ['relatorios'];
  if (caminho.startsWith('/recall')) return ['recall'];
  if (caminho.startsWith('/clientes')) return ['clientes'];
  if (caminho.startsWith('/fonada')) return ['fonadas'];
  if (caminho.startsWith('/ao-vivo')) return ['ao-vivo'];
  return [];
}

function MarcaPombo({ pequena = false }) {
  return (
    <span className={`marca-pombo ${pequena ? 'pequena' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M6.5 9.5h19v13h-19z" stroke="currentColor" strokeWidth="1.8" />
        <path d="m7.5 10.5 8.5 7 8.5-7M7.5 21.5l6.3-5.1m10.7 5.1-6.3-5.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const ROTAS = [
  { teste: /^\/agenda/, secao: 'Operação', titulo: 'Agenda' },
  { teste: /^\/clientes\/novo/, secao: 'Clientes', titulo: 'Novo cliente' },
  { teste: /^\/clientes\/lixeira/, secao: 'Clientes', titulo: 'Lixeira' },
  { teste: /^\/clientes\/\d+/, secao: 'Clientes', titulo: 'Ficha do cliente' },
  { teste: /^\/clientes/, secao: 'Relacionamento', titulo: 'Clientes' },
  { teste: /^\/cobranca/, secao: 'Financeiro', titulo: 'Cobrança' },
  { teste: /^\/recall/, secao: 'Relacionamento', titulo: 'Recall' },
  { teste: /^\/relatorios/, secao: 'Gestão', titulo: 'Relatórios' },
  { teste: /^\/fonada\/novo/, secao: 'Pedidos · Fonada', titulo: 'Novo pedido' },
  { teste: /^\/fonada\/hoje/, secao: 'Pedidos · Fonada', titulo: 'Transmissões de hoje' },
  { teste: /^\/fonada\/\d+/, secao: 'Pedidos · Fonada', titulo: 'Editar pedido' },
  { teste: /^\/fonada/, secao: 'Pedidos', titulo: 'Fonada' },
  { teste: /^\/ao-vivo\/novo/, secao: 'Pedidos · Ao vivo', titulo: 'Novo pedido' },
  { teste: /^\/ao-vivo\/hoje/, secao: 'Pedidos · Ao vivo', titulo: 'Agenda de hoje' },
  { teste: /^\/ao-vivo\/\d+/, secao: 'Pedidos · Ao vivo', titulo: 'Editar pedido' },
  { teste: /^\/ao-vivo/, secao: 'Pedidos', titulo: 'Ao vivo' },
];


export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const usuario = getUsuarioLogado();
  const nomeExibicao = getNomeExibicao();
  const [menuAberto, setMenuAberto] = useState(false);
  const [sidebarCompacta, setSidebarCompacta] = useState(() => localStorage.getItem('pombo_sidebar_compacta') === '1');
  const [commandAberta, setCommandAberta] = useState(false);
  const [chaveConteudo, setChaveConteudo] = useState(0);
  const conteudoRef = useRef(null);
  const temporizadorAtualizacaoRef = useRef(null);
  const atualizacaoPendenteRef = useRef(false);
  const { rascunhoFonada, rascunhoAoVivo } = useRascunhos();
  const { mostrarToast } = useToast();
  // A cor da bolinha vem do contexto compartilhado — assim ela e as
  // bordas de urgência na tela Agenda ficam sempre sincronizadas, já
  // que ambas partem do mesmo dado buscado no mesmo instante.
  const { alertaMenu: alertaAgenda } = useAgendaAlerta();
  const contextoRota = ROTAS.find((item) => item.teste.test(location.pathname)) || { secao: 'Pombo-Correio', titulo: 'Visão geral' };
  const inicialUsuario = (nomeExibicao || usuario || 'U').trim().charAt(0).toUpperCase();
  const estaCriandoCliente = location.pathname === '/clientes/novo';
  const topicosTempoReal = topicosTempoRealDaRota(location.pathname);

  useAtualizacaoTempoReal(
    topicosTempoReal,
    (evento) => {
      const caminho = location.pathname;
      // A Agenda atualiza seus dados diretamente, preservando seleção,
      // filtros e o carrossel. Remontá-la inteira multiplicava as buscas.
      if (caminho === '/agenda') return;
      const ehLista = [
        '/cobranca', '/relatorios', '/recall', '/clientes', '/clientes/lixeira',
        '/fonada', '/fonada/hoje', '/ao-vivo', '/ao-vivo/hoje',
      ].includes(caminho);
      if (ehLista) {
        clearTimeout(temporizadorAtualizacaoRef.current);
        const atualizarQuandoLivre = () => {
          const alvo = document.activeElement;
          const digitando = alvo instanceof HTMLInputElement
            || alvo instanceof HTMLTextAreaElement
            || alvo instanceof HTMLSelectElement
            || alvo?.isContentEditable;
          const sobreposicaoAberta = Boolean(document.querySelector('.modal-fundo,.command-overlay,.drawer-cliente-overlay'));
          if (digitando || sobreposicaoAberta) {
            if (!atualizacaoPendenteRef.current) {
              mostrarToast('Há dados novos. A tela será atualizada quando você terminar esta ação.', 'aviso');
            }
            atualizacaoPendenteRef.current = true;
            temporizadorAtualizacaoRef.current = setTimeout(atualizarQuandoLivre, 700);
            return;
          }
          atualizacaoPendenteRef.current = false;
          setChaveConteudo((atual) => atual + 1);
        };
        atualizarQuandoLivre();
      } else {
        const detalhe = caminho.match(/^\/(clientes|fonada|ao-vivo)\/(\d+)$/);
        const topicoDaTela = detalhe?.[1] === 'fonada' ? 'fonadas' : detalhe?.[1];
        const idAlterado = evento.recurso?.match(/^\/api\/(?:clientes|fonadas|ao-vivo)\/(\d+)(?:\/|$)/)?.[1];
        if (detalhe && evento.topico === topicoDaTela && idAlterado === detalhe[2]) {
          mostrarToast('Este registro foi alterado em outra tela. Seu formulário foi preservado.', 'aviso');
        }
      }
    }
  );

  useEffect(() => () => clearTimeout(temporizadorAtualizacaoRef.current), []);

  useEffect(() => {
    setMenuAberto(false);
    clearTimeout(temporizadorAtualizacaoRef.current);
    atualizacaoPendenteRef.current = false;
  }, [location.pathname]);

  // Cada entrada do histórico do React Router possui uma chave estável.
  // Guardamos a rolagem por chave para que voltar restaure a posição da
  // tela anterior, inclusive quando o conteúdo termina de carregar depois.
  useEffect(() => {
    const elemento = conteudoRef.current;
    if (!elemento) return undefined;
    const chave = `pombo-scroll:${location.key}`;
    const salvo = Number(sessionStorage.getItem(chave) || 0);
    const restaurar = () => { elemento.scrollTop = salvo; };
    restaurar();
    const tentativas = [80, 220, 500].map((tempo) => setTimeout(restaurar, tempo));
    return () => {
      tentativas.forEach(clearTimeout);
      sessionStorage.setItem(chave, String(elemento.scrollTop));
    };
  }, [location.key]);

  useEffect(() => {
    localStorage.setItem('pombo_sidebar_compacta', sidebarCompacta ? '1' : '0');
  }, [sidebarCompacta]);

  useEffect(() => {
    function atalhosGlobais(e) {
      const alvo = e.target;
      const digitando = alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement || alvo?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandAberta((atual) => !atual);
        return;
      }
      if (!digitando && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && !document.querySelector('.modal-fundo,.command-overlay,.drawer-cliente-overlay')) {
        e.preventDefault();
        navigate('/clientes/novo');
      }
    }
    document.addEventListener('keydown', atalhosGlobais);
    return () => document.removeEventListener('keydown', atalhosGlobais);
  }, [navigate]);

  function resetarSecaoAtual(rota) {
    if (rota === '/recall') {
      Object.keys(sessionStorage).filter((chave) => chave.startsWith('recall-lista-scroll:')).forEach((chave) => sessionStorage.removeItem(chave));
    }
    if (rota === '/fonada') {
      sessionStorage.removeItem('ultimoFonadaSelecionado');
      sessionStorage.removeItem('fonadaListaNavegacao');
      sessionStorage.removeItem('fonadaNavegacaoContexto');
    }
    if (rota === '/ao-vivo') sessionStorage.removeItem('ultimoAoVivoSelecionado');
    setChaveConteudo((atual) => atual + 1);
    navigate(rota, { replace: true });
  }

  function aoClicarLinkSecao(evento, rota) {
    if (location.pathname !== rota && !location.pathname.startsWith(`${rota}/`)) return;
    evento.preventDefault();
    resetarSecaoAtual(rota);
  }

  function irParaClientes() {
    if (location.pathname === '/clientes' || location.pathname.startsWith('/clientes/')) resetarSecaoAtual('/clientes');
    else navigate('/clientes');
  }

  function sair() {
    limparSessao();
    navigate('/login');
  }

  return (
    <div className="layout-app">
      <div className="layout-topbar nao-imprimir">
        <button
          className="layout-hamburguer"
          onClick={() => setMenuAberto((v) => !v)}
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
        >
          {menuAberto ? '✕' : '☰'}
        </button>
        <div style={estilos.marca}>
          <MarcaPombo pequena />
          <span style={estilos.marcaTexto}>Pombo-Correio</span>
        </div>
        <div style={estilos.crachaTopbar} title="Usuário logado no momento">
          {nomeExibicao}
        </div>
      </div>

      <aside className={`layout-sidebar nao-imprimir ${menuAberto ? 'aberto' : ''} ${sidebarCompacta ? 'compacta' : ''}`}>
        <div className="layout-marca-desktop" style={estilos.marca}>
          <MarcaPombo />
          <span className="nav-label marca-texto-wrap"><strong style={estilos.marcaTexto}>Pombo-Correio</strong><small>Gestão operacional</small></span>
          <button type="button" className="sidebar-recolher" onClick={() => setSidebarCompacta((v) => !v)} aria-label={sidebarCompacta ? 'Expandir menu' : 'Recolher menu'} title={sidebarCompacta ? 'Expandir menu' : 'Recolher menu'}>{sidebarCompacta ? '›' : '‹'}</button>
        </div>

        <nav className="layout-nav">
          <div className="nav-destaque-duo">
            <NavLink to="/agenda" className="nav-item-destaque" style={estilos.linkAgenda} aria-label="Agenda" title="Agenda" onClick={(e) => aoClicarLinkSecao(e, '/agenda')}>
              <span style={estilos.itemComIcone}><IconeAgenda /> <span className="nav-label">Agenda</span></span>
              {alertaAgenda && (
                <span
                  className={`bolinha-alerta-agenda ${alertaAgenda}`}
                  title={alertaAgenda === 'vermelho' ? 'Tem mensagem atrasada' : 'Tem mensagem a menos de 10 minutos'}
                />
              )}
            </NavLink>

            <button
              type="button"
              className={`nav-item-destaque ${location.pathname.startsWith('/clientes') ? 'ativo' : ''}`}
              onClick={irParaClientes}
              aria-label="Clientes"
              title="Clientes"
            >
              <span style={estilos.itemComIcone}><IconeClientes /> <span className="nav-label">Clientes</span></span>
            </button>
          </div>

          <div className="nav-divisor" />

          <NavLink to="/cobranca" className="nav-item-direto" aria-label="Cobrança" title="Cobrança" onClick={(e) => aoClicarLinkSecao(e, '/cobranca')}>
            <IconeCobranca /> <span className="nav-label">Cobrança</span>
          </NavLink>

          <NavLink to="/recall" className="nav-item-direto" aria-label="Recall" title="Recall" onClick={(e) => aoClicarLinkSecao(e, '/recall')}>
            <IconeRecall /> <span className="nav-label">Recall</span>
          </NavLink>

          <NavLink
            to="/relatorios"
            className="nav-item-direto"
            aria-label="Relatórios"
            title="Relatórios"
            onClick={(e) => aoClicarLinkSecao(e, '/relatorios')}
          >
            <IconeRelatorios /> <span className="nav-label">Relatórios</span>
          </NavLink>

          <div className="nav-divisor" />

          <div className="nav-secao-titulo"><span className="nav-label">Pedidos</span></div>

          <NavLink to="/fonada" className="nav-item-direto" end aria-label="Fonada" title="Fonada" onClick={(e) => aoClicarLinkSecao(e, '/fonada')}>
            <IconeFonada /> <span className="nav-label">Fonada</span>
          </NavLink>
          {rascunhoFonada && (
            <NavLink to={rotaDoRascunho('/fonada', rascunhoFonada.chave)} className="nav-continuar">
              <span className="nav-label">↻ Continuar pedido fonada</span>
            </NavLink>
          )}

          <NavLink to="/ao-vivo" className="nav-item-direto" end aria-label="Ao vivo" title="Ao vivo" onClick={(e) => aoClicarLinkSecao(e, '/ao-vivo')}>
            <IconeAoVivo /> <span className="nav-label">Ao vivo</span>
          </NavLink>
          {rascunhoAoVivo && (
            <NavLink to={rotaDoRascunho('/ao-vivo', rascunhoAoVivo.chave)} className="nav-continuar">
              <span className="nav-label">↻ Continuar pedido ao vivo</span>
            </NavLink>
          )}
        </nav>

        <div className="layout-sidebar-fixo">
          <NavLink to="/clientes/lixeira" className="nav-lixeira" style={linkLixeiraEstilo} aria-label="Lixeira" title="Lixeira">
            <span style={estilos.itemComIcone}><IconeLixeira /> <span className="nav-label">Lixeira</span></span>
          </NavLink>

          <div className="nav-label" style={estilos.rodapeSidebar}>
            <div style={estilos.crachaSidebar} title="Usuário logado no momento">
              <span className="usuario-avatar">{inicialUsuario}</span>
              <span className="usuario-identidade"><span style={estilos.crachaSidebarRotulo}>Logado como</span><span style={estilos.crachaSidebarNome}>{nomeExibicao}</span></span>
            </div>
            <button onClick={sair} className="btn-sair-menu">
              Sair
            </button>
          </div>
        </div>
      </aside>

      {menuAberto && (
        <div className="layout-overlay nao-imprimir" onClick={() => setMenuAberto(false)} />
      )}

      <main className="layout-conteudo" ref={conteudoRef}>
        <div className={`workspace-topbar nao-imprimir ${estaCriandoCliente ? 'sem-acao-principal' : ''}`}>
          <nav className="workspace-contexto" aria-label="Localização atual">
            <span>{contextoRota.secao}</span><i aria-hidden="true">/</i><strong>{contextoRota.titulo}</strong>
          </nav>
          <button type="button" className="workspace-command" onClick={() => setCommandAberta(true)} aria-label="Abrir busca global">
            <span>⌕</span><span>Buscar clientes, páginas ou ações</span><kbd>Ctrl K</kbd>
          </button>
          {!estaCriandoCliente && <button type="button" className="workspace-novo" onClick={() => navigate('/clientes/novo')}><span>＋</span> Novo cliente <kbd>N</kbd></button>}
        </div>
        <div className="layout-pagina">
          <div className="pagina-transicao" key={`${location.pathname}-${chaveConteudo}`}>
            <LimitePagina><Suspense fallback={<EstadoCarregando rotulo="Abrindo página…" />}><Outlet /></Suspense></LimitePagina>
          </div>
        </div>
      </main>
      <CommandPalette aberta={commandAberta} onFechar={() => setCommandAberta(false)} onNavegar={navigate} />
    </div>
  );
}

const linkEstilo = ({ isActive }) => ({
  display: 'block',
  padding: '10px 14px',
  borderRadius: 8,
  marginBottom: 4,
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 14,
  color: isActive ? '#ffffff' : '#c9d9ec',
  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
});

const linkLixeiraEstilo = ({ isActive }) => ({
  display: 'block',
  padding: '10px 14px',
  borderRadius: 8,
  marginTop: 'auto',
  marginBottom: 10,
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 13,
  color: isActive ? '#ffffff' : '#8fa8c4',
  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
});

const estilos = {
  linkAgenda: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemComIcone: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  marca: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  carimboMini: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: 'transparent',
    border: '1.5px dashed rgba(255,255,255,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  marcaTexto: {
    fontWeight: 700,
    fontSize: 15,
  },
  // "Crachá" com o nome de quem está logado, sempre visível na barra
  // superior (inclusive no mobile, sem precisar abrir o menu) — o
  // objetivo é que fique impossível não perceber quem está usando o
  // sistema no momento, para lembrar de trocar quando for o caso.
  crachaTopbar: {
    marginLeft: 'auto',
    fontWeight: 700,
    fontSize: 14,
    color: '#ffffff',
    background: 'rgba(255,255,255,0.16)',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 999,
    padding: '6px 14px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '45vw',
  },
  rodapeSidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingTop: 16,
    borderTop: '1px solid rgba(255,255,255,0.15)',
  },
  // Crachá bem visível com o nome de quem está logado — antes era um
  // texto pequeno e discreto (fs-xs), fácil de passar batido; agora é
  // um cartão com fundo próprio, para não ter como não notar quem está
  // usando o sistema no momento e lembrar de trocar quando for o caso.
  crachaSidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 10,
    padding: '8px 12px',
  },
  crachaSidebarRotulo: {
    fontSize: 11,
    color: '#c9d9ec',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  },
  crachaSidebarNome: {
    fontSize: 16,
    fontWeight: 700,
    color: '#ffffff',
  },
};
