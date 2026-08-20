import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useRascunhos } from '../../RascunhosContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData, formatarHorario, formatarValorMonetario, valorMonetarioParaNumero, numeroParaValorMonetario } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';
import CampoComSugestoes from '../../components/CampoComSugestoes.jsx';
import CampoSelecao from '../../components/CampoSelecao.jsx';

const VAZIO = {
  numero_os: '', cliente_id: null, data_pedido: '', horario_pedido: '', dia_entrega: '', horario_entrega: '',
  para: '', oferecimento: '',
  endereco: '', bairro: '', referencia: '',
  fixo_local: '', celular_local: '',
  tema_1: '', mensagem_codigo_1: '', tema_2: '', mensagem_codigo_2: '',
  tema_3: '', mensagem_codigo_3: '', tema_4: '', mensagem_codigo_4: '',
  musica_1: '', musica_2: '', musica_3: '', musica_4: '', musica_5: '', musica_6: '',
  valor: '', pagamento: '', brinde: '', observacoes: '',
};

const MIN_MENSAGENS = 1;
const MAX_MENSAGENS = 2;
const MIN_MUSICAS = 2;
const MAX_MUSICAS = 4;

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

// O campo de pagamento continua sendo salvo como um texto único (sem
// mudar o schema do banco), mas agora montado a partir de escolhas
// clicáveis em vez de digitado livremente. Essas funções convertem
// entre o texto salvo e as partes que a interface mostra.
//
// Formatos possíveis:
//   "PIX" / "DINHEIRO"
//   "CARTÃO - CRÉDITO" / "CARTÃO - DÉBITO"
//   "PRAZO - DIA 15 - MP - PIX" (dia de pagamento + forma do MP)
//
// Pedidos antigos com texto livre não batem em nenhum desses padrões
// — nesse caso, forma fica null (nenhuma pílula marcada) e o texto
// original não é mexido até a pessoa escolher uma opção nova.
function parsearPagamento(texto) {
  const t = String(texto || '').trim();
  if (t === 'PIX' || t === 'DINHEIRO') {
    return { forma: t, tipoCartao: '', diaPag: '', formaMp: '' };
  }
  const matchCartao = t.match(/^CARTÃO(?: - (CRÉDITO|DÉBITO))?$/);
  if (matchCartao) {
    return { forma: 'CARTÃO', tipoCartao: matchCartao[1] || '', diaPag: '', formaMp: '' };
  }
  const matchPrazo = t.match(/^PRAZO(?: - DIA ([\d/]*))?(?: - MP - (PIX|DINHEIRO|CARTÃO))?$/);
  if (matchPrazo) {
    return { forma: 'PRAZO', tipoCartao: '', diaPag: matchPrazo[1] || '', formaMp: matchPrazo[2] || '' };
  }
  return { forma: '', tipoCartao: '', diaPag: '', formaMp: '', textoOriginal: t };
}

