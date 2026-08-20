import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useRascunhos } from '../../RascunhosContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData, formatarHorario, formatarCodigoNumerico, formatarValorMonetario, valorMonetarioParaNumero, numeroParaValorMonetario } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';

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

// Data de hoje sem componente de hora, para comparar com outras datas
// "no nível do dia" (sem hora atrapalhar a comparação).
function hojeSemHora() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Converte "dd/mm/aa" para Date, ou null se incompleta/inválida —
// usado na validação de data mínima ao digitar manualmente.
function textoParaData(texto) {
  const m = String(texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, aa] = m;
  const data = new Date(2000 + parseInt(aa, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  if (data.getDate() !== parseInt(dd, 10) || data.getMonth() !== parseInt(mm, 10) - 1) return null;
  return data;
}

function IconeSalvar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}
function IconeLimpar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-.9 13.1a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 6" />
    </svg>
  );
}
function IconeMaisPequeno() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconeExcluir() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v2" />
      <path d="M6 7l1 12.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5L18 7" />
    </svg>
  );
}
function IconeFechar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
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
    const novo = { ...dados, [campo]: valor };
    setDados(novo);
    setRascunhoFonada({ chave: chaveRascunho, dados: novo, cliente });
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
    if (!editando) {
      const hoje = hojeSemHora();
      const camposData = [
        { campo: 'p1_dia', rotulo: 'Dia da 1ª mensagem' },
        { campo: 'p2_dia', rotulo: 'Dia da 2ª mensagem' },
        { campo: 'cobranca', rotulo: 'Dia de cobrança' },
      ];
      for (const { campo, rotulo } of camposData) {
        const data = textoParaData(dados[campo]);
        if (data && data.getTime() < hoje.getTime()) {
          setErro(`${rotulo} não pode ser uma data anterior a hoje.`);
          return;
        }
      }
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
        <p className="fs-sm" style={{ color: 'var(--selo)', marginBottom: 12 }}>{erro}</p>
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

  // Validação em tempo real (não só ao salvar): se a data ficar
  // completa e for anterior a hoje, o aviso aparece na hora, sem
  // precisar clicar em Salvar para descobrir. Só se aplica ao criar um
  // pedido novo — editar um pedido existente com data passada é normal.
  const hoje = hojeSemHora();
  function dataNoPassado(texto) {
    if (editando) return false;
    const data = textoParaData(texto);
    return data && data.getTime() < hoje.getTime();
  }
  const p1DiaNoPassado = dataNoPassado(dados.p1_dia);
  const p2DiaNoPassado = dataNoPassado(dados.p2_dia);
  const cobrancaNoPassado = dataNoPassado(dados.cobranca);
  const algumaDataNoPassado = p1DiaNoPassado || p2DiaNoPassado || cobrancaNoPassado;

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
            <div className="section-title">Transmissão</div>
            <div className="duas-colunas-mensagem">
              <ColunaMensagem
                numero={1} dados={dados} set={set} setComMascara={setComMascara} onCopiar={copiarEntreMensagens}
                editando={editando} dataNoPassado={p1DiaNoPassado}
              />
              <ColunaMensagem
                numero={2} dados={dados} set={set} setComMascara={setComMascara} onCopiar={copiarEntreMensagens}
                bloqueada={!segundaLiberada} editando={editando} dataNoPassado={p2DiaNoPassado}
              />
            </div>
          </div>

          <div className="section-box" style={{ width: 'fit-content', maxWidth: '100%' }}>
            <div className="form-row">
              <label>Valor R$:</label>
              <input
                type="text"
                inputMode="numeric"
                className="input-valor-destaque"
                value={dados.valor}
                onChange={(e) => set('valor', formatarValorMonetario(e.target.value))}
                placeholder="0,00"
                style={{ maxWidth: 90, flex: '0 0 auto' }}
              />
              <label style={{ minWidth: 'auto', marginLeft: 8 }}>Cob. dia:</label>
              <CampoData
                placeholder="dd/mm/aa"
                value={dados.cobranca}
                onChange={(v) => setComMascara('cobranca', v, 'data')}
                minimo={!editando ? hojeSemHora() : undefined}
                style={{ maxWidth: 118, flex: '0 0 auto' }}
              />
            </div>
            {cobrancaNoPassado && (
              <p className="fs-xs" style={{ color: 'var(--selo)', marginTop: -4, marginBottom: 8 }}>
                O dia de cobrança não pode ser anterior a hoje.
              </p>
            )}
            <div className="form-row">
              <label>Período:</label>
              <input
                value={dados.periodo}
                onChange={(e) => set('periodo', e.target.value)}
                style={{ width: 292, flex: '0 0 auto' }}
              />
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
                <InfoSomenteLeitura label="WhatsApp" valor={cliente.whatsapp} />
                <InfoSomenteLeitura label="Celular" valor={cliente.celular} />
                <InfoSomenteLeitura label="Endereço" valor={cliente.endereco} />
                <InfoSomenteLeitura label="Complemento" valor={cliente.complemento} />
                <InfoSomenteLeitura label="Bairro" valor={cliente.bairro} />
                <InfoSomenteLeitura label="Referência" valor={cliente.referencia} />
              </div>
            ) : (
              <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Nenhum cliente vinculado.</p>
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
                        <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>Obs.: {item.observacao}</span>
                      )}
                      {item.remarcado_dia && (
                        <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>
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

          {erro && <p className="fs-sm" style={{ color: 'var(--selo)', marginBottom: 10 }}>{erro}</p>}

          <div className="section-box actions-grid">
            <button type="button" className="btn-action destaque" onClick={salvar} disabled={salvando || algumaDataNoPassado}>
              <IconeSalvar /> {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <div className="acoes-secundarias-mobile">
              {editando && cliente && !estaBloqueado && (
                <button type="button" className="btn-action" onClick={() => navigate(`/fonada/novo?clienteId=${cliente.id}`)}>
                  <IconeMaisPequeno /> Novo pedido
                </button>
              )}
              {editando && (
                <button type="button" className="btn-action perigo-acao" onClick={apagar}><IconeExcluir /> Excluir</button>
              )}
              <button
                type="button"
                className="btn-action fechar-acao"
                style={{ gridColumn: editando ? undefined : 'span 2', pointerEvents: 'auto' }}
                onClick={fechar}
              >
                <IconeFechar /> Fechar
              </button>
            </div>
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
              <input
                placeholder="00000"
                value={dados.recall_codigo}
                disabled={dados.recall !== 'SIM'}
                onChange={(e) => set('recall_codigo', formatarCodigoNumerico(e.target.value, 5))}
                style={{ maxWidth: 90, marginLeft: 4 }}
              />
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

// Uma coluna com todos os campos de uma mensagem específica (1ª ou
// 2ª) — as duas colunas ficam visíveis lado a lado, sem precisar
// trocar de aba para ver a outra mensagem. O botão "P" (copiar) só
// aparece na coluna da 1ª mensagem, já que o fluxo normal é preencher
// a 1ª e copiar dali para a 2ª, não o contrário. Reúne o que antes
// eram duas seções separadas ("Ordem de serviço" e "Transmissão") —
// na prática é a mesma ordem de serviço, só com campos diferentes.
function ColunaMensagem({ numero, dados, set, setComMascara, onCopiar, bloqueada, editando, dataNoPassado }) {
  const p = numero === 1 ? 'p1' : 'p2';
  const mostrarBotaoP = numero === 1;

  return (
    <div className="coluna-mensagem">
      <div className="coluna-mensagem-titulo">
        <span className={`bolinha-status ${dados[`${p}_dia`] ? 'usada' : 'livre'}`} /> {numero}ª mensagem
        {bloqueada && (
          <span className="fs-xs" style={{ color: 'var(--selo)', fontWeight: 700, marginLeft: 6, whiteSpace: 'nowrap' }}>
            — INTERURBANO
          </span>
        )}
      </div>
      <div className="form-row">
        <label>Tema:</label>
        <input
          value={dados[`${p}_tema`]}
          onChange={(e) => set(`${p}_tema`, e.target.value)}
          disabled={bloqueada}
        />
        <label style={{ minWidth: 'auto', marginLeft: 6 }}>Nº:</label>
        <input
          value={dados[`${p}_mensagem`]}
          onChange={(e) => set(`${p}_mensagem`, e.target.value)}
          disabled={bloqueada}
          style={{ maxWidth: 56, flex: '0 0 auto' }}
        />
        {mostrarBotaoP && (
          <BotaoP
            onClick={() => { onCopiar('tema', numero); onCopiar('mensagem', numero); }}
            titulo="Copiar tema/nº para a 2ª mensagem"
          />
        )}
      </div>
      <CampoComP label="Para" nomeCampo="para" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} />
      <div className="form-row">
        <label>Fixo:</label>
        <input value={dados[`${p}_fixo`]} onChange={(e) => setComMascara(`${p}_fixo`, e.target.value, 'fixo')} disabled={bloqueada} />
        <label style={{ minWidth: 'auto', marginLeft: 4 }}>Cel.:</label>
        <input value={dados[`${p}_celular`]} onChange={(e) => setComMascara(`${p}_celular`, e.target.value, 'celular')} disabled={bloqueada} />
        {mostrarBotaoP && (
          <BotaoP
            onClick={() => { onCopiar('fixo', numero); onCopiar('celular', numero); }}
            titulo="Copiar telefones para a 2ª mensagem"
          />
        )}
      </div>
      <div className="form-row">
        <label>Dia:</label>
        <CampoData
          placeholder="dd/mm/aa"
          value={dados[`${p}_dia`]}
          onChange={(v) => setComMascara(`${p}_dia`, v, 'data')}
          disabled={bloqueada}
          style={{ fontWeight: 700, flex: '1 1 60px', minWidth: 0 }}
          minimo={!editando ? hojeSemHora() : undefined}
        />
        <label style={{ minWidth: 'auto', marginLeft: 6 }}>Horário:</label>
        <input
          placeholder="hh:mm"
          value={dados[`${p}_horario`]}
          onChange={(e) => setComMascara(`${p}_horario`, e.target.value, 'horario')}
          disabled={bloqueada}
          style={{ fontWeight: 700, flex: '1 1 45px', minWidth: 0 }}
        />
        {mostrarBotaoP && (
          <BotaoP
            onClick={() => { onCopiar('dia', numero); onCopiar('horario', numero); }}
            titulo="Copiar dia/horário para a 2ª mensagem"
          />
        )}
      </div>
      {dataNoPassado && (
        <p className="fs-xs" style={{ color: 'var(--selo)', marginTop: -4, marginBottom: 6 }}>
          O dia não pode ser anterior a hoje.
        </p>
      )}
      <CampoComP label="Quem oferece" nomeCampo="quem_oferece" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} negrito />
      <CampoComP label="Resultado" nomeCampo="resultado" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} negrito cor="var(--selo)" />
    </div>
  );
}

function CampoComP({ label, nomeCampo, prefixo, numero, dados, set, onCopiar, mostrarBotaoP, desabilitado, negrito, cor }) {
  return (
    <div className="form-row">
      <label>{label}:</label>
      <input
        value={dados[`${prefixo}_${nomeCampo}`]}
        onChange={(e) => set(`${prefixo}_${nomeCampo}`, e.target.value)}
        disabled={desabilitado}
        style={{ ...(negrito ? { fontWeight: 700 } : {}), ...(cor ? { color: cor } : {}) }}
      />
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
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
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
