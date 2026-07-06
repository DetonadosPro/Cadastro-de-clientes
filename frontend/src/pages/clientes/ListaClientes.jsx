import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarData } from '../../mascaras.js';

const OPCOES_FILTRO = [
  { valor: '', label: 'Nome' },
  { valor: 'nascimento', label: 'Data de aniversário' },
  { valor: 'celular', label: 'Celular' },
  { valor: 'endereco', label: 'Endereço' },
];

const MASCARA_POR_FILTRO = {
  nascimento: formatarData,
  celular: formatarCelular,
};

export default function ListaClientes() {
  const [searchParams, setSearchParams] = useSearchParams();

  const buscaUrl = searchParams.get('busca') || '';
  const campoUrl = searchParams.get('campo') || '';
  const paginaUrl = parseInt(searchParams.get('pagina') || '1', 10);

  const [busca, setBusca] = useState(buscaUrl);
  const [campoFiltro, setCampoFiltro] = useState(campoUrl);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [arrastandoId, setArrastandoId] = useState(null);
  const [sobreId, setSobreId] = useState(null);
  const [mesclando, setMesclando] = useState(false);
  const navigate = useNavigate();
  const { mostrarToast } = useToast();

  const acabouDeArrastar = useRef(false);

  const porPagina = 30;
  const totalPaginas = Math.max(Math.ceil(total / porPagina), 1);

  const carregar = useCallback(async (termo, pag, campo) => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.clientes.listar(termo, pag, campo);
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
    carregar(buscaUrl, paginaUrl, campoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaUrl, campoUrl, paginaUrl, carregar]);

  function montarParams(novaBusca, novoCampo, novaPagina) {
    const params = {};
    if (novaBusca) params.busca = novaBusca;
    if (novoCampo) params.campo = novoCampo;
    params.pagina = String(novaPagina);
    return params;
  }

  function aoSubmeterBusca(e) {
    e.preventDefault();
    setSearchParams(montarParams(busca, campoFiltro, 1), { replace: true });
  }

  function irParaPagina(novaPagina) {
    setSearchParams(montarParams(busca, campoFiltro, novaPagina), { replace: true });
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
      carregar(buscaUrl, paginaUrl, campoUrl);
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
          <p className="fs-sm" style={{ color: '#6c757d', margin: 0 }}>
            Cadastro único de compradores — arraste um cliente sobre outro para mesclar
          </p>
        </div>
        <button className="btn" onClick={() => navigate('/clientes/novo')}>
          + Novo cliente
        </button>
      </div>

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

      {erro && <p style={{ color: '#dc3545' }}>{erro}</p>}
      {mesclando && <p className="fs-sm" style={{ color: '#6c757d' }}>Mesclando clientes...</p>}

      {carregando ? (
        <p style={{ color: '#6c757d' }}>Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="painel" style={{ textAlign: 'center', color: '#6c757d' }}>
          Nenhum cliente encontrado.
        </div>
      ) : (
        <>
          <div className="painel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela-lista">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Nascimento</th>
                    <th>Celular</th>
                    <th>Bairro</th>
                    <th style={{ textAlign: 'center' }}>Fonada</th>
                    <th style={{ textAlign: 'center' }}>Ao vivo</th>
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
                      <td style={{ fontWeight: 700 }}>
                        <span className="alca-arrastar" title="Arraste para mesclar com outro cliente">⠿</span>
                        {c.nome}
                      </td>
                      <td>{c.nascimento || '—'}</td>
                      <td>{c.celular || c.fixo || '—'}</td>
                      <td>{c.bairro || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="contagem-pedidos">{c.total_fonada || 0}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
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
            <span className="fs-sm" style={{ color: '#6c757d' }}>
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
};
