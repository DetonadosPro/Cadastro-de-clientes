import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarData } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';
import { AvisoInline, Dialogo, EstadoCarregando, EstadoVazio } from '../../components/Interface.jsx';
import { linkWhatsAppCobranca } from '../../utils/mensagemCobranca.js';

function hojeBr() {
  const data = new Date();
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${String(data.getFullYear()).slice(-2)}`;
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
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  return data;
}

function dataUtc(valor) {
  const partes = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!partes) return null;
  const ano = Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]);
  return Date.UTC(ano, Number(partes[2]) - 1, Number(partes[1]));
}

function diasAte(valor) {
  const alvo = dataUtc(valor);
  const agora = new Date();
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return alvo == null ? null : Math.round((alvo - hoje) / 86400000);
}

function reais(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formaInicial(pedido) {
  const texto = String(pedido?.pagamentoPrevisto || '').toUpperCase();
  if (texto.includes('PIX')) return 'PIX';
  if (texto.includes('DINHEIRO')) return 'DINHEIRO';
  if (texto.includes('CART')) return 'CARTÃO';
  if (texto.includes('DEP')) return 'DEPÓSITO';
  return 'PRESENCIAL';
}

function IconeWhatsAppAntigo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 11.5a8.5 8.5 0 1 1-12.6 7.4L3 20.5l1.6-4.7A8.5 8.5 0 0 1 20.5 11.5Z" />
      <path d="M8.1 7.8c.3-.7.7-.7 1-.7h.4c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.6.8c-.2.2-.1.4 0 .6.7 1.2 1.7 2.1 2.9 2.7.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.5 0 .3-.2 1.5-1 2.1-.6.5-1.4.8-2.3.6-1.1-.2-2.6-.8-4.4-2.4-1.5-1.4-2.5-3.1-2.8-4.2-.3-1 0-1.9.3-2.5Z" />
    </svg>
  );
}

function IconeWhatsApp() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-4.7A8.5 8.5 0 1 1 20.5 11.5Z" /><path d="M8.1 7.8c.3-.7.7-.7 1-.7h.4c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.6.8c-.2.2-.1.4 0 .6.7 1.2 1.7 2.1 2.9 2.7.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.5 0 .3-.2 1.5-1 2.1-.6.5-1.4.8-2.3.6-1.1-.2-2.6-.8-2.8-4.2-.3-1 0-1.9.3-2.5Z" /></svg>;
}

function IconeWhatsAppReferencia() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-4.7A8.5 8.5 0 1 1 20.5 11.5Z" /><path d="M8.1 7.8c.3-.7.7-.7 1-.7h.4c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.6.8c-.2.2-.1.4 0 .6.7 1.2 1.7 2.1 2.9 2.7.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.5 0 .3-.2 1.5-1 2.1-.6.5-1.4.8-2.3.6-1.1-.2-2.6-.8-4.4-2.4-1.5-1.4-2.5-3.1-2.8-4.2-.3-1 0-1.9.3-2.5Z" /></svg>;
}

function rotuloData(pedido) {
  if (pedido.pagou === 'SIM') {
    const recebimento = dataUtc(pedido.dataPagamento);
    const vencimento = dataUtc(pedido.dataCobranca);
    if (recebimento != null && vencimento != null && recebimento < vencimento) {
      const dias = Math.round((vencimento - recebimento) / 86400000);
      return `Antecipado em ${dias} dia${dias === 1 ? '' : 's'}`;
    }
    return pedido.dataPagamento ? `Recebido em ${pedido.dataPagamento}` : 'Recebido';
  }
  const dias = diasAte(pedido.dataCobranca);
  if (dias == null) return 'Sem data';
  if (dias < 0) return `${Math.abs(dias)} dia${dias === -1 ? '' : 's'} atrasada`;
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return `Daqui a ${dias} dias`;
}

export default function CobrancaAoVivo({ mostrarCabecalho = true }) {
  const [parametrosUrl, setParametrosUrl] = useSearchParams();
  const [pendentes, setPendentes] = useState([]);
  const [recebidas, setRecebidas] = useState([]);
  const [filtro, setFiltro] = useState(() => parametrosUrl.get('avFiltro') || 'pendentes');
  const [nome, setNome] = useState(() => parametrosUrl.get('avNome') || '');
  const [os, setOs] = useState(() => parametrosUrl.get('avOs') || '');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [baixa, setBaixa] = useState(null);
  const [dataPagamento, setDataPagamento] = useState('');
  const [valorRecebido, setValorRecebido] = useState('');
  const [formaRecebimento, setFormaRecebimento] = useState('PIX');
  const [reagendar, setReagendar] = useState(null);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setParametrosUrl((atuais) => {
        const novos = new URLSearchParams(atuais);
        if (filtro && filtro !== 'pendentes') novos.set('avFiltro', filtro); else novos.delete('avFiltro');
        if (nome) novos.set('avNome', nome); else novos.delete('avNome');
        if (os) novos.set('avOs', os); else novos.delete('avOs');
        return novos;
      }, { replace: true });
    }, 200);
    return () => clearTimeout(temporizador);
  }, [filtro, nome, os, setParametrosUrl]);
  const [novaData, setNovaData] = useState('');
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();
  const { mostrarToast } = useToast();

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.cobranca.buscarAoVivo('TODOS', nome, os, intervaloMesAtual());
      const pedidos = resposta.pedidos || [];
      setPendentes(pedidos.filter((pedido) => String(pedido.pagou || '').toUpperCase() !== 'SIM'));
      setRecebidas(pedidos.filter((pedido) => String(pedido.pagou || '').toUpperCase() === 'SIM'));
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar as cobranças Ao Vivo.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const temporizador = setTimeout(() => carregar(), 300);
    return () => clearTimeout(temporizador);
    // A busca é intencionalmente refeita ao digitar nome ou O.S.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, os]);

  const recebidasNoMes = useMemo(() => {
    const agora = new Date();
    return recebidas.filter((pedido) => {
      const data = dataUtc(pedido.dataPagamento);
      if (data == null) return false;
      const recebimento = new Date(data);
      return recebimento.getUTCMonth() === agora.getMonth() && recebimento.getUTCFullYear() === agora.getFullYear();
    });
  }, [recebidas]);

  const visiveis = useMemo(() => {
    if (filtro === 'recebidas') return recebidasNoMes;
    if (filtro === 'atrasadas') return pendentes.filter((p) => (diasAte(p.dataCobranca) ?? 0) < 0);
    if (filtro === 'hoje') return pendentes.filter((p) => diasAte(p.dataCobranca) === 0);
    if (filtro === 'proximas') return pendentes.filter((p) => (diasAte(p.dataCobranca) ?? -1) > 0);
    return pendentes;
  }, [filtro, pendentes, recebidasNoMes]);
  const lista = useListaIncremental(visiveis, `${filtro}:${nome}:${os}`);

  function abrirBaixa(pedido) {
    setBaixa(pedido);
    setDataPagamento(hojeBr());
    setValorRecebido(String(Number(pedido.valor || 0).toFixed(2)));
    setFormaRecebimento(formaInicial(pedido));
  }

  async function confirmarBaixa() {
    setSalvando(true);
    try {
      await api.cobranca.darBaixaAoVivo(baixa.id, {
        dataPagamento,
        valorRecebido: Number(String(valorRecebido).replace(',', '.')),
        formaRecebimento,
        versao: baixa.versao,
      });
      mostrarToast('PAGAMENTO AO VIVO RECEBIDO');
      setBaixa(null);
      await carregar();
    } catch (e) {
      mostrarToast(e.message || 'Não foi possível registrar o pagamento.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function desfazer(pedido) {
    if (!window.confirm(`Desfazer a baixa da O.S. ${pedido.numero_os || pedido.id}?`)) return;
    try {
      await api.cobranca.desfazerBaixaAoVivo(pedido.id, pedido.versao);
      mostrarToast('Baixa financeira desfeita.');
      await carregar();
    } catch (e) {
      mostrarToast(e.message || 'Não foi possível desfazer.', 'erro');
    }
  }

  async function confirmarReagendamento() {
    if (diasAte(novaData) == null) {
      mostrarToast('Informe uma data válida para reagendar.', 'erro');
      return;
    }
    if (diasAte(novaData) < 0) {
      mostrarToast('A cobrança não pode ser reagendada para o passado.', 'erro');
      return;
    }
    setSalvando(true);
    try {
      await api.cobranca.reagendarAoVivo(reagendar.id, novaData, reagendar.versao);
      mostrarToast('COBRANÇA AO VIVO REAGENDADA');
      setReagendar(null);
      await carregar();
    } catch (e) {
      mostrarToast(e.message || 'Não foi possível reagendar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  const totalPendente = pendentes.reduce((s, p) => s + Number(p.valor || 0), 0);
  const totalRecebido = recebidasNoMes.reduce((s, p) => s + Number(p.valorRecebido ?? p.valor ?? 0), 0);

  return (
    <div>
      {mostrarCabecalho && <div className="cobranca-cabecalho nao-imprimir">
        <div><h1 style={{ marginBottom: 2 }}>Cobrança — Ao Vivo</h1><p className="fs-sm texto-suave" style={{ margin: 0 }}>Pagamento e realização da mensagem são controles independentes</p></div>
      </div>}

      <div className="grade-resumo-cobranca-operacional nao-imprimir">
        <Resumo titulo="Pendente" valor={totalPendente} quantidade={pendentes.length} classe="total" onClick={() => setFiltro('pendentes')} />
        <Resumo titulo="Atrasadas" pedidos={pendentes.filter((p) => (diasAte(p.dataCobranca) ?? 0) < 0)} classe="atrasada" onClick={() => setFiltro('atrasadas')} />
        <Resumo titulo="Para hoje" pedidos={pendentes.filter((p) => diasAte(p.dataCobranca) === 0)} classe="hoje" onClick={() => setFiltro('hoje')} />
        <Resumo titulo="Próximas" pedidos={pendentes.filter((p) => (diasAte(p.dataCobranca) ?? -1) > 0)} classe="futura" onClick={() => setFiltro('proximas')} />
        <Resumo titulo="Recebido no mês" valor={totalRecebido} quantidade={recebidasNoMes.length} classe="recebida" onClick={() => setFiltro('recebidas')} />
      </div>

      <div className="painel cobranca-aovivo-filtros nao-imprimir">
        <div className="cobranca-atalhos">
          {[['pendentes', 'Pendentes'], ['atrasadas', 'Atrasadas'], ['hoje', 'Hoje'], ['proximas', 'Próximas'], ['recebidas', 'Recebidas no mês']].map(([v, r]) => <button type="button" key={v} className={filtro === v ? 'ativo' : ''} onClick={() => setFiltro(v)}>{r}</button>)}
        </div>
        <div className="cobranca-campos-filtro">
          <div className="campo cobranca-filtro-os"><label>O.S.</label><input value={os} onChange={(e) => setOs(e.target.value)} placeholder="Número exato" /></div>
          <div className="campo cobranca-filtro-nome"><label>Cliente</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do comprador" /></div>
        </div>
      </div>

      {erro && <AvisoInline tom="erro" titulo="Não foi possível atualizar os pagamentos">{erro}</AvisoInline>}
      {carregando ? <EstadoCarregando rotulo="Atualizando pagamentos Ao vivo…" linhas={4} /> : visiveis.length === 0 ? <EstadoVazio className="cobranca-estado-vazio" icone="R$" titulo="Nenhum pagamento Ao vivo neste grupo" descricao="Altere a situação, o nome ou a O.S. para consultar outros registros." /> : (
        <div className="lista-cobranca-aovivo nao-imprimir">
          {lista.itensVisiveis.map((pedido) => {
            const valorMensagem = pedido.pagou === 'SIM' ? (pedido.valorRecebido ?? pedido.valor) : pedido.valor;
            const whatsapp = linkWhatsAppCobranca(pedido.whatsapp || pedido.celular, pedido.nome, valorMensagem);
            return <div className={`cobranca-aovivo-card ${pedido.pagou === 'SIM' ? 'recebida' : (diasAte(pedido.dataCobranca) ?? 0) < 0 ? 'atrasada' : ''}`} key={pedido.id}>
              <div className="cobranca-aovivo-os"><span className="carimbo-os carimbo-os-lista">{pedido.numero_os || pedido.id}</span><small>{pedido.dataPedido || '—'}</small></div>
              <div className="cobranca-aovivo-cliente"><button type="button" onClick={() => pedido.cliente_id && navigate(`/clientes/${pedido.cliente_id}`)}>{pedido.nome || 'Cliente não informado'}</button><span>Para: {pedido.destinatario || '—'} · Evento: {pedido.dataEvento || '—'} {pedido.horarioEvento || ''}</span></div>
              <div className="cobranca-aovivo-data"><strong>{rotuloData(pedido)}</strong><span>{pedido.pagou === 'SIM' ? `Pago em ${pedido.dataPagamento || '—'}${pedido.recebidoPor ? ` · ${pedido.recebidoPor}` : ''}` : `Cobrança: ${pedido.dataCobranca || '—'}`}</span></div>
              <div className="cobranca-aovivo-valor"><strong>{reais(pedido.pagou === 'SIM' ? (pedido.valorRecebido ?? pedido.valor) : pedido.valor)}</strong><span>{pedido.pagou === 'SIM' ? (pedido.formaRecebimento || 'Recebido') : (pedido.pagamentoPrevisto || 'Forma não informada')}</span></div>
              <div className="cobranca-aovivo-acoes">
                {whatsapp && <a className="btn-small cobranca-whatsapp" href={whatsapp} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp" title="Abrir WhatsApp"><IconeWhatsAppReferencia /></a>}
                <button type="button" className="btn-small" onClick={() => navigate(`/ao-vivo/${pedido.id}`)}>Abrir pedido</button>
                {pedido.pagou === 'SIM' ? <button type="button" className="btn-small" onClick={() => desfazer(pedido)}>Desfazer baixa</button> : <><button type="button" className="btn-small" onClick={() => { setReagendar(pedido); setNovaData((diasAte(pedido.dataCobranca) ?? -1) >= 0 ? pedido.dataCobranca : hojeBr()); }}>Reagendar</button><button type="button" className="btn-small primario" onClick={() => abrirBaixa(pedido)}>Dar baixa</button></>}
              </div>
            </div>;
          })}
          <BotaoMostrarMais temMais={lista.temMais} restantes={lista.restantes} onClick={lista.mostrarMais} />
        </div>
      )}

      {baixa && <Modal titulo={`Dar baixa — O.S. ${baixa.numero_os || baixa.id}`} fechar={() => setBaixa(null)}>
        <div className="resumo-modal-cobranca"><strong>{baixa.nome}</strong><strong>{reais(baixa.valor)}</strong></div>
        <div className="grade grade-3">
          <div className="campo"><label>Data do recebimento</label><CampoData value={dataPagamento} onChange={(v) => setDataPagamento(formatarData(v))} /></div>
          <div className="campo"><label>Valor recebido</label><input type="number" min="0" step="0.01" value={valorRecebido} onChange={(e) => setValorRecebido(e.target.value)} /></div>
          <div className="campo"><label>Forma</label><select value={formaRecebimento} onChange={(e) => setFormaRecebimento(e.target.value)}><option>PIX</option><option>DINHEIRO</option><option>CARTÃO</option><option>DEPÓSITO</option><option>PRESENCIAL</option><option>OUTRO</option></select></div>
        </div>
        <Acoes cancelar={() => setBaixa(null)} confirmar={confirmarBaixa} salvando={salvando} rotulo="Confirmar pagamento" />
      </Modal>}

      {reagendar && <Modal titulo={`Reagendar cobrança — O.S. ${reagendar.numero_os || reagendar.id}`} fechar={() => setReagendar(null)}>
        <div className="campo" style={{ maxWidth: 180 }}><label>Nova data</label><CampoData value={novaData} minimo={hojeSemHora()} onChange={(v) => setNovaData(formatarData(v))} /></div>
        <Acoes cancelar={() => setReagendar(null)} confirmar={confirmarReagendamento} salvando={salvando} rotulo="Reagendar" />
      </Modal>}
    </div>
  );
}

function Resumo({ titulo, pedidos, valor, quantidade, classe, onClick }) {
  const lista = pedidos || [];
  const total = valor ?? lista.reduce((s, p) => s + Number(p.valor || 0), 0);
  return <button type="button" className={`resumo-cobranca-operacional ${classe}`} onClick={onClick}><span>{titulo}</span><strong>{reais(total)}</strong><small>{quantidade ?? lista.length} pedido(s)</small></button>;
}

function Modal({ titulo, fechar, children }) {
  return <Dialogo titulo={titulo} onClose={fechar} className="nao-imprimir modal-cobranca-calendario">{children}</Dialogo>;
}

function Acoes({ cancelar, confirmar, salvando, rotulo }) {
  return <div className="acoes-modal-cobranca"><button type="button" className="btn secundario" onClick={cancelar}>Cancelar</button><button type="button" className="btn" onClick={confirmar} disabled={salvando}>{salvando ? 'Salvando...' : rotulo}</button></div>;
}
