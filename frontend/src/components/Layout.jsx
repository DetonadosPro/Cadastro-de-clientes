import React, { Suspense, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Dialogo, EstadoCarregando } from './Interface.jsx';
import LimitePagina from './LimitePagina.jsx';
import { Outlet, useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { getIdTela, getUsuarioLogado, getNomeExibicao, limparSessao } from '../api.js';
import { useRascunhos } from '../RascunhosContext.jsx';
import { useAgendaAlerta } from '../AgendaAlertaContext.jsx';
import CommandPalette from './CommandPalette.jsx';
import MenuLateral, { nomeDoRascunho } from './MenuLateral.jsx';
import RelogioAgenda from './RelogioAgenda.jsx';
import { useAtualizacaoTempoReal } from '../TempoRealContext.jsx';
import { useToast } from '../ToastContext.jsx';

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
  { teste: /^\/configuracoes/, secao: 'Sistema', titulo: 'Configurações' },
  { teste: /^\/agenda/, secao: 'Operação', titulo: 'Agenda' },
  { teste: /^\/clientes\/novo/, secao: 'Clientes', titulo: 'Novo cliente' },
  { teste: /^\/clientes\/lixeira/, secao: 'Clientes', titulo: 'Lixeira' },
  { teste: /^\/clientes\/\d+/, secao: 'Clientes', titulo: 'Ficha do cliente' },
  { teste: /^\/clientes/, secao: 'Relacionamento', titulo: 'Clientes' },
  { teste: /^\/cobranca/, secao: 'Financeiro', titulo: 'Cobrança' },
  { teste: /^\/recall/, secao: 'Relacionamento', titulo: 'Recall' },
  { teste: /^\/relatorios/, secao: 'Gestão', titulo: 'Relatórios' },
  { teste: /^\/fonada\/novo/, secao: 'Pedidos · Fonada', titulo: 'Novo pedido' },
  { teste: /^\/fonada\/hoje/, secao: 'Pedidos · Fonada', titulo: 'Vendas de hoje' },
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
  const tipoNavegacao = useNavigationType();
  const rotaRolagemRef = useRef(null);
  const usuario = getUsuarioLogado();
  const nomeExibicao = getNomeExibicao();
  const [menuAberto, setMenuAberto] = useState(false);
  const [sidebarCompacta, setSidebarCompacta] = useState(() => localStorage.getItem('pombo_sidebar_compacta') === '1');
  const [commandAberta, setCommandAberta] = useState(false);
  const [chaveConteudo, setChaveConteudo] = useState(0);
  const conteudoRef = useRef(null);
  const temporizadorAtualizacaoRef = useRef(null);
  const atualizacaoPendenteRef = useRef(false);
  const { rascunhosClientes, limparRascunhoCliente, rascunhosFonada, rascunhosAoVivo, limparRascunhoFonada, limparRascunhoAoVivo } = useRascunhos();
  const [rascunhoFechar, setRascunhoFechar] = useState(null);
  function descartarRascunho() {
    const { prefixo, rascunho } = rascunhoFechar;
    const atual = location.pathname === `${prefixo}/${rascunho.chave.startsWith('editar-') ? rascunho.chave.slice(7) : 'novo'}`
      && (rascunho.chave.startsWith('editar-') || new URLSearchParams(location.search).get('rascunho') === rascunho.chave.slice(5));
    if (atual) navigate(location.state?.returnTo?.startsWith('/') ? location.state.returnTo : prefixo, { replace: true });
    (prefixo === '/clientes' ? limparRascunhoCliente : prefixo === '/fonada' ? limparRascunhoFonada : limparRascunhoAoVivo)(rascunho.chave);
    setRascunhoFechar(null);
    mostrarToast('Rascunho descartado.');
  }
  const { mostrarToast } = useToast();
  // A cor da bolinha vem do contexto compartilhado — assim ela e as
  // bordas de urgência na tela Agenda ficam sempre sincronizadas, já
  // que ambas partem do mesmo dado buscado no mesmo instante.
  const { alertaMenu: alertaAgenda } = useAgendaAlerta();
  const contextoRota = ROTAS.find((item) => item.teste.test(location.pathname)) || { secao: 'Pombo-Correio', titulo: 'Visão geral' };
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
        if (detalhe && evento.topico === topicoDaTela && idAlterado === detalhe[2] && evento.origem !== getIdTela()) {
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
  useLayoutEffect(() => {
    const elemento = conteudoRef.current;
    if (!elemento) return undefined;
    // Cobrança restaura após carregar seus dados e usa apenas um retorno em memória.
    if (location.pathname === '/cobranca') {
      const mesmaTela = rotaRolagemRef.current === location.pathname;
      rotaRolagemRef.current = location.pathname;
      if (!mesmaTela || tipoNavegacao !== 'REPLACE') {
        elemento.scrollTop = 0;
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
      return undefined;
    }
    const chave = `pombo-scroll:${location.key}`;
    // Seleção, busca e filtros da agenda substituem a mesma entrada da URL.
    // Preserve a posição nessas mudanças; voltar pelo histórico ainda restaura.
    const preservar = location.pathname === '/agenda' && rotaRolagemRef.current === location.pathname && tipoNavegacao === 'REPLACE';
    rotaRolagemRef.current = location.pathname;
    const salvo = preservar ? elemento.scrollTop : Number(sessionStorage.getItem(chave) || 0);
    // A troca de página pode reduzir o documento e zerar scrollTop antes do
    // cleanup. Guarde a última posição observada enquanto a página existia.
    let posicao = salvo;
    const registrar = () => { posicao = elemento.scrollTop; };
    elemento.addEventListener('scroll', registrar, { passive: true });
    const restaurar = () => { elemento.scrollTop = salvo; registrar(); };
    if (!preservar) restaurar();
    const tentativas = preservar ? [] : [80, 220, 500].map((tempo) => setTimeout(restaurar, tempo));
    return () => {
      tentativas.forEach(clearTimeout);
      elemento.removeEventListener('scroll', registrar);
      sessionStorage.setItem(chave, String(posicao));
    };
  }, [location.key, location.pathname, tipoNavegacao]);

  useEffect(() => {
    localStorage.setItem('pombo_sidebar_compacta', sidebarCompacta ? '1' : '0');
  }, [sidebarCompacta]);

  useEffect(() => {
    function atalhosGlobais(e) {
      const alvo = e.target;
      const digitando = alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement || alvo?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMenuAberto(false);
        setCommandAberta((atual) => !atual);
        return;
      }
      if (!digitando && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && !document.querySelector('.modal-fundo,.command-overlay,.drawer-cliente-overlay')) {
        e.preventDefault();
        setMenuAberto(false);
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
    <div className="layout-app menu-renovado">
      <div className="layout-topbar nao-imprimir">
        <button
          className="layout-hamburguer"
          onClick={() => setMenuAberto((v) => !v)}
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          aria-controls="menu-principal"
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

      <MenuLateral aberto={menuAberto} compacto={sidebarCompacta} onFechar={() => setMenuAberto(false)} onCompactar={() => setSidebarCompacta(v => !v)}
        onBusca={() => setCommandAberta(true)} onNovoCliente={() => navigate('/clientes/novo')} onClientes={irParaClientes} onSecao={aoClicarLinkSecao}
        onSair={sair} nome={nomeExibicao} usuario={usuario} alertaAgenda={alertaAgenda} onDescartar={setRascunhoFechar}
        rascunhos={[
          ...Object.values(rascunhosClientes).map(rascunho => ({ prefixo: '/clientes', tipo: 'Cadastro', rascunho })),
          ...Object.values(rascunhosFonada).map(rascunho => ({ prefixo: '/fonada', tipo: 'Fonada', rascunho })),
          ...Object.values(rascunhosAoVivo).map(rascunho => ({ prefixo: '/ao-vivo', tipo: 'Ao Vivo', rascunho })),
        ].sort((a, b) => b.rascunho.criadoEm - a.rascunho.criadoEm)} />

      <main className="layout-conteudo" ref={conteudoRef}>
        <div className={`workspace-topbar nao-imprimir ${estaCriandoCliente ? 'sem-acao-principal' : ''}`}>
          <nav className="workspace-contexto" aria-label="Localização atual">
            <span>{contextoRota.secao}</span><i aria-hidden="true">/</i><strong>{contextoRota.titulo}</strong>
          </nav>
          <RelogioAgenda />
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
      {rascunhoFechar && <Dialogo titulo="Fechar rascunho" descricao={`Descartar as alterações não salvas de ${nomeDoRascunho(rascunhoFechar.rascunho)}? Os registros já salvos permanecem no sistema.`} onClose={() => setRascunhoFechar(null)} centralizado className="confirmacao-contextual">
        <div className="confirmacao-acoes"><button className="btn secundario" onClick={() => setRascunhoFechar(null)}>Continuar editando</button><button className="btn" onClick={descartarRascunho}>Descartar rascunho</button></div>
      </Dialogo>}
    </div>
  );
}

const estilos = {
  marca: { display: 'flex', alignItems: 'center', gap: 10 },
  marcaTexto: { fontWeight: 700, fontSize: 15 },
  crachaTopbar: {
    marginLeft: 'auto', fontWeight: 700, fontSize: 14, color: '#ffffff',
    background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 999, padding: '6px 14px', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45vw',
  },
};
