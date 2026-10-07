import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSmartBack } from '../../hooks/useSmartBack.js';
import { api } from '../../api.js';
import { useRascunhos } from '../../RascunhosContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData, formatarHorario, formatarValorMonetario, valorMonetarioParaNumero, numeroParaValorMonetario } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';
import CampoComSugestoes from '../../components/CampoComSugestoes.jsx';
import CampoSelecao from '../../components/CampoSelecao.jsx';
import CampoEnderecoAutocomplete from '../../components/CampoEnderecoAutocomplete.jsx';
import { enderecoComNumero, separarEnderecoNumero } from '../../enderecoAutocomplete.js';
import PaginaImpressaoAoVivo from './PaginaImpressaoAoVivo.jsx';
import { AvisoInline, CabecalhoPagina, Dialogo, EstadoCarregando } from '../../components/Interface.jsx';
import { numeroWhatsAppBrasil } from '../../utils/telefoneWhatsApp.js';

const VAZIO = {
  numero_os: '', cliente_id: null, data_pedido: '', horario_pedido: '', dia_entrega: '', horario_entrega: '',
  para: '', oferecimento: '',
  endereco: '', numero: '', bairro: '', referencia: '',
  fixo_local: '', celular_local: '', aniversario_destinatario: '',
  tema_1: '', mensagem_codigo_1: '', tema_2: '', mensagem_codigo_2: '',
  tema_3: '', mensagem_codigo_3: '', tema_4: '', mensagem_codigo_4: '',
  musica_1: '', musica_2: '', musica_3: '', musica_4: '', musica_5: '', musica_6: '',
  valor: '', pagamento: '', brinde: '', observacoes: '', pagou: '', data_pagou: '',
  data_cobranca: '', valor_recebido: '', forma_recebimento: '', pagamento_recebido_por: '',
  resultado_entrega: '', entregue_por: '',
};

const MIN_MENSAGENS = 1;
const MAX_MENSAGENS = 2;
const MIN_MUSICAS = 2;
const MAX_MUSICAS = 4;

function dataHoraAtual() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const hh = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');
  return { data: `${dd}/${mm}/${aa}`, horario: `${hh}:${min}` };
}

