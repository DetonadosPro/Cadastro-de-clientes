import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { getUsuarioLogado, getNomeExibicao, limparSessao } from '../api.js';
import { useRascunhos } from '../RascunhosContext.jsx';
import { api } from '../api.js';

// Converte a chave do rascunho ("novo" ou "editar-123") na rota do formulário correspondente.
function rotaDoRascunho(prefixoRota, chave) {
  if (chave === 'novo') return `${prefixoRota}/novo`;
  const id = chave.replace('editar-', '');
  return `${prefixoRota}/${id}`;
}

// Quantos minutos faltam para um horário "hh:mm" de hoje, a partir de "agora".
// Negativo significa que já passou.
function minutosAteHorario(horarioStr, agora) {
  if (!horarioStr) return null;
  const m = String(horarioStr).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  const alvo = new Date(agora);
  alvo.setHours(h, min, 0, 0);
  return Math.round((alvo - agora) / 60000);
}

// Decide a cor do alerta da Agenda a partir das mensagens fonada de hoje:
// vermelho se alguma já passou do horário (e ainda não foi baixada),
// laranja se alguma está a 10 minutos ou menos de começar, senão nada.
const LIMIAR_PROXIMA_MINUTOS = 10;
function corAlertaAgenda(itensFonada) {
  const agora = new Date();
  let temAtrasada = false;
  let temProxima = false;
  for (const item of itensFonada) {
    const diff = minutosAteHorario(item.horario, agora);
    if (diff === null) continue;
    if (diff < 0) temAtrasada = true;
    else if (diff <= LIMIAR_PROXIMA_MINUTOS) temProxima = true;
  }
  if (temAtrasada) return 'vermelho';
  if (temProxima) return 'laranja';
  return null;
}

// Verifica a Agenda a cada 30 segundos para manter a bolinha de alerta
// atualizada sem sobrecarregar o servidor.
const INTERVALO_VERIFICACAO_MS = 30000;

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const usuario = getUsuarioLogado();
  const nomeExibicao = getNomeExibicao();
  const [menuAberto, setMenuAberto] = useState(false);
  const [alertaAgenda, setAlertaAgenda] = useState(null); // null | 'laranja' | 'vermelho'
  const { rascunhoFonada, rascunhoAoVivo } = useRascunhos();

  // Busca a Agenda periodicamente para saber se alguma mensagem fonada de
  // hoje está próxima do horário (laranja) ou já passou (vermelho), e
  // mostra isso como uma bolinha ao lado de "Agenda" no menu.
  useEffect(() => {
    let cancelado = false;

    function verificar() {
      api.agenda.hoje()
        .then((resp) => {
          if (!cancelado) setAlertaAgenda(corAlertaAgenda(resp.fonada));
        })
        .catch(() => {
          // Falha silenciosa — o alerta é só um indicativo visual, não
          // deve interromper o uso do resto do sistema se a rede falhar.
        });
    }

    verificar();
    const intervalo = setInterval(verificar, INTERVALO_VERIFICACAO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

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

          <NavLink to="/relatorios" className="nav-item-direto">
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
        <Outlet key={location.key} />
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
