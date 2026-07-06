import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useRascunhos } from '../../RascunhosContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData, formatarHorario } from '../../mascaras.js';

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
const MAX_MENSAGENS = 4;
const MIN_MUSICAS = 2;
const MAX_MUSICAS = 6;

function dataHoraAtual() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const hh = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');
  return { data: `${dd}/${mm}/${aa}`, horario: `${hh}:${min}` };
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
    setDados((d) => {
      const novo = { ...d, [campo]: valor };
      setRascunhoAoVivo({ chave: chaveRascunho, dados: novo, cliente });
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
    setSalvando(true);
    try {
      const payload = { ...dados, valor: dados.valor === '' ? null : parseFloat(dados.valor) };
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
        <p className="fs-sm" style={{ color: '#dc3545', marginBottom: 12 }}>{erro}</p>
        <button className="btn" onClick={() => navigate('/clientes')}>Ir para Clientes</button>
      </div>
    );
  }

  return (
    <div className="form-pagina form-compacto">
      <div className="form-layout">

        <div>
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

          <div className="section-box">
            <div className="section-title">Homenageado</div>
            <div className="form-row">
              <label>Para:</label>
              <input value={dados.para} onChange={(e) => set('para', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Dia Evento:</label>
              <input placeholder="dd/mm/aa" value={dados.dia_entrega} onChange={(e) => setComMascara('dia_entrega', e.target.value, 'data')} />
              <label style={{ minWidth: 'auto', marginLeft: 4 }}>Horário:</label>
              <input placeholder="hh:mm" value={dados.horario_entrega} onChange={(e) => setComMascara('horario_entrega', e.target.value, 'horario')} />
            </div>
            <div className="form-row">
              <label>Oferecimento:</label>
              <input value={dados.oferecimento} onChange={(e) => set('oferecimento', e.target.value)} />
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
              <input value={dados.fixo_local} onChange={(e) => setComMascara('fixo_local', e.target.value, 'fixo')} />
              <label style={{ minWidth: 'auto', marginLeft: 4 }}>Cel. local:</label>
              <input value={dados.celular_local} onChange={(e) => setComMascara('celular_local', e.target.value, 'celular')} />
            </div>
          </div>

          <div className="section-box">
            <div className="section-title">Mensagem (catálogo)</div>
            {Array.from({ length: qtdMensagens }, (_, i) => i + 1).map((n) => (
              <div className="form-row" key={n}>
                <label>{qtdMensagens > 1 ? `Tema ${n}:` : 'Tema:'}</label>
                <input value={dados[`tema_${n}`]} onChange={(e) => set(`tema_${n}`, e.target.value)} />
                <label style={{ minWidth: 'auto', marginLeft: 4 }}>Código:</label>
                <input value={dados[`mensagem_codigo_${n}`]} onChange={(e) => set(`mensagem_codigo_${n}`, e.target.value)} style={{ maxWidth: 80, flex: 'none' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {qtdMensagens < MAX_MENSAGENS && (
                <button type="button" className="btn-small" onClick={adicionarMensagem}>
                  + Adicionar
                </button>
              )}
              {qtdMensagens > MIN_MENSAGENS && (
                <button type="button" className="btn-small" onClick={removerUltimaMensagem}>
                  − Remover última
                </button>
              )}
            </div>
          </div>

          <div className="section-box">
            <div className="section-title">Músicas</div>
            {Array.from({ length: qtdMusicas }, (_, i) => i + 1).map((n) => (
              <div className="form-row" key={n}>
                <label>Música {n}:</label>
                <input value={dados[`musica_${n}`]} onChange={(e) => set(`musica_${n}`, e.target.value)} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {qtdMusicas < MAX_MUSICAS && (
                <button type="button" className="btn-small" onClick={adicionarMusica}>
                  + Adicionar
                </button>
              )}
              {qtdMusicas > MIN_MUSICAS && (
                <button type="button" className="btn-small" onClick={removerUltimaMusica}>
                  − Remover última
                </button>
              )}
            </div>
          </div>

          <div className="section-box">
            <div className="section-title">Financeiro e brinde</div>
            <div className="form-row">
              <label>Valor R$:</label>
              <input type="number" step="0.01" value={dados.valor} onChange={(e) => set('valor', e.target.value)} style={{ fontWeight: 700 }} />
              <label style={{ minWidth: 'auto', marginLeft: 4 }}>Pagamento:</label>
              <input value={dados.pagamento} onChange={(e) => set('pagamento', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Brinde:</label>
              <input value={dados.brinde} onChange={(e) => set('brinde', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Obs.:</label>
              <input value={dados.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <div style={estilos.osTopo}>
            {dados.numero_os
              ? <span className="carimbo-os">O.S. {dados.numero_os}</span>
              : <span className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Calculando O.S...</span>}
          </div>

          {erro && <p className="fs-sm" style={{ color: '#dc3545', marginBottom: 10 }}>{erro}</p>}

          <div className="section-box actions-grid">
            <button type="button" className="btn-action destaque" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" className="btn-action" onClick={limpar}>Limpar</button>
            {editando && cliente && (
              <button type="button" className="btn-action" onClick={() => navigate(`/ao-vivo/novo?clienteId=${cliente.id}`)}>
                + Novo pedido
              </button>
            )}
            {editando && (
              <button type="button" className="btn-action perigo-acao" onClick={apagar}>Excluir</button>
            )}
            <button type="button" className="btn-action fechar-acao" style={{ gridColumn: editando ? undefined : 'span 2' }} onClick={fechar}>
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
        </div>

      </div>
    </div>
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
