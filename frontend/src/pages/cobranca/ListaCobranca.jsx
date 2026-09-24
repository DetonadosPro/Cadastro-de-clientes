import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarData } from '../../mascaras.js';
import PaginaImpressaoRecibos from './PaginaImpressaoRecibos.jsx';
import CampoData from '../../components/CampoData.jsx';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';
import { AvisoInline, Dialogo, EstadoCarregando, EstadoVazio } from '../../components/Interface.jsx';
import { linkWhatsAppCobranca } from '../../utils/mensagemCobranca.js';

function dataLocalFormatada(deslocamento = 0) {
  const data = new Date();
  data.setDate(data.getDate() + deslocamento);
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${String(data.getFullYear()).slice(-2)}`;
}

function intervaloMesAtual() {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const ano = String(hoje.getFullYear()).slice(-2);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  return {
    recebidasInicio: `01/${mes}/${ano}`,
    recebidasFim: `${String(ultimoDia).padStart(2, '0')}/${mes}/${ano}`,
  };
}

function hojeSemHora() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje;
}

function dataBrParaUtc(valor) {
  const partes = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!partes) return null;
  const ano = Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]);
  return Date.UTC(ano, Number(partes[2]) - 1, Number(partes[1]));
}

function diferencaParaHoje(dataBr) {
  const alvo = dataBrParaUtc(dataBr);
  if (alvo == null) return null;
  const hoje = new Date();
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - hojeUtc) / 86400000);
}

function estaNaSemana(diff) {
  if (diff == null || diff < 0) return false;
  const hoje = new Date();
  return diff <= 7 - (hoje.getDay() || 7);
}

function formatarReais(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function somarPedidos(pedidos) {
  return pedidos.reduce((total, pedido) => total + Number(pedido.valor || 0), 0);
}

function dataDaAgenda(pedido) {
  return pedido.cobrancaReagendada || pedido.cobranca;
}

function valorInformado(valor) {
  const texto = String(valor || '').trim();
  return texto && texto !== '0' && texto !== '-' ? texto : '';
}

function foiRecebidoNoMesAtual(pedido) {
  const partes = String(pedido.dataPagamento || '').match(/^\d{2}\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!partes) return false;
  const hoje = new Date();
  const ano = Number(partes[2].length === 2 ? `20${partes[2]}` : partes[2]);
  return Number(partes[1]) === hoje.getMonth() + 1 && ano === hoje.getFullYear();
}

function rotuloUrgencia(pedido) {
  if (pedido.pagou === 'SIM') return pedido.dataPagamento ? `Recebido em ${pedido.dataPagamento}` : 'Recebido';
  const diff = diferencaParaHoje(pedido.cobranca);
  if (diff == null) return 'Sem data';
  if (diff < 0) return `${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'} atrasada`;
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return `Daqui a ${diff} dias`;
}

function classeUrgencia(pedido) {
  if (pedido.pagou === 'SIM') return 'recebida';
  const diff = diferencaParaHoje(pedido.cobranca);
  if (diff == null) return 'sem-data';
  if (diff < 0) return 'atrasada';
  if (diff === 0) return 'hoje';
  return 'futura';
}

function filtrarPorSituacao(pedidos, filtro) {
  if (filtro === 'recebidas') return pedidos;
  return pedidos.filter((pedido) => {
    const diffOriginal = diferencaParaHoje(pedido.cobranca);
    const diffAgenda = diferencaParaHoje(dataDaAgenda(pedido));
    if (filtro === 'atrasadas') return diffOriginal != null && diffOriginal < 0;
    if (filtro === 'hoje') return diffAgenda === 0;
    if (filtro === 'amanha') return diffAgenda === 1;
    if (filtro === 'semana') return estaNaSemana(diffAgenda);
    if (filtro === 'proximas') return diffAgenda != null && diffAgenda > 0;
    if (filtro === 'sem_data') return diffAgenda == null;
    return true;
  });
}

function agruparPedidos(pedidos) {
  const mapa = new Map();
  for (const pedido of pedidos) {
    const cliente = pedido.cliente_id ? `cliente-${pedido.cliente_id}` : `nome-${String(pedido.nome || '').trim().toUpperCase()}`;
    const dataAgenda = dataDaAgenda(pedido);
    const chave = `${cliente}-${dataAgenda || 'sem-data'}-${pedido.pagou === 'SIM' ? 'pago' : 'pendente'}`;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave, nome: pedido.nome || 'Cliente não informado', cobranca: pedido.cobranca,
        cobrancaReagendada: pedido.cobrancaReagendada, dataAgenda,
        cliente_id: pedido.cliente_id, whatsapp: pedido.whatsapp || pedido.celular,
        endereco: pedido.endereco, complemento: pedido.complemento,
        bairro: pedido.bairro, referencia: pedido.referencia, pedidos: [],
      });
    }
    mapa.get(chave).pedidos.push(pedido);
  }
  return [...mapa.values()]
    .map((grupo) => ({ ...grupo, valorTotal: somarPedidos(grupo.pedidos) }))
    .sort((a, b) => {
      if (a.pedidos[0].pagou === 'SIM' && b.pedidos[0].pagou === 'SIM') {
        return String(b.pedidos[0].dataPagamento || '').localeCompare(String(a.pedidos[0].dataPagamento || ''));
      }
      const diffA = diferencaParaHoje(a.dataAgenda);
      const diffB = diferencaParaHoje(b.dataAgenda);
      if (diffA == null) return 1;
      if (diffB == null) return -1;
      return diffA - diffB || a.nome.localeCompare(b.nome);
    });
}

