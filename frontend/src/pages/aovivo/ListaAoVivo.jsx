import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarData } from '../../mascaras.js';
import PaginaImpressaoAoVivo from './PaginaImpressaoAoVivo.jsx';
import { AvisoInline, CabecalhoPagina, EstadoCarregando, EstadoVazio, Paginacao } from '../../components/Interface.jsx';

function IconeBusca() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function IconeImprimir() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

const OPCOES_FILTRO = [
  { valor: '', label: 'Todos os campos' },
  { valor: 'aniversario', label: 'Aniversário cliente' },
  { valor: 'celular_comprador', label: 'Celular cliente' },
  { valor: 'dia_mensagem', label: 'Dia mensagem' },
  { valor: 'endereco', label: 'Endereço' },
  { valor: 'comprador', label: 'Nome cliente' },
  { valor: 'destinatario', label: 'Nome destinatário' },
  { valor: 'os', label: 'O.S.' },
];

const MASCARA_POR_FILTRO = {
  celular_comprador: formatarCelular,
  aniversario: formatarData,
  dia_mensagem: formatarData,
};

// Converte "dd/mm/aa" ou "dd/mm/aaaa" num Date para comparação. Datas
// mal formatadas ou vazias retornam null (tratadas como "sem data").
function paraData(dataBr) {
  if (!dataBr) return null;
  const m = String(dataBr).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, dd, mm, anoStr] = m;
  const ano = anoStr.length === 2 ? 2000 + parseInt(anoStr, 10) : parseInt(anoStr, 10);
  return new Date(ano, parseInt(mm, 10) - 1, parseInt(dd, 10));
}

