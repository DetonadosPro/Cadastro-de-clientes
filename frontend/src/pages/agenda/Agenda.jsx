import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { useAgendaAlerta, statusUrgenciaItem } from '../../AgendaAlertaContext.jsx';
import { formatarData, formatarHorario } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';

// Data de hoje no mesmo formato usado nos campos do sistema (dd/mm/aa).
function hojeFormatado() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  return `${dd}/${mm}/${aa}`;
}

// Soma (ou subtrai) dias a uma data no formato dd/mm/aa, devolvendo o
// resultado no mesmo formato. Usado pelos botões "dia anterior"/"próximo".
function somarDias(dataBr, quantidade) {
  const m = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return dataBr;
  const [, dd, mm, aa] = m;
  const data = new Date(2000 + parseInt(aa, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  data.setDate(data.getDate() + quantidade);
  const novoDd = String(data.getDate()).padStart(2, '0');
  const novoMm = String(data.getMonth() + 1).padStart(2, '0');
  const novoAa = String(data.getFullYear()).slice(-2);
  return `${novoDd}/${novoMm}/${novoAa}`;
}

export default function Agenda() {
  // A data e a aba selecionadas ficam na URL (não em useState solto) —
  // assim, ao abrir um pedido e depois "Fechar" (que usa o histórico do
  // navegador para voltar), a Agenda é restaurada exatamente no dia e
  // aba em que a pessoa estava, em vez de resetar para hoje.
  const [searchParams, setSearchParams] = useSearchParams();
  const dataSelecionada = searchParams.get('data') || hojeFormatado();
  const aba = searchParams.get('aba') || 'fonada';

  const [dataRef, setDataRef] = useState('');
  const [fonada, setFonada] = useState([]);
  const [aoVivo, setAoVivo] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [salvandoBaixa, setSalvandoBaixa] = useState(null);

  const [itemRemarcarAberto, setItemRemarcarAberto] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [remarcadoDia, setRemarcadoDia] = useState('');
  const [remarcadoHorario, setRemarcadoHorario] = useState('');
  const [salvandoRemarcacao, setSalvandoRemarcacao] = useState(false);

  // Mesma ideia, mas para o prazo de pagamento do Ao Vivo — sem
  // horário, e em estados separados para não misturar com o fluxo da
  // Fonada (podem estar abertos em telas diferentes, embora não ao
  // mesmo tempo na prática).
  const [itemRemarcarPrazoAberto, setItemRemarcarPrazoAberto] = useState(null);
  const [observacaoPrazo, setObservacaoPrazo] = useState('');
  const [remarcadoDiaPrazo, setRemarcadoDiaPrazo] = useState('');
  const [salvandoRemarcacaoPrazo, setSalvandoRemarcacaoPrazo] = useState(false);

  // Item selecionado na lista compacta — chave única por tipo+id, já
  // que fonada usa pedidoId+mensagem e ao vivo usa só id.
  const [chaveSelecionada, setChaveSelecionada] = useState(null);

  const navigate = useNavigate();
  const { mostrarToast } = useToast();
  // O contexto compartilhado (mesmo que alimenta a bolinha do menu) é
  // consumido aqui só para que este componente re-renderize no mesmo
  // instante em que ele atualiza — assim a cor da borda dos cards muda
  // exatamente junto com a bolinha, em vez de cada um ter seu próprio
  // temporizador desalinhado.
  useAgendaAlerta();

  // As ações de "Dar baixa" e "Não atendeu" só fazem sentido para o dia
  // de hoje — em qualquer outro dia, a Agenda serve só para consulta.
  const ehHoje = dataSelecionada === hojeFormatado();

  function carregar(data = dataSelecionada) {
    setCarregando(true);
    setErro('');
    api.agenda.hoje(data)
      .then((resp) => {
        setDataRef(resp.data);
        setFonada(resp.fonada);
        setAoVivo(resp.aoVivo);
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar(dataSelecionada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSelecionada]);

  function irParaDia(novaData) {
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('data', novaData);
      return novo;
    }, { replace: true });
  }

  function irParaAba(novaAba) {
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('aba', novaAba);
      return novo;
    }, { replace: true });
  }

  async function darBaixa(item) {
    const chave = `${item.pedidoId}-${item.mensagem}`;
    setSalvandoBaixa(chave);
    try {
      await api.agenda.darBaixaFonada(item.pedidoId, item.mensagem);
      mostrarToast('Baixa registrada com sucesso.');
      carregar();
    } catch (err) {
      mostrarToast('Não foi possível registrar a baixa. Tente novamente.', 'erro');
    } finally {
      setSalvandoBaixa(null);
    }
  }

  async function desfazerBaixa(item) {
    const chave = `desfazer-${item.pedidoId}-${item.mensagem}`;
    setSalvandoBaixa(chave);
    try {
      await api.agenda.desfazerBaixaFonada(item.pedidoId, item.mensagem);
      mostrarToast('Baixa desfeita.');
      carregar();
    } catch (err) {
      mostrarToast('Não foi possível desfazer. Tente novamente.', 'erro');
    } finally {
      setSalvandoBaixa(null);
    }
  }

  async function darBaixaAoVivo(item, entregue) {
    const chave = `aovivo-${item.id}`;
    setSalvandoBaixa(chave);
    try {
      await api.aoVivo.darBaixa(item.id, entregue);
      mostrarToast(entregue ? 'Entrega registrada com sucesso.' : 'Registrado como não entregue.');
      carregar();
    } catch (err) {
      mostrarToast('Não foi possível registrar. Tente novamente.', 'erro');
    } finally {
      setSalvandoBaixa(null);
    }
  }

  async function desfazerBaixaAoVivo(item) {
    const chave = `aovivo-desfazer-${item.id}`;
    setSalvandoBaixa(chave);
    try {
      await api.aoVivo.desfazerBaixa(item.id);
      mostrarToast('Baixa desfeita.');
      carregar();
    } catch (err) {
      mostrarToast('Não foi possível desfazer. Tente novamente.', 'erro');
    } finally {
      setSalvandoBaixa(null);
    }
  }

  async function marcarPagouAoVivo(item, pagou) {
    const chave = `aovivo-pagou-${item.id}`;
    setSalvandoBaixa(chave);
    try {
      await api.aoVivo.marcarPagou(item.id, pagou);
      mostrarToast(pagou === 'SIM' ? 'Pagamento registrado como recebido.' : 'Registrado como não recebido.');
      carregar();
    } catch (err) {
      mostrarToast('Não foi possível registrar. Tente novamente.', 'erro');
    } finally {
      setSalvandoBaixa(null);
    }
  }

  function abrirRemarcar(item) {
    setItemRemarcarAberto({ pedidoId: item.pedidoId, mensagem: item.mensagem, nome: item.nome_comprador });
    setObservacao('');
    setRemarcadoDia('');
    setRemarcadoHorario('');
  }

  function cancelarRemarcar() {
    setItemRemarcarAberto(null);
  }

  async function confirmarRemarcar() {
    if (!remarcadoDia.trim() || !remarcadoHorario.trim()) {
      mostrarToast('Informe o novo dia e horário para remarcar.', 'erro');
      return;
    }
    setSalvandoRemarcacao(true);
    try {
      await api.agenda.naoAtendeuFonada(
        itemRemarcarAberto.pedidoId,
        itemRemarcarAberto.mensagem,
        observacao.trim() || null,
        remarcadoDia.trim(),
        remarcadoHorario.trim()
      );
      mostrarToast('Tentativa registrada e mensagem remarcada.');
      setItemRemarcarAberto(null);
      carregar();
    } catch (err) {
      mostrarToast('Não foi possível registrar. Tente novamente.', 'erro');
    } finally {
      setSalvandoRemarcacao(false);
    }
  }

  function abrirRemarcarPrazo(item) {
    setItemRemarcarPrazoAberto({ pedidoId: item.id, nome: item.comprador });
    setObservacaoPrazo('');
    setRemarcadoDiaPrazo('');
  }

  function cancelarRemarcarPrazo() {
    setItemRemarcarPrazoAberto(null);
  }

  async function confirmarRemarcarPrazo() {
    if (!remarcadoDiaPrazo.trim()) {
      mostrarToast('Informe o novo dia para remarcar o prazo.', 'erro');
      return;
    }
    setSalvandoRemarcacaoPrazo(true);
    try {
      await api.aoVivo.naoRecebeu(
        itemRemarcarPrazoAberto.pedidoId,
        observacaoPrazo.trim() || null,
        remarcadoDiaPrazo.trim()
      );
      mostrarToast('Tentativa registrada e prazo remarcado.');
      setItemRemarcarPrazoAberto(null);
      carregar();
    } catch (err) {
      mostrarToast('Não foi possível registrar. Tente novamente.', 'erro');
    } finally {
      setSalvandoRemarcacaoPrazo(false);
    }
  }

  // Pendentes primeiro (ordenados por horário), já passados/pagos depois
  // (também ordenados por horário entre si) — em vez de escondidos, ficam
  // sempre visíveis no fim da lista, acinzentados.
  function ordenarPendentesPrimeiro(lista, chaveHorario) {
    return [...lista].sort((a, b) => {
      if (a.passada !== b.passada) return a.passada ? 1 : -1;
      return (a[chaveHorario] || '').localeCompare(b[chaveHorario] || '');
    });
  }

  const fonadaExibida = ehHoje ? ordenarPendentesPrimeiro(fonada, 'horario') : fonada;
  const aoVivoExibido = ehHoje ? ordenarPendentesPrimeiro(aoVivo, 'horario_entrega') : aoVivo;

  const listaAtual = aba === 'fonada' ? fonadaExibida : aoVivoExibido;
  const chaveDoItem = (item) => (aba === 'fonada' ? `${item.pedidoId}-${item.mensagem}` : `aovivo-${item.id}`);

  // Ao trocar de dia ou de aba: no desktop, seleciona automaticamente o
  // primeiro item (painel de detalhes nunca fica vazio à toa). No
  // mobile isso é indesejado — abriria o drawer de detalhes sozinho a
  // cada troca — então lá só limpa a seleção que não existe mais,
  // deixando o usuário escolher o que ver tocando na lista.
  useEffect(() => {
    if (listaAtual.length === 0) {
      setChaveSelecionada(null);
      return;
    }
    const aindaExiste = listaAtual.some((item) => chaveDoItem(item) === chaveSelecionada);
    if (!aindaExiste) {
      const ehMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
      setChaveSelecionada(ehMobile ? null : chaveDoItem(listaAtual[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, dataSelecionada, fonada, aoVivo]);

  const itemSelecionado = listaAtual.find((item) => chaveDoItem(item) === chaveSelecionada) || null;

  return (
    <div>
      <Relogio />
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 4 }}>Agenda</h1>
        <div style={estilos.navegacaoData}>
          <button type="button" className="btn-small" onClick={() => irParaDia(somarDias(dataSelecionada, -1))}>
            ← Dia anterior
          </button>
          <CampoData
            className="campo-data-agenda"
            placeholder="dd/mm/aa"
            value={dataSelecionada}
            onChange={(v) => irParaDia(formatarData(v))}
          />
          {!ehHoje && (
            <button type="button" className="btn-small" onClick={() => irParaDia(hojeFormatado())}>
              Hoje
            </button>
          )}
          <button type="button" className="btn-small" onClick={() => irParaDia(somarDias(dataSelecionada, 1))}>
            Próximo dia →
          </button>
        </div>
        {!ehHoje && (
          <p className="fs-xs" style={{ color: 'var(--selo)', marginTop: 6 }}>
            Consultando outro dia — só visualização, sem ações de baixa.
          </p>
        )}
      </div>

      {erro && <p style={{ color: 'var(--selo)' }}>{erro}</p>}

      {carregando ? (
        <p style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : (
        <div className="section-box secao-relatorios">
          <div className="abas-cliente">
            <button
              type="button"
              className={`aba-cliente-botao ${aba === 'fonada' ? 'ativa' : ''}`}
              onClick={() => irParaAba('fonada')}
            >
              Fonada <span className="aba-contagem">{fonadaExibida.length}</span>
            </button>
            <button
              type="button"
              className={`aba-cliente-botao ${aba === 'aovivo' ? 'ativa' : ''}`}
              onClick={() => irParaAba('aovivo')}
            >
              Ao vivo <span className="aba-contagem">{aoVivoExibido.length}</span>
            </button>
          </div>

          <div className="grid-agenda-lista-painel" style={{ padding: 16 }}>
            <div className="lista-agenda-compacta">
              {aba === 'fonada' && (
                fonadaExibida.length === 0 ? (
                  <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '16px 0' }}>
                    Nenhuma mensagem fonada marcada para {ehHoje ? 'hoje' : 'esse dia'}.
                  </p>
                ) : (
                  fonadaExibida.map((item) => {
                    const chave = `${item.pedidoId}-${item.mensagem}`;
                    const jaPassada = ehHoje && item.passada;
                    const urgencia = (ehHoje && !jaPassada) ? statusUrgenciaItem(item.horario) : null;
                    return (
                      <LinhaAgenda
                        key={chave}
                        selecionada={chaveSelecionada === chave}
                        onClick={() => setChaveSelecionada(chave)}
                        urgencia={urgencia}
                        jaPassada={jaPassada}
                        horario={item.horario}
                        titulo={item.nome_comprador}
                        tagExtra={`${item.mensagem}ª msg`}
                        status={(!ehHoje || jaPassada) ? (item.resultado ? 'Passada' : 'Pendente') : null}
                        statusOk={Boolean(item.resultado)}
                      />
                    );
                  })
                )
              )}

              {aba === 'aovivo' && (
                aoVivoExibido.length === 0 ? (
                  <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '16px 0' }}>
                    Nenhuma mensagem ao vivo marcada para {ehHoje ? 'hoje' : 'esse dia'}.
                  </p>
                ) : (
                  aoVivoExibido.map((item) => {
                    const chave = `aovivo-${item.id}`;
                    const jaPassada = ehHoje && item.passada;
                    const foiEntregue = Boolean(item.resultado_entrega);
                    const urgencia = (ehHoje && !jaPassada && !item.ehCobranca) ? statusUrgenciaItem(item.horario_entrega) : null;
                    let status = null;
                    let statusOk = false;
                    if (item.ehCobranca) {
                      status = item.pagou === 'SIM' ? 'Recebido' : 'A receber';
                      statusOk = item.pagou === 'SIM';
                    } else if (foiEntregue) {
                      status = 'Entregue';
                      statusOk = true;
                    }
                    return (
                      <LinhaAgenda
                        key={chave}
                        selecionada={chaveSelecionada === chave}
                        onClick={() => setChaveSelecionada(chave)}
                        urgencia={urgencia}
                        jaPassada={jaPassada}
                        horario={item.ehCobranca ? null : item.horario_entrega}
                        titulo={item.comprador}
                        tagExtra={item.ehCobranca ? 'Cobrança' : null}
                        status={status}
                        statusOk={statusOk}
                      />
                    );
                  })
                )
              )}
            </div>

            <div className={`painel-detalhes-agenda ${itemSelecionado ? 'drawer-aberto' : ''}`}>
              {itemSelecionado && (
                <button
                  type="button"
                  className="drawer-fechar-mobile"
                  onClick={() => setChaveSelecionada(null)}
                  aria-label="Fechar detalhes"
                >
                  ✕
                </button>
              )}
              {!itemSelecionado ? (
                <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '24px 12px' }}>
                  Selecione um item da lista para ver os detalhes.
                </p>
              ) : aba === 'fonada' ? (
                <DetalhesFonada
                  item={itemSelecionado}
                  ehHoje={ehHoje}
                  salvandoBaixa={salvandoBaixa}
                  navigate={navigate}
                  onDarBaixa={darBaixa}
                  onDesfazerBaixa={desfazerBaixa}
                  onAbrirRemarcar={abrirRemarcar}
                />
              ) : (
                <DetalhesAoVivo
                  item={itemSelecionado}
                  ehHoje={ehHoje}
                  salvandoBaixa={salvandoBaixa}
                  navigate={navigate}
                  onDarBaixaAoVivo={darBaixaAoVivo}
                  onDesfazerBaixaAoVivo={desfazerBaixaAoVivo}
                  onMarcarPagouAoVivo={marcarPagouAoVivo}
                  onAbrirRemarcarPrazo={abrirRemarcarPrazo}
                />
              )}
            </div>
            {itemSelecionado && (
              <div className="drawer-overlay-mobile" onClick={() => setChaveSelecionada(null)} />
            )}
          </div>
        </div>
      )}

      {itemRemarcarAberto && (
        <div className="modal-fundo" onClick={cancelarRemarcar}>
          <div className="modal-caixa" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">Não atendeu — {itemRemarcarAberto.nome}</div>
            <p className="fs-sm" style={{ color: 'var(--tinta-suave)', marginBottom: 10 }}>
              A tentativa fica registrada no horário atual do sistema. Escolha o novo dia e horário
              para remarcar a {itemRemarcarAberto.mensagem}ª mensagem.
            </p>
            <div className="grade grade-2">
              <div className="campo">
                <label>Novo dia *</label>
                <CampoData
                  placeholder="dd/mm/aa"
                  value={remarcadoDia}
                  onChange={(v) => setRemarcadoDia(formatarData(v))}
                  autoFocus
                />
              </div>
              <div className="campo">
                <label>Novo horário *</label>
                <input
                  placeholder="hh:mm"
                  value={remarcadoHorario}
                  onChange={(e) => setRemarcadoHorario(formatarHorario(e.target.value))}
                />
              </div>
            </div>
            <div className="campo">
              <label>Observação (opcional)</label>
              <input
                placeholder="Ex: caixa postal, número errado..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn secundario" onClick={cancelarRemarcar}>Cancelar</button>
              <button type="button" className="btn" onClick={confirmarRemarcar} disabled={salvandoRemarcacao}>
                {salvandoRemarcacao ? 'Salvando...' : 'Registrar e remarcar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {itemRemarcarPrazoAberto && (
        <div className="modal-fundo" onClick={cancelarRemarcarPrazo}>
          <div className="modal-caixa" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">Não recebeu — {itemRemarcarPrazoAberto.nome}</div>
            <p className="fs-sm" style={{ color: 'var(--tinta-suave)', marginBottom: 10 }}>
              A tentativa fica registrada no horário atual do sistema. Escolha o novo dia
              para remarcar o prazo de pagamento.
            </p>
            <div className="campo">
              <label>Novo dia *</label>
              <CampoData
                placeholder="dd/mm/aa"
                value={remarcadoDiaPrazo}
                onChange={(v) => setRemarcadoDiaPrazo(formatarData(v))}
                autoFocus
              />
            </div>
            <div className="campo">
              <label>Observação (opcional)</label>
              <input
                placeholder="Ex: pediu mais alguns dias..."
                value={observacaoPrazo}
                onChange={(e) => setObservacaoPrazo(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn secundario" onClick={cancelarRemarcarPrazo}>Cancelar</button>
              <button type="button" className="btn" onClick={confirmarRemarcarPrazo} disabled={salvandoRemarcacaoPrazo}>
                {salvandoRemarcacaoPrazo ? 'Salvando...' : 'Registrar e remarcar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconeUsuario() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

function IconePedido() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

function IconeNaoAtendeu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8 10a16 16 0 0 0 6 6l1.3-1.4a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function IconeCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Seta de expandir/recolher — gira 180° quando o card está aberto.
function IconeChevron({ aberto }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 18, height: 18, flexShrink: 0, transition: 'transform 0.15s', transform: aberto ? 'rotate(180deg)' : 'none' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Uma linha fina e clicável na lista compacta — horário, nome, tag de
// urgência/status. Reduz cada item a uma tira baixa, para caber muitos
// na tela sem rolar, em vez do card grande com todos os campos aberto.
function LinhaAgenda({ selecionada, onClick, urgencia, jaPassada, horario, titulo, tagExtra, status, statusOk }) {
  return (
    <div
      className={`linha-agenda ${selecionada ? 'selecionada' : ''} ${urgencia ? `urgencia-${urgencia}` : ''} ${jaPassada ? 'passada' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      <span className="linha-agenda-horario" style={{ textDecoration: jaPassada ? 'line-through' : 'none' }}>
        {horario || '—'}
      </span>
      <span className="linha-agenda-titulo">{titulo || '—'}</span>
      {tagExtra && <span className="tag neutro linha-agenda-tag">{tagExtra}</span>}
      {urgencia === 'atrasada' && <span className="tag pendente linha-agenda-tag">Atrasado</span>}
      {urgencia === 'proxima' && <span className="tag aviso linha-agenda-tag">Chegando</span>}
      {status && <span className={`tag ${statusOk ? 'ok' : 'pendente'} linha-agenda-tag`}>{status}</span>}
    </div>
  );
}

// Painel de detalhes — mostra todos os campos e ações do item
// selecionado na lista, para caber mensagens/pedidos por dia sem abrir
// uma tela nova para cada um.
function DetalhesFonada({ item, ehHoje, salvandoBaixa, navigate, onDarBaixa, onDesfazerBaixa, onAbrirRemarcar }) {
  const chave = `${item.pedidoId}-${item.mensagem}`;
  const jaPassada = ehHoje && item.passada;
  const urgencia = (ehHoje && !jaPassada) ? statusUrgenciaItem(item.horario) : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="carimbo-os carimbo-os-lista">{item.senha_os || item.pedidoId}</span>
        <span className="tag neutro">{item.mensagem}ª mensagem</span>
        {urgencia === 'atrasada' && <span className="tag pendente">Atrasado</span>}
        {urgencia === 'proxima' && <span className="tag aviso">Chegando</span>}
        {(!ehHoje || jaPassada) && (
          <span className={`tag ${item.resultado ? 'ok' : 'pendente'}`}>
            {item.resultado ? 'Passada' : 'Pendente'}
          </span>
        )}
      </div>
      <NomeComWhatsapp
        nome={item.nome_comprador}
        whatsapp={item.whatsapp}
        mensagem={mensagemConfirmacao(item.nome_comprador, item.para)}
      />
      <div className="fs-sm" style={{ color: 'var(--tinta-suave)', marginBottom: 14 }}>
        {item.horario || '—'}
      </div>

      <div className="grade grade-2" style={{ marginBottom: 12 }}>
        <Info label="Para" valor={item.para} />
        <Info label="Tema" valor={item.tema ? `${item.tema}${item.codigo ? ' · ' + item.codigo : ''}` : (item.codigo || null)} />
      </div>

      {(item.celular || item.fixo) && (
        <div className="grade grade-2" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--papel-alt)' }}>
          {item.celular && <InfoTelefone label="Celular" valor={item.celular} />}
          {item.fixo && <Info label="Fixo" valor={item.fixo} />}
        </div>
      )}

      {item.quemOferece && (
        <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--papel-alt)' }}>
          <Info label="Quem oferece" valor={item.quemOferece} />
        </div>
      )}

      {(!ehHoje || jaPassada) && item.resultado && (
        <div style={{ marginBottom: 14 }}>
          <Info label="Resultado" valor={item.resultado} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: ehHoje && !jaPassada ? 8 : 0 }}>
        {item.cliente_id && (
          <button type="button" className="btn-action" style={{ flex: 1 }} onClick={() => navigate(`/clientes/${item.cliente_id}`)}>
            <IconeUsuario /> Ver cliente
          </button>
        )}
        <button type="button" className="btn-action" style={{ flex: 1 }} onClick={() => navigate(`/fonada/${item.pedidoId}`)}>
          <IconePedido /> Abrir pedido
        </button>
      </div>
      {ehHoje && !jaPassada && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-action perigo-acao" style={{ flex: 1 }} onClick={() => onAbrirRemarcar(item)}>
            <IconeNaoAtendeu /> Não atendeu
          </button>
          <button
            type="button"
            className="btn-action destaque"
            style={{ flex: 1 }}
            onClick={() => onDarBaixa(item)}
            disabled={salvandoBaixa === chave}
          >
            <IconeCheck /> {salvandoBaixa === chave ? 'Salvando...' : 'Marcar passada'}
          </button>
        </div>
      )}
      {ehHoje && jaPassada && (
        <button
          type="button"
          className="btn-action"
          style={{ width: '100%' }}
          onClick={() => onDesfazerBaixa(item)}
          disabled={salvandoBaixa === `desfazer-${chave}`}
        >
          {salvandoBaixa === `desfazer-${chave}` ? 'Desfazendo...' : 'Desfazer'}
        </button>
      )}

      <CardRemarcacoes pedidoId={item.pedidoId} mensagem={item.mensagem} />
    </div>
  );
}

// Card separado, abaixo dos detalhes da fonada — clicável para expandir
// e mostrar o histórico de tentativas ("não atendeu" + remarcação) desse
// pedido/mensagem específico. Busca sob demanda (só quando o item
// selecionado muda), e fica escondido quando não há nenhuma tentativa.
function CardRemarcacoes({ pedidoId, mensagem }) {
  const [tentativas, setTentativas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setAberto(false);
    api.agenda.buscarTentativas(pedidoId)
      .then((resp) => {
        if (cancelado) return;
        setTentativas((resp.tentativas || []).filter((t) => t.mensagem === mensagem));
      })
      .catch(() => { if (!cancelado) setTentativas([]); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [pedidoId, mensagem]);

  if (carregando || tentativas.length === 0) return null;

  return (
    <div className="section-box" style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          borderBottom: '1px solid var(--papel-alt)', paddingBottom: 8, marginBottom: aberto ? 10 : 0,
          font: 'inherit', color: 'inherit',
        }}
      >
        <span className="fs-xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
          Remarcações
          <span className="aba-contagem">{tentativas.length}</span>
        </span>
        <IconeChevron aberto={aberto} />
      </button>

      {aberto && (
        <div style={{ display: 'grid', gap: 8 }}>
          {tentativas.map((t) => (
            <div key={t.id} className="info-linha" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                <span className="fs-sm" style={{ fontWeight: 700 }}>
                  Ligou em {t.data_hora_tentativa}
                </span>
                <span className="tag pendente">Não atendeu</span>
              </div>
              {t.observacao && (
                <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>Obs.: {t.observacao}</span>
              )}
              {t.remarcado_dia && (
                <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>
                  Remarcado para {t.remarcado_dia} às {t.remarcado_horario}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Igual a CardRemarcacoes, mas para o histórico de "não recebeu no dia
// previsto" do prazo de pagamento do Ao Vivo — sem o conceito de
// mensagem (1ª/2ª) nem de horário, só o dia do prazo.
function CardRemarcacoesPrazo({ pedidoId }) {
  const [tentativas, setTentativas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setAberto(false);
    api.aoVivo.buscarTentativasPrazo(pedidoId)
      .then((resp) => {
        if (cancelado) return;
        setTentativas(resp.tentativas || []);
      })
      .catch(() => { if (!cancelado) setTentativas([]); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [pedidoId]);

  if (carregando || tentativas.length === 0) return null;

  return (
    <div className="section-box" style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          borderBottom: '1px solid var(--papel-alt)', paddingBottom: 8, marginBottom: aberto ? 10 : 0,
          font: 'inherit', color: 'inherit',
        }}
      >
        <span className="fs-xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
          Remarcações
          <span className="aba-contagem">{tentativas.length}</span>
        </span>
        <IconeChevron aberto={aberto} />
      </button>

      {aberto && (
        <div style={{ display: 'grid', gap: 8 }}>
          {tentativas.map((t) => (
            <div key={t.id} className="info-linha" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                <span className="fs-sm" style={{ fontWeight: 700 }}>
                  Verificado em {t.data_hora_tentativa}
                </span>
                <span className="tag pendente">Não recebeu</span>
              </div>
              {t.observacao && (
                <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>Obs.: {t.observacao}</span>
              )}
              {t.remarcado_dia && (
                <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>
                  Remarcado para {t.remarcado_dia}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetalhesAoVivo({ item, ehHoje, salvandoBaixa, navigate, onDarBaixaAoVivo, onDesfazerBaixaAoVivo, onMarcarPagouAoVivo, onAbrirRemarcarPrazo }) {
  const chave = `aovivo-${item.id}`;
  const jaPassada = ehHoje && item.passada;
  const foiEntregue = Boolean(item.resultado_entrega);
  const urgencia = (ehHoje && !jaPassada && !item.ehCobranca) ? statusUrgenciaItem(item.horario_entrega) : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="carimbo-os carimbo-os-lista">{item.numero_os || item.id}</span>
        {item.ehCobranca && <span className="tag aviso">Cobrança prevista — não é entrega</span>}
        {urgencia === 'atrasada' && <span className="tag pendente">Atrasado</span>}
        {urgencia === 'proxima' && <span className="tag aviso">Chegando</span>}
        {item.ehCobranca && item.pagou === 'SIM' && <span className="tag ok">Recebido</span>}
        {!item.ehCobranca && foiEntregue && <span className="tag ok">Entregue</span>}
      </div>
      <div className="fs-lg" style={{ fontWeight: 700, marginBottom: 2 }}>{item.comprador || '—'}</div>
      <div className="fs-sm" style={{ color: 'var(--tinta-suave)', marginBottom: 14 }}>
        {item.ehCobranca ? 'Cobrança prevista' : (item.horario_entrega || '—')}
      </div>

      <div className="grade grade-2" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--papel-alt)' }}>
        <Info label="Para" valor={item.para} />
        <Info label="Endereço" valor={item.endereco} />
        <Info label="Bairro" valor={item.bairro} />
        <Info label="Referência" valor={item.referencia} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {item.cliente_id && (
          <button type="button" className="btn-action" style={{ flex: 1 }} onClick={() => navigate(`/clientes/${item.cliente_id}`)}>
            <IconeUsuario /> Ver cliente
          </button>
        )}
        <button type="button" className="btn-action" style={{ flex: 1 }} onClick={() => navigate(`/ao-vivo/${item.id}`)}>
          <IconePedido /> Abrir pedido
        </button>
      </div>

      {!item.ehCobranca && foiEntregue && (
        <button
          type="button"
          className="btn-action"
          style={{ width: '100%' }}
          onClick={() => onDesfazerBaixaAoVivo(item)}
          disabled={salvandoBaixa === `aovivo-desfazer-${item.id}`}
        >
          {salvandoBaixa === `aovivo-desfazer-${item.id}` ? 'Desfazendo...' : 'Desfazer entrega'}
        </button>
      )}
      {!item.ehCobranca && !foiEntregue && (
        <button
          type="button"
          className="btn-action destaque"
          style={{ width: '100%' }}
          onClick={() => onDarBaixaAoVivo(item, true)}
          disabled={salvandoBaixa === chave}
        >
          <IconeCheck /> {salvandoBaixa === chave ? 'Salvando...' : 'Confirmar entrega'}
        </button>
      )}
      {item.ehCobranca && item.pagou !== 'SIM' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-action perigo-acao"
            style={{ flex: 1 }}
            onClick={() => onAbrirRemarcarPrazo(item)}
          >
            <IconeNaoAtendeu /> Não recebeu
          </button>
          <button
            type="button"
            className="btn-action destaque"
            style={{ flex: 1 }}
            onClick={() => onMarcarPagouAoVivo(item, 'SIM')}
            disabled={salvandoBaixa === `aovivo-pagou-${item.id}`}
          >
            <IconeCheck /> {salvandoBaixa === `aovivo-pagou-${item.id}` ? 'Salvando...' : 'Recebido'}
          </button>
        </div>
      )}
      {item.ehCobranca && item.pagou === 'SIM' && (
        <button
          type="button"
          className="btn-action"
          style={{ width: '100%' }}
          onClick={() => onMarcarPagouAoVivo(item, null)}
          disabled={salvandoBaixa === `aovivo-pagou-${item.id}`}
        >
          <IconeNaoAtendeu /> {salvandoBaixa === `aovivo-pagou-${item.id}` ? 'Desfazendo...' : 'Desfazer'}
        </button>
      )}

      {item.ehCobranca && <CardRemarcacoesPrazo pedidoId={item.id} />}
    </div>
  );
}

// Relógio no canto superior direito da tela — só na Agenda, para
// comparar rápido com os horários das mensagens/entregas do dia.
// Atualiza a cada segundo (para trocar de minuto na hora certa),
// exibindo só HH:MM.
function Relogio() {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    const intervalo = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);
  const hh = String(agora.getHours()).padStart(2, '0');
  const mm = String(agora.getMinutes()).padStart(2, '0');
  return (
    <div className="relogio-topo nao-imprimir" aria-label={`Hora atual: ${hh}:${mm}`}>
      {hh}:{mm}
    </div>
  );
}

// Monta o link wa.me a partir de um número de telefone qualquer — DDI
// 55 + DDD + número, só dígitos. Usado tanto no nome do comprador
// quanto no campo Celular do card de detalhes. Quando `mensagem` é
// informada, ela já vem preenchida na conversa ao abrir o link — o
// texto é urlencoded automaticamente pelo `encodeURIComponent`.
function linkWhatsappDe(valor, mensagem) {
  const somenteDigitos = String(valor || '').replace(/\D/g, '');
  if (!somenteDigitos) return null;
  const numeroComDDI = somenteDigitos.startsWith('55') ? somenteDigitos : `55${somenteDigitos}`;
  if (numeroComDDI.length < 12) return null;
  const base = `https://wa.me/${numeroComDDI}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}

// Texto de confirmação enviado por padrão ao clicar no celular do
// comprador na Agenda — "comprador" e "destinatario" já vêm prontos
// (nome_comprador/comprador e para, dependendo do sistema).
function mensagemConfirmacao(comprador, destinatario) {
  const nomeComprador = comprador || 'tudo bem';
  const nomeDestinatario = destinatario || 'a pessoa';
  // Emoji "rosto sorridente" (😊) escrito como escape Unicode, em vez
  // do caractere literal — mais resistente a problemas de codificação
  // ao salvar/abrir o arquivo em editores ou sistemas diferentes.
  const emoji = '\u{1F60A}';
  return `Olá ${nomeComprador}! Acabei de passar a mensagem para ${nomeDestinatario}${emoji}`;
}

// Nome do comprador como título do card — vira link clicável para abrir
// o WhatsApp quando o cliente tiver esse número cadastrado. Quando
// `mensagem` é informada, ela já vem preenchida na conversa.
function NomeComWhatsapp({ nome, whatsapp, mensagem }) {
  const link = linkWhatsappDe(whatsapp, mensagem);
  if (!link) {
    return <div className="fs-lg" style={{ fontWeight: 700, marginBottom: 2 }}>{nome || '—'}</div>;
  }
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="fs-lg link-whatsapp"
      style={{ fontWeight: 700, marginBottom: 2, display: 'inline-block' }}
      title={mensagem ? 'Enviar confirmação no WhatsApp' : 'Abrir conversa no WhatsApp'}
    >
      {nome || '—'}
    </a>
  );
}

function Info({ label, valor }) {
  return (
    <div>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
        {label}
      </div>
      <div className="fs-md">{valor || '—'}</div>
    </div>
  );
}

// Igual a Info, mas o valor vira link clicável para abrir a conversa no
// WhatsApp (wa.me), usado no Celular — mesmo padrão de formatação de
// número usado no cadastro (DDI 55 + DDD + número, só dígitos).
function InfoTelefone({ label, valor, mensagem }) {
  const linkWhatsapp = linkWhatsappDe(valor, mensagem);

  return (
    <div>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
        {label}
      </div>
      {linkWhatsapp ? (
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="fs-md link-whatsapp"
          title={mensagem ? 'Enviar confirmação no WhatsApp' : 'Abrir conversa no WhatsApp'}
        >
          {valor}
        </a>
      ) : (
        <div className="fs-md">{valor || '—'}</div>
      )}
    </div>
  );
}

const estilos = {
  navegacaoData: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  itemAgenda: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    flexWrap: 'wrap',
  },
  itemPassado: {
    opacity: 0.55,
  },
};