function IconeImpressora() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M6 14h12v7H6z" /></svg>;
}
function IconeWhatsApp() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-4.7A8.5 8.5 0 1 1 20.5 11.5Z" /><path d="M8.1 7.8c.3-.7.7-.7 1-.7h.4c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.6.8c-.2.2-.1.4 0 .6.7 1.2 1.7 2.1 2.9 2.7.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.5 0 .3-.2 1.5-1 2.1-.6.5-1.4.8-2.3.6-1.1-.2-2.6-.8-4.4-2.4-1.5-1.4-2.5-3.1-2.8-4.2-.3-1 0-1.9.3-2.5Z" /></svg>;
}
function IconeAbrir() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8" /><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>;
}

function reciboJaImpresso(pedido) {
  const valor = String(pedido.impresso || '').trim().toUpperCase();
  return valor !== '' && valor !== 'NÃO' && valor !== 'NAO' && valor !== '0';
}

export default function ListaCobranca({ mostrarCabecalho = true }) {
  const [parametrosUrl, setParametrosUrl] = useSearchParams();
  const [cobrarDia, setCobrarDia] = useState('');
  const [filtroRapido, setFiltroRapido] = useState(() => parametrosUrl.get('filtro') || 'todas');
  const [formaFiltro, setFormaFiltro] = useState(() => {
    const forma = parametrosUrl.get('forma');
    return ['presencial', 'pix'].includes(forma) ? forma : 'todos';
  });
  const [nome, setNome] = useState(() => parametrosUrl.get('nome') || '');
  const [os, setOs] = useState(() => parametrosUrl.get('os') || '');

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setParametrosUrl((atuais) => {
        const novos = new URLSearchParams(atuais);
        if (filtroRapido && filtroRapido !== 'todas') novos.set('filtro', filtroRapido); else novos.delete('filtro');
        if (formaFiltro !== 'todos') novos.set('forma', formaFiltro); else novos.delete('forma');
        if (nome) novos.set('nome', nome); else novos.delete('nome');
        if (os) novos.set('os', os); else novos.delete('os');
        return novos;
      }, { replace: true });
    }, 200);
    return () => clearTimeout(temporizador);
  }, [filtroRapido, formaFiltro, nome, os, setParametrosUrl]);
  const [pendentes, setPendentes] = useState([]);
  const [recebidas, setRecebidas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [jaBuscou, setJaBuscou] = useState(false);
  const [erro, setErro] = useState('');
  const [expandidos, setExpandidos] = useState(new Set());
  const [selecionados, setSelecionados] = useState(new Set());
  const [pedidosImpressao, setPedidosImpressao] = useState([]);
  const [confirmacaoImpressao, setConfirmacaoImpressao] = useState([]);
  const [pedidosBaixa, setPedidosBaixa] = useState([]);
  const [dataBaixa, setDataBaixa] = useState('');
  const [statusBaixa, setStatusBaixa] = useState('');
  const [salvandoBaixa, setSalvandoBaixa] = useState(false);
  const [pedidosReagendar, setPedidosReagendar] = useState([]);
  const [pedidoDesfazer, setPedidoDesfazer] = useState(null);
  const [salvandoDesfazer, setSalvandoDesfazer] = useState(false);
  const [novaData, setNovaData] = useState('');
  const [salvandoReagendamento, setSalvandoReagendamento] = useState(false);
  const ultimaBusca = useRef(0);
  const navigate = useNavigate();
  const { mostrarToast } = useToast();
  const recebidasNoMes = useMemo(() => recebidas.filter(foiRecebidoNoMesAtual), [recebidas]);
  const pagasOrdenadas = useMemo(() => [...recebidas].sort((a, b) => {
    const dataA = dataBrParaUtc(a.dataPagamento) ?? 0;
    const dataB = dataBrParaUtc(b.dataPagamento) ?? 0;
    return dataB - dataA || Number(b.id || 0) - Number(a.id || 0);
  }), [recebidas]);

  const pedidosFiltrados = useMemo(() => {
    let pedidos;
    if (filtroRapido === 'pagas') pedidos = pagasOrdenadas;
    else if (filtroRapido === 'recebidas') pedidos = recebidasNoMes;
    else if (filtroRapido === 'data') pedidos = pendentes;
    else pedidos = filtrarPorSituacao(pendentes, filtroRapido);
    if (formaFiltro === 'todos') return pedidos;
    return pedidos.filter((pedido) => String(pedido.formaPagamento || '').toLowerCase() === formaFiltro);
  }, [filtroRapido, formaFiltro, pendentes, pagasOrdenadas, recebidasNoMes]);
  const lista = useListaIncremental(pedidosFiltrados, `${filtroRapido}:${formaFiltro}:${cobrarDia}:${nome}:${os}`);
  const pedidosVisiveis = lista.itensVisiveis;
  const grupos = useMemo(() => agruparPedidos(pedidosVisiveis), [pedidosVisiveis]);
  // A lista exibida é ordenada por grupos (data/urgência e cliente). A impressão
  // precisa percorrer essa mesma sequência, não a ordem original da API nem a
  // ordem em que as caixas foram marcadas.
  const pedidosNaOrdemDaLista = useMemo(() => grupos.flatMap((grupo) => grupo.pedidos), [grupos]);
  const pedidosSelecionados = useMemo(
    () => pedidosNaOrdemDaLista.filter((pedido) => selecionados.has(pedido.id)),
    [pedidosNaOrdemDaLista, selecionados],
  );
  const todosVisiveisSelecionados = pedidosVisiveis.length > 0 && pedidosVisiveis.every((pedido) => selecionados.has(pedido.id));
  const atrasadas = pendentes.filter((p) => (diferencaParaHoje(p.cobranca) ?? 1) < 0);
  const paraHoje = pendentes.filter((p) => diferencaParaHoje(dataDaAgenda(p)) === 0);
  const futuras = pendentes.filter((p) => (diferencaParaHoje(dataDaAgenda(p)) ?? -1) > 0);

  useEffect(() => {
    const idBusca = ++ultimaBusca.current;
    const dataIncompleta = filtroRapido === 'data' && cobrarDia !== '' && !/^\d{2}\/\d{2}\/\d{2}$/.test(cobrarDia);
    if (dataIncompleta) {
      setCarregando(false);
      return undefined;
    }

    const espera = nome.trim() || os.trim() ? 350 : 100;
    const temporizador = setTimeout(() => {
      buscar({ filtro: filtroRapido, cobrarDia, nome, os, idBusca });
    }, espera);

    return () => clearTimeout(temporizador);
    // A busca acompanha automaticamente todos os filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobrarDia, filtroRapido, nome, os]);

  async function buscar(opcoes = {}) {
    const idBusca = opcoes.idBusca ?? ++ultimaBusca.current;
    setCarregando(true); setErro(''); setJaBuscou(true);
    try {
      const filtroDaBusca = opcoes.filtro ?? filtroRapido;
      const dataDaBusca = opcoes.cobrarDia ?? cobrarDia;
      const nomeDaBusca = opcoes.nome ?? nome;
      const osDaBusca = opcoes.os ?? os;
      const dataExata = filtroDaBusca === 'data' ? dataDaBusca : '';
      // O endpoint já aceita TODOS. Buscar uma vez e separar localmente
      // evita repetir a mesma leitura e a mesma junção de clientes para
      // montar as abas de pendentes e recebidas.
      const recorteRecebidas = filtroDaBusca === 'pagas' ? {} : intervaloMesAtual();
      const resp = await api.cobranca.buscar(dataExata, 'TODOS', nomeDaBusca, osDaBusca, recorteRecebidas);
      if (idBusca !== ultimaBusca.current) return;
      const pedidos = resp.pedidos || [];
      setPendentes(pedidos.filter((pedido) => String(pedido.pagou || '').toUpperCase() !== 'SIM'));
      setRecebidas(pedidos.filter((pedido) => String(pedido.pagou || '').toUpperCase() === 'SIM'));
      setExpandidos(new Set()); setSelecionados(new Set());
    } catch (err) {
      if (idBusca === ultimaBusca.current) setErro(err.message);
    } finally {
      if (idBusca === ultimaBusca.current) setCarregando(false);
    }
  }

  function aplicarFiltro(filtro) {
    setFiltroRapido((atual) => atual === filtro ? 'todas' : filtro);
    setCobrarDia('');
  }
  function aplicarFormaFiltro(forma) {
    setFormaFiltro(forma);
    setSelecionados(new Set());
    setExpandidos(new Set());
  }
  function alternarGrupo(chave) {
    setExpandidos((atual) => { const novo = new Set(atual); if (novo.has(chave)) novo.delete(chave); else novo.add(chave); return novo; });
  }
  function alternarSelecao(pedidos) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      const todosSelecionados = pedidos.every((pedido) => novo.has(pedido.id));
      pedidos.forEach((pedido) => todosSelecionados ? novo.delete(pedido.id) : novo.add(pedido.id));
      return novo;
    });
  }
  function imprimir(pedidos) {
    if (!pedidos.length) return mostrarToast('Não há pedidos para imprimir.', 'erro');
    const preparados = pedidos.map((pedido) => ({ ...pedido, impresso: 'SIM' }));
    setPedidosImpressao(preparados);
    setTimeout(() => {
      window.print();
      setConfirmacaoImpressao(preparados);
    }, 50);
  }

  async function confirmarImpressaoConcluida() {
    const pedidos = confirmacaoImpressao;
    const ids = pedidos.map((pedido) => pedido.id);
    const atualizar = (lista) => lista.map((pedido) => ids.includes(pedido.id) ? { ...pedido, impresso: 'SIM' } : pedido);
    setPendentes(atualizar);
    setRecebidas(atualizar);
    setConfirmacaoImpressao([]);
    setPedidosImpressao([]);
    try {
      await api.cobranca.marcarImpressos(ids);
    } catch (err) {
      try {
        await Promise.all(ids.map((pedidoId) => api.fonadas.atualizar(pedidoId, { impresso: 'SIM' })));
      } catch (erroFallback) {
        mostrarToast('O recibo foi aberto, mas não foi possível salvar o status de impressão.', 'erro');
      }
    }
  }

  function cancelarConfirmacaoImpressao() {
    setConfirmacaoImpressao([]);
    setPedidosImpressao([]);
  }
  function abrirBaixa(pedidos) { setPedidosBaixa(pedidos); setDataBaixa(dataLocalFormatada()); setStatusBaixa(pedidos[0]?.recebi || ''); }
  async function confirmarBaixa() {
    setSalvandoBaixa(true);
    try {
      await api.cobranca.darBaixaEmLote(pedidosBaixa.map((p) => p.id), statusBaixa, dataBaixa, Object.fromEntries(pedidosBaixa.map((p) => [p.id, p.versao])));
      mostrarToast('BAIXA DADA COM SUCESSO'); setPedidosBaixa([]); await buscar();
    } catch (err) { mostrarToast(err.message || 'Não foi possível salvar.', 'erro'); } finally { setSalvandoBaixa(false); }
  }
  function abrirReagendamento(pedidos) {
    const atual = dataDaAgenda(pedidos[0]);
    setPedidosReagendar(pedidos);
    setNovaData(diferencaParaHoje(atual) != null && diferencaParaHoje(atual) >= 0 ? atual : dataLocalFormatada(1));
  }
  async function confirmarReagendamento() {
    const diferenca = diferencaParaHoje(novaData);
    if (diferenca == null) return mostrarToast('Informe uma data válida para reagendar.', 'erro');
    if (diferenca < 0) return mostrarToast('A cobrança não pode ser reagendada para o passado.', 'erro');
    setSalvandoReagendamento(true);
    try {
      await api.cobranca.reagendarEmLote(pedidosReagendar.map((p) => p.id), novaData, Object.fromEntries(pedidosReagendar.map((p) => [p.id, p.versao])));
      mostrarToast('COBRANÇA REAGENDADA COM SUCESSO'); setPedidosReagendar([]); await buscar();
    } catch (err) { mostrarToast(err.message || 'Não foi possível reagendar.', 'erro'); } finally { setSalvandoReagendamento(false); }
  }

  async function confirmarDesfazer() {
    if (!pedidoDesfazer) return;
    setSalvandoDesfazer(true);
    try {
      await api.cobranca.darBaixa(pedidoDesfazer.id, 'NÃO', null, null, pedidoDesfazer.versao);
      mostrarToast('BAIXA DESFEITA COM SUCESSO');
      setPedidoDesfazer(null);
      await buscar();
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível desfazer a baixa.', 'erro');
    } finally {
      setSalvandoDesfazer(false);
    }
  }

  return (
    <div>
      {mostrarCabecalho && <div className="cobranca-cabecalho nao-imprimir">
        <div><h1 style={{ marginBottom: 2 }}>Cobrança</h1><p className="fs-sm texto-suave" style={{ margin: 0 }}>Organize a rota por urgência e dê baixa nos recebimentos</p></div>
        {pedidosVisiveis.length > 0 && <div className="cobranca-acoes-impressao">
          {pedidosSelecionados.length > 0 && <button type="button" className="btn-small" onClick={() => setSelecionados(new Set())}>Limpar seleção</button>}
          <button type="button" className="btn cobranca-imprimir" onClick={() => imprimir(pedidosSelecionados.length > 0 ? pedidosSelecionados : pedidosNaOrdemDaLista)}>
            <IconeImpressora /> {pedidosSelecionados.length > 0 ? `Imprimir selecionados (${pedidosSelecionados.length})` : `Imprimir lista (${pedidosVisiveis.length})`}
          </button>
        </div>}
      </div>}

      <div className="painel cobranca-filtros nao-imprimir">
        <div className="cobranca-atalhos">
          {[
            ['atrasadas', 'Atrasadas'], ['hoje', 'Hoje'], ['amanha', 'Amanhã'],
            ['semana', 'Esta semana'], ['proximas', 'Próximas'], ['pagas', 'Recebidas'], ['recebidas', 'Recebidas no mês'],
          ].map(([valor, rotulo]) => <button key={valor} type="button" className={filtroRapido === valor ? 'ativo' : ''} onClick={() => aplicarFiltro(valor)}>{rotulo}</button>)}
        </div>
        <div className="cobranca-campos-filtro">
          <div className="campo"><label>Data exata</label><CampoData placeholder="dd/mm/aa" value={cobrarDia} onChange={(v) => { const data = formatarData(v); setCobrarDia(data); setFiltroRapido(data ? 'data' : 'todas'); }} /></div>
          <div className="campo cobranca-filtro-os"><label>O.S.</label><input value={os} onChange={(e) => setOs(e.target.value)} placeholder="Número exato" /></div>
          <div className="campo cobranca-filtro-nome"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do comprador" /></div>
          <div className="campo cobranca-filtro-forma">
            <label htmlFor="cobranca-forma-impressao">Forma para impressão</label>
            <select id="cobranca-forma-impressao" value={formaFiltro} onChange={(e) => aplicarFormaFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="presencial">Presencial</option>
              <option value="pix">PIX</option>
            </select>
          </div>
        </div>
      </div>

      {pedidosSelecionados.length > 0 && (
        <div className="cobranca-barra-selecao nao-imprimir" role="region" aria-label="Ações para cobranças selecionadas">
          <div>
            <span className="selecao-contagem">{pedidosSelecionados.length}</span>
            <strong>{pedidosSelecionados.length === 1 ? 'cobrança selecionada' : 'cobranças selecionadas'}</strong>
            <small>Escolha todos os resultados visíveis ou imprima somente a seleção.</small>
          </div>
          <div className="cobranca-barra-selecao-acoes">
            <button type="button" className="btn-small" onClick={() => alternarSelecao(pedidosVisiveis)}>
              {todosVisiveisSelecionados ? 'Desmarcar todos' : `Selecionar todos (${pedidosVisiveis.length})`}
            </button>
            <button type="button" className="btn-small" onClick={() => setSelecionados(new Set())}>Limpar seleção</button>
            <button type="button" className="btn cobranca-imprimir" onClick={() => imprimir(pedidosSelecionados)}>
              <IconeImpressora /> Imprimir selecionados ({pedidosSelecionados.length})
            </button>
          </div>
        </div>
      )}

      {erro && <AvisoInline className="nao-imprimir" tom="erro" titulo="Não foi possível atualizar as cobranças">{erro}</AvisoInline>}
      {jaBuscou && !carregando && (
        <div className="grade-resumo-cobranca-operacional nao-imprimir">
          <ResumoCobranca titulo="Atrasadas" pedidos={atrasadas} classe="atrasada" onClick={() => aplicarFiltro('atrasadas')} />
          <ResumoCobranca titulo="Para hoje" pedidos={paraHoje} classe="hoje" onClick={() => aplicarFiltro('hoje')} />
          <ResumoCobranca titulo="Próximas" pedidos={futuras} classe="futura" onClick={() => aplicarFiltro('proximas')} />
          <ResumoCobranca titulo="Recebidas no mês" pedidos={recebidasNoMes} classe="recebida" onClick={() => aplicarFiltro('recebidas')} />
          <ResumoCobranca titulo="Total pendente" pedidos={pendentes} classe="total" onClick={() => aplicarFiltro('todas')} />
        </div>
      )}

      {!jaBuscou ? <EstadoCarregando className="nao-imprimir" rotulo="Carregando cobranças…" linhas={4} />
        : carregando ? <EstadoCarregando className="nao-imprimir" rotulo="Atualizando cobranças…" linhas={4} />
          : grupos.length === 0 ? <EstadoVazio className="nao-imprimir cobranca-estado-vazio" icone="R$" titulo="Nenhuma cobrança neste grupo" descricao="Altere o período, a situação ou os dados de busca para consultar outros recebimentos." />
            : <>
              <ListaGrupos grupos={grupos} pedidosVisiveis={pedidosVisiveis} expandidos={expandidos} selecionados={selecionados} alternarGrupo={alternarGrupo} alternarSelecao={alternarSelecao} imprimir={imprimir} abrirBaixa={abrirBaixa} abrirReagendamento={abrirReagendamento} abrirDesfazer={setPedidoDesfazer} navigate={navigate} />
              <BotaoMostrarMais temMais={lista.temMais} restantes={lista.restantes} onClick={lista.mostrarMais} />
            </>}

      {pedidosBaixa.length > 0 && (
        <Modal titulo={`Dar baixa — ${pedidosBaixa[0].nome || 'cliente não informado'}`} onClose={() => setPedidosBaixa([])}>
          <div className="resumo-modal-cobranca"><strong>{pedidosBaixa.length} pedido(s)</strong><strong>{formatarReais(somarPedidos(pedidosBaixa))}</strong></div>
          <div className="campo" style={{ maxWidth: 150 }}><label>Dia do pagamento</label><CampoData placeholder="dd/mm/aa" value={dataBaixa} onChange={(v) => setDataBaixa(formatarData(v))} /></div>
          <div className="campo"><label>Observação</label><input placeholder="Observação do recebimento..." value={statusBaixa} onChange={(e) => setStatusBaixa(e.target.value)} /></div>
          <AcoesModal onCancelar={() => setPedidosBaixa([])} onConfirmar={confirmarBaixa} salvando={salvandoBaixa} rotulo="Confirmar baixa" />
        </Modal>
      )}
      {pedidosReagendar.length > 0 && (
        <Modal titulo={`Reagendar — ${pedidosReagendar[0].nome || 'cliente não informado'}`} onClose={() => setPedidosReagendar([])}>
          <p className="fs-sm texto-suave">A nova data será aplicada a {pedidosReagendar.length} pedido(s).</p>
          <div className="campo" style={{ maxWidth: 150 }}><label>Nova data</label><CampoData placeholder="dd/mm/aa" value={novaData} minimo={hojeSemHora()} onChange={(v) => setNovaData(formatarData(v))} /></div>
          <AcoesModal onCancelar={() => setPedidosReagendar([])} onConfirmar={confirmarReagendamento} salvando={salvandoReagendamento} rotulo="Reagendar" />
        </Modal>
      )}
      {pedidoDesfazer && (
        <Modal titulo={`Desfazer baixa — O.S. ${pedidoDesfazer.senha_os || pedidoDesfazer.id}`} onClose={() => setPedidoDesfazer(null)}>
          <p className="fs-sm texto-suave">O pedido voltará para as cobranças pendentes. A data e a observação do recebimento serão removidas.</p>
          <AcoesModal onCancelar={() => setPedidoDesfazer(null)} onConfirmar={confirmarDesfazer} salvando={salvandoDesfazer} rotulo="Confirmar desfazer" />
        </Modal>
      )}
      {confirmacaoImpressao.length > 0 && (
        <Modal titulo="A impressão foi concluída?" onClose={cancelarConfirmacaoImpressao}>
          <p className="fs-sm texto-suave">Confirme somente se o recibo realmente foi impresso. Se você cancelou a janela de impressão, escolha “Não, cancelei”.</p>
          <div className="resumo-modal-cobranca"><strong>{confirmacaoImpressao.length} recibo(s)</strong><strong>{formatarReais(somarPedidos(confirmacaoImpressao))}</strong></div>
          <div className="acoes-modal-cobranca">
            <button type="button" className="btn secundario" onClick={cancelarConfirmacaoImpressao}>Não, cancelei</button>
            <button type="button" className="btn" onClick={confirmarImpressaoConcluida}>Sim, foi impresso</button>
          </div>
        </Modal>
      )}
      {pedidosImpressao.length > 0 && <div className="somente-imprimir"><PaginaImpressaoRecibos pedidos={pedidosImpressao} /></div>}
    </div>
  );
}