// Data de hoje sem componente de hora, para comparar com outras datas
// "no nível do dia" (sem hora atrapalhar a comparação).
function hojeSemHora() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Converte "dd/mm/aa" para Date, ou null se incompleta/inválida —
// usado na validação de data mínima ao digitar manualmente.
function textoParaData(texto) {
  const m = String(texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, aa] = m;
  const data = new Date(2000 + parseInt(aa, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  if (data.getDate() !== parseInt(dd, 10) || data.getMonth() !== parseInt(mm, 10) - 1) return null;
  return data;
}

// O campo de pagamento continua sendo salvo como um texto único (sem
// mudar o schema do banco), mas agora montado a partir de escolhas
// clicáveis em vez de digitado livremente. Essas funções convertem
// entre o texto salvo e as partes que a interface mostra.
//
// Formatos possíveis:
//   "PIX" / "DINHEIRO"
//   "CARTÃO - CRÉDITO" / "CARTÃO - DÉBITO"
//   "PRAZO - DIA 15 - MP - PIX" (dia de pagamento + forma do MP)
//
// Pedidos antigos com texto livre não batem em nenhum desses padrões
// — nesse caso, forma fica null (nenhuma pílula marcada) e o texto
// original não é mexido até a pessoa escolher uma opção nova.
function parsearPagamento(texto) {
  const t = String(texto || '').trim();
  if (t === 'PIX' || t === 'DINHEIRO') {
    return { forma: t, tipoCartao: '', diaPag: '', formaMp: '' };
  }
  const matchCartao = t.match(/^CARTÃO(?: - (CRÉDITO|DÉBITO))?$/);
  if (matchCartao) {
    return { forma: 'CARTÃO', tipoCartao: matchCartao[1] || '', diaPag: '', formaMp: '' };
  }
  const matchPrazo = t.match(/^PRAZO(?: - DIA ([\d/]*))?(?: - MP - (PIX|DINHEIRO|CARTÃO))?$/);
  if (matchPrazo) {
    return { forma: 'PRAZO', tipoCartao: '', diaPag: matchPrazo[1] || '', formaMp: matchPrazo[2] || '' };
  }
  return { forma: '', tipoCartao: '', diaPag: '', formaMp: '', textoOriginal: t };
}

function montarPagamento({ forma, tipoCartao, diaPag, formaMp }) {
  if (forma === 'PIX' || forma === 'DINHEIRO') return forma;
  if (forma === 'CARTÃO') return tipoCartao ? `CARTÃO - ${tipoCartao}` : 'CARTÃO';
  if (forma === 'PRAZO') {
    let partes = ['PRAZO'];
    if (diaPag) partes.push(`DIA ${diaPag}`);
    if (formaMp) partes.push('MP', formaMp);
    return partes.join(' - ');
  }
  return '';
}

function IconeSalvar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}
function IconeLimpar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-.9 13.1a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 6" />
    </svg>
  );
}
function IconeMaisPequeno() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconeExcluir() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V5c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v2" />
      <path d="M6 7l1 12.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5L18 7" />
    </svg>
  );
}
function IconeVoltar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function IconeFechar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default function FormAoVivo() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const clienteIdUrl = searchParams.get('clienteId');
  const rascunhoIdUrl = searchParams.get('rascunho');
  const editando = Boolean(id);
  const location = useLocation();
  const navigate = useNavigate();
  const voltarHistorico = useSmartBack('/ao-vivo');
  const { rascunhosAoVivo, salvarRascunhoAoVivo, atualizarClienteRascunhoAoVivo, limparRascunhoAoVivo } = useRascunhos();
  const { mostrarToast } = useToast();

  const novoRascunhoId = useMemo(() => crypto.randomUUID(), [location.key]);
  const chaveRascunho = editando ? `editar-${id}` : `novo-${rascunhoIdUrl || novoRascunhoId}`;
  const rascunhoAoVivo = rascunhosAoVivo[chaveRascunho];

  const [dados, setDados] = useState(VAZIO);
  const [cliente, setCliente] = useState(null);
  const [qtdMensagens, setQtdMensagens] = useState(MIN_MENSAGENS);
  const [qtdMusicas, setQtdMusicas] = useState(MIN_MUSICAS);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const [erro, setErro] = useState('');
  const [campoObrigatorioFaltando, setCampoObrigatorioFaltando] = useState(null);
  const [pedidosImpressao, setPedidosImpressao] = useState(null);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [dataRecebimento, setDataRecebimento] = useState('');
  const [valorRecebimento, setValorRecebimento] = useState('');
  const [formaRecebimento, setFormaRecebimento] = useState('PIX');
  const [salvandoPagamento, setSalvandoPagamento] = useState(false);
  const [modalPrazo, setModalPrazo] = useState(false);
  const [novoDiaPrazo, setNovoDiaPrazo] = useState('');
  const [observacaoPrazo, setObservacaoPrazo] = useState('');
  const [salvandoPrazo, setSalvandoPrazo] = useState(false);
  const [tentativasPrazo, setTentativasPrazo] = useState([]);
  const refValor = useRef(null);

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
    let ativo = true;
    setCarregando(true);
    setErro('');
    if (!editando && !rascunhoIdUrl) {
      const params = new URLSearchParams(searchParams);
      params.set('rascunho', novoRascunhoId);
      navigate(`${location.pathname}?${params}`, { replace: true, state: location.state });
      return;
    }
    if (rascunhoAoVivo) {
      setDados(rascunhoAoVivo.dados);
      setCliente(rascunhoAoVivo.cliente || null);
      if (!rascunhoAoVivo.cliente && rascunhoAoVivo.dados.cliente_id) {
        api.clientes.buscarCadastro(rascunhoAoVivo.dados.cliente_id)
          .then((resp) => { if (ativo) {
            setCliente(resp.cliente);
            atualizarClienteRascunhoAoVivo(chaveRascunho, resp.cliente);
          } })
          .catch(() => {});
      }
      setQtdMensagens(contarMensagensPreenchidas(rascunhoAoVivo.dados));
      setQtdMusicas(contarPreenchidos(rascunhoAoVivo.dados, 'musica', MIN_MUSICAS, MAX_MUSICAS));
      setCarregando(false);
      return () => { ativo = false; };
    }
    setCliente(null);

    if (!editando) {
      if (!clienteIdUrl) {
        setErro('Nenhum cliente selecionado. Volte e abra o pedido pela ficha do cliente.');
        setCarregando(false);
        return;
      }
      Promise.all([api.clientes.buscarCadastro(clienteIdUrl), api.aoVivo.proximaOs()])
        .then(([respCliente, respOs]) => {
          if (!ativo) return;
          const { data, horario } = dataHoraAtual();
          const inicial = {
            ...VAZIO,
            cliente_id: Number(clienteIdUrl),
            data_pedido: data,
            horario_pedido: horario,
            numero_os: respOs.proximaOs,
            ...(location.state?.recallAoVivo || {}),
          };
          setDados(inicial);
          setCliente(respCliente.cliente);
          setQtdMensagens(contarMensagensPreenchidas(inicial));
          setQtdMusicas(MIN_MUSICAS);
          salvarRascunhoAoVivo(chaveRascunho, inicial, respCliente.cliente, location.search);
        })
        .catch((err) => { if (ativo) setErro(err.message); })
        .finally(() => { if (ativo) setCarregando(false); });
      return () => { ativo = false; };
    }

    api.aoVivo.buscar(id)
      .then((pedido) => {
        if (!ativo) return;
        const normalizado = { ...VAZIO };
        Object.keys(VAZIO).forEach((campo) => { normalizado[campo] = pedido[campo] ?? ''; });
        const enderecoSeparado = separarEnderecoNumero(pedido.endereco);
        normalizado.endereco = enderecoSeparado.logradouro;
        normalizado.numero = enderecoSeparado.numero;
        normalizado.valor = numeroParaValorMonetario(pedido.valor);
        normalizado.versao = pedido.versao;
        setDados(normalizado);
        setQtdMensagens(contarMensagensPreenchidas(normalizado));
        setQtdMusicas(contarPreenchidos(normalizado, 'musica', MIN_MUSICAS, MAX_MUSICAS));
        if (pedido.cliente_id) {
          return api.clientes.buscarCadastro(pedido.cliente_id).then((resp) => { if (ativo) {
            setCliente(resp.cliente);
            atualizarClienteRascunhoAoVivo(chaveRascunho, resp.cliente);
          } });
        }
      })
      .catch((err) => { if (ativo) setErro(err.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    // O rascunho é consultado apenas ao abrir este pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ativo = false; };
  }, [chaveRascunho, clienteIdUrl, rascunhoIdUrl]);

  function set(campo, valor) {
    const novo = { ...dados, [campo]: valor };
    setDados(novo);
    salvarRascunhoAoVivo(chaveRascunho, novo, cliente);
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
    salvarRascunhoAoVivo(chaveRascunho, preservado, cliente);
  }

  async function salvar() {
    if (salvandoRef.current) return;
    setErro('');
    setCampoObrigatorioFaltando(null);
    if (!dados.cliente_id) {
      setErro('Nenhum cliente vinculado a este pedido.');
      return;
    }
    if (!String(dados.valor || '').trim()) {
      setErro('Preencha o campo "Valor" antes de salvar.');
      setCampoObrigatorioFaltando('valor');
      refValor.current?.focus();
      return;
    }
    if (String(dados.dia_entrega || '').trim() && !textoParaData(dados.dia_entrega)) {
      setErro('O dia do evento precisa ser uma data válida.');
      return;
    }
    if (dados.aniversario_destinatario && !textoParaData(dados.aniversario_destinatario.length === 5 ? `${dados.aniversario_destinatario}/00` : dados.aniversario_destinatario)) {
      setErro('O aniversário do destinatário precisa ser uma data válida.');
      return;
    }
    if (!editando) {
      const diaEvento = textoParaData(dados.dia_entrega);
      if (diaEvento && diaEvento.getTime() < hojeSemHora().getTime()) {
        setErro('O dia do evento não pode ser uma data anterior a hoje.');
        return;
      }
    }
    salvandoRef.current = true;
    setSalvando(true);
    try {
      const { numero, ...dadosPersistidos } = dados;
      const payload = {
        ...dadosPersistidos,
        endereco: enderecoComNumero(dados.endereco, numero),
        valor: valorMonetarioParaNumero(dados.valor),
      };
      if (editando) {
        const atualizado = await api.aoVivo.atualizar(id, payload);
        setDados((anterior) => ({ ...anterior, versao: atualizado.versao }));
        limparRascunhoAoVivo(chaveRascunho);
        mostrarToast('Pedido salvo com sucesso.');
      } else {
        const novo = await api.aoVivo.criar(payload);
        limparRascunhoAoVivo(chaveRascunho);
        const recallRelacao = searchParams.get('recallRelacao');
        let recallAtualizado = true;
        if (recallRelacao && searchParams.get('recallData')) {
          try { await api.recall.pedidoCriado({ sistema: 'AOVIVO', dataReferencia: searchParams.get('recallData'), relacaoChave: recallRelacao, pedidoId: novo.id }); }
          catch { recallAtualizado = false; }
        }
        mostrarToast(recallAtualizado ? 'Pedido salvo com sucesso.' : 'Pedido salvo. Não foi possível atualizar o Recall.', recallAtualizado ? 'sucesso' : 'aviso');
        navigate(`/ao-vivo/${novo.id}`, { replace: true, state: { returnTo: location.state?.returnTo } });
      }
    } catch (err) {
      setErro(err.message);
      mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!confirm('Tem certeza que deseja excluir este pedido? Essa ação não pode ser desfeita.')) return;
    try {
      await api.aoVivo.apagar(id);
      if (cliente) navigate(`/clientes/${cliente.id}`);
      else navigate('/ao-vivo');
    } catch (err) {
      setErro(err.message);
    }
  }

  function fechar() {
    if (!editando) limparRascunhoAoVivo(chaveRascunho);
    voltarHistorico();
  }

  async function imprimirPedido() {
    if (!editando || !id) return;
    try {
      const resposta = await api.aoVivo.buscarParaImpressao([id]);
      const pedidoImpressao = (resposta.pedidos || []).map((pedido) => ({
        ...pedido,
        pagou: pedido.pagou == null || String(pedido.pagou).trim() === '' ? dados.pagou : pedido.pagou,
        data_pagou: pedido.data_pagou == null || String(pedido.data_pagou).trim() === '' ? dados.data_pagou : pedido.data_pagou,
        valor_recebido: pedido.valor_recebido == null || String(pedido.valor_recebido).trim() === '' ? dados.valor_recebido : pedido.valor_recebido,
        forma_recebimento: pedido.forma_recebimento == null || String(pedido.forma_recebimento).trim() === '' ? dados.forma_recebimento : pedido.forma_recebimento,
        pagamento_recebido_por: pedido.pagamento_recebido_por == null || String(pedido.pagamento_recebido_por).trim() === '' ? dados.pagamento_recebido_por : pedido.pagamento_recebido_por,
      }));
      setPedidosImpressao(pedidoImpressao);
      setTimeout(() => window.print(), 100);
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível preparar a impressão.', 'erro');
    }
  }

  function abrirPagamento() {
    setDataRecebimento(dataHoraAtual().data);
    setValorRecebimento(String(valorMonetarioParaNumero(dados.valor) || 0));
    const pagamento = String(dados.pagamento || '').toUpperCase();
    setFormaRecebimento(pagamento.includes('PIX') ? 'PIX' : pagamento.includes('DINHEIRO') ? 'DINHEIRO' : pagamento.includes('CART') ? 'CARTÃO' : 'PRESENCIAL');
    setModalPagamento(true);
  }

  async function confirmarPagamento() {
    setSalvandoPagamento(true);
    try {
      const resposta = await api.cobranca.darBaixaAoVivo(id, {
        dataPagamento: dataRecebimento,
        valorRecebido: Number(String(valorRecebimento).replace(',', '.')),
        formaRecebimento,
        versao: dados.versao,
      });
      const atualizado = {
        ...dados,
        pagou: 'SIM',
        data_pagou: resposta.dataPagamento,
        valor_recebido: resposta.valorRecebido,
        forma_recebimento: resposta.formaRecebimento,
        pagamento_recebido_por: resposta.recebidoPor,
        versao: resposta.versao,
      };
      setDados(atualizado);
      if (rascunhoAoVivo) salvarRascunhoAoVivo(chaveRascunho, atualizado, cliente);
      setModalPagamento(false);
      mostrarToast('PAGAMENTO RECEBIDO');
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível registrar o pagamento.', 'erro');
    } finally {
      setSalvandoPagamento(false);
    }
  }

  async function desfazerPagamento() {
    if (!confirm('Deseja desfazer a baixa financeira deste pedido?')) return;
    try {
      const resposta = await api.cobranca.desfazerBaixaAoVivo(id, dados.versao);
      const atualizado = { ...dados, pagou: '', data_pagou: '', valor_recebido: '', forma_recebimento: '', pagamento_recebido_por: '', versao: resposta.versao };
      setDados(atualizado);
      if (rascunhoAoVivo) salvarRascunhoAoVivo(chaveRascunho, atualizado, cliente);
      mostrarToast('Baixa financeira desfeita.');
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível desfazer a baixa.', 'erro');
    }
  }

  async function abrirPrazo() {
    setNovoDiaPrazo('');
    setObservacaoPrazo('');
    try {
      const resposta = await api.aoVivo.buscarTentativasPrazo(id);
      setTentativasPrazo(resposta.tentativas || []);
      setModalPrazo(true);
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  }

  async function confirmarPrazo() {
    setSalvandoPrazo(true);
    try {
      const resposta = await api.aoVivo.naoRecebeu(id, observacaoPrazo, novoDiaPrazo, dados.versao);
      const atualizado = { ...dados, pagamento: resposta.pagamento, versao: resposta.versao };
      setDados(atualizado);
      if (rascunhoAoVivo) salvarRascunhoAoVivo(chaveRascunho, atualizado, cliente);
      setModalPrazo(false);
      mostrarToast('Prazo de pagamento remarcado.');
    } catch (err) {
      mostrarToast(err.message, 'erro');
    } finally {
      setSalvandoPrazo(false);
    }
  }

  useEffect(() => {
    function aoPressionarTecla(evento) {
      if (!editando || !id || !(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== 'p') return;
      evento.preventDefault();
      imprimirPedido();
    }

    window.addEventListener('keydown', aoPressionarTecla);
    return () => window.removeEventListener('keydown', aoPressionarTecla);
  }, [editando, id, dados]);

  if (carregando) return <EstadoCarregando rotulo="Preparando o pedido Ao vivo…" linhas={8} />;

  if (erro && !dados.cliente_id) {
    return (
      <AvisoInline
        className="form-erro-vinculo"
        tom="erro"
        titulo="O pedido precisa de um cliente"
        acao={<button className="btn" onClick={() => navigate('/clientes')}>Escolher cliente</button>}
      >{erro}</AvisoInline>
    );
  }

  const estaBloqueado = !!cliente?.bloqueado;
  const pagamentoParseado = parsearPagamento(dados.pagamento);

  // Validação em tempo real (não só ao salvar): se a pessoa digitar uma
  // data passada manualmente — sem usar o calendário, que já bloqueia
  // isso visualmente — o aviso aparece assim que a data fica completa,
  // sem precisar clicar em Salvar para descobrir.
  const diaEventoDigitado = !editando ? textoParaData(dados.dia_entrega) : null;
  const diaEventoNoPassado = diaEventoDigitado && diaEventoDigitado.getTime() < hojeSemHora().getTime();

  return (
    <div className="pagina-aovivo-ampliada">
      <div className="form-pagina form-compacto nao-imprimir">
      <CabecalhoPagina
        className="form-cabecalho-pedido"
        contexto="Pedido · Ao vivo"
        titulo={editando ? 'Editar pedido' : 'Novo pedido'}
        descricao={cliente ? `${cliente.nome} · concentre evento, homenagem, músicas e pagamento no mesmo fluxo.` : 'Preencha evento, homenagem, músicas e condições do pedido.'}
        meta={dados.numero_os ? `O.S. ${dados.numero_os}` : 'Nova O.S.'}
      />
      {estaBloqueado && (
        <div className="aviso-bloqueio" style={{ marginBottom: 16 }}>
          <strong>Cliente bloqueado.</strong> Este pedido está travado para edição — só é possível visualizar.
          {cliente.bloqueio_motivo && <> Motivo: {cliente.bloqueio_motivo}</>}
        </div>
      )}
      <div className={`form-layout ${estaBloqueado ? 'form-bloqueado' : ''}`}>

        <div>
          <div className="grade-secoes-aovivo" style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
            <div className="section-box secao-aovivo-espacosa secao-homenageado-aovivo" style={{ flex: '1 1 320px', minWidth: 320 }}>
              <div className="section-title">Homenageado</div>
              <div className="form-row linha-para-dia-aovivo">
                <label>Para:</label>
                <input aria-label="Destinatário do Ao Vivo" value={dados.para} onChange={(e) => set('para', e.target.value)} className="campo-para-aovivo" style={{ flex: '1 1 auto', minWidth: 0 }} />
                <label style={{ minWidth: 'auto', marginLeft: 4 }} className="label-dia-aovivo">Dia Evento:</label>
                <CampoData
                  aria-label="Dia do evento Ao Vivo"
                  placeholder="dd/mm/aa"
                  value={dados.dia_entrega}
                  onChange={(v) => setComMascara('dia_entrega', v, 'data')}
                  className="campo-dia-aovivo"
                  style={{ maxWidth: 121, flex: '0 0 auto' }}
                  minimo={!editando ? hojeSemHora() : undefined}
                />
                <label style={{ minWidth: 'auto', marginLeft: 4 }} className="label-horario-aovivo">Horário:</label>
                <input
                  aria-label="Horário da entrega Ao Vivo"
                  placeholder="hh:mm"
                  value={dados.horario_entrega}
                  onChange={(e) => setComMascara('horario_entrega', e.target.value, 'horario')}
                  className="campo-horario-aovivo"
                  style={{ maxWidth: 70, flex: '0 0 auto' }}
                />
              </div>
              {diaEventoNoPassado && (
                <p className="fs-xs" style={{ color: 'var(--selo)', marginTop: -6, marginBottom: 8 }}>
                  O dia do evento não pode ser uma data anterior a hoje.
                </p>
              )}
              <div className="form-row">
                <label htmlFor="celular-destinatario-aovivo">Celular:</label>
                <input id="celular-destinatario-aovivo" aria-label="Celular do destinatário" type="tel" value={dados.celular_local} onChange={(e) => setComMascara('celular_local', e.target.value, 'celular')} />
              </div>
              <div className="form-row">
                <label htmlFor="aniversario-destinatario-aovivo">Aniversário:</label>
                <input id="aniversario-destinatario-aovivo" aria-label="Aniversário do destinatário" inputMode="numeric" placeholder="dd/mm ou dd/mm/aa" value={dados.aniversario_destinatario || ''} onChange={(e) => setComMascara('aniversario_destinatario', e.target.value, 'data')} />
              </div>
              <div className="form-row">
                <label>Oferecimento:</label>
                <textarea
                  aria-label="Oferecimento do Ao Vivo"
                  value={dados.oferecimento}
                  onChange={(e) => set('oferecimento', e.target.value)}
                  rows={4}
                  style={{ resize: 'vertical', flex: '1 1 auto', minWidth: 0 }}
                />
              </div>
              <div className="form-row" style={{ alignItems: 'flex-end' }}>
                <label>End.:</label>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <CampoEnderecoAutocomplete
                    value={dados.endereco}
                    numero={dados.numero}
                    onChange={(valor) => set('endereco', valor)}
                    onSelecionar={({ logradouro, bairro }) => {
                      const novo = { ...dados, endereco: logradouro, bairro: bairro || dados.bairro };
                      setDados(novo);
                      salvarRascunhoAoVivo(chaveRascunho, novo, cliente);
                    }}
                  />
                </div>
                <label style={{ minWidth: 'auto' }}>Nº:</label>
                <input aria-label="Número do endereço de entrega" value={dados.numero} onChange={(e) => set('numero', e.target.value)} placeholder="Nº / S/N" style={{ flex: '0 0 96px', width: 96 }} />
              </div>
              <div className="form-row">
                <label>Bairro:</label>
                <input aria-label="Bairro da entrega" value={dados.bairro} onChange={(e) => set('bairro', e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
              </div>
              <div className="form-row">
                <label style={{ minWidth: 'auto' }}>Ref.:</label>
                <input aria-label="Referência da entrega" value={dados.referencia} onChange={(e) => set('referencia', e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
              </div>
            </div>

            <div className="section-box secao-aovivo-espacosa secao-catalogo-aovivo" style={{ width: 'fit-content', maxWidth: '100%' }}>
              <div className="section-title">Catálogo</div>
              <div className="subsecao-titulo">Mensagem</div>
              {Array.from({ length: qtdMensagens }, (_, i) => i + 1).map((n) => (
                <div className="form-row linha-tema-codigo-aovivo" key={n}>
                  <label>{qtdMensagens > 1 ? `Tema ${n}:` : 'Tema:'}</label>
                  <input
                    aria-label={`Tema ${n} do Ao Vivo`}
                    value={dados[`tema_${n}`]}
                    onChange={(e) => set(`tema_${n}`, e.target.value)}
                    className="campo-tema-aovivo"
                    style={{ width: 120, flex: '0 0 auto' }}
                  />
                  <label style={{ minWidth: 'auto', marginLeft: 6 }} className="label-codigo-aovivo">Código:</label>
                  <input
                    aria-label={`Código da mensagem ${n} do Ao Vivo`}
                    value={dados[`mensagem_codigo_${n}`]}
                    onChange={(e) => set(`mensagem_codigo_${n}`, e.target.value)}
                    className="campo-codigo-aovivo"
                    style={{ width: 80, flex: '0 0 auto' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 14 }}>
                {qtdMensagens < MAX_MENSAGENS && (
                  <button type="button" className="btn-small" onClick={adicionarMensagem} style={{ gap: 4 }}>
                    <IconeMaisPequeno /> Adicionar
                  </button>
                )}
                {qtdMensagens > MIN_MENSAGENS && (
                  <button type="button" className="btn-small" onClick={removerUltimaMensagem}>
                    − Remover última
                  </button>
                )}
              </div>

              <div className="subsecao-titulo">Músicas</div>
              {Array.from({ length: qtdMusicas }, (_, i) => i + 1).map((n) => (
                <div className="form-row" key={n}>
                  <label>Música {n}:</label>
                  <input
                    aria-label={`Música ${n} do Ao Vivo`}
                    value={dados[`musica_${n}`]}
                    onChange={(e) => set(`musica_${n}`, e.target.value)}
                    className="campo-musica-aovivo"
                    style={{ width: 293, flex: '0 0 auto' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {qtdMusicas < MAX_MUSICAS && (
                  <button type="button" className="btn-small" onClick={adicionarMusica} style={{ gap: 4 }}>
                    <IconeMaisPequeno /> Adicionar
                  </button>
                )}
                {qtdMusicas > MIN_MUSICAS && (
                  <button type="button" className="btn-small" onClick={removerUltimaMusica}>
                    − Remover última
                  </button>
                )}
              </div>
            </div>

            <div className="wrapper-financeiro-aovivo" style={{ display: 'flex', gap: 12, alignItems: 'stretch', flex: '1 1 660px' }}>
              <div className="section-box secao-aovivo-espacosa secao-financeiro-aovivo" style={{ width: 'fit-content', maxWidth: '100%' }}>
                <div className="section-title">Financeiro e brinde</div>
                <div className="form-row">
                  <label>Valor:</label>
                  <input
                    aria-label="Valor do pedido Ao Vivo"
                    ref={refValor}
                    type="text"
                    inputMode="numeric"
                    className="input-valor-destaque campo-valor-aovivo"
                    value={dados.valor}
                    onChange={(e) => { set('valor', formatarValorMonetario(e.target.value)); setCampoObrigatorioFaltando(null); }}
                    placeholder="R$ 0,00"
                    style={{
                      maxWidth: 110, flex: '0 0 auto',
                      borderColor: campoObrigatorioFaltando === 'valor' ? 'var(--selo)' : undefined,
                    }}
                  />
                </div>
                <div className="form-row linha-pagamento-aovivo">
                  <label>Pagamento:</label>
                  <CampoSelecao
                    opcoes={['PIX', 'DINHEIRO', 'CARTÃO', 'PRAZO']}
                    value={pagamentoParseado.forma}
                    onChange={(forma) => set('pagamento', montarPagamento({ ...pagamentoParseado, forma, tipoCartao: '', diaPag: '', formaMp: '' }))}
                    placeholder="Escolher..."
                    className="campo-forma-pagamento-aovivo"
                    style={{ width: 105, flex: '0 0 auto' }}
                  />
                  {pagamentoParseado.forma === 'CARTÃO' && (
                    <CampoSelecao
                      opcoes={['DÉBITO', 'CRÉDITO']}
                      value={pagamentoParseado.tipoCartao}
                      onChange={(tipoCartao) => set('pagamento', montarPagamento({ ...pagamentoParseado, tipoCartao }))}
                      placeholder="Escolher..."
                      className="campo-tipo-cartao-aovivo"
                      style={{ width: 90, flex: '0 0 auto', marginLeft: 6 }}
                    />
                  )}
                </div>
                {pagamentoParseado.forma === 'PRAZO' && (
                  <>
                    <div className="form-row">
                      <label>Dia pag.:</label>
                      <CampoData
                        className="campo-dia-pagamento-aovivo"
                        placeholder="dd/mm/aa"
                        value={pagamentoParseado.diaPag}
                        onChange={(v) => {
                          const mascarado = formatarData(v);
                          set('pagamento', montarPagamento({ ...pagamentoParseado, diaPag: mascarado }));
                        }}
                        minimo={!editando ? hojeSemHora() : undefined}
                        style={{ width: 112, flex: '0 0 auto' }}
                      />
                    </div>
                    <div className="form-row">
                      <label>Mod. pag.:</label>
                      <CampoSelecao
                        opcoes={['PIX', 'DINHEIRO', 'CARTÃO']}
                        value={pagamentoParseado.formaMp}
                        onChange={(formaMp) => set('pagamento', montarPagamento({ ...pagamentoParseado, formaMp }))}
                        placeholder="Escolher..."
                        style={{ width: 105, flex: '0 0 auto' }}
                      />
                    </div>
                  </>
                )}
                <div className="form-row">
                  <label>Brinde:</label>
                  <CampoComSugestoes
                    value={dados.brinde}
                    onChange={(v) => set('brinde', v)}
                    sugestoes={['Bombom', 'Champagne']}
                    placeholder="Bombom, Champagne..."
                    className="campo-brinde-aovivo"
                    style={{ width: 240, flex: '0 0 auto' }}
                  />
                </div>
              </div>

              <div className="section-box secao-comprador" style={{ flex: '1 1 320px', minWidth: 320, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
                <div className="section-title">
                  <span>Cliente</span>
                  {cliente && (
                    <button type="button" className="btn-small" onClick={() => navigate(`/clientes/${cliente.id}`)}>
                      Abrir ficha do cliente
                    </button>
                  )}
                </div>
                {cliente ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span className="fs-lg" style={{ fontWeight: 700 }}>{cliente.nome}</span>
                      <span className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>
                        Nasc.: {cliente.nascimento || '—'}
                      </span>
                    </div>
                    <div className="grade grade-3" style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--papel-alt)' }}>
                      <InfoGrupo label="Fixo" valor={cliente.fixo} />
                      <InfoGrupo label="Celular" valor={cliente.celular} />
                      <InfoGrupo label="WhatsApp" valor={cliente.whatsapp} />
                    </div>
                    <div className="grade grade-3">
                      <InfoGrupo label="Bairro" valor={cliente.bairro} />
                      <InfoGrupo label="Endereço" valor={[cliente.endereco, cliente.complemento].filter(Boolean).join(' — ')} />
                      <InfoGrupo label="Referência" valor={cliente.referencia} />
                    </div>
                  </>
                ) : (
                  <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Nenhum cliente vinculado.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          {erro && <AvisoInline tom="erro" titulo="Revise o pedido antes de salvar">{erro}</AvisoInline>}

          <div className="section-box actions-grid">
            <button type="button" className="btn-action destaque" onClick={salvar} disabled={salvando || diaEventoNoPassado}>
              <IconeSalvar /> {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <div className="acoes-secundarias-mobile">
              {editando && cliente && !estaBloqueado && (
                <button type="button" className="btn-action" onClick={() => navigate(`/ao-vivo/novo?clienteId=${cliente.id}`)}>
                  <IconeMaisPequeno /> Novo pedido
                </button>
              )}
              {editando && (
                <button type="button" className="btn-action perigo-acao" onClick={apagar}><IconeExcluir /> Excluir</button>
              )}
              <button
                type="button"
                className="btn-action fechar-acao"
                style={{ pointerEvents: 'auto' }}
                onClick={fechar}
              >
                {editando ? <IconeVoltar /> : <IconeFechar />} {editando ? 'Voltar' : 'Fechar'}
              </button>
            </div>
          </div>

          {editando && (
            <div className={`section-box pagamento-aovivo-card ${dados.pagou === 'SIM' ? 'pago' : 'pendente'}`}>
              <div className="section-title">Pagamento</div>
              <div className="info-linha">
                <span className="info-label">Status</span>
                <span className={`tag ${dados.pagou === 'SIM' ? 'ok' : 'pendente'}`}>{dados.pagou === 'SIM' ? 'PAGO' : 'PENDENTE'}</span>
              </div>
              <div className="info-linha">
                <span className="info-label">Data do pagamento</span>
                <span className="info-valor">{dados.data_pagou || '—'}</span>
              </div>
              <div className="info-linha">
                <span className="info-label">Valor recebido</span>
                <span className="info-valor">{dados.pagou === 'SIM' ? numeroParaValorMonetario(dados.valor_recebido ?? valorMonetarioParaNumero(dados.valor)) : '—'}</span>
              </div>
              <div className="info-linha">
                <span className="info-label">Forma</span>
                <span className="info-valor">{dados.forma_recebimento || dados.pagamento || '—'}</span>
              </div>
              {dados.pagamento_recebido_por && <div className="info-linha"><span className="info-label">Registrado por</span><span className="info-valor">{dados.pagamento_recebido_por}</span></div>}
              {dados.pagou === 'SIM'
                ? <button type="button" className="btn-small" style={{ width: '100%', marginTop: 8 }} onClick={desfazerPagamento}>Desfazer baixa</button>
                : <button type="button" className="btn-action destaque" style={{ width: '100%', marginTop: 8 }} onClick={abrirPagamento}>Dar baixa no pagamento</button>}
              {String(dados.pagamento || '').startsWith('PRAZO') && dados.pagou !== 'SIM' && (
                <button type="button" className="btn-small" style={{ width: '100%', marginTop: 8 }} onClick={abrirPrazo}>Não recebeu — remarcar prazo</button>
              )}
            </div>
          )}

          <div className="section-box section-box-somente-leitura">
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

      {pedidosImpressao && (
        <div className="somente-imprimir">
          <PaginaImpressaoAoVivo pedidos={pedidosImpressao} />
        </div>
      )}

      {modalPagamento && (
        <Dialogo titulo={`Receber pagamento — O.S. ${dados.numero_os || id}`} descricao="Registre os dados do recebimento para atualizar a cobrança." onClose={() => setModalPagamento(false)}>
            <div className="grade grade-3">
              <div className="campo"><label>Data</label><CampoData value={dataRecebimento} onChange={(v) => setDataRecebimento(formatarData(v))} /></div>
              <div className="campo"><label>Valor recebido</label><input type="number" min="0" step="0.01" value={valorRecebimento} onChange={(e) => setValorRecebimento(e.target.value)} /></div>
              <div className="campo"><label>Forma</label><select value={formaRecebimento} onChange={(e) => setFormaRecebimento(e.target.value)}><option>PIX</option><option>DINHEIRO</option><option>CARTÃO</option><option>DEPÓSITO</option><option>PRESENCIAL</option><option>OUTRO</option></select></div>
            </div>
            <div className="acoes-modal-cobranca"><button type="button" className="btn secundario" onClick={() => setModalPagamento(false)}>Cancelar</button><button type="button" className="btn" onClick={confirmarPagamento} disabled={salvandoPagamento}>{salvandoPagamento ? 'Salvando...' : 'Confirmar pagamento'}</button></div>
        </Dialogo>
      )}
      {modalPrazo && (
        <Dialogo titulo="Não recebeu o pagamento" descricao="Registre a tentativa e escolha a nova data do prazo." onClose={() => setModalPrazo(false)}>
          <div className="campo"><label>Novo dia do prazo</label><CampoData aria-label="Novo dia do prazo" value={novoDiaPrazo} onChange={(v) => setNovoDiaPrazo(formatarData(v))} /></div>
          <div className="campo"><label>Observação</label><textarea aria-label="Observação da tentativa de pagamento" value={observacaoPrazo} onChange={(e) => setObservacaoPrazo(e.target.value)} /></div>
          {tentativasPrazo.length > 0 && <div><strong>Tentativas anteriores</strong>{tentativasPrazo.map((t) => <div key={t.id}>{t.data_hora_tentativa} — {t.remarcado_dia} — {t.observacao || 'Sem observação'}</div>)}</div>}
          <div className="acoes-modal-cobranca"><button type="button" className="btn secundario" onClick={() => setModalPrazo(false)}>Cancelar</button><button type="button" className="btn" disabled={salvandoPrazo || !textoParaData(novoDiaPrazo)} onClick={confirmarPrazo}>Confirmar remarcação</button></div>
        </Dialogo>
      )}
    </div>
  );
}

function InfoGrupo({ label, valor }) {
  const ehWhatsapp = label === 'WhatsApp';
  const numeroComDDI = numeroWhatsAppBrasil(valor);
  const linkWhatsapp = ehWhatsapp && numeroComDDI ? `https://wa.me/${numeroComDDI}` : null;

  return (
    <div>
      <div className="info-label" style={{ fontSize: 11, marginBottom: 3 }}>{label}</div>
      {linkWhatsapp ? (
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="info-valor link-whatsapp"
          style={{ fontSize: 13 }}
          title="Abrir conversa no WhatsApp"
        >
          {valor}
        </a>
      ) : (
        <div className="info-valor" style={{ fontSize: 13 }}>{valor || '—'}</div>
      )}
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
