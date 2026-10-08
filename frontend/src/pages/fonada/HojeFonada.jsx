import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';
import { AvisoInline, EstadoCarregando, EstadoVazio } from '../../components/Interface.jsx';
import { filtrarVendasFonada, formatarReais, resumirVendasFonada, vendaQuitada, vendaRecall } from '../../utils/vendasFonada.js';
import NavegacaoFonada from './NavegacaoFonada.jsx';
import './fonada.css';
import './vendas-hoje.css';

export default function HojeFonada() {
  const [params, setParams] = useSearchParams();
  const busca = params.get('busca') || '';
  const status = params.get('status') || '';
  const vendedor = params.get('vendedor') || '';
  const ordem = params.get('ordem') || 'recentes';
  const [dataRef, setDataRef] = useState('');
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [atualizadoEm, setAtualizadoEm] = useState('');
  const [ultimoSelecionado, setUltimoSelecionado] = useState(() => sessionStorage.getItem('ultimaVendaFonadaSelecionada'));
  const consultaRef = useRef(null);
  const dataRefAtual = useRef('');

  const carregar = useCallback(async (inicial = false) => {
    consultaRef.current?.abort();
    const controle = new AbortController();
    consultaRef.current = controle;
    if (inicial) setCarregando(true);
    setAtualizando(true);
    setErro('');
    try {
      const resposta = await api.fonada.hoje({ signal: controle.signal });
      if (controle.signal.aborted) return;
      setDataRef(resposta.data);
      dataRefAtual.current = resposta.data;
      setItens(resposta.fonadas || []);
      setAtualizadoEm(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date()));
    } catch (err) {
      if (!controle.signal.aborted) setErro(err.message);
    } finally {
      if (!controle.signal.aborted) { setCarregando(false); setAtualizando(false); }
    }
  }, []);

  useEffect(() => {
    carregar(true);
    // Mantém o dia correto se a tela continuar aberta após meia-noite.
    const intervalo = setInterval(() => {
      const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date());
      if (dataRefAtual.current && hoje !== dataRefAtual.current) carregar();
    }, 60000);
    return () => { clearInterval(intervalo); consultaRef.current?.abort(); };
  }, [carregar]);

  const resumo = useMemo(() => resumirVendasFonada(itens), [itens]);
  const filtrados = useMemo(() => filtrarVendasFonada(itens, { busca, status, vendedor, ordem }), [itens, busca, status, vendedor, ordem]);
  const resumoFiltro = useMemo(() => resumirVendasFonada(filtrados), [filtrados]);
  const lista = useListaIncremental(filtrados, `${dataRef}:${busca}:${status}:${vendedor}:${ordem}`);
  const temFiltro = !!(busca || status || vendedor);

  useEffect(() => {
    if (carregando || !ultimoSelecionado) return;
    const indice = filtrados.findIndex((pedido) => String(pedido.id) === ultimoSelecionado);
    if (indice < 0) return;
    lista.mostrarAte(indice + 1);
    const frame = requestAnimationFrame(() => document.getElementById(`venda-fonada-${ultimoSelecionado}`)?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [carregando, filtrados, ultimoSelecionado, lista.limite]);

  function filtrar(campo, valor) {
    setParams((atuais) => {
      const proximos = new URLSearchParams(atuais);
      if (valor) proximos.set(campo, valor); else proximos.delete(campo);
      return proximos;
    }, { replace: true });
    setUltimoSelecionado(null);
    sessionStorage.removeItem('ultimaVendaFonadaSelecionada');
  }

  function limparFiltros() {
    setParams({}, { replace: true });
    setUltimoSelecionado(null);
    sessionStorage.removeItem('ultimaVendaFonadaSelecionada');
  }

  function abrir(pedido) {
    sessionStorage.setItem('ultimaVendaFonadaSelecionada', String(pedido.id));
    sessionStorage.setItem('ultimoFonadaSelecionado', String(pedido.id));
    sessionStorage.setItem('fonadaListaNavegacao', JSON.stringify(filtrados.map((item) => item.id)));
    sessionStorage.removeItem('fonadaNavegacaoContexto');
    setUltimoSelecionado(String(pedido.id));
  }

  return <div className="fonada-moderna vendas-fonada-pagina">
    <NavegacaoFonada>{carregando ? 'Consultando vendas…' : dataRef ? `${dataRef} · dia de Brasília` : 'Consulta indisponível'}</NavegacaoFonada>
    <header className="vendas-fonada-intro">
      <div><span className="vendas-fonada-eyebrow">Conferência diária</span><h1>Vendas de hoje</h1><p>Pedidos vendidos hoje, com os valores e a situação de pagamento à vista.</p></div>
      <button type="button" className="btn secundario vendas-fonada-atualizar" onClick={() => carregar()} disabled={atualizando}>
        <span aria-hidden="true">↻</span> {atualizando ? 'Atualizando…' : 'Atualizar vendas'}
      </button>
    </header>
    {erro && <AvisoInline tom="erro" titulo="Não foi possível consultar as vendas" acao={<button type="button" className="btn secundario" onClick={() => carregar(!dataRef)}>Tentar novamente</button>}>{erro}{dataRef && ' Os dados exibidos são da última consulta concluída.'}</AvisoInline>}
    {carregando ? <EstadoCarregando rotulo="Organizando as vendas de Fonada de hoje…" linhas={6} /> : !dataRef ? null : <>
      <section className="vendas-fonada-resumo" aria-label="Resumo das vendas do dia">
        <Indicador label="Vendas do dia" valor={resumo.quantidade} detalhe={`${resumo.clientes} cliente${resumo.clientes === 1 ? '' : 's'} atendido${resumo.clientes === 1 ? '' : 's'}`} />
        <Indicador label="Total vendido" valor={formatarReais(resumo.total)} detalhe={`Ticket médio ${formatarReais(resumo.ticketMedio)}`} destaque />
        <Indicador label="Vendas quitadas" valor={formatarReais(resumo.quitado)} detalhe={`${resumo.quitadas} venda${resumo.quitadas === 1 ? '' : 's'} com pagamento confirmado`} tom="quitadas" />
        <Indicador label="A receber" valor={formatarReais(resumo.aReceber)} detalhe={`${resumo.emAberto} venda${resumo.emAberto === 1 ? '' : 's'} com pagamento em aberto`} tom="abertas" />
      </section>
      {itens.length === 0 ? <EstadoVazio icone="▤" titulo="Nenhuma venda de Fonada hoje" descricao="Os pedidos vendidos neste dia aparecerão aqui assim que forem salvos." /> :
      <div className="vendas-fonada-workspace">
        <section className="vendas-fonada-painel" aria-label="Lista de vendas do dia">
          <div className="vendas-fonada-filtros">
            <label className="vendas-fonada-busca"><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar nas vendas de hoje" placeholder="Buscar cliente, senha, destinatário ou telefone" value={busca} onChange={(e) => filtrar('busca', e.target.value)} /></label>
            <div className="vendas-fonada-filtros-linha">
              <div className="vendas-fonada-status" role="group" aria-label="Filtrar por situação">
                {[['', 'Todas', resumo.quantidade], ['abertas', 'A receber', resumo.emAberto], ['quitadas', 'Quitadas', resumo.quitadas], ['recall', 'Recall', resumo.recalls]].map(([valor, label, quantidade]) =>
                  <button type="button" key={valor} aria-pressed={status === valor} onClick={() => filtrar('status', valor)}>{label}<span>{quantidade}</span></button>)}
              </div>
              <select aria-label="Ordenar vendas" value={ordem} onChange={(e) => filtrar('ordem', e.target.value)}>
                <option value="recentes">Mais recentes</option><option value="valor">Maior valor</option><option value="cliente">Nome do cliente</option>
              </select>
            </div>
            {temFiltro && <div className="vendas-fonada-resultados"><span>{filtrados.length} de {resumo.quantidade} vendas · {formatarReais(resumoFiltro.total)} neste filtro</span><button type="button" onClick={limparFiltros}>Limpar filtros</button></div>}
          </div>
          <div className="vendas-fonada-colunas" aria-hidden="true"><span>Venda</span><span>Cliente</span><span>Mensagem</span><span>Pagamento</span><span>Valor</span></div>
          {filtrados.length ? <div className="vendas-fonada-lista">
            {lista.itensVisiveis.map((pedido) => <LinhaVenda key={pedido.id} pedido={pedido} selecionada={String(pedido.id) === ultimoSelecionado} onAbrir={() => abrir(pedido)} />)}
            <BotaoMostrarMais temMais={lista.temMais} restantes={lista.restantes} onClick={lista.mostrarMais} />
          </div> : <EstadoVazio titulo="Nenhuma venda com esses filtros" descricao="Tente outro nome, senha ou situação de pagamento." />}
          <footer className="vendas-fonada-rodape"><span>{Math.min(lista.limite, filtrados.length)} de {filtrados.length} vendas exibidas</span><span>Atualizado às {atualizadoEm}</span></footer>
        </section>
        <aside className="vendas-fonada-equipe" aria-label="Vendas por vendedor">
          <div className="vendas-fonada-equipe-titulo"><span aria-hidden="true">↗</span><div><h3>Vendas por vendedor</h3><p>Participação no total do dia</p></div></div>
          <select aria-label="Filtrar por vendedor" value={vendedor} onChange={(e) => filtrar('vendedor', e.target.value)}>
            <option value="">Todos os vendedores</option>{resumo.vendedores.map((item) => <option key={item.chave} value={item.chave}>{item.nome}</option>)}
          </select>
          <div className="vendas-fonada-ranking">{resumo.vendedores.map((item) => <button type="button" key={item.chave} aria-pressed={vendedor === item.chave} onClick={() => filtrar('vendedor', vendedor === item.chave ? '' : item.chave)}>
            <span className="vendas-fonada-vendedor"><strong>{item.nome}</strong><b>{formatarReais(item.total)}</b></span>
            <span className="vendas-fonada-participacao"><span>{item.quantidade} venda{item.quantidade === 1 ? '' : 's'}</span><span>{resumo.total ? Math.round(item.total / resumo.total * 100) : 0}% do valor</span></span>
            <span className="vendas-fonada-barra" aria-hidden="true"><i style={{ width: `${resumo.total ? item.total / resumo.total * 100 : 0}%` }} /></span>
          </button>)}</div>
          <div className="vendas-fonada-origem"><span>Vendas por Recall</span><strong>{resumo.recalls}<small> de {resumo.quantidade}</small></strong><p>Retornos que viraram uma venda neste dia.</p></div>
          <p className="vendas-fonada-nota">Quitadas e a receber consideram apenas as vendas de hoje, conforme o pagamento registrado no pedido.</p>
        </aside>
      </div>}
    </>}
  </div>;
}

function Indicador({ label, valor, detalhe, destaque = false, tom = '' }) {
  return <article className={`vendas-fonada-indicador ${destaque ? 'destaque' : ''} ${tom}`}><span>{label}</span><strong>{valor}</strong><small>{detalhe}</small></article>;
}

function LinhaVenda({ pedido, selecionada, onAbrir }) {
  const quitada = vendaQuitada(pedido);
  const telefone = pedido.comprador_celular || pedido.comprador_whatsapp || pedido.comprador_fixo;
  return <Link id={`venda-fonada-${pedido.id}`} className={`venda-fonada-item ${selecionada ? 'selecionada' : ''}`} to={`/fonada/${pedido.id}`} state={{ returnTo: '/fonada/hoje' }} onClick={onAbrir} aria-label={`Abrir venda O.S. ${pedido.senha_os || pedido.id} de ${pedido.nome_comprador || 'cliente não informado'}`}>
    <span className="venda-fonada-registro"><strong>{pedido.horario_pedido || '—'}</strong><span>O.S. {pedido.senha_os || pedido.id}</span></span>
    <span className="venda-fonada-cliente"><strong>{pedido.nome_comprador || 'Cliente não informado'}</strong>{telefone && <span>{telefone}</span>}<small>Venda por {pedido.vendedor_nome || pedido.vendedor_usuario || 'não informado'}</small></span>
    <span className="venda-fonada-mensagem"><strong>{pedido.p1_para || 'Destinatário não informado'}</strong><span>{pedido.p1_tema || 'Tema não informado'}{pedido.p1_mensagem ? ` · Nº ${pedido.p1_mensagem}` : ''}</span>{pedido.p1_dia && <small>Envio {pedido.p1_dia}{pedido.p1_horario ? ` às ${pedido.p1_horario}` : ''}</small>}{pedido.p2_para && <small className="venda-fonada-segunda">2ª: {pedido.p2_para}{pedido.p2_dia ? ` · ${pedido.p2_dia}` : ''}</small>}</span>
    <span className="venda-fonada-pagamento"><span className={`venda-fonada-selo ${quitada ? 'quitada' : 'aberta'}`}>{quitada ? 'Quitada' : 'A receber'}</span><small>{quitada ? (pedido.data_pagamento ? `Pago em ${pedido.data_pagamento}` : 'Pagamento confirmado') : (pedido.cobranca ? `Cobrar ${pedido.cobranca}` : 'Cobrança sem data')}</small>{pedido.periodo && <small>{pedido.periodo}</small>}</span>
    <span className="venda-fonada-valor"><strong>{formatarReais(pedido.valor)}</strong>{vendaRecall(pedido) && <span className="venda-fonada-recall">Recall</span>}<span className="venda-fonada-abrir" aria-hidden="true">›</span></span>
  </Link>;
}