function formatarReais(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusEntrega(pedido) {
  const resultado = String(pedido.resultado_entrega || '').trim().toUpperCase();
  if (resultado.startsWith('NÃO ENTREGUE') || resultado.startsWith('NAO ENTREGUE')) return 'nao-entregue';
  if (resultado.startsWith('ENTREGUE')) return 'entregue';

  const dataEntrega = paraData(pedido.dia_entrega);
  if (!dataEntrega) return 'futuro';

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  dataEntrega.setHours(0, 0, 0, 0);

  if (dataEntrega > hoje) return 'futuro';
  if (dataEntrega.getTime() === hoje.getTime()) return 'hoje';
  return 'passado';
}

// Indicador visual de status de entrega, usado na coluna da listagem.
// Usa a mesma linguagem de "carimbo de data" das outras telas: tag
// compacta em fonte mono, cor por significado (verde = entregue,
// vermelho = pendente/atrasado). 'futuro' não mostra nada — a data
// ainda não chegou, não há o que indicar.
function IndicadorEntrega({ status }) {
  if (status === 'entregue') return <span className="tag ok">Entregue</span>;
  if (status === 'nao-entregue') return <span className="tag pendente">Não entregue</span>;
  if (status === 'hoje') return <span className="tag aviso">Hoje</span>;
  if (status === 'passado') return <span className="tag neutro">Evento passado</span>;
  return <span className="tag neutro">Agendado</span>;
}

function IndicadorPagamento({ pedido }) {
  return <span className={`tag ${pedido.pagou === 'SIM' ? 'ok' : 'pendente'}`}>{pedido.pagou === 'SIM' ? 'Recebido' : 'A receber'}</span>;
}

function pagamentoEhPrazo(pagamento) {
  return /^PRAZO(?:\s|-|$)/i.test(String(pagamento || '').trim());
}

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
  const [ultimoSelecionado, setUltimoSelecionado] = useState(null);
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

  // Ao voltar da tela de um pedido, destaca e rola até o item em que a
  // pessoa clicou por último, para retomar de onde parou na lista.
  useEffect(() => {
    if (carregando || itens.length === 0) return;
    const idSalvo = sessionStorage.getItem('ultimoAoVivoSelecionado');
    if (!idSalvo) return;
    setUltimoSelecionado(idSalvo);
    const elemento = document.getElementById(`aovivo-${idSalvo}`);
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
      // A lista já traz o status financeiro atualizado. Mesclá-lo ao
      // retorno de impressão mantém o recibo correto mesmo enquanto uma
      // instância antiga do backend ainda não expõe os novos campos.
      const porId = new Map(itens.filter((item) => ids.includes(item.id)).map((item) => [item.id, item]));
      const pedidosComPagamento = (resp.pedidos || []).map((pedido) => {
        const origem = porId.get(pedido.id) || {};
        const usarOrigemSeVazio = (valorApi, valorOrigem) => (
          valorApi == null || String(valorApi).trim() === '' ? valorOrigem : valorApi
        );
        return {
          ...origem,
          ...pedido,
          pagou: usarOrigemSeVazio(pedido.pagou, origem.pagou),
          data_pagou: usarOrigemSeVazio(pedido.data_pagou, origem.data_pagou ?? origem.dataPagamento),
          valor_recebido: usarOrigemSeVazio(pedido.valor_recebido, origem.valor_recebido ?? origem.valorRecebido),
          forma_recebimento: usarOrigemSeVazio(pedido.forma_recebimento, origem.forma_recebimento ?? origem.formaRecebimento),
          pagamento_recebido_por: usarOrigemSeVazio(pedido.pagamento_recebido_por, origem.pagamento_recebido_por ?? origem.recebidoPor),
        };
      });
      setPedidosImpressao(pedidosComPagamento);
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
    <div className="lista-aovivo-pagina">
      <CabecalhoPagina
        className="nao-imprimir"
        contexto="Pedidos"
        titulo="Ao vivo"
        descricao="Acompanhe eventos, locais de entrega e pagamentos com leitura rápida."
        meta={!carregando ? `${total} pedido${total === 1 ? '' : 's'}` : null}
        acoes={<div className="lista-aovivo-acoes-topo">
          <button
            type="button"
            className="btn secundario"
            onClick={() => imprimir(selecionados.size > 0 ? [...selecionados] : itens.map((p) => p.id))}
            disabled={imprimindo || itens.length === 0}
          >
            <IconeImprimir />
            {selecionados.size > 0
              ? `Imprimir selecionados (${selecionados.size})`
              : `Imprimir página (${itens.length})`}
          </button>
        </div>}
      />

      <div className="nao-imprimir lista-aovivo-busca">
        <select
          value={campoFiltro}
          onChange={(e) => aoMudarFiltro(e.target.value)}
          className="busca-select"
        >
          {OPCOES_FILTRO.map((o) => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>
        <div className="lista-aovivo-campo-busca">
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

      <div className="nao-imprimir lista-aovivo-meta">
        {!carregando && <span>{total} pedido(s) encontrado(s)</span>}
        {selecionados.size > 0 && <span className="lista-aovivo-selecionados">{selecionados.size} selecionado(s)</span>}
      </div>

      {erro && <AvisoInline className="nao-imprimir" tom="erro" titulo="Não foi possível carregar os pedidos">{erro}</AvisoInline>}

      {carregando ? (
        <EstadoCarregando className="nao-imprimir" rotulo="Carregando pedidos Ao Vivo…" linhas={7} />
      ) : itens.length === 0 ? (
        <EstadoVazio className="nao-imprimir" icone="♪" titulo="Nenhum pedido encontrado" descricao={buscaUrl ? 'Revise o termo ou limpe os filtros para ampliar os resultados.' : 'Novos pedidos Ao Vivo são criados a partir da ficha do cliente.'} acao={buscaUrl ? <button className="btn secundario" onClick={limparBusca}>Limpar busca</button> : null} />
      ) : (
        <>
          <div className="painel nao-imprimir lista-aovivo-tabela-painel">
            <div style={{ overflowX: 'auto' }}>
            <table className="tabela-lista tabela-aovivo">
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
                  <th>Cliente</th>
                  <th>Evento</th>
                  <th>Destinatário e local</th>
                  <th>Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((p) => (
                  <tr
                    key={p.id}
                    id={`aovivo-${p.id}`}
                    className={ultimoSelecionado === String(p.id) ? 'linha-ultimo-selecionado' : ''}
                    onClick={() => {
                      sessionStorage.setItem('ultimoAoVivoSelecionado', String(p.id));
                      navigate(`/ao-vivo/${p.id}`);
                    }}
                  >
                    <td data-label="Selecionar" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selecionados.has(p.id)}
                        onChange={(e) => alternarSelecao(p.id, e)}
                      />
                    </td>
                    <td data-label="O.S.">
                      <span className="carimbo-os carimbo-os-lista">
                        {p.numero_os || p.id}
                      </span>
                    </td>
                    <td data-label="Cliente">
                      <span className="lista-aovivo-cliente-nome">{p.comprador || '—'}</span>
                      {(p.celular || p.celular2) && <span className="lista-aovivo-detalhe">{p.celular || p.celular2}</span>}
                    </td>
                    <td data-label="Evento">
                      <div className="lista-aovivo-evento">
                        <span className="lista-aovivo-evento-data">{p.dia_entrega || 'Sem data'}{p.horario_entrega ? ` • ${p.horario_entrega}` : ''}</span>
                        <IndicadorEntrega status={statusEntrega(p)} />
                      </div>
                    </td>
                    <td data-label="Destino">
                      {p.para && <span className="lista-aovivo-destino">{p.para}</span>}
                      {(p.endereco || p.bairro) && <span className="lista-aovivo-detalhe">{[p.endereco, p.bairro].filter(Boolean).join(' • ')}</span>}
                    </td>
                    <td data-label="Pagamento">
                      <div className="lista-aovivo-pagamento">
                        <span className="lista-aovivo-valor">{p.valor != null ? formatarReais(p.valor) : '—'}</span>
                        <IndicadorPagamento pedido={p} />
                        {pagamentoEhPrazo(p.pagamento) && <span className="tag aviso">Prazo</span>}
                      </div>
                      {p.pagamento && <span className="lista-aovivo-detalhe">{p.pagamento}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <Paginacao pagina={paginaUrl} totalPaginas={totalPaginas} total={total} rotulo="pedidos" onAnterior={() => irParaPagina(paginaUrl - 1)} onProxima={() => irParaPagina(paginaUrl + 1)} className="nao-imprimir lista-aovivo-paginacao" />
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

