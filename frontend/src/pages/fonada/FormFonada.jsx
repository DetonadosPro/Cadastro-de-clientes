import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useRascunhos } from '../../RascunhosContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData, formatarHorario, formatarCodigoNumerico, formatarValorMonetario, valorMonetarioParaNumero, numeroParaValorMonetario } from '../../mascaras.js';

const VAZIO = {
  senha_os: '', cliente_id: null, data_pedido: '', horario_pedido: '', nascimento: '', tipo: '', recall: 'NÃO', recall_codigo: '',
  p1_dia: '', p1_para: '', p1_tema: '', p1_mensagem: '', p1_fixo: '', p1_celular: '', p1_horario: '', p1_quem_oferece: '', p1_resultado: '',
  p2_dia: '', p2_para: '', p2_tema: '', p2_mensagem: '', p2_fixo: '', p2_celular: '', p2_horario: '', p2_quem_oferece: '', p2_resultado: '',
  valor: '', cobranca: '', periodo: '', pagou: 'NÃO', recebi: '', data_pagamento: '',
  vender: '', status: '', impresso: '',
};

const CAMPOS_COPIAVEIS = ['tema', 'mensagem', 'para', 'fixo', 'celular', 'dia', 'horario', 'quem_oferece', 'resultado'];

function dataHoraAtual() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const hh = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');
  return { data: `${dd}/${mm}/${aa}`, horario: `${hh}:${min}` };
}

// Extrai os 2 dígitos do DDD de um telefone formatado como "(34) 9 9999-9999"
// ou "(34) 9999-9999". Retorna null se não houver DDD reconhecível.
function extrairDDD(telefoneFormatado) {
  const m = String(telefoneFormatado || '').match(/^\((\d{2})\)/);
  return m ? m[1] : null;
}

// A 2ª mensagem só é liberada para edição quando pelo menos um dos
// telefones já preenchidos (fixo ou celular) da 1ª mensagem tiver DDD
// 34 — região atendida pelo serviço. Sem isso, os campos ficam
// bloqueados, para não montar uma 2ª mensagem incompatível.
const DDD_ATENDIDO = '34';
function segundaMensagemLiberada(dados) {
  const ddds = [extrairDDD(dados.p1_celular), extrairDDD(dados.p1_fixo)];
  return ddds.some((ddd) => ddd === DDD_ATENDIDO);
}