function ListaGrupos({ grupos, pedidosVisiveis, expandidos, selecionados, alternarGrupo, alternarSelecao, imprimir, abrirBaixa, abrirReagendamento, abrirDesfazer, navigate }) {
  return (
    <div className="lista-grupos-cobranca nao-imprimir">
      <div className="lista-grupos-meta"><strong>{grupos.length} cliente(s)</strong><span>{pedidosVisiveis.length} pedido(s) · {formatarReais(somarPedidos(pedidosVisiveis))}</span></div>
      {grupos.map((grupo) => {
        const aberto = expandidos.has(grupo.chave); const primeiro = grupo.pedidos[0];
        const whatsapp = linkWhatsAppCobranca(grupo.whatsapp, grupo.nome, grupo.valorTotal);
        const quantidadeImpressos = grupo.pedidos.filter(reciboJaImpresso).length;
        return (
          <div className={`grupo-cobranca ${classeUrgencia(primeiro)}`} key={grupo.chave}>
            <div className="grupo-cobranca-principal">
              <div className="grupo-cobranca-controles">
                <CaixaSelecaoGrupo pedidos={grupo.pedidos} selecionados={selecionados} onChange={() => alternarSelecao(grupo.pedidos)} />
                <button type="button" className="grupo-cobranca-expandir" onClick={() => alternarGrupo(grupo.chave)} aria-label={aberto ? 'Recolher pedidos' : 'Expandir pedidos'}>{aberto ? '−' : '+'}</button>
              </div>
              <div className="grupo-cobranca-urgencia">
                <span>{rotuloUrgencia(primeiro)}</span>
                <small>{grupo.cobrancaReagendada ? `${grupo.cobranca || 'Sem data'} → ${grupo.cobrancaReagendada}` : grupo.cobranca || 'Sem cobrança'}</small>
              </div>
              <div className="grupo-cobranca-cliente">
                {grupo.cliente_id ? (
                  <button type="button" className="cobranca-link-cliente" onClick={() => navigate(`/clientes/${grupo.cliente_id}`)} title="Abrir cadastro do cliente">
                    <strong>{grupo.nome}</strong><IconeAbrir />
                  </button>
                ) : <strong>{grupo.nome}</strong>}
                <span>{grupo.pedidos.length} pedido(s) · O.S. {grupo.pedidos.map((p) => p.senha_os || p.id).join(', ')}</span>
              </div>
              <div className="grupo-cobranca-status-impressao">{grupo.pedidos.length > 0 && quantidadeImpressos === grupo.pedidos.length ? 'Impresso' : ''}</div>
              <div className="grupo-cobranca-valor"><strong>{formatarReais(grupo.valorTotal)}</strong><span>{[...new Set(grupo.pedidos.map((p) => p.formaPagamento))].join(' · ')}</span></div>
              <div className="grupo-cobranca-acoes">
                {whatsapp && <a className="btn-small cobranca-whatsapp" href={whatsapp} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${grupo.nome}`} title="Abrir WhatsApp"><IconeWhatsApp /></a>}
                <button type="button" className="btn-small cobranca-recibo-icone" onClick={() => imprimir(grupo.pedidos)} title={`Imprimir recibo — ${quantidadeImpressos} de ${grupo.pedidos.length} impresso(s)`} aria-label={`Imprimir recibo de ${grupo.nome}`}>
                  <IconeImpressora />
                </button>
                {primeiro.pagou !== 'SIM' && <button type="button" className="btn-small" onClick={() => abrirReagendamento(grupo.pedidos)}>Reagendar</button>}
                {primeiro.pagou !== 'SIM' && <button type="button" className="btn-small primario" onClick={() => abrirBaixa(grupo.pedidos)}>Dar baixa {grupo.pedidos.length > 1 ? 'em todos' : ''}</button>}
                {primeiro.pagou === 'SIM' && grupo.pedidos.length === 1 && <button type="button" className="btn-small" onClick={() => abrirDesfazer(primeiro)}>Desfazer baixa</button>}
              </div>
            </div>
            {aberto && <DetalhesGrupo grupo={grupo} selecionados={selecionados} alternarSelecao={alternarSelecao} imprimir={imprimir} abrirBaixa={abrirBaixa} abrirDesfazer={abrirDesfazer} navigate={navigate} />}
          </div>
        );
      })}
    </div>
  );
}

function DetalhesGrupo({ grupo, selecionados, alternarSelecao, imprimir, abrirBaixa, abrirDesfazer, navigate }) {
  return (
    <div className="grupo-cobranca-detalhes">
      <div className="grupo-cobranca-endereco">
        <div><span>Endereço</span><strong>{[valorInformado(grupo.endereco), valorInformado(grupo.complemento)].filter(Boolean).join(' - ') || 'Não informado'}</strong></div>
        <div><span>Bairro</span><strong>{valorInformado(grupo.bairro) || 'Não informado'}</strong></div>
        <div><span>Referência</span><strong>{valorInformado(grupo.referencia) || 'Não informada'}</strong></div>
      </div>
      <div className="grupo-cobranca-pedidos">
        {grupo.pedidos.map((pedido) => (
          <div className={`pedido-cobranca-individual ${grupo.pedidos.length === 1 ? 'pedido-unico' : ''}`} key={pedido.id}>
            <input type="checkbox" checked={selecionados.has(pedido.id)} onChange={() => alternarSelecao([pedido])} aria-label={`Selecionar O.S. ${pedido.senha_os || pedido.id} para impressão`} />
            <span className="carimbo-os carimbo-os-lista">{pedido.senha_os || pedido.id}</span>
            <span className="pedido-cobranca-datas"><span>Compra: {pedido.data_pedido || '—'}</span><span>Cobrança: {pedido.cobrancaReagendada ? `${pedido.cobranca || '—'} → ${pedido.cobrancaReagendada}` : pedido.cobranca || '—'}</span></span>
            <span className={`tag ${pedido.formaPagamento === 'PIX' ? 'ok' : pedido.formaPagamento === 'DEPÓSITO' ? 'aviso' : 'neutro'}`}>{pedido.formaPagamento}</span>
            <strong>{formatarReais(pedido.valor)}</strong>
            {grupo.pedidos.length > 1 && <span className={`recibo-status ${reciboJaImpresso(pedido) ? 'impresso' : ''}`}><IconeImpressora /> {reciboJaImpresso(pedido) ? 'Impresso' : 'Não impresso'}</span>}
            <div className="pedido-cobranca-acoes">
              <button type="button" className="btn-small" onClick={() => navigate(`/fonada/${pedido.id}`)}><IconeAbrir /> Abrir pedido</button>
              <button type="button" className="btn-small" onClick={() => imprimir([pedido])}>Imprimir</button>
              {pedido.pagou !== 'SIM' && <button type="button" className="btn-small primario" onClick={() => abrirBaixa([pedido])}>Dar baixa</button>}
              {pedido.pagou === 'SIM' && <button type="button" className="btn-small" onClick={() => abrirDesfazer(pedido)}>Desfazer baixa</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaixaSelecaoGrupo({ pedidos, selecionados, onChange }) {
  const referencia = useRef(null);
  const quantidade = pedidos.filter((pedido) => selecionados.has(pedido.id)).length;
  const todos = quantidade === pedidos.length;
  useEffect(() => {
    if (referencia.current) referencia.current.indeterminate = quantidade > 0 && !todos;
  }, [quantidade, todos]);
  return <input ref={referencia} type="checkbox" checked={todos} onChange={onChange} aria-label={`Selecionar ${pedidos.length} pedido(s) deste cliente para impressão`} />;
}

function ResumoCobranca({ titulo, pedidos, classe, onClick }) {
  return <button type="button" className={`resumo-cobranca-operacional ${classe}`} onClick={onClick}><span>{titulo}</span><strong>{formatarReais(somarPedidos(pedidos))}</strong><small>{pedidos.length} pedido(s)</small></button>;
}
function Modal({ titulo, onClose, children }) {
  return <Dialogo titulo={titulo} onClose={onClose} className="nao-imprimir modal-cobranca-calendario">{children}</Dialogo>;
}
function AcoesModal({ onCancelar, onConfirmar, salvando, rotulo }) {
  return <div className="acoes-modal-cobranca"><button type="button" className="btn secundario" onClick={onCancelar}>Cancelar</button><button type="button" className="btn" onClick={onConfirmar} disabled={salvando}>{salvando ? 'Salvando...' : rotulo}</button></div>;
}
