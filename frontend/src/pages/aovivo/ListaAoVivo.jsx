import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';
import PaginaImpressaoAoVivo from './PaginaImpressaoAoVivo.jsx';

const OPCOES_FILTRO = [
  { valor: '', label: 'Todos os campos' },
  { valor: 'os', label: 'O.S.' },
  { valor: 'comprador', label: 'Comprador' },
  { valor: 'destinatario', label: 'Destinatário' },
  { valor: 'celular_comprador', label: 'Celular do comprador' },
  { valor: 'fixo_local', label: 'Telefone fixo do local' },
  { valor: 'celular_local', label: 'Celular do local' },
  { valor: 'endereco', label: 'Endereço' },
  { valor: 'aniversario', label: 'Aniversário' },
  { valor: 'data_pedido', label: 'Data do pedido' },
  { valor: 'dia_mensagem', label: 'Dia da mensagem' },
];

const MASCARA_POR_FILTRO = {
  celular_comprador: formatarCelular,
  celular_local: formatarCelular,
  fixo_local: formatarFixo,
  aniversario: formatarData,
  data_pedido: formatarData,
  dia_mensagem: formatarData,
};

export default function ListaAoVivo() {
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
  const [selecionados, setSelecionados] = useState(new Set());
  const [pedidosImpressao, setPedidosImpressao] = useState(null);
  const [imprimindo, setImprimindo] = useState(false);
  const navigate = useNavigate();
  const { mostrarToast } = useToast();

  const porPagina = 30;
  const totalPaginas = Math.max(Math.ceil(total / porPagina), 1);

  const carregar = useCallback(async (termo, pag, campo) => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.aoVivo.listar(termo, pag, campo);
      setItens(resposta.pedidos);
      setTotal(resposta.total);
      setSelecionados(new Set());
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

  function alternarSelecao(id, e) {
    e.stopPropagation();
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodos() {
    setSelecionados((atual) => (
      atual.size === itens.length ? new Set() : new Set(itens.map((p) => p.id))
    ));
  }

  async function imprimir(ids) {
    if (ids.length === 0) {
      mostrarToast('Selecione ao menos um pedido para imprimir.', 'erro');
      return;
    }
    setImprimindo(true);
    try {
      const resp = await api.aoVivo.buscarParaImpressao(ids);
      setPedidosImpressao(resp.pedidos);
      setTimeout(() => window.print(), 100);
    } catch (err) {
      mostrarToast('Não foi possível preparar a impressão. Tente novamente.', 'erro');
    } finally {
      setImprimindo(false);
    }
  }

  const placeholderBusca = campoFiltro
    ? `Buscar por ${OPCOES_FILTRO.find((o) => o.valor === campoFiltro)?.label.toLowerCase()}...`
    : 'Buscar por comprador, destinatário, telefone ou endereço...';

  return (
    <div>
      <div className="nao-imprimir" style={estilos.cabecalho}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Mensagem ao vivo</h1>
          <p className="fs-sm" style={{ color: '#6c757d', margin: 0 }}>Pedidos de carro de som — consulta</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => imprimir(selecionados.size > 0 ? [...selecionados] : itens.map((p) => p.id))}
            disabled={imprimindo || itens.length === 0}
          >
            {selecionados.size > 0
              ? `🖨 Imprimir selecionados (${selecionados.size})`
              : `🖨 Imprimir tudo (${itens.length})`}
          </button>
        </div>
      </div>

      <form onSubmit={aoSubmeterBusca} className="nao-imprimir" style={estilos.buscaForm}>
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

      {erro && <p className="nao-imprimir" style={{ color: '#dc3545' }}>{erro}</p>}

      {carregando ? (
        <p className="nao-imprimir" style={{ color: '#6c757d' }}>Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="painel nao-imprimir" style={{ textAlign: 'center', color: '#6c757d' }}>
          Nenhum pedido encontrado.
        </div>
      ) : (
        <>
          <div className="painel nao-imprimir" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
            <table className="tabela-lista">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selecionados.size === itens.length}
                      onChange={alternarSelecionarTodos}
                      title="Selecionar todos"
                    />
                  </th>
                  <th>O.S.</th>
                  <th>Comprador</th>
                  <th>Para</th>
                  <th>Data</th>
                  <th>Bairro</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/ao-vivo/${p.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selecionados.has(p.id)}
                        onChange={(e) => alternarSelecao(p.id, e)}
                      />
                    </td>
                    <td>
                      <span className="carimbo-os carimbo-os-lista">
                        {p.numero_os || p.id}
                      </span>
                    </td>
                    <td>{p.comprador}</td>
                    <td>{p.para || '—'}</td>
                    <td>{p.dia_entrega} {p.horario_entrega ? `— ${p.horario_entrega}` : ''}</td>
                    <td>{p.bairro || '—'}</td>
                    <td>{p.valor != null ? `R$ ${p.valor.toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="nao-imprimir" style={estilos.paginacao}>
            <button className="btn secundario" disabled={paginaUrl <= 1} onClick={() => irParaPagina(paginaUrl - 1)}>
              ← Anterior
            </button>
            <span className="fs-sm" style={{ color: '#6c757d' }}>
              Página {paginaUrl} de {totalPaginas} — {total} pedido(s)
            </span>
            <button className="btn secundario" disabled={paginaUrl >= totalPaginas} onClick={() => irParaPagina(paginaUrl + 1)}>
              Próxima →
            </button>
          </div>
        </>
      )}

      {pedidosImpressao && (
        <div className="somente-imprimir">
          <PaginaImpressaoAoVivo pedidos={pedidosImpressao} />
        </div>
      )}
    </div>
  );
}

const estilos = {
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  buscaForm: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  paginacao: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
};
