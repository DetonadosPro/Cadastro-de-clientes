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
function IconeBusca() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
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

function dddDoTelefone(telefone) {
  const match = String(telefone || '').match(/^\((\d{2})\)/);
  return match ? match[1] : null;
}

function pedidoInterurbano(pedido) {
  const ddds = [pedido.p1_fixo, pedido.p1_celular].map(dddDoTelefone).filter(Boolean);
  return ddds.length > 0 && !ddds.includes('34');
}

function LinhaMensagem({ numero, para, dia, horario, bloqueada, situacao }) {
  const marcada = Boolean(dia);
  const expirada = situacao?.status === 'EXPIRADA';
  const naoConcedida = situacao?.status === 'NAO_CONCEDIDA';
  const indeterminada = situacao?.status === 'INDETERMINADA';
  const indisponivel = bloqueada || expirada || naoConcedida || indeterminada;
  const descricao = expirada
    ? `Expirada em ${situacao.dataExpiracao}`
    : indeterminada
      ? 'Verificar data da compra'
      : indisponivel
      ? 'Não disponível'
      : para || (situacao?.status === 'DISPONIVEL' ? `Disponível até ${situacao.dataExpiracao}` : situacao?.status === 'UTILIZADA' ? 'Utilizada' : '');
  return (
    <div className={`resumo-mensagem ${indisponivel ? 'bloqueada' : ''}`}>
      <span className={`ponto-msg ${indisponivel ? 'bloqueada' : (marcada ? 'usada' : 'livre')}`}>{numero}ª</span>
      <span className="resumo-mensagem-destino">{descricao}</span>
      {!indisponivel && (
        <span className="resumo-mensagem-data">
          {dia ? `${dia}${horario ? ` • ${horario}` : ''}` : ''}
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

  useEffect(() => {
    if (busca === buscaUrl && campoFiltro === campoUrl) return undefined;
    const temporizador = setTimeout(() => {
      setSearchParams(montarParams(busca, campoFiltro, 1), { replace: true });
    }, 300);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, campoFiltro, buscaUrl, campoUrl, setSearchParams]);

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

  function limparBusca() {
    setBusca('');
    setCampoFiltro('');
    setSearchParams({ pagina: '1' }, { replace: true });
  }

  const placeholderBusca = campoFiltro
    ? `Buscar por ${OPCOES_FILTRO.find((o) => o.valor === campoFiltro)?.label.toLowerCase()}...`
    : 'Buscar por nome do comprador, destinatário ou telefone...';

  return (
    <div className="lista-fonada-pagina">
      <div className="lista-fonada-cabecalho">
        <div>
          <h1 style={{ marginBottom: 2 }}>Pedidos de Fonada</h1>
          <p className="fs-sm" style={{ color: 'var(--tinta-suave)', margin: 0 }}>
            Encontre e acompanhe pedidos de mensagem por telefone.
          </p>
        </div>
      </div>

      <div className="lista-fonada-busca">
        <select
          value={campoFiltro}
          onChange={(e) => aoMudarFiltro(e.target.value)}
          className="busca-select"
        >
          {OPCOES_FILTRO.map((o) => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>
        <div className="lista-fonada-campo-busca">
          <IconeBusca />
          <input
            type="text"
            placeholder={placeholderBusca}
            value={busca}
            onChange={(e) => aoDigitarBusca(e.target.value)}
            className="busca-input"
          />
        </div>
        {(buscaUrl || campoUrl) && <button type="button" className="btn secundario" onClick={limparBusca}>Limpar</button>}
      </div>

      <div className="lista-fonada-meta">
        <div className="legenda-chip">
          <IconeInfo />
          <span><span className="bolinha-status usada" /> MARCADA</span>
          <span><span className="bolinha-status livre" /> DISPONÍVEL</span>
        </div>
        {!carregando && <span className="lista-fonada-total">{total} pedido(s) encontrado(s)</span>}
      </div>

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
          <div className="painel lista-fonada-tabela-painel">
            <div style={{ overflowX: 'auto' }}>
            <table className="tabela-lista tabela-fonada">
              <thead>
                <tr>
                  <th>O.S.</th>
                  <th>Cliente</th>
                  <th>Transmissões</th>
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
                    <td data-label="Cliente">
                      <span className="lista-fonada-cliente-nome">{p.nome_comprador || '—'}</span>
                      {(p.comprador_celular || p.comprador_fixo) && (
                        <span className="lista-fonada-cliente-contato">{p.comprador_celular || p.comprador_fixo}</span>
                      )}
                    </td>
                    <td data-label="Transmissões">
                      <div className="resumo-mensagens">
                        <LinhaMensagem numero={1} para={p.p1_para} dia={p.p1_dia} horario={p.p1_horario} />
                        <LinhaMensagem numero={2} para={p.p2_para} dia={p.p2_dia} horario={p.p2_horario} bloqueada={!p.mensagemEmHaver && pedidoInterurbano(p)} situacao={p.mensagemEmHaver} />
                      </div>
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

          <div className="lista-fonada-paginacao">
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