function montarPagamento({ forma, tipoCartao, diaPag, formaMp }) {
  if (forma === 'PIX' || forma === 'DINHEIRO') return forma;
  if (forma === 'CARTÃO') return tipoCartao ? `CARTÃO - ${tipoCartao}` : 'CARTÃO';
  if (forma === 'PRAZO') {
    let partes = ['PRAZO'];
    if (diaPag) partes.push(`DIA ${diaPag}`);
    if (formaMp) partes.push('MP', formaMp);
    return partes.join(' - ');
  }
  return '';
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

export default function FormAoVivo() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const clienteIdUrl = searchParams.get('clienteId');
  const editando = Boolean(id);
  const navigate = useNavigate();
  const { rascunhoAoVivo, setRascunhoAoVivo, limparRascunhoAoVivo } = useRascunhos();
  const { mostrarToast } = useToast();

  const chaveRascunho = editando ? `editar-${id}` : 'novo';

  const [dados, setDados] = useState(VAZIO);
  const [cliente, setCliente] = useState(null);
  const [qtdMensagens, setQtdMensagens] = useState(MIN_MENSAGENS);
  const [qtdMusicas, setQtdMusicas] = useState(MIN_MUSICAS);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  function contarPreenchidos(d, prefixo, minimo, maximo) {
    for (let i = maximo; i > minimo; i--) {
      if (d[`${prefixo}_${i}`] && d[`${prefixo}_${i}`].trim()) return i;
    }
    return minimo;
  }
  function contarMensagensPreenchidas(d) {
    for (let i = MAX_MENSAGENS; i > MIN_MENSAGENS; i--) {
      if ((d[`tema_${i}`] && d[`tema_${i}`].trim()) || (d[`mensagem_codigo_${i}`] && d[`mensagem_codigo_${i}`].trim())) {
        return i;
      }
    }
    return MIN_MENSAGENS;
  }

  useEffect(() => {
    if (rascunhoAoVivo && rascunhoAoVivo.chave === chaveRascunho) {
      setDados(rascunhoAoVivo.dados);
      if (rascunhoAoVivo.cliente) setCliente(rascunhoAoVivo.cliente);
      setQtdMensagens(contarMensagensPreenchidas(rascunhoAoVivo.dados));
      setQtdMusicas(contarPreenchidos(rascunhoAoVivo.dados, 'musica', MIN_MUSICAS, MAX_MUSICAS));
      setCarregando(false);
      return;
    }

    if (!editando) {
      if (!clienteIdUrl) {
        setErro('Nenhum cliente selecionado. Volte e abra o pedido pela ficha do cliente.');
        setCarregando(false);
        return;
      }
      Promise.all([api.clientes.buscar(clienteIdUrl), api.aoVivo.proximaOs()])
        .then(([respCliente, respOs]) => {
          const { data, horario } = dataHoraAtual();
          const inicial = {
            ...VAZIO,
            cliente_id: Number(clienteIdUrl),
            data_pedido: data,
            horario_pedido: horario,
            numero_os: respOs.proximaOs,
          };
          setDados(inicial);
          setCliente(respCliente.cliente);
          setQtdMensagens(MIN_MENSAGENS);
          setQtdMusicas(MIN_MUSICAS);
          setRascunhoAoVivo({ chave: chaveRascunho, dados: inicial, cliente: respCliente.cliente });
        })
        .catch((err) => setErro(err.message))
        .finally(() => setCarregando(false));
      return;
    }

    api.aoVivo.buscar(id)
      .then((pedido) => {
        const normalizado = { ...VAZIO };
        Object.keys(VAZIO).forEach((campo) => { normalizado[campo] = pedido[campo] ?? ''; });
        normalizado.valor = numeroParaValorMonetario(pedido.valor);
        setDados(normalizado);
        setQtdMensagens(contarMensagensPreenchidas(normalizado));
        setQtdMusicas(contarPreenchidos(normalizado, 'musica', MIN_MUSICAS, MAX_MUSICAS));
        if (pedido.cliente_id) {
          return api.clientes.buscar(pedido.cliente_id).then((resp) => setCliente(resp.cliente));
        }
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editando, clienteIdUrl]);

  function set(campo, valor) {
    const novo = { ...dados, [campo]: valor };
    setDados(novo);
    setRascunhoAoVivo({ chave: chaveRascunho, dados: novo, cliente });
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

  function adicionarMensagem() {
    setQtdMensagens((n) => Math.min(n + 1, MAX_MENSAGENS));
  }
  function removerUltimaMensagem() {
    set(`tema_${qtdMensagens}`, '');
    set(`mensagem_codigo_${qtdMensagens}`, '');
    setQtdMensagens((n) => Math.max(n - 1, MIN_MENSAGENS));
  }

  function adicionarMusica() {
    setQtdMusicas((n) => Math.min(n + 1, MAX_MUSICAS));
  }
  function removerUltimaMusica() {
    set(`musica_${qtdMusicas}`, '');
    setQtdMusicas((n) => Math.max(n - 1, MIN_MUSICAS));
  }

  function limpar() {
    const preservado = { ...VAZIO, cliente_id: dados.cliente_id, numero_os: dados.numero_os };
    setDados(preservado);
    setQtdMensagens(MIN_MENSAGENS);
    setQtdMusicas(MIN_MUSICAS);
    setRascunhoAoVivo({ chave: chaveRascunho, dados: preservado, cliente });
  }

  async function salvar() {
    setErro('');
    if (!dados.cliente_id) {
      setErro('Nenhum cliente vinculado a este pedido.');
      return;
    }
    if (!editando) {
      const diaEvento = textoParaData(dados.dia_entrega);
      if (diaEvento && diaEvento.getTime() < hojeSemHora().getTime()) {
        setErro('O dia do evento não pode ser uma data anterior a hoje.');
        return;
      }
    }
    setSalvando(true);
    try {
      const payload = { ...dados, valor: valorMonetarioParaNumero(dados.valor) };
      if (editando) {
        await api.aoVivo.atualizar(id, payload);
        limparRascunhoAoVivo();
        mostrarToast('Pedido salvo com sucesso.');
      } else {
        const novo = await api.aoVivo.criar(payload);
        limparRascunhoAoVivo();
        mostrarToast('Pedido salvo com sucesso.');
        navigate(`/ao-vivo/${novo.id}`, { replace: true });
      }
    } catch (err) {
      setErro(err.message);
      mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!confirm('Tem certeza que deseja excluir este pedido? Essa ação não pode ser desfeita.')) return;
    try {
      await api.aoVivo.apagar(id);
      limparRascunhoAoVivo();
      if (cliente) navigate(`/clientes/${cliente.id}`);
      else navigate('/ao-vivo');
    } catch (err) {
      setErro(err.message);
    }
  }

  function fechar() {
    limparRascunhoAoVivo();
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else if (cliente) {
      navigate(`/clientes/${cliente.id}`);
    } else {
      navigate('/ao-vivo');
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

  const estaBloqueado = !!cliente?.bloqueado;
  const pagamentoParseado = parsearPagamento(dados.pagamento);

  // Validação em tempo real (não só ao salvar): se a pessoa digitar uma
  // data passada manualmente — sem usar o calendário, que já bloqueia
  // isso visualmente — o aviso aparece assim que a data fica completa,
  // sem precisar clicar em Salvar para descobrir.
  const diaEventoDigitado = !editando ? textoParaData(dados.dia_entrega) : null;
  const diaEventoNoPassado = diaEventoDigitado && diaEventoDigitado.getTime() < hojeSemHora().getTime();

  return (
    <div className="form-pagina form-compacto pagina-aovivo-ampliada">
      {estaBloqueado && (
        <div className="aviso-bloqueio" style={{ marginBottom: 16 }}>
          <strong>Cliente bloqueado.</strong> Este pedido está travado para edição — só é possível visualizar.
          {cliente.bloqueio_motivo && <> Motivo: {cliente.bloqueio_motivo}</>}
        </div>
      )}
      <div className={`form-layout ${estaBloqueado ? 'form-bloqueado' : ''}`}>

        <div>
          <div className="section-box">
            <div className="section-title">Homenageado</div>
            <div className="form-row">
              <label>Para:</label>
              <input value={dados.para} onChange={(e) => set('para', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Dia Evento:</label>
              <CampoData
                placeholder="dd/mm/aa"
                value={dados.dia_entrega}
                onChange={(v) => setComMascara('dia_entrega', v, 'data')}
                style={{ maxWidth: 110, flex: '0 0 auto' }}
                minimo={!editando ? hojeSemHora() : undefined}
              />
              <label style={{ minWidth: 'auto', marginLeft: 4 }}>Horário:</label>
              <input
                placeholder="hh:mm"
                value={dados.horario_entrega}
                onChange={(e) => setComMascara('horario_entrega', e.target.value, 'horario')}
                style={{ maxWidth: 70, flex: '0 0 auto' }}
              />
            </div>
            {diaEventoNoPassado && (
              <p className="fs-xs" style={{ color: 'var(--selo)', marginTop: -6, marginBottom: 8 }}>
                O dia do evento não pode ser uma data anterior a hoje.
              </p>
            )}
            <div className="form-row">
              <label>Oferecimento:</label>
              <textarea
                value={dados.oferecimento}
                onChange={(e) => set('oferecimento', e.target.value)}
                rows={3}
                style={{ fontSize: 13, resize: 'vertical', flex: 1 }}
              />
            </div>
            <div className="form-row">
              <label>End.:</label>
              <input value={dados.endereco} onChange={(e) => set('endereco', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Bairro:</label>
              <input value={dados.bairro} onChange={(e) => set('bairro', e.target.value)} />
              <label style={{ minWidth: 'auto', marginLeft: 4 }}>Ref.:</label>
              <input value={dados.referencia} onChange={(e) => set('referencia', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Fixo local:</label>
              <input
                value={dados.fixo_local}
                onChange={(e) => setComMascara('fixo_local', e.target.value, 'fixo')}
                style={{ maxWidth: 118, flex: '0 0 auto' }}
              />
              <label style={{ minWidth: 'auto', marginLeft: 8 }}>Cel. local:</label>
              <input
                value={dados.celular_local}
                onChange={(e) => setComMascara('celular_local', e.target.value, 'celular')}
                style={{ maxWidth: 134, flex: '0 0 auto' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="section-box" style={{ width: 'fit-content', maxWidth: '100%' }}>
              <div className="section-title">Catálogo</div>
              <div className="subsecao-titulo">Mensagem</div>
              {Array.from({ length: qtdMensagens }, (_, i) => i + 1).map((n) => (
                <div className="form-row" key={n}>
                  <label>{qtdMensagens > 1 ? `Tema ${n}:` : 'Tema:'}</label>
                  <input
                    value={dados[`tema_${n}`]}
                    onChange={(e) => set(`tema_${n}`, e.target.value)}
                    style={{ width: 240, flex: '0 0 auto' }}
                  />
                  <label style={{ minWidth: 'auto', marginLeft: 6 }}>Código:</label>
                  <input
                    value={dados[`mensagem_codigo_${n}`]}
                    onChange={(e) => set(`mensagem_codigo_${n}`, e.target.value)}
                    style={{ width: 80, flex: '0 0 auto' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 14 }}>
                {qtdMensagens < MAX_MENSAGENS && (
                  <button type="button" className="btn-small" onClick={adicionarMensagem} style={{ gap: 4 }}>
                    <IconeMaisPequeno /> Adicionar
                  </button>
                )}
                {qtdMensagens > MIN_MENSAGENS && (
                  <button type="button" className="btn-small" onClick={removerUltimaMensagem}>
                    − Remover última
                  </button>
                )}
              </div>

              <div className="subsecao-titulo">Músicas</div>
              {Array.from({ length: qtdMusicas }, (_, i) => i + 1).map((n) => (
                <div className="form-row" key={n}>
                  <label>Música {n}:</label>
                  <input
                    value={dados[`musica_${n}`]}
                    onChange={(e) => set(`musica_${n}`, e.target.value)}
                    style={{ width: 391, flex: '0 0 auto' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {qtdMusicas < MAX_MUSICAS && (
                  <button type="button" className="btn-small" onClick={adicionarMusica} style={{ gap: 4 }}>
                    <IconeMaisPequeno /> Adicionar
                  </button>
                )}
                {qtdMusicas > MIN_MUSICAS && (
                  <button type="button" className="btn-small" onClick={removerUltimaMusica}>
                    − Remover última
                  </button>
                )}
              </div>
            </div>

            <div className="section-box" style={{ width: 'fit-content', maxWidth: '100%' }}>
              <div className="section-title">Financeiro e brinde</div>
              <div className="form-row">
                <label>Valor:</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input-valor-destaque"
                  value={dados.valor}
                  onChange={(e) => set('valor', formatarValorMonetario(e.target.value))}
                  placeholder="R$ 0,00"
                  style={{ maxWidth: 110, flex: '0 0 auto' }}
                />
              </div>
              <div className="form-row">
                <label>Pagamento:</label>
                <CampoSelecao
                  opcoes={['PIX', 'DINHEIRO', 'CARTÃO', 'PRAZO']}
                  value={pagamentoParseado.forma}
                  onChange={(forma) => set('pagamento', montarPagamento({ ...pagamentoParseado, forma, tipoCartao: '', diaPag: '', formaMp: '' }))}
                  placeholder="Escolher..."
                  style={{ width: 105, flex: '0 0 auto' }}
                />
                {pagamentoParseado.forma === 'CARTÃO' && (
                  <CampoSelecao
                    opcoes={['DÉBITO', 'CRÉDITO']}
                    value={pagamentoParseado.tipoCartao}
                    onChange={(tipoCartao) => set('pagamento', montarPagamento({ ...pagamentoParseado, tipoCartao }))}
                    placeholder="Escolher..."
                    style={{ width: 90, flex: '0 0 auto', marginLeft: 6 }}
                  />
                )}
              </div>
              {pagamentoParseado.forma === 'PRAZO' && (
                <>
                  <div className="form-row">
                    <label>Dia pag.:</label>
                    <CampoData
                      placeholder="dd/mm/aa"
                      value={pagamentoParseado.diaPag}
                      onChange={(v) => {
                        const mascarado = formatarData(v);
                        set('pagamento', montarPagamento({ ...pagamentoParseado, diaPag: mascarado }));
                      }}
                      minimo={!editando ? hojeSemHora() : undefined}
                      style={{ width: 112, flex: '0 0 auto' }}
                    />
                  </div>
                  <div className="form-row">
                    <label>Mod. pag.:</label>
                    <CampoSelecao
                      opcoes={['PIX', 'DINHEIRO', 'CARTÃO']}
                      value={pagamentoParseado.formaMp}
                      onChange={(formaMp) => set('pagamento', montarPagamento({ ...pagamentoParseado, formaMp }))}
                      placeholder="Escolher..."
                      style={{ width: 105, flex: '0 0 auto' }}
                    />
                  </div>
                </>
              )}
              <div className="form-row">
                <label>Brinde:</label>
                <CampoComSugestoes
                  value={dados.brinde}
                  onChange={(v) => set('brinde', v)}
                  sugestoes={['Bombom', 'Champagne']}
                  placeholder="Bombom, Champagne..."
                  style={{ width: 240, flex: '0 0 auto' }}
                />
              </div>
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
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className="fs-lg" style={{ fontWeight: 700 }}>{cliente.nome}</span>
                  <span className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>
                    Nasc.: {cliente.nascimento || '—'}
                  </span>
                </div>
                <div className="grade grade-3" style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--papel-alt)' }}>
                  <InfoSomenteLeitura label="Fixo" valor={cliente.fixo} />
                  <InfoSomenteLeitura label="Celular" valor={cliente.celular} />
                  <InfoSomenteLeitura label="WhatsApp" valor={cliente.whatsapp} />
                </div>
                <div className="grade grade-3">
                  <InfoSomenteLeitura label="Endereço" valor={[cliente.endereco, cliente.complemento].filter(Boolean).join(' — ')} />
                  <InfoSomenteLeitura label="Bairro" valor={cliente.bairro} />
                  <InfoSomenteLeitura label="Referência" valor={cliente.referencia} />
                </div>
              </>
            ) : (
              <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Nenhum cliente vinculado.</p>
            )}
          </div>
        </div>

        <div>
          <div style={estilos.osTopo}>
            {dados.numero_os
              ? <span className="carimbo-os">O.S. {dados.numero_os}</span>
              : <span className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Calculando O.S...</span>}
          </div>

          {erro && <p className="fs-sm" style={{ color: 'var(--selo)', marginBottom: 10 }}>{erro}</p>}

          <div className="section-box actions-grid">
            <button type="button" className="btn-action destaque" onClick={salvar} disabled={salvando || diaEventoNoPassado}>
              <IconeSalvar /> {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <div className="acoes-secundarias-mobile">
              {editando && cliente && !estaBloqueado && (
                <button type="button" className="btn-action" onClick={() => navigate(`/ao-vivo/novo?clienteId=${cliente.id}`)}>
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
        </div>

      </div>
    </div>
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
