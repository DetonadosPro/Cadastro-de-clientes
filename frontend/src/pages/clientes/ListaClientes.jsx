import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';

const OPCOES_FILTRO = [
  { valor: '', label: 'Nome' },
  { valor: 'celular', label: 'Celular' },
  { valor: 'nascimento', label: 'Data de aniversário' },
  { valor: 'endereco', label: 'Endereço' },
  { valor: 'fixo', label: 'Telefone fixo' },
  { valor: 'whatsapp', label: 'WhatsApp' },
];

const MASCARA_POR_FILTRO = {
  nascimento: formatarData,
  celular: formatarCelular,
  whatsapp: formatarCelular,
  fixo: formatarFixo,
};

// Alça de arrastar — seis pontos em duas colunas, o desenho universal
// de "isso é arrastável" em interfaces de lista.
function IconeAlca() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="5" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="9" cy="19" r="1.6" />
      <circle cx="15" cy="5" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="15" cy="19" r="1.6" />
    </svg>
  );
}
function IconeMais() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconeAviso() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.3 18a1.8 1.8 0 0 0 1.5 2.7h16.4a1.8 1.8 0 0 0 1.5-2.7l-8-14.1a1.8 1.8 0 0 0-3.1 0Z" />
    </svg>
  );
}
function IconeSeta({ aberta }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Mostra ▲/▼ ao lado do nome da coluna quando ela é o critério de
// ordenação ativo, para indicar visualmente a direção corrente.
function indicadorOrdenacao(coluna, ordenarPorAtivo, direcaoAtiva) {
  if (ordenarPorAtivo !== coluna) return '';
  return direcaoAtiva === 'asc' ? ' ▲' : ' ▼';
}

export default function ListaClientes() {
  const [searchParams, setSearchParams] = useSearchParams();

  const buscaUrl = searchParams.get('busca') || '';
  const campoUrl = searchParams.get('campo') || '';
  const paginaUrl = parseInt(searchParams.get('pagina') || '1', 10);
  const ordenarPorUrl = searchParams.get('ordenarPor') || 'nome';
  const direcaoUrl = searchParams.get('direcao') || 'asc';

  const [busca, setBusca] = useState(buscaUrl);
  const [campoFiltro, setCampoFiltro] = useState(campoUrl);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [arrastandoId, setArrastandoId] = useState(null);
  const [sobreId, setSobreId] = useState(null);
  const [mesclando, setMesclando] = useState(false);
  const [sugestoesDuplicata, setSugestoesDuplicata] = useState([]);
  const [descartadas, setDescartadas] = useState(() => new Set());
  const [mesclandoAutomatico, setMesclandoAutomatico] = useState(null);
  const [duplicatasAbertas, setDuplicatasAbertas] = useState(false);
  const navigate = useNavigate();
  const { mostrarToast } = useToast();

  const acabouDeArrastar = useRef(false);

  const porPagina = 30;
  const totalPaginas = Math.max(Math.ceil(total / porPagina), 1);

  const carregar = useCallback(async (termo, pag, campo, ordenarPor, direcao) => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.clientes.listar(termo, pag, campo, ordenarPor, direcao);
      setItens(resposta.clientes);
      setTotal(resposta.total);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    setBusca(buscaUrl);
    setCampoFiltro(campoUrl);
    carregar(buscaUrl, paginaUrl, campoUrl, ordenarPorUrl, direcaoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaUrl, campoUrl, paginaUrl, ordenarPorUrl, direcaoUrl, carregar]);

  // Busca sugestões de possíveis duplicatas uma vez ao entrar na tela
  // — é uma varredura da base inteira, então não precisa refazer a
  // cada busca/paginação, só quando a lista de clientes muda de fato
  // (após uma mesclagem, por exemplo).
  const buscarSugestoes = useCallback(async () => {
    try {
      const resp = await api.clientes.possiveisDuplicatas();
      setSugestoesDuplicata(resp.pares || []);
    } catch (err) {
      // Sugestão é um "extra" — se falhar, a tela continua funcionando
      // normalmente sem ela, sem precisar mostrar erro para a pessoa.
    }
  }, []);

  useEffect(() => {
    buscarSugestoes();
  }, [buscarSugestoes]);

  function chaveDoPar(par) {
    return [par.a.id, par.b.id].sort((x, y) => x - y).join('-');
  }

  async function descartarSugestao(par) {
    const chave = chaveDoPar(par);
    // Atualiza a tela imediatamente (sem esperar a resposta do
    // servidor) para a ação parecer instantânea; se o pedido falhar,
    // a sugestão volta a aparecer na próxima visita à tela — não é
    // grave, só significa que a pessoa vai precisar descartar de novo.
    setDescartadas((antigo) => new Set(antigo).add(chave));
    try {
      await api.clientes.descartarDuplicata(par.a.id, par.b.id);
    } catch (err) {
      // Silencioso — a sugestão só volta a aparecer numa próxima
      // visita à tela, o que não atrapalha o uso atual.
    }
  }

  async function mesclarSugestao(par) {
    const chave = chaveDoPar(par);
    setMesclandoAutomatico(chave);
    try {
      const resp = await api.clientes.mesclarAutomatico(par.a.id, par.b.id);
      const vencedorNome = resp.vencedorId === par.a.id ? par.a.nome : par.b.nome;
      mostrarToast(`Clientes mesclados. Cadastro mantido: "${vencedorNome}".`);
      setDescartadas((antigo) => new Set(antigo).add(chave));
      buscarSugestoes();
      carregar(buscaUrl, paginaUrl, campoUrl, ordenarPorUrl, direcaoUrl);
    } catch (err) {
      mostrarToast('Não foi possível mesclar. Tente novamente.', 'erro');
    } finally {
      setMesclandoAutomatico(null);
    }
  }

  const sugestoesVisiveis = sugestoesDuplicata.filter((par) => !descartadas.has(chaveDoPar(par)));

  function montarParams(novaBusca, novoCampo, novaPagina, novoOrdenarPor, novaDirecao) {
    const params = {};
    if (novaBusca) params.busca = novaBusca;
    if (novoCampo) params.campo = novoCampo;
    params.pagina = String(novaPagina);
    if (novoOrdenarPor && novoOrdenarPor !== 'nome') params.ordenarPor = novoOrdenarPor;
    if (novaDirecao && novaDirecao !== 'asc') params.direcao = novaDirecao;
    return params;
  }

  function aoSubmeterBusca(e) {
    e.preventDefault();
    setSearchParams(montarParams(busca, campoFiltro, 1, ordenarPorUrl, direcaoUrl), { replace: true });
  }

  function irParaPagina(novaPagina) {
    setSearchParams(montarParams(busca, campoFiltro, novaPagina, ordenarPorUrl, direcaoUrl), { replace: true });
  }

  // Clicar numa coluna ordenável: se já é a coluna ativa, inverte a
  // direção; se é uma coluna nova, começa em ordem crescente.
  function aoClicarOrdenacao(coluna) {
    const novaDirecao = ordenarPorUrl === coluna && direcaoUrl === 'asc' ? 'desc' : 'asc';
    setSearchParams(montarParams(busca, campoFiltro, 1, coluna, novaDirecao), { replace: true });
  }

  function aoMudarFiltro(novoCampo) {
    setCampoFiltro(novoCampo);
    const mascara = MASCARA_POR_FILTRO[novoCampo];
    setBusca((atual) => (mascara ? mascara(atual) : atual));
  }

  function aoDigitarBusca(valor) {
    const mascara = MASCARA_POR_FILTRO[campoFiltro];
    setBusca(mascara ? mascara(valor) : valor);
  }

  const placeholderBusca = campoFiltro
    ? `Buscar por ${OPCOES_FILTRO.find((o) => o.valor === campoFiltro)?.label.toLowerCase()}...`
    : 'Buscar por nome...';

  function aoClicarLinha(cliente) {
    if (acabouDeArrastar.current) {
      acabouDeArrastar.current = false;
      return;
    }
    navigate(`/clientes/${cliente.id}`);
  }

  function aoIniciarArrasto(e, cliente) {
    setArrastandoId(cliente.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(cliente.id));
  }

  function aoTerminarArrasto() {
    setArrastandoId(null);
    setSobreId(null);
  }

  function aoPassarPorCima(e, cliente) {
    if (arrastandoId === null || arrastandoId === cliente.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setSobreId(cliente.id);
  }

  function aoSairDeCima(cliente) {
    if (sobreId === cliente.id) setSobreId(null);
  }

  async function aoSoltar(e, clienteDestino) {
    e.preventDefault();
    acabouDeArrastar.current = true;
    setSobreId(null);

    const origemId = arrastandoId;
    setArrastandoId(null);
    if (!origemId || origemId === clienteDestino.id) return;

    const origem = itens.find((c) => c.id === origemId);
    if (!origem) return;

    const totalPedidosOrigem = (origem.total_fonada || 0) + (origem.total_aovivo || 0);
    const confirmar = confirm(
      `Mesclar "${origem.nome}" dentro de "${clienteDestino.nome}"?\n\n` +
      `${totalPedidosOrigem} pedido(s) de "${origem.nome}" passarão para "${clienteDestino.nome}", ` +
      `e o cadastro de "${origem.nome}" será enviado para a lixeira.\n\n` +
      `Essa ação pode ser conferida depois na Lixeira.`
    );
    if (!confirmar) return;

    setMesclando(true);
    try {
      await api.clientes.mesclar(clienteDestino.id, origemId);
      mostrarToast(`"${origem.nome}" foi mesclado em "${clienteDestino.nome}".`);
      carregar(buscaUrl, paginaUrl, campoUrl, ordenarPorUrl, direcaoUrl);
    } catch (err) {
      mostrarToast('Não foi possível mesclar. Tente novamente.', 'erro');
    } finally {
      setMesclando(false);
    }
  }

  return (
    <div>
      <div style={estilos.cabecalho}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Clientes</h1>
          <p className="fs-sm" style={{ color: 'var(--tinta-suave)', margin: 0 }}>
            Cadastro único de compradores — arraste um cliente sobre outro para mesclar
          </p>
        </div>
        <button className="btn" onClick={() => navigate('/clientes/novo')} style={{ gap: 8 }}>
          <IconeMais /> Novo cliente
        </button>
      </div>

      {sugestoesVisiveis.length > 0 && (
        <div className="painel" style={estilos.avisoDuplicata}>
          <button
            type="button"
            onClick={() => setDuplicatasAbertas((v) => !v)}
            style={estilos.cabecalhoDuplicata}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--aviso)', fontWeight: 700 }}>
              <IconeAviso /> {sugestoesVisiveis.length} possível{sugestoesVisiveis.length > 1 ? 'is' : ''} duplicata{sugestoesVisiveis.length > 1 ? 's' : ''} encontrada{sugestoesVisiveis.length > 1 ? 's' : ''}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--aviso)' }}>
              <span className="fs-sm">{duplicatasAbertas ? 'Ocultar' : 'Ver'}</span>
              <IconeSeta aberta={duplicatasAbertas} />
            </span>
          </button>

          {duplicatasAbertas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {sugestoesVisiveis.map((par) => {
                const chave = chaveDoPar(par);
                return (
                  <div
                    key={chave}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                      background: '#ffffff', border: '1px solid var(--borda)', borderRadius: 8, padding: '10px 14px',
                    }}
                  >
                    <div className="fs-sm">
                      <strong>{par.a.nome}</strong>
                      <span style={{ color: 'var(--tinta-suave)' }}> ({par.a.nascimento})</span>
                      <span style={{ color: 'var(--tinta-suave)', margin: '0 6px' }}>×</span>
                      <strong>{par.b.nome}</strong>
                      <span style={{ color: 'var(--tinta-suave)' }}> ({par.b.nascimento})</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button type="button" className="btn-small" onClick={() => descartarSugestao(par)}>
                        Não é duplicata
                      </button>
                      <button
                        type="button"
                        className="btn secundario"
                        onClick={() => mesclarSugestao(par)}
                        disabled={mesclandoAutomatico === chave}
                      >
                        {mesclandoAutomatico === chave ? 'Mesclando...' : 'Mesclar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <form onSubmit={aoSubmeterBusca} style={estilos.buscaForm}>
        <select
          value={campoFiltro}
          onChange={(e) => aoMudarFiltro(e.target.value)}
          className="busca-select"
        >
          {OPCOES_FILTRO.map((o) => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder={placeholderBusca}
          value={busca}
          onChange={(e) => aoDigitarBusca(e.target.value)}
          className="busca-input"
        />
        <button type="submit" className="btn secundario">Buscar</button>
      </form>

      {erro && <p style={{ color: 'var(--selo)' }}>{erro}</p>}
      {mesclando && <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Mesclando clientes...</p>}

      {carregando ? (
        <p style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="painel" style={{ textAlign: 'center', color: 'var(--tinta-suave)' }}>
          Nenhum cliente encontrado.
        </div>
      ) : (
        <>
          <div className="painel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela-lista tabela-clientes">
                <thead>
                  <tr>
                    <th
                      onClick={() => aoClicarOrdenacao('nome')}
                      style={estilos.colunaOrdenavel}
                    >
                      Nome{indicadorOrdenacao('nome', ordenarPorUrl, direcaoUrl)}
                    </th>
                    <th>Celular</th>
                    <th>WhatsApp</th>
                    <th>Nascimento</th>
                    <th>Bairro</th>
                    <th
                      onClick={() => aoClicarOrdenacao('total_fonada')}
                      style={{ ...estilos.colunaOrdenavel, textAlign: 'center' }}
                    >
                      Fonada{indicadorOrdenacao('total_fonada', ordenarPorUrl, direcaoUrl)}
                    </th>
                    <th
                      onClick={() => aoClicarOrdenacao('total_aovivo')}
                      style={{ ...estilos.colunaOrdenavel, textAlign: 'center' }}
                    >
                      Ao vivo{indicadorOrdenacao('total_aovivo', ordenarPorUrl, direcaoUrl)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((c) => (
                    <tr
                      key={c.id}
                      draggable
                      onDragStart={(e) => aoIniciarArrasto(e, c)}
                      onDragEnd={aoTerminarArrasto}
                      onDragOver={(e) => aoPassarPorCima(e, c)}
                      onDragLeave={() => aoSairDeCima(c)}
                      onDrop={(e) => aoSoltar(e, c)}
                      onClick={() => aoClicarLinha(c)}
                      className={
                        (arrastandoId === c.id ? 'linha-arrastando ' : '') +
                        (sobreId === c.id ? 'linha-soltar-aqui' : '')
                      }
                    >
                      <td style={{ fontWeight: 700 }} data-label="Nome">
                        <span className="alca-arrastar" title="Arraste para mesclar com outro cliente"><IconeAlca /></span>
                        {c.nome}
                      </td>
                      <td data-label="Celular">{c.celular || c.fixo || '—'}</td>
                      <td data-label="WhatsApp">{c.whatsapp || '—'}</td>
                      <td data-label="Nascimento">{c.nascimento || '—'}</td>
                      <td data-label="Bairro">{c.bairro || '—'}</td>
                      <td style={{ textAlign: 'center' }} data-label="Fonada">
                        <span className="contagem-pedidos">{c.total_fonada || 0}</span>
                      </td>
                      <td style={{ textAlign: 'center' }} data-label="Ao vivo">
                        <span className="contagem-pedidos">{c.total_aovivo || 0}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={estilos.paginacao}>
            <button className="btn secundario" disabled={paginaUrl <= 1} onClick={() => irParaPagina(paginaUrl - 1)}>
              ← Anterior
            </button>
            <span className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>
              Página {paginaUrl} de {totalPaginas} — {total} cliente(s)
            </span>
            <button className="btn secundario" disabled={paginaUrl >= totalPaginas} onClick={() => irParaPagina(paginaUrl + 1)}>
              Próxima →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const estilos = {
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  buscaForm: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  paginacao: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  colunaOrdenavel: { cursor: 'pointer', userSelect: 'none' },
  avisoDuplicata: {
    borderLeft: '4px solid var(--aviso)',
    background: 'var(--aviso-suave)',
    marginBottom: 20,
  },
  cabecalhoDuplicata: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
