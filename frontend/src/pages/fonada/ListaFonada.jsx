import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';

function IconeInfo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.1" />
    </svg>
  );
}

const OPCOES_FILTRO = [
  { valor: '', label: 'Todos os campos' },
  { valor: 'aniversario', label: 'Aniversário cliente' },
  { valor: 'celular_comprador', label: 'Celular cliente' },
  { valor: 'celular_destinatario', label: 'Celular destinatário' },
  { valor: 'dia_mensagem', label: 'Dia mensagem' },
  { valor: 'endereco', label: 'Endereço' },
  { valor: 'fixo_comprador', label: 'Fixo cliente' },
  { valor: 'fixo_destinatario', label: 'Fixo destinatário' },
  { valor: 'nome_comprador', label: 'Nome cliente' },
  { valor: 'destinatario', label: 'Nome destinatário' },
  { valor: 'os', label: 'O.S.' },
];

const MASCARA_POR_FILTRO = {
  fixo_comprador: formatarFixo,
  fixo_destinatario: formatarFixo,
  celular_comprador: formatarCelular,
  celular_destinatario: formatarCelular,
  aniversario: formatarData,
  dia_mensagem: formatarData,
};

function formatarReais(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Mostra o nome do destinatário com o dia agendado da mensagem logo
// abaixo, em fonte menor — assim dá para ver na própria lista para
// quando cada mensagem está marcada, sem abrir o pedido.
function CelulaDestinatario({ nome, dia }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
      <span>{nome || '—'}</span>
      {dia && (
        <span className="fs-xs" style={{ color: 'var(--tinta-suave)', fontVariantNumeric: 'tabular-nums' }}>
          {dia}
        </span>
      )}
    </div>
  );
}

export default function ListaFonada() {
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
  const [ultimoSelecionado, setUltimoSelecionado] = useState(null);
  const navigate = useNavigate();

  const porPagina = 30;
  const totalPaginas = Math.max(Math.ceil(total / porPagina), 1);

  const carregar = useCallback(async (termo, pag, campo) => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.fonada.listar(termo, pag, campo);
      setItens(resposta.fonadas);
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

  // Ao voltar da tela de um pedido, destaca e rola até o item em que a
  // pessoa clicou por último, para retomar de onde parou na lista.
  useEffect(() => {
    if (carregando || itens.length === 0) return;
    const idSalvo = sessionStorage.getItem('ultimoFonadaSelecionado');
    if (!idSalvo) return;
    setUltimoSelecionado(idSalvo);
    const elemento = document.getElementById(`fonada-${idSalvo}`);
    if (elemento) {
      elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [carregando, itens]);

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
    : 'Buscar por nome do comprador, destinatário ou telefone...';

  return (
    <div>
      <div style={estilos.cabecalho}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Mensagem fonada</h1>
          <p className="fs-sm" style={{ color: 'var(--tinta-suave)', margin: 0 }}>
            Pedidos de mensagem por telefone — consulta
          </p>
        </div>
      </div>

      <div className="legenda-chip">
        <IconeInfo />
        <span><span className="bolinha-status usada" /> MARCADA</span>
        <span><span className="bolinha-status livre" /> DISPONÍVEL</span>
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

      {erro && <p style={{ color: 'var(--selo)' }}>{erro}</p>}

      {carregando ? (
        <p style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="painel" style={{ textAlign: 'center', color: 'var(--tinta-suave)' }}>
          {buscaUrl
            ? 'Nenhum pedido encontrado com esses filtros.'
            : 'Nenhum pedido de mensagem fonada ainda. Novos pedidos são criados a partir da ficha do cliente.'}
        </div>
      ) : (
        <>
          <div className="painel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
            <table className="tabela-lista tabela-fonada">
              <thead>
                <tr>
                  <th>O.S.</th>
                  <th>Cliente</th>
                  <th className="col-somente-desktop">Destinatário 1</th>
                  <th className="col-somente-desktop">Destinatário 2</th>
                  <th>Mensagens</th>
                  <th>Venda</th>
                  <th>Recall</th>
                  <th>Valor</th>
                  <th>Pagou</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((p) => (
                  <tr
                    key={p.id}
                    id={`fonada-${p.id}`}
                    className={ultimoSelecionado === String(p.id) ? 'linha-ultimo-selecionado' : ''}
                    onClick={() => {
                      sessionStorage.setItem('ultimoFonadaSelecionado', String(p.id));
                      // Salva a lista de IDs da página atual (na mesma
                      // ordem exibida) para permitir navegar entre os
                      // resultados da busca sem precisar voltar à lista.
                      // Também salva o contexto da busca/página, para o
                      // formulário poder buscar a página seguinte ou
                      // anterior sob demanda quando o Anterior/Próximo
                      // chegar na borda da página atual.
                      sessionStorage.setItem('fonadaListaNavegacao', JSON.stringify(itens.map((x) => x.id)));
                      sessionStorage.setItem('fonadaNavegacaoContexto', JSON.stringify({
                        busca: buscaUrl, campo: campoUrl, pagina: paginaUrl, totalPaginas,
                      }));
                      navigate(`/fonada/${p.id}`);
                    }}
                  >
                    <td data-label="O.S.">
                      <span className="carimbo-os carimbo-os-lista">
                        {p.senha_os || p.id}
                      </span>
                    </td>
                    <td data-label="Cliente">{p.nome_comprador}</td>
                    <td data-label="Destinatário 1" className="col-somente-desktop">
                      <CelulaDestinatario nome={p.p1_para} dia={p.p1_dia} />
                    </td>
                    <td data-label="Destinatário 2" className="col-somente-desktop">
                      <CelulaDestinatario nome={p.p2_para} dia={p.p2_dia} />
                    </td>
                    <td data-label="Mensagens">
                      <span className="indicador-msgs">
                        <span
                          className={`ponto-msg ${p.p1_dia ? 'usada' : 'livre'}`}
                          title={p.p1_dia ? `1ª mensagem marcada para ${p.p1_dia}` : '1ª mensagem ainda disponível'}
                        >
                          1ª
                        </span>
                        <span
                          className={`ponto-msg ${p.p2_dia ? 'usada' : 'livre'}`}
                          title={p.p2_dia ? `2ª mensagem marcada para ${p.p2_dia}` : '2ª mensagem ainda disponível'}
                        >
                          2ª
                        </span>
                      </span>
                    </td>
                    <td data-label="Venda">{p.data_pedido || '—'}</td>
                    <td data-label="Recall">
                      <span className={`tag ${p.recall === 'SIM' ? 'ok' : 'neutro'}`}>
                        {p.recall === 'SIM' ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td data-label="Valor">{p.valor != null ? formatarReais(p.valor) : '—'}</td>
                    <td data-label="Pagou">
                      <span className={`tag ${p.pagou === 'SIM' ? 'ok' : 'pendente'}`}>
                        {p.pagou === 'SIM' ? 'Pago' : 'Pendente'}
                      </span>
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
              Página {paginaUrl} de {totalPaginas} — {total} pedido(s)
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
