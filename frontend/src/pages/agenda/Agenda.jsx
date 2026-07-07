import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarData, formatarHorario } from '../../mascaras.js';

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
  // "Relógio" local, só para forçar o recálculo da urgência (borda
  // laranja/vermelha) periodicamente — os cards de fonada/ao vivo não
  // mudam quando isso atualiza, só a cor da borda deles é recalculada.
  const [agoraTick, setAgoraTick] = useState(() => Date.now());

  const [itemRemarcarAberto, setItemRemarcarAberto] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [remarcadoDia, setRemarcadoDia] = useState('');
  const [remarcadoHorario, setRemarcadoHorario] = useState('');
  const [salvandoRemarcacao, setSalvandoRemarcacao] = useState(false);

  const navigate = useNavigate();
  const { mostrarToast } = useToast();

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

  // Atualiza o "relógio" a cada 30s, para a borda laranja/vermelha virar
  // sozinha conforme o tempo passa, sem precisar recarregar a página.
  useEffect(() => {
    const intervalo = setInterval(() => setAgoraTick(Date.now()), 30000);
    return () => clearInterval(intervalo);
  }, []);

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

  // Pendentes primeiro (ordenados por horário), já passados/pagos depois
  // (também ordenados por horário entre si) — em vez de escondidos, ficam
  // sempre visíveis no fim da lista, acinzentados.
  function ordenarPendentesPrimeiro(lista, chaveHorario) {
    return [...lista].sort((a, b) => {
      if (a.passada !== b.passada) return a.passada ? 1 : -1;
      return (a[chaveHorario] || '').localeCompare(b[chaveHorario] || '');
    });
  }

  // Status de urgência de um horário "hh:mm" comparado com agora, usado
  // para destacar visualmente mensagens pendentes na Agenda de hoje:
  // 'atrasada' (já passou da hora), 'proxima' (faltam 10min ou menos),
  // ou null (sem destaque — ainda falta tempo, ou horário inválido).
  function statusUrgencia(horarioStr) {
    const m = String(horarioStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const [, hh, mm] = m;

    const agora = new Date();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const minutosItem = parseInt(hh, 10) * 60 + parseInt(mm, 10);
    const diferenca = minutosItem - minutosAgora;

    if (diferenca < 0) return 'atrasada';
    if (diferenca <= 10) return 'proxima';
    return null;
  }

  const ESTILO_URGENCIA = {
    atrasada: { border: '2px solid #dc3545' },
    proxima: { border: '2px solid #fd7e14' },
  };

  const fonadaExibida = ehHoje ? ordenarPendentesPrimeiro(fonada, 'horario') : fonada;
  const aoVivoExibido = ehHoje ? ordenarPendentesPrimeiro(aoVivo, 'horario_entrega') : aoVivo;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 4 }}>Agenda</h1>
        <div style={estilos.navegacaoData}>
          <button type="button" className="btn-small" onClick={() => irParaDia(somarDias(dataSelecionada, -1))}>
            ← Dia anterior
          </button>
          <input
            className="campo-data-agenda"
            placeholder="dd/mm/aa"
            value={dataSelecionada}
            onChange={(e) => irParaDia(formatarData(e.target.value))}
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
          <p className="fs-xs" style={{ color: '#dc3545', marginTop: 6 }}>
            Consultando outro dia — só visualização, sem ações de baixa.
          </p>
        )}
      </div>

      {erro && <p style={{ color: '#dc3545' }}>{erro}</p>}

      {carregando ? (
        <p style={{ color: '#6c757d' }}>Carregando...</p>
      ) : (
        <div className="section-box" style={{ padding: 0, overflow: 'hidden' }}>
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

          <div style={{ padding: 16 }}>
            {aba === 'fonada' && (
              fonadaExibida.length === 0 ? (
                <p className="fs-sm" style={{ color: '#6c757d', textAlign: 'center', padding: '16px 0' }}>
                  Nenhuma mensagem fonada marcada para {ehHoje ? 'hoje' : 'esse dia'}.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {fonadaExibida.map((item) => {
                    const chave = `${item.pedidoId}-${item.mensagem}`;
                    const jaPassada = ehHoje && item.passada;
                    const urgencia = (ehHoje && !jaPassada) ? statusUrgencia(item.horario) : null;
                    return (
                      <div
                        key={chave}
                        className="painel"
                        style={{
                          ...estilos.itemAgenda,
                          ...(jaPassada ? estilos.itemPassado : {}),
                          ...(urgencia ? ESTILO_URGENCIA[urgencia] : {}),
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span className="carimbo-os carimbo-os-lista">{item.senha_os || item.pedidoId}</span>
                            <span
                              className="fs-lg"
                              style={{ fontWeight: 700, color: '#004085', textDecoration: jaPassada ? 'line-through' : 'none' }}
                            >
                              {item.horario || '—'}
                            </span>
                            <span className="tag neutro">{item.mensagem}ª mensagem</span>
                            {(!ehHoje || jaPassada) && (
                              <span className={`tag ${item.resultado ? 'ok' : 'pendente'}`}>
                                {item.resultado ? 'Já passada' : 'Pendente'}
                              </span>
                            )}
                          </div>
                          <div className="grade grade-3">
                            <Info label="Comprador" valor={item.nome_comprador} />
                            <Info label="Para" valor={item.para} />
                            <Info label="Tema" valor={item.tema} />
                            <Info label="Celular" valor={item.celular} />
                            <Info label="Fixo" valor={item.fixo} />
                            {(!ehHoje || jaPassada) && item.resultado && <Info label="Resultado" valor={item.resultado} />}
                          </div>
                        </div>
                        <div style={estilos.acoesItem}>
                          {item.cliente_id && (
                            <button
                              type="button"
                              className="btn-small"
                              onClick={() => navigate(`/clientes/${item.cliente_id}`)}
                            >
                              Ver cliente
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => navigate(`/fonada/${item.pedidoId}`)}
                          >
                            Abrir pedido
                          </button>
                          {ehHoje && !jaPassada && (
                            <>
                              <button
                                type="button"
                                className="btn-small"
                                style={{ color: '#dc3545', borderColor: '#dc3545' }}
                                onClick={() => abrirRemarcar(item)}
                              >
                                Não atendeu
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => darBaixa(item)}
                                disabled={salvandoBaixa === chave}
                              >
                                {salvandoBaixa === chave ? 'Salvando...' : 'Dar baixa'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {aba === 'aovivo' && (
              aoVivoExibido.length === 0 ? (
                <p className="fs-sm" style={{ color: '#6c757d', textAlign: 'center', padding: '16px 0' }}>
                  Nenhuma mensagem ao vivo marcada para {ehHoje ? 'hoje' : 'esse dia'}.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {aoVivoExibido.map((item) => {
                    const chave = `aovivo-${item.id}`;
                    const jaPassada = ehHoje && item.passada;
                    const foiEntregue = Boolean(item.resultado_entrega);
                    const urgencia = (ehHoje && !jaPassada) ? statusUrgencia(item.horario_entrega) : null;
                    return (
                      <div
                        key={item.id}
                        className="painel"
                        style={{
                          ...estilos.itemAgenda,
                          ...(jaPassada ? estilos.itemPassado : {}),
                          ...(urgencia ? ESTILO_URGENCIA[urgencia] : {}),
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span className="carimbo-os carimbo-os-lista">{item.numero_os || item.id}</span>
                            <span
                              className="fs-lg"
                              style={{ fontWeight: 700, color: '#004085', textDecoration: jaPassada ? 'line-through' : 'none' }}
                            >
                              {item.horario_entrega || '—'}
                            </span>
                            {foiEntregue && (
                              <>
                                <span className="tag ok">Pago</span>
                                <button
                                  type="button"
                                  className="btn-small"
                                  style={{ padding: '2px 8px', fontSize: 12 }}
                                  onClick={() => desfazerBaixaAoVivo(item)}
                                  disabled={salvandoBaixa === `aovivo-desfazer-${item.id}`}
                                >
                                  {salvandoBaixa === `aovivo-desfazer-${item.id}` ? 'Desfazendo...' : 'Desfazer'}
                                </button>
                              </>
                            )}
                          </div>
                          <div className="grade grade-3">
                            <Info label="Comprador" valor={item.comprador} />
                            <Info label="Para" valor={item.para} />
                            <Info label="Endereço" valor={item.endereco} />
                            <Info label="Bairro" valor={item.bairro} />
                            <Info label="Referência" valor={item.referencia} />
                          </div>
                        </div>
                        <div style={estilos.acoesItem}>
                          {item.cliente_id && (
                            <button
                              type="button"
                              className="btn-small"
                              onClick={() => navigate(`/clientes/${item.cliente_id}`)}
                            >
                              Ver cliente
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => navigate(`/ao-vivo/${item.id}`)}
                          >
                            Abrir pedido
                          </button>
                          {!foiEntregue && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => darBaixaAoVivo(item, true)}
                              disabled={salvandoBaixa === chave}
                            >
                              {salvandoBaixa === chave ? 'Salvando...' : 'Pagou'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {itemRemarcarAberto && (
        <div className="modal-fundo" onClick={cancelarRemarcar}>
          <div className="modal-caixa" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">Não atendeu — {itemRemarcarAberto.nome}</div>
            <p className="fs-sm" style={{ color: '#6c757d', marginBottom: 10 }}>
              A tentativa fica registrada no horário atual do sistema. Escolha o novo dia e horário
              para remarcar a {itemRemarcarAberto.mensagem}ª mensagem.
            </p>
            <div className="grade grade-2">
              <div className="campo">
                <label>Novo dia *</label>
                <input
                  placeholder="dd/mm/aa"
                  value={remarcadoDia}
                  onChange={(e) => setRemarcadoDia(formatarData(e.target.value))}
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
    </div>
  );
}

function Info({ label, valor }) {
  return (
    <div>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6c757d', marginBottom: 2 }}>
        {label}
      </div>
      <div className="fs-md">{valor || '—'}</div>
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
  acoesItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flexShrink: 0,
  },
};
