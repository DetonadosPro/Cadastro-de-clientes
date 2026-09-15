import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { getUsuarioLogado, getNomeExibicao, limparSessao } from '../api.js';
import { useRascunhos } from '../RascunhosContext.jsx';
import { useAgendaAlerta } from '../AgendaAlertaContext.jsx';

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
function IconeRelatorios() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}
function IconeLembretes() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 5.5-2.5 7-2.5 7h17S18 13.5 18 8Z" />
      <path d="M10.5 20a1.7 1.7 0 0 0 3 0" />
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


export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const usuario = getUsuarioLogado();
  const nomeExibicao = getNomeExibicao();
  const [menuAberto, setMenuAberto] = useState(false);
  const [chaveRelatorios, setChaveRelatorios] = useState(0);
  const { rascunhoFonada, rascunhoAoVivo } = useRascunhos();
  // A cor da bolinha vem do contexto compartilhado — assim ela e as
  // bordas de urgência na tela Agenda ficam sempre sincronizadas, já
  // que ambas partem do mesmo dado buscado no mesmo instante.
  const { alertaMenu: alertaAgenda } = useAgendaAlerta();

  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  function irParaClientes() {
    navigate('/clientes');
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
          <div style={estilos.carimboMini}>PC</div>
          <span style={estilos.marcaTexto}>Pombo-Correio</span>
        </div>
      </div>

      <aside className={`layout-sidebar nao-imprimir ${menuAberto ? 'aberto' : ''}`}>
        <div className="layout-marca-desktop" style={estilos.marca}>
          <div style={estilos.carimboMini}>PC</div>
          <span style={estilos.marcaTexto}>Pombo-Correio</span>
        </div>

        <nav className="layout-nav">
          <div className="nav-destaque-duo">
            <NavLink to="/agenda" className="nav-item-destaque" style={estilos.linkAgenda}>
              <span style={estilos.itemComIcone}><IconeAgenda /> Agenda</span>
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
            >
              <span style={estilos.itemComIcone}><IconeClientes /> Clientes</span>
            </button>
          </div>

          <div className="nav-divisor" />

          <NavLink to="/cobranca" className="nav-item-direto">
            <IconeCobranca /> Cobrança
          </NavLink>

          <NavLink
            to="/relatorios"
            className="nav-item-direto"
            onClick={(e) => {
              // Se a pessoa já está em Relatórios e clica de novo no
              // menu, força o reset da página (limpa aba/filtro da URL
              // e remonta o componente do zero, sem afetar a navegação
              // interna entre abas/filtro dentro da própria tela).
              if (location.pathname === '/relatorios') {
                e.preventDefault();
                setChaveRelatorios((v) => v + 1);
                navigate('/relatorios', { replace: true });
              }
            }}
          >
            <IconeRelatorios /> Relatórios
          </NavLink>

          <NavLink to="/lembretes" className="nav-item-direto">
            <IconeLembretes /> Lembretes
          </NavLink>

          <div className="nav-divisor" />

          <div className="nav-secao-titulo">Pedidos</div>

          <NavLink to="/fonada" className="nav-item-direto" end>
            <IconeFonada /> Fonada
          </NavLink>
          {rascunhoFonada && (
            <NavLink to={rotaDoRascunho('/fonada', rascunhoFonada.chave)} className="nav-continuar">
              ↻ Continuar pedido fonada
            </NavLink>
          )}

          <NavLink to="/ao-vivo" className="nav-item-direto" end>
            <IconeAoVivo /> Ao vivo
          </NavLink>
          {rascunhoAoVivo && (
            <NavLink to={rotaDoRascunho('/ao-vivo', rascunhoAoVivo.chave)} className="nav-continuar">
              ↻ Continuar pedido ao vivo
            </NavLink>
          )}
        </nav>

        <div className="layout-sidebar-fixo">
          <NavLink to="/clientes/lixeira" className="nav-lixeira" style={linkLixeiraEstilo}>
            <span style={estilos.itemComIcone}><IconeLixeira /> Lixeira</span>
          </NavLink>

          <div style={estilos.rodapeSidebar}>
            <span className="fs-xs" style={estilos.usuarioTexto}>{nomeExibicao}</span>
            <button onClick={sair} className="btn-sair-menu">
              Sair
            </button>
          </div>
        </div>
      </aside>

      {menuAberto && (
        <div className="layout-overlay nao-imprimir" onClick={() => setMenuAberto(false)} />
      )}

      <main className="layout-conteudo">
        <Outlet key={location.pathname === '/relatorios' ? chaveRelatorios : undefined} />
      </main>
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
  rodapeSidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 16,
    borderTop: '1px solid rgba(255,255,255,0.15)',
  },
  usuarioTexto: {
    color: '#c9d9ec',
    paddingLeft: 4,
  },
};