export default function FormFonada() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const clienteIdUrl = searchParams.get('clienteId');
  const editando = Boolean(id);
  const navigate = useNavigate();
  const { rascunhoFonada, setRascunhoFonada, limparRascunhoFonada } = useRascunhos();
  const { mostrarToast } = useToast();

  const chaveRascunho = editando ? `editar-${id}` : 'novo';

  const [dados, setDados] = useState(VAZIO);
  const [cliente, setCliente] = useState(null);
  const [tentativas, setTentativas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (rascunhoFonada && rascunhoFonada.chave === chaveRascunho) {
      setDados(rascunhoFonada.dados);
      if (rascunhoFonada.cliente) setCliente(rascunhoFonada.cliente);
      setCarregando(false);
      return;
    }

    if (!editando) {
      if (!clienteIdUrl) {
        setErro('Nenhum cliente selecionado. Volte e abra o pedido pela ficha do cliente.');
        setCarregando(false);
        return;
      }
      Promise.all([api.clientes.buscar(clienteIdUrl), api.fonada.proximaOs()])
        .then(([respCliente, respOs]) => {
          const { data, horario } = dataHoraAtual();
          const inicial = {
            ...VAZIO,
            cliente_id: Number(clienteIdUrl),
            data_pedido: data,
            horario_pedido: horario,
            senha_os: respOs.proximaOs,
            nascimento: respCliente.cliente.nascimento || '',
          };
          setDados(inicial);
          setCliente(respCliente.cliente);
          setRascunhoFonada({ chave: chaveRascunho, dados: inicial, cliente: respCliente.cliente });
        })
        .catch((err) => setErro(err.message))
        .finally(() => setCarregando(false));
      return;
    }

    api.fonada.buscar(id)
      .then((pedido) => {
        const normalizado = { ...VAZIO };
        Object.keys(VAZIO).forEach((campo) => { normalizado[campo] = pedido[campo] ?? ''; });
        normalizado.valor = numeroParaValorMonetario(pedido.valor);
        setDados(normalizado);
        if (pedido.cliente_id) {
          api.clientes.buscar(pedido.cliente_id).then((resp) => setCliente(resp.cliente));
        }
        api.agenda.buscarTentativas(id).then((resp) => setTentativas(resp.tentativas)).catch(() => {});
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editando, clienteIdUrl]);

  function set(campo, valor) {
    setDados((d) => {
      const novo = { ...d, [campo]: valor };
      setRascunhoFonada({ chave: chaveRascunho, dados: novo, cliente });
      return novo;
    });
  }

  function setComMascara(campo, valorBruto, tipoMascara) {
    const formatadores = {
      celular: formatarCelular,
      fixo: formatarFixo,
      data: formatarData,
      horario: formatarHorario,
    };
    const formatado = formatadores[tipoMascara](valorBruto);
    set(campo, formatado);
  }

  function copiarEntreMensagens(nomeCampo, deMensagem) {
    const origemPrefixo = deMensagem === 1 ? 'p1' : 'p2';
    const destinoPrefixo = deMensagem === 1 ? 'p2' : 'p1';
    const valor = dados[`${origemPrefixo}_${nomeCampo}`];
    set(`${destinoPrefixo}_${nomeCampo}`, valor);
  }

  function limpar() {
    const preservado = { ...VAZIO, cliente_id: dados.cliente_id, senha_os: dados.senha_os };
    setDados(preservado);
    setRascunhoFonada({ chave: chaveRascunho, dados: preservado, cliente });
  }

  async function salvar() {
    setErro('');
    if (!dados.cliente_id) {
      setErro('Nenhum cliente vinculado a este pedido.');
      return;
    }
    setSalvando(true);
    try {
      const payload = { ...dados, valor: valorMonetarioParaNumero(dados.valor) };
      if (editando) {
        await api.fonada.atualizar(id, payload);
        limparRascunhoFonada();
        mostrarToast('Pedido salvo com sucesso.');
      } else {
        const novo = await api.fonada.criar(payload);
        limparRascunhoFonada();
        mostrarToast('Pedido salvo com sucesso.');
        navigate(`/fonada/${novo.id}`, { replace: true });
      }
    } catch (err) {
      setErro(err.message);
      mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!confirm('Tem certeza que deseja excluir este pacote? Essa ação não pode ser desfeita.')) return;
    try {
      await api.fonada.apagar(id);
      limparRascunhoFonada();
      if (cliente) navigate(`/clientes/${cliente.id}`);
      else navigate('/fonada');
    } catch (err) {
      setErro(err.message);
    }
  }

  function fechar() {
    limparRascunhoFonada();
    // Volta para a página de onde realmente veio (lista, "Hoje", busca, etc).
    // Se não houver histórico (acesso direto pela URL), cai na ficha do
    // cliente vinculado, ou na listagem de fonada como último recurso.
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else if (cliente) {
      navigate(`/clientes/${cliente.id}`);
    } else {
      navigate('/fonada');
    }
  }

  if (carregando) return <p style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>;

  if (erro && !dados.cliente_id) {
    return (
      <div className="painel" style={{ maxWidth: 480 }}>
        <p className="fs-sm" style={{ color: '#dc3545', marginBottom: 12 }}>{erro}</p>
        <button className="btn" onClick={() => navigate('/clientes')}>Ir para Clientes</button>
      </div>
    );
  }

  // Junta as tentativas sem sucesso com os resultados de baixa bem-sucedida
  // (identificados pelo texto automático "MENSAGEM PASSADA, ..."), para
  // mostrar o histórico completo em ordem: mais recentes primeiro.
  const itensHistorico = [
    ...tentativas.map((t) => ({ ...t, tipo: 'falha', chave: `tentativa-${t.id}` })),
    ...[1, 2].flatMap((n) => {
      const resultado = dados[`p${n}_resultado`];
      if (resultado && resultado.startsWith('MENSAGEM PASSADA')) {
        return [{ tipo: 'sucesso', mensagem: n, texto: resultado, chave: `sucesso-${n}` }];
      }
      return [];
    }),
  ];

  const estaBloqueado = !!cliente?.bloqueado;
  const segundaLiberada = segundaMensagemLiberada(dados);

  return (
    <div className="form-pagina pagina-fonada-ampliada">
      {estaBloqueado && (
        <div className="aviso-bloqueio" style={{ marginBottom: 16 }}>
          <strong>Cliente bloqueado.</strong> Este pedido está travado para edição — só é possível visualizar.
          {cliente.bloqueio_motivo && <> Motivo: {cliente.bloqueio_motivo}</>}
        </div>
      )}
      <div className={`form-layout ${estaBloqueado ? 'form-bloqueado' : ''}`}>

        <div>
          <div className="section-box">
            <div className="section-title">Ordem de serviço</div>
            <div className="duas-colunas-mensagem">
              <ColunaOrdemServico numero={1} dados={dados} set={set} setComMascara={setComMascara} onCopiar={copiarEntreMensagens} />
              <ColunaOrdemServico numero={2} dados={dados} set={set} setComMascara={setComMascara} onCopiar={copiarEntreMensagens} bloqueada={!segundaLiberada} />
            </div>
          </div>

          <div className="section-box">
            <div className="section-title">Transmissão</div>
            <div className="duas-colunas-mensagem">
              <ColunaTransmissao numero={1} dados={dados} set={set} setComMascara={setComMascara} onCopiar={copiarEntreMensagens} />
              <ColunaTransmissao numero={2} dados={dados} set={set} setComMascara={setComMascara} onCopiar={copiarEntreMensagens} bloqueada={!segundaLiberada} />
            </div>
          </div>

          <div className="section-box">
            <div className="form-row">
              <label>Valor R$:</label>
              <input
                type="text"
                inputMode="numeric"
                className="campo-valor"
                value={dados.valor}
                onChange={(e) => set('valor', formatarValorMonetario(e.target.value))}
                style={{ fontWeight: 700 }}
              />
              <label style={{ minWidth: 'auto', marginLeft: 8 }}>Cob. dia:</label>
              <input className="campo-data" placeholder="dd/mm/aa" value={dados.cobranca} onChange={(e) => setComMascara('cobranca', e.target.value, 'data')} />
            </div>
            <div className="form-row">
              <label>Período:</label>
              <input value={dados.periodo} onChange={(e) => set('periodo', e.target.value)} />
            </div>
          </div>

          <div className="section-box">
            <div className="section-title">
              <span>Comprador</span>
              {cliente && (
                <button type="button" className="btn-small" onClick={() => navigate(`/clientes/${cliente.id}`)}>
                  Ver/editar cliente
                </button>
              )}
            </div>
            {cliente ? (
              <div className="grade grade-2">
                <InfoSomenteLeitura label="Nome" valor={cliente.nome} />
                <InfoSomenteLeitura label="Nascimento" valor={cliente.nascimento} />
                <InfoSomenteLeitura label="Fixo" valor={cliente.fixo} />
                <InfoSomenteLeitura label="Celular" valor={cliente.celular} />
                <InfoSomenteLeitura label="Endereço" valor={cliente.endereco} />
                <InfoSomenteLeitura label="Complemento" valor={cliente.complemento} />
                <InfoSomenteLeitura label="Bairro" valor={cliente.bairro} />
                <InfoSomenteLeitura label="Referência" valor={cliente.referencia} />
              </div>
            ) : (
              <p className="fs-sm" style={{ color: '#6c757d' }}>Nenhum cliente vinculado.</p>
            )}
          </div>

          {editando && (tentativas.length > 0 || dados.p1_resultado || dados.p2_resultado) && (
            <div className="section-box">
              <div className="section-title">
                <span>Histórico de tentativas</span>
                <span className="aba-contagem">{itensHistorico.length}</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {itensHistorico.map((item) => (
                  item.tipo === 'sucesso' ? (
                    <div key={item.chave} className="info-linha historico-sucesso" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                        <span className="fs-sm" style={{ fontWeight: 700 }}>
                          {item.mensagem}ª mensagem — {item.texto}
                        </span>
                        <span className="tag ok">Passada</span>
                      </div>
                    </div>
                  ) : (
                    <div key={item.chave} className="info-linha" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                        <span className="fs-sm" style={{ fontWeight: 700 }}>
                          {item.mensagem}ª mensagem — ligou em {item.data_hora_tentativa}
                        </span>
                        <span className="tag pendente">Não atendeu</span>
                      </div>
                      {item.observacao && (
                        <span className="fs-xs" style={{ color: '#6c757d' }}>Obs.: {item.observacao}</span>
                      )}
                      {item.remarcado_dia && (
                        <span className="fs-xs" style={{ color: '#6c757d' }}>
                          Remarcado para {item.remarcado_dia} às {item.remarcado_horario}
                        </span>
                      )}
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div style={estilos.osTopo}>
            {dados.senha_os
              ? <span className="carimbo-os">O.S. {dados.senha_os}</span>
              : <span className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Calculando O.S...</span>}
          </div>

          {erro && <p className="fs-sm" style={{ color: '#dc3545', marginBottom: 10 }}>{erro}</p>}

          <div className="section-box actions-grid">
            <button type="button" className="btn-action destaque" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" className="btn-action" onClick={limpar}>Limpar</button>
            {editando && cliente && !estaBloqueado && (
              <button type="button" className="btn-action" onClick={() => navigate(`/fonada/novo?clienteId=${cliente.id}`)}>
                + Novo pedido
              </button>
            )}
            {editando && (
              <button type="button" className="btn-action perigo-acao" onClick={apagar}>Excluir</button>
            )}
            <button
              type="button"
              className="btn-action fechar-acao"
              style={{ gridColumn: editando ? undefined : 'span 2', pointerEvents: 'auto' }}
              onClick={fechar}
            >
              Fechar
            </button>
          </div>

          <div className="section-box">
            <div className="section-title">Registro do pedido</div>
            <div className="info-linha">
              <span className="info-label">Data</span>
              <span className="info-valor">{dados.data_pedido || '—'}</span>
            </div>
            <div className="info-linha">
              <span className="info-label">Horário</span>
              <span className="info-valor">{dados.horario_pedido || '—'}</span>
            </div>
          </div>

          <div className="section-box">
            <div className="form-row">
              <label style={{ minWidth: 'auto' }}>Recall:</label>
              <select
                value={dados.recall}
                onChange={(e) => {
                  const novoValor = e.target.value;
                  set('recall', novoValor);
                  if (novoValor !== 'SIM') set('recall_codigo', '');
                }}
                style={{ maxWidth: 90 }}
              >
                <option value="SIM">Sim</option>
                <option value="NÃO">Não</option>
              </select>
              <label style={{ minWidth: 'auto', marginLeft: 4 }}>Código:</label>
              <input
                placeholder="00000"
                value={dados.recall_codigo}
                disabled={dados.recall !== 'SIM'}
                onChange={(e) => set('recall_codigo', formatarCodigoNumerico(e.target.value, 5))}
                style={{ maxWidth: 90 }}
              />
            </div>
            <div className="form-row">
              <label style={{ minWidth: 'auto' }}>Tipo:</label>
              <select value={dados.tipo} onChange={(e) => set('tipo', e.target.value)}>
                <option value="">—</option>
                <option value="ANI.">ANIVERSÁRIO</option>
                <option value="OUT.">OUTRO</option>
              </select>
            </div>
            <div className="form-row">
              <label style={{ minWidth: 'auto' }}>Vender:</label>
              <select value={dados.vender} onChange={(e) => set('vender', e.target.value)}>
                <option value="">—</option>
                <option value="SIM">Sim</option>
                <option value="NÃO">Não</option>
              </select>
            </div>
          </div>

          <div className="section-box">
            <div className="section-title">Lançamento</div>
            <div className="grade grade-2">
              <InfoSomenteLeitura label="Pagou" valor={dados.pagou === 'SIM' ? 'Sim' : 'Não'} />
              <InfoSomenteLeitura label="Data do pagamento" valor={dados.data_pagamento} />
            </div>
            <InfoSomenteLeitura label="Status" valor={dados.recebi} />
          </div>
        </div>

      </div>
    </div>
  );
}

// Uma coluna com os campos da Ordem de serviço de uma mensagem específica
// (1ª ou 2ª) — as duas colunas ficam visíveis lado a lado, sem precisar
// trocar de aba para ver a outra mensagem. O botão "P" (copiar) só
// aparece na coluna da 1ª mensagem, já que o fluxo normal é preencher a
// 1ª e copiar dali para a 2ª, não o contrário.
function ColunaOrdemServico({ numero, dados, set, setComMascara, onCopiar, bloqueada }) {
  const p = numero === 1 ? 'p1' : 'p2';
  const mostrarBotaoP = numero === 1;

  return (
    <div className="coluna-mensagem">
      <div className="coluna-mensagem-titulo">
        <span className={`bolinha-status ${dados[`${p}_dia`] ? 'usada' : 'livre'}`} /> {numero}ª mensagem
      </div>
      {bloqueada && (
        <p className="fs-xs" style={{ color: '#dc3545', marginBottom: 6 }}>
          Bloqueada: nenhum telefone da 1ª mensagem tem DDD 34.
        </p>
      )}
      <CampoComP label="Tema" nomeCampo="tema" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} />
      <CampoComP label="Mensagem" nomeCampo="mensagem" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} />
      <CampoComP label="Para" nomeCampo="para" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} />
      <div className="form-row">
        <label>Fixo:</label>
        <input className="campo-fixo" value={dados[`${p}_fixo`]} onChange={(e) => setComMascara(`${p}_fixo`, e.target.value, 'fixo')} disabled={bloqueada} />
        <label style={{ minWidth: 'auto', marginLeft: 4 }}>Cel.:</label>
        <input className="campo-celular" value={dados[`${p}_celular`]} onChange={(e) => setComMascara(`${p}_celular`, e.target.value, 'celular')} disabled={bloqueada} />
        {mostrarBotaoP && (
          <BotaoP
            onClick={() => { onCopiar('fixo', numero); onCopiar('celular', numero); }}
            titulo="Copiar telefones para a 2ª mensagem"
          />
        )}
      </div>
    </div>
  );
}

// Mesma ideia para a seção Transmissão.
function ColunaTransmissao({ numero, dados, set, setComMascara, onCopiar, bloqueada }) {
  const p = numero === 1 ? 'p1' : 'p2';
  const mostrarBotaoP = numero === 1;

  return (
    <div className="coluna-mensagem">
      <div className="form-row">
        <label>Dia:</label>
        <input className="campo-data" placeholder="dd/mm/aa" value={dados[`${p}_dia`]} onChange={(e) => setComMascara(`${p}_dia`, e.target.value, 'data')} disabled={bloqueada} />
        <label style={{ minWidth: 'auto', marginLeft: 4 }}>Horário:</label>
        <input className="campo-horario" placeholder="hh:mm" value={dados[`${p}_horario`]} onChange={(e) => setComMascara(`${p}_horario`, e.target.value, 'horario')} disabled={bloqueada} />
        {mostrarBotaoP && (
          <BotaoP
            onClick={() => { onCopiar('dia', numero); onCopiar('horario', numero); }}
            titulo="Copiar dia/horário para a 2ª mensagem"
          />
        )}
      </div>
      <CampoComP label="Quem oferece" nomeCampo="quem_oferece" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} />
      <CampoComP label="Resultado" nomeCampo="resultado" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} />
    </div>
  );
}

function CampoComP({ label, nomeCampo, prefixo, numero, dados, set, onCopiar, mostrarBotaoP, desabilitado }) {
  return (
    <div className="form-row">
      <label>{label}:</label>
      <input value={dados[`${prefixo}_${nomeCampo}`]} onChange={(e) => set(`${prefixo}_${nomeCampo}`, e.target.value)} disabled={desabilitado} />
      {mostrarBotaoP && (
        <BotaoP onClick={() => onCopiar(nomeCampo, numero)} titulo="Copiar para a 2ª mensagem" />
      )}
    </div>
  );
}

function BotaoP({ onClick, titulo }) {
  return (
    <button type="button" className="btn-small" title={titulo} onClick={onClick} style={{ flexShrink: 0 }}>
      P
    </button>
  );
}

function InfoSomenteLeitura({ label, valor }) {
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
  osTopo: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 10,
  },
};
