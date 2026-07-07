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
              <span>📅 Agenda</span>
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
              👥 Clientes
            </button>
          </div>

          <div className="nav-divisor" />

          <NavLink to="/cobranca" className="nav-item-direto">
            💰 Cobrança
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
            📊 Relatórios
          </NavLink>

          <div className="nav-divisor" />

          <div className="nav-secao-titulo">Pedidos</div>

          <NavLink to="/fonada" className="nav-item-direto" end>
            📞 Fonada
          </NavLink>
          {rascunhoFonada && (
            <NavLink to={rotaDoRascunho('/fonada', rascunhoFonada.chave)} className="nav-continuar">
              ↻ Continuar pedido fonada
            </NavLink>
          )}

          <NavLink to="/ao-vivo" className="nav-item-direto" end>
            🔊 Ao vivo
          </NavLink>
          {rascunhoAoVivo && (
            <NavLink to={rotaDoRascunho('/ao-vivo', rascunhoAoVivo.chave)} className="nav-continuar">
              ↻ Continuar pedido ao vivo
            </NavLink>
          )}
        </nav>

        <div className="layout-sidebar-fixo">
          <NavLink to="/clientes/lixeira" className="nav-lixeira" style={linkLixeiraEstilo}>
            🗑 Lixeira
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
  marca: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  carimboMini: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 12,
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
