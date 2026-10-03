import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSmartBack } from '../../hooks/useSmartBack.js';
import { api } from '../../api.js';
import { useRascunhos } from '../../RascunhosContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData, formatarHorario, formatarCodigoNumerico, formatarValorMonetario, valorMonetarioParaNumero, numeroParaValorMonetario } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';
import { AvisoInline, CabecalhoPagina, Dialogo, EstadoCarregando } from '../../components/Interface.jsx';
import { numeroWhatsAppBrasil } from '../../utils/telefoneWhatsApp.js';
import { useConfiguracoes } from '../../ConfiguracoesContext.jsx';

const VAZIO = {
  senha_os: '', cliente_id: null, data_pedido: '', horario_pedido: '', nascimento: '', tipo: '', recall: 'NÃO', recall_codigo: '',
  p1_dia: '', p1_para: '', p1_tema: '', p1_mensagem: '', p1_fixo: '', p1_celular: '', p1_horario: '', p1_quem_oferece: '', p1_resultado: '',
  p2_dia: '', p2_para: '', p2_tema: '', p2_mensagem: '', p2_fixo: '', p2_celular: '', p2_horario: '', p2_quem_oferece: '', p2_resultado: '',
  valor: '', cobranca: '', periodo: '', pagou: 'NÃO', recebi: '', data_pagamento: '',
  vender: '', status: '', impresso: '',
};

const CAMPOS_COPIAVEIS = ['tema', 'mensagem', 'para', 'fixo', 'celular', 'dia', 'horario', 'quem_oferece', 'resultado'];

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

function IconeNaoAtendeuMensagem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8 10a16 16 0 0 0 6 6l1.3-1.4a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function IconeCheckMensagem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
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

export default function FormFonada() {
  const { id } = useParams();
  const { configuracoes, erro: erroConfiguracoes, carregando: carregandoConfiguracoes, recarregar: recarregarConfiguracoes } = useConfiguracoes();
  function segundaMensagemLiberada(dados) {
    return !!configuracoes && String(dados.valor || '').trim() !== '' && Math.round(valorMonetarioParaNumero(dados.valor) * 100) <= Math.round(configuracoes.limite_segunda_mensagem * 100);
  }
  const [searchParams] = useSearchParams();
  const clienteIdUrl = searchParams.get('clienteId');
  const rascunhoIdUrl = searchParams.get('rascunho');
  const recallParaUrl = searchParams.get('recallPara');
  const recallDataUrl = searchParams.get('recallData');
  const recallRelacaoUrl = searchParams.get('recallRelacao');
  const editando = Boolean(id);
  const location = useLocation();
  const navigate = useNavigate();
  const voltarHistorico = useSmartBack('/fonada');
  const { rascunhosFonada, salvarRascunhoFonada, atualizarClienteRascunhoFonada, limparRascunhoFonada } = useRascunhos();
  const { mostrarToast } = useToast();

  // Navegação entre resultados da busca (Anterior/Próximo), sem
  // precisar voltar à lista. A lista de IDs é salva pela ListaFonada
  // no momento do clique; aqui só localizamos a posição atual nela.
  // Quando o pedido atual está na borda da página local (primeiro ou
  // último item), e existe uma página anterior/seguinte na busca
  // original, essa página é buscada sob demanda na API — sem isso,
  // Anterior/Próximo "travava" nas bordas de cada página de 30 itens.
  const [listaNavegacao, setListaNavegacao] = useState([]);
  const [contextoNavegacao, setContextoNavegacao] = useState(null);
  const [buscandoPaginaAdjacente, setBuscandoPaginaAdjacente] = useState(false);
  useEffect(() => {
    try {
      const salva = JSON.parse(sessionStorage.getItem('fonadaListaNavegacao') || '[]');
      setListaNavegacao(Array.isArray(salva) ? salva : []);
    } catch {
      setListaNavegacao([]);
    }
    try {
      const ctx = JSON.parse(sessionStorage.getItem('fonadaNavegacaoContexto') || 'null');
      setContextoNavegacao(ctx);
    } catch {
      setContextoNavegacao(null);
    }
  }, [id]);
  const indiceAtual = listaNavegacao.indexOf(Number(id));
  const idAnterior = indiceAtual > 0 ? listaNavegacao[indiceAtual - 1] : null;
  const idProximo = indiceAtual >= 0 && indiceAtual < listaNavegacao.length - 1 ? listaNavegacao[indiceAtual + 1] : null;

  // Só faz sentido tentar buscar a página vizinha quando o pedido atual
  // é realmente a borda da lista local (primeiro/último item) — no
  // meio da lista, idAnterior/idProximo já resolvem localmente.
  const podeBuscarPaginaAnterior = idAnterior === null && indiceAtual === 0 && contextoNavegacao && contextoNavegacao.pagina > 1;
  const podeBuscarPaginaProxima = idProximo === null && indiceAtual === listaNavegacao.length - 1 && indiceAtual >= 0
    && contextoNavegacao && contextoNavegacao.pagina < contextoNavegacao.totalPaginas;

  function irParaPedidoAdjacente(idAlvo) {
    sessionStorage.setItem('ultimoFonadaSelecionado', String(idAlvo));
    // replace: true — substitui a entrada atual do histórico em vez de
    // empilhar uma nova. Sem isso, cada clique em Anterior/Próximo
    // empilha uma entrada, e o botão "Fechar" (que usa navigate(-1))
    // passa a voltar pedido por pedido em vez de ir direto para a
    // lista de onde a navegação começou.
    navigate(`/fonada/${idAlvo}`, { replace: true });
  }

  // Busca a página vizinha (anterior ou seguinte) na API, atualiza o
  // sessionStorage com a nova lista/contexto (como se a pessoa tivesse
  // clicado nesse item a partir daquela página), e navega para a
  // primeira/última linha dela.
  async function irParaPaginaAdjacente(direcao) {
    if (!contextoNavegacao) return;
    const novaPagina = contextoNavegacao.pagina + direcao;
    setBuscandoPaginaAdjacente(true);
    try {
      const resposta = await api.fonada.listar(contextoNavegacao.busca, novaPagina, contextoNavegacao.campo);
      const novosIds = (resposta.fonadas || []).map((f) => f.id);
      if (novosIds.length === 0) return;

      const novoContexto = { ...contextoNavegacao, pagina: novaPagina };
      sessionStorage.setItem('fonadaListaNavegacao', JSON.stringify(novosIds));
      sessionStorage.setItem('fonadaNavegacaoContexto', JSON.stringify(novoContexto));

      // Indo para a página seguinte, entra pelo primeiro item dela;
      // voltando para a anterior, entra pelo último — mantém a sensação
      // de "continuar andando" na mesma direção do clique.
      const idAlvo = direcao > 0 ? novosIds[0] : novosIds[novosIds.length - 1];
      sessionStorage.setItem('ultimoFonadaSelecionado', String(idAlvo));
      navigate(`/fonada/${idAlvo}`, { replace: true });
    } catch (err) {
      mostrarToast('Não foi possível carregar a próxima página de resultados.', 'erro');
    } finally {
      setBuscandoPaginaAdjacente(false);
    }
  }

  const novoRascunhoId = useMemo(() => crypto.randomUUID(), [location.key]);
  const chaveRascunho = editando ? `editar-${id}` : `novo-${rascunhoIdUrl || novoRascunhoId}`;
  const rascunhoFonada = rascunhosFonada[chaveRascunho];

  const [dados, setDados] = useState(VAZIO);
  const [mensagemEmHaver, setMensagemEmHaver] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [tentativas, setTentativas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [confirmacaoDatasPassadas, setConfirmacaoDatasPassadas] = useState(null);
  const salvandoRef = useRef(false);
  const [erro, setErro] = useState('');
  // Nome do campo (valor/cobranca/periodo) que está faltando ao tentar
  // salvar — usado para destacar visualmente qual precisa ser
  // preenchido, já que CampoData não é um <input> real e não dá para
  // simplesmente chamar .focus() nele.
  const [campoObrigatorioFaltando, setCampoObrigatorioFaltando] = useState(null);
  const refValor = useRef(null);
  const refPeriodo = useRef(null);
  const [salvandoBaixa, setSalvandoBaixa] = useState(null);
  const [remarcarAberto, setRemarcarAberto] = useState(null);
  const [remarcadoDia, setRemarcadoDia] = useState('');
  const [remarcadoHorario, setRemarcadoHorario] = useState('');
  const [observacaoRemarcar, setObservacaoRemarcar] = useState('');
  const [salvandoRemarcacao, setSalvandoRemarcacao] = useState(false);

  function carregarPedido() {
    return api.fonada.buscar(id)
      .then((pedido) => {
        const normalizado = { ...VAZIO };
        Object.keys(VAZIO).forEach((campo) => { normalizado[campo] = pedido[campo] ?? ''; });
        normalizado.valor = numeroParaValorMonetario(pedido.valor);
        normalizado.versao = pedido.versao;
        setDados(normalizado);
        setMensagemEmHaver(pedido.mensagemEmHaver || null);
        if (pedido.cliente_id) {
          api.clientes.buscarCadastro(pedido.cliente_id).then((resp) => setCliente(resp.cliente));
        }
        api.agenda.buscarTentativas(id).then((resp) => setTentativas(resp.tentativas)).catch(() => {});
      })
      .catch((err) => setErro(err.message));
  }

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    setMensagemEmHaver(null);
    setTentativas([]);
    if (!editando && !rascunhoIdUrl) {
      const params = new URLSearchParams(searchParams);
      params.set('rascunho', novoRascunhoId);
      navigate(`${location.pathname}?${params}`, { replace: true, state: location.state });
      return;
    }
    if (rascunhoFonada) {
      setDados(rascunhoFonada.dados);
      setCliente(rascunhoFonada.cliente || null);
      if (editando) {
        api.fonada.buscar(id)
          .then((pedido) => { if (ativo) setMensagemEmHaver(pedido.mensagemEmHaver || null); })
          .catch(() => {});
        api.agenda.buscarTentativas(id)
          .then((resp) => { if (ativo) setTentativas(resp.tentativas); })
          .catch(() => {});
      }
      if (!rascunhoFonada.cliente && rascunhoFonada.dados.cliente_id) {
        api.clientes.buscarCadastro(rascunhoFonada.dados.cliente_id)
          .then((resp) => { if (ativo) {
            setCliente(resp.cliente);
            atualizarClienteRascunhoFonada(chaveRascunho, resp.cliente);
          } })
          .catch(() => {});
      }
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
      Promise.all([api.clientes.buscarCadastro(clienteIdUrl), api.fonada.proximaOs()])
        .then(([respCliente, respOs]) => {
          if (!ativo) return;
          const { data, horario } = dataHoraAtual();
          const inicial = {
            ...VAZIO,
            cliente_id: Number(clienteIdUrl),
            data_pedido: data,
            horario_pedido: horario,
            senha_os: respOs.proximaOs,
            nascimento: respCliente.cliente.nascimento || '',
            recall: recallParaUrl ? 'SIM' : 'NÃO',
            recall_codigo: recallParaUrl ? String(location.state?.recallDadosMensagem?.osAnterior || '') : '',
            p1_para: recallParaUrl || '',
            p1_tema: recallParaUrl ? (location.state?.recallDadosMensagem?.tema ?? 'ANIV GERAL') : '',
            p1_fixo: recallParaUrl ? (location.state?.recallDadosMensagem?.fixo || '') : '',
            p1_celular: recallParaUrl ? (location.state?.recallDadosMensagem?.celular || '') : '',
            p1_dia: recallDataUrl && /^\d{4}-\d{2}-\d{2}$/.test(recallDataUrl)
              ? `${recallDataUrl.slice(8, 10)}/${recallDataUrl.slice(5, 7)}/${recallDataUrl.slice(2, 4)}` : '',
          };
          setDados(inicial);
          setCliente(respCliente.cliente);
          salvarRascunhoFonada(chaveRascunho, inicial, respCliente.cliente, location.search);
        })
        .catch((err) => { if (ativo) setErro(err.message); })
        .finally(() => { if (ativo) setCarregando(false); });
      return () => { ativo = false; };
    }

    api.fonada.buscar(id)
      .then((pedido) => {
        if (!ativo) return;
        const normalizado = { ...VAZIO };
        Object.keys(VAZIO).forEach((campo) => { normalizado[campo] = pedido[campo] ?? ''; });
        normalizado.valor = numeroParaValorMonetario(pedido.valor);
        normalizado.versao = pedido.versao;
        setDados(normalizado);
        setMensagemEmHaver(pedido.mensagemEmHaver || null);
        if (pedido.cliente_id) {
          api.clientes.buscarCadastro(pedido.cliente_id).then((resp) => { if (ativo) {
            setCliente(resp.cliente);
            atualizarClienteRascunhoFonada(chaveRascunho, resp.cliente);
          } });
        }
        api.agenda.buscarTentativas(id).then((resp) => { if (ativo) setTentativas(resp.tentativas); }).catch(() => {});
      })
      .catch((err) => { if (ativo) setErro(err.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    // O rascunho é consultado apenas ao abrir este pedido; mudanças de campo
    // não devem reinicializar o formulário durante a digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { ativo = false; };
  }, [chaveRascunho, clienteIdUrl, rascunhoIdUrl]);

  async function darBaixaMensagem(mensagem) {
    setSalvandoBaixa(mensagem);
    try {
      await api.agenda.darBaixaFonada(id, mensagem, dados.versao);
      mostrarToast('BAIXA DADA COM SUCESSO');
      await carregarPedido();
      limparRascunhoFonada(chaveRascunho);
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível registrar a baixa.', 'erro');
    } finally {
      setSalvandoBaixa(null);
    }
  }

  function abrirRemarcarMensagem(mensagem) {
    setRemarcarAberto(mensagem);
    setObservacaoRemarcar('');
    setRemarcadoDia('');
    setRemarcadoHorario('');
  }

  function cancelarRemarcarMensagem() {
    setRemarcarAberto(null);
  }

  async function confirmarRemarcarMensagem() {
    if (!remarcadoDia.trim() || !remarcadoHorario.trim()) {
      mostrarToast('Informe o novo dia e horário para remarcar.', 'erro');
      return;
    }
    const dataEscolhida = textoParaData(remarcadoDia);
    if (!dataEscolhida) {
      mostrarToast('Informe uma data válida para remarcar.', 'erro');
      return;
    }
    if (dataEscolhida.getTime() < hojeSemHora().getTime()) {
      mostrarToast('Não é possível remarcar para um dia anterior a hoje.', 'erro');
      return;
    }
    setSalvandoRemarcacao(true);
    try {
      await api.agenda.naoAtendeuFonada(
        id,
        remarcarAberto,
        observacaoRemarcar.trim() || null,
        remarcadoDia.trim(),
        remarcadoHorario.trim(),
        undefined,
        dados.versao
      );
      mostrarToast('Tentativa registrada e mensagem remarcada.');
      setRemarcarAberto(null);
      await carregarPedido();
      limparRascunhoFonada(chaveRascunho);
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível registrar.', 'erro');
    } finally {
      setSalvandoRemarcacao(false);
    }
  }

  function set(campo, valor) {
    const novo = { ...dados, [campo]: valor };
    setDados(novo);
    salvarRascunhoFonada(chaveRascunho, novo, cliente);
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

  // Copia um ou mais campos da mensagem de origem para a mensagem de
  // destino, tudo numa única atualização de estado. Antes, cada campo
  // era copiado com uma chamada separada de set() — como set() lê o
  // "dados" atual do fechamento (closure), a segunda chamada (e
  // seguintes) ainda enxergava o "dados" de antes da primeira cópia
  // ser aplicada, sobrescrevendo-a. Na prática isso fazia o botão P
  // (passar) da 1ª mensagem, que deveria copiar tema E número, só
  // copiar o último campo copiado (o número), perdendo o tema.
  function copiarEntreMensagens(nomesCampos, deMensagem) {
    // Pedidos acima do limite não possuem 2ª mensagem. Além de desabilitar os
    // botões na interface, protege a ação aqui para impedir qualquer cópia.
    if (deMensagem === 1 && !segundaMensagemLiberada(dados)) return;
    const campos = Array.isArray(nomesCampos) ? nomesCampos : [nomesCampos];
    const origemPrefixo = deMensagem === 1 ? 'p1' : 'p2';
    const destinoPrefixo = deMensagem === 1 ? 'p2' : 'p1';
    const novo = { ...dados };
    for (const nomeCampo of campos) {
      novo[`${destinoPrefixo}_${nomeCampo}`] = dados[`${origemPrefixo}_${nomeCampo}`];
    }
    setDados(novo);
    salvarRascunhoFonada(chaveRascunho, novo, cliente);
  }

  function limpar() {
    const preservado = { ...VAZIO, cliente_id: dados.cliente_id, senha_os: dados.senha_os };
    setDados(preservado);
    salvarRascunhoFonada(chaveRascunho, preservado, cliente);
  }

  async function salvar(datasConfirmadas = false) {
    if (salvandoRef.current) return;
    if (!configuracoes || erroConfiguracoes) { setErro('Carregue as configurações antes de salvar.'); return; }
    setErro('');
    setCampoObrigatorioFaltando(null);
    if (!dados.cliente_id) {
      setErro('Nenhum cliente vinculado a este pedido.');
      return;
    }

    // Valor, dia de cobrança e período são obrigatórios para o pedido
    // fazer sentido financeiramente — sem eles, a cobrança não tem
    // como ser feita depois. O botão Salvar fica sempre clicável (não
    // desabilitado), mas ao clicar sem preencher, avisa e destaca
    // visualmente o primeiro campo faltando, em vez de deixar salvar
    // silenciosamente incompleto.
    const camposObrigatorios = [
      { campo: 'valor', rotulo: 'Valor' },
      { campo: 'cobranca', rotulo: 'Cobrar dia' },
      { campo: 'periodo', rotulo: 'Período' },
    ];
    for (const { campo, rotulo } of camposObrigatorios) {
      const valorAtual = String(dados[campo] || '').trim();
      if (!valorAtual) {
        setErro(`Preencha o campo "${rotulo}" antes de salvar.`);
        setCampoObrigatorioFaltando(campo);
        if (campo === 'valor') refValor.current?.focus();
        if (campo === 'periodo') refPeriodo.current?.focus();
        return;
      }
    }

    for (const { campo, rotulo } of [
      { campo: 'p1_dia', rotulo: 'Dia da 1ª mensagem' },
      { campo: 'p2_dia', rotulo: 'Dia da 2ª mensagem' },
      { campo: 'cobranca', rotulo: 'Dia de cobrança' },
    ]) {
      if (String(dados[campo] || '').trim() && !textoParaData(dados[campo])) {
        setErro(`${rotulo} precisa ser uma data válida.`);
        return;
      }
    }

    salvandoRef.current = true;
    setSalvando(true);
    try {
      const hoje = hojeSemHora();
      let datasPassadas = [
        { campo: 'p1_dia', rotulo: '1ª mensagem' },
        { campo: 'p2_dia', rotulo: '2ª mensagem' },
        { campo: 'cobranca', rotulo: 'cobrança' },
      ].filter(({ campo }) => {
        if (campo === 'p2_dia' && !segundaMensagemLiberada(dados)) return false;
        const data = textoParaData(dados[campo]);
        return data && data.getTime() < hoje.getTime();
      });
      if (!datasConfirmadas && editando && datasPassadas.length) {
        const pedidoSalvo = await api.fonada.buscar(id);
        datasPassadas = datasPassadas.filter(({ campo }) =>
          String(dados[campo] || '').trim() !== String(pedidoSalvo[campo] || '').trim()
        );
      }
      if (datasPassadas.length && !datasConfirmadas) {
        setConfirmacaoDatasPassadas(datasPassadas.map(({ rotulo, campo }) => ({ rotulo, data: dados[campo] })));
        return;
      }
      const payload = { ...dados, valor: valorMonetarioParaNumero(dados.valor) };
      if (!segundaMensagemLiberada(dados)) {
        const original = editando ? await api.fonada.buscar(id) : {};
        for (const campo of Object.keys(VAZIO).filter((campo) => campo.startsWith('p2_'))) payload[campo] = original[campo] || '';
      }
      if (editando) {
        const atualizado = await api.fonada.atualizar(id, payload);
        setDados((anterior) => ({ ...anterior, versao: atualizado.versao,
          ...Object.fromEntries(Object.keys(VAZIO).filter((campo) => campo.startsWith('p2_')).map((campo) => [campo, atualizado[campo] ?? ''])),
        }));
        setMensagemEmHaver(atualizado.mensagemEmHaver || null);
        limparRascunhoFonada(chaveRascunho);
        mostrarToast('Pedido salvo com sucesso.');
      } else {
        const novo = await api.fonada.criar(payload);
        let recallAtualizado = true;
        if (recallRelacaoUrl && recallDataUrl) {
          try {
            await api.recall.pedidoCriado({ dataReferencia: recallDataUrl, relacaoChave: recallRelacaoUrl, pedidoId: novo.id });
          } catch {
            // O pedido já está salvo: uma falha secundária no Recall não pode
            // induzir a pessoa a tentar salvar de novo e duplicar a O.S.
            recallAtualizado = false;
          }
        }
        limparRascunhoFonada(chaveRascunho);
        mostrarToast(recallAtualizado ? 'Pedido salvo com sucesso.' : 'Pedido salvo. O status do Recall precisa ser conferido.', recallAtualizado ? 'sucesso' : 'aviso');
        navigate(`/fonada/${novo.id}`, { replace: true, state: recallRelacaoUrl ? { returnTo: `/recall?data=${recallDataUrl}` } : undefined });
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
    if (!confirm('Tem certeza que deseja excluir este pacote? Essa ação não pode ser desfeita.')) return;
    try {
      await api.fonada.apagar(id);
      if (cliente) navigate(`/clientes/${cliente.id}`);
      else navigate('/fonada');
    } catch (err) {
      setErro(err.message);
    }
  }

  function fechar() {
    // Fechar descarta apenas este pedido novo. Voltar de um pedido existente
    // mantém as alterações pendentes para continuar depois.
    if (!editando) limparRascunhoFonada(chaveRascunho);
    voltarHistorico();
  }

  if (carregando) return <EstadoCarregando rotulo="Preparando o pedido de Fonada…" linhas={8} />;

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

  // Junta as tentativas sem sucesso com os resultados de baixa bem-sucedida
  // para mostrar o histórico completo em ordem: mais recentes primeiro.
  // O texto automático de sucesso mudou de formato ("MENSAGEM PASSADA, ..."
  // -> "OK usuario dd/mm/aa hh:mm"); reconhece os dois formatos para não
  // perder do histórico os resultados antigos já salvos no banco.
  const itensHistorico = [
    ...tentativas.map((t) => ({ ...t, tipo: 'falha', chave: `tentativa-${t.id}` })),
    ...[1, 2].flatMap((n) => {
      const resultado = dados[`p${n}_resultado`];
      if (resultado && (resultado.startsWith('MENSAGEM PASSADA') || resultado.startsWith('OK '))) {
        return [{ tipo: 'sucesso', mensagem: n, texto: resultado, chave: `sucesso-${n}` }];
      }
      return [];
    }),
  ];

  const estaBloqueado = !!cliente?.bloqueado;
  const segundaLiberada = segundaMensagemLiberada(dados);
  const segundaExpirada = editando && mensagemEmHaver?.status === 'EXPIRADA';

  return (
    <div className="form-pagina pagina-fonada-ampliada">
      <CabecalhoPagina
        className="form-cabecalho-pedido"
        contexto="Pedido · Fonada"
        titulo={editando ? 'Editar pedido' : 'Novo pedido'}
        descricao={cliente ? `${cliente.nome} · organize as duas transmissões e as condições de cobrança.` : 'Preencha as transmissões e as condições do pedido.'}
        meta={dados.senha_os ? `O.S. ${dados.senha_os}` : 'Nova O.S.'}
      />
      {estaBloqueado && (
        <div className="aviso-bloqueio" style={{ marginBottom: 16 }}>
          <strong>Cliente bloqueado.</strong> Este pedido está travado para edição — só é possível visualizar.
          {cliente.bloqueio_motivo && <> Motivo: {cliente.bloqueio_motivo}</>}
        </div>
      )}
      <div className={`form-layout ${estaBloqueado ? 'form-bloqueado' : ''}`}>

        <div>
          <div className="section-box secao-transmissao">
            <div className="section-title">Transmissão</div>
            <div className="duas-colunas-mensagem">
              <ColunaMensagem
                numero={1} dados={dados} set={set} setComMascara={setComMascara} onCopiar={copiarEntreMensagens}
                copiarBloqueado={!segundaLiberada}
                editando={editando}
                salvandoBaixa={salvandoBaixa} onDarBaixa={darBaixaMensagem} onNaoAtendeu={abrirRemarcarMensagem}
              />
              <ColunaMensagem
                numero={2} dados={dados} set={set} setComMascara={setComMascara} onCopiar={copiarEntreMensagens}
                bloqueada={!segundaLiberada || segundaExpirada} editando={editando}
                situacaoMensagem={!segundaLiberada ? { status: 'NAO_CONCEDIDA' } : mensagemEmHaver?.status === 'NAO_CONCEDIDA' ? null : mensagemEmHaver}
                salvandoBaixa={salvandoBaixa} onDarBaixa={darBaixaMensagem} onNaoAtendeu={abrirRemarcarMensagem}
              />
            </div>
          </div>

          <div className="grade grade-comprador-lateral">
            <div className="section-box">
              <div className="form-row">
                <label>Valor R$:</label>
                <input
                  aria-label="Valor do pedido Fonada"
                  ref={refValor}
                  type="text"
                  inputMode="numeric"
                  className="input-valor-destaque"
                  value={dados.valor}
                  onChange={(e) => { set('valor', formatarValorMonetario(e.target.value)); setCampoObrigatorioFaltando(null); }}
                  placeholder="0,00"
                  style={{
                    maxWidth: 90, flex: '0 0 auto',
                    borderColor: campoObrigatorioFaltando === 'valor' ? 'var(--selo)' : undefined,
                  }}
                />
              </div>
              <div className="form-row">
                <label style={{ minWidth: 'auto' }}>Cob. dia:</label>
                <CampoData
                  aria-label="Dia da cobrança Fonada"
                  className="campo-cobranca-fonada"
                  placeholder="dd/mm/aa"
                  value={dados.cobranca}
                  onChange={(v) => { setComMascara('cobranca', v, 'data'); setCampoObrigatorioFaltando(null); }}
                  style={{
                    maxWidth: 118, flex: '0 0 auto',
                    borderColor: campoObrigatorioFaltando === 'cobranca' ? 'var(--selo)' : undefined,
                  }}
                />
              </div>
              <div className="form-row">
                <label>Período:</label>
                <input
                  aria-label="Período de cobrança Fonada"
                  ref={refPeriodo}
                  value={dados.periodo}
                  onChange={(e) => { set('periodo', e.target.value); setCampoObrigatorioFaltando(null); }}
                  style={{
                    flex: 1, minWidth: 0,
                    borderColor: campoObrigatorioFaltando === 'periodo' ? 'var(--selo)' : undefined,
                  }}
                />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label style={{ minWidth: 'auto' }}>Recall:</label>
                <select
                  aria-label="Recall do pedido Fonada"
                  value={dados.recall}
                  onChange={(e) => {
                    const novoValor = e.target.value;
                    // Atualiza recall e recall_codigo juntos, numa
                    // única chamada — chamar set() duas vezes seguidas
                    // aqui usaria o "dados" antigo (ainda sem a
                    // mudança de recall) na segunda chamada, revertendo
                    // silenciosamente o recall para o valor anterior
                    // sempre que se tentava voltar de SIM para NÃO.
                    const novo = {
                      ...dados,
                      recall: novoValor,
                      recall_codigo: novoValor === 'SIM' ? dados.recall_codigo : '',
                    };
                    setDados(novo);
                    salvarRascunhoFonada(chaveRascunho, novo, cliente);
                  }}
                  style={{ maxWidth: 90 }}
                >
                  <option value="SIM">Sim</option>
                  <option value="NÃO">Não</option>
                </select>
                <input
                  aria-label="Código de Recall do pedido Fonada"
                  placeholder="00000"
                  value={dados.recall_codigo}
                  disabled={dados.recall !== 'SIM'}
                  onChange={(e) => set('recall_codigo', formatarCodigoNumerico(e.target.value, 5))}
                  style={{ maxWidth: 90, marginLeft: 4 }}
                />
              </div>
            </div>

            <div className="section-box secao-comprador">
              <div className="section-title titulo-secao-comprador">
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

          {editando && (tentativas.length > 0 || dados.p1_resultado || dados.p2_resultado) && (
            <div className="section-box">
              <div className="section-title">
                <span>Histórico de tentativas</span>
                <span className="aba-contagem">{itensHistorico.length}</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {itensHistorico.map((item) => (
                  item.tipo === 'sucesso' ? (
                    <div key={item.chave} className="info-linha historico-sucesso" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                        <span className="fs-sm" style={{ fontWeight: 700 }}>
                          {item.mensagem}ª mensagem — {item.texto}
                        </span>
                        <span className="tag ok">Passada</span>
                      </div>
                    </div>
                  ) : (
                    <div key={item.chave} className="info-linha" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                        <span className="fs-sm" style={{ fontWeight: 700 }}>
                          {item.mensagem}ª mensagem — ligou em {item.data_hora_tentativa}
                        </span>
                        <span className="tag pendente">Não atendeu</span>
                      </div>
                      {item.observacao && (
                        <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>Obs.: {item.observacao}</span>
                      )}
                      {item.remarcado_dia && (
                        <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>
                          Remarcado para {item.remarcado_dia} às {item.remarcado_horario}
                        </span>
                      )}
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          {(idAnterior !== null || idProximo !== null || podeBuscarPaginaAnterior || podeBuscarPaginaProxima) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className="btn-action"
                style={{ flex: 1 }}
                onClick={() => {
                  if (idAnterior !== null) irParaPedidoAdjacente(idAnterior);
                  else if (podeBuscarPaginaAnterior) irParaPaginaAdjacente(-1);
                }}
                disabled={(idAnterior === null && !podeBuscarPaginaAnterior) || buscandoPaginaAdjacente}
                title="Pedido anterior na busca"
              >
                ← Anterior
              </button>
              <button
                type="button"
                className="btn-action"
                style={{ flex: 1 }}
                onClick={() => {
                  if (idProximo !== null) irParaPedidoAdjacente(idProximo);
                  else if (podeBuscarPaginaProxima) irParaPaginaAdjacente(1);
                }}
                disabled={(idProximo === null && !podeBuscarPaginaProxima) || buscandoPaginaAdjacente}
                title="Próximo pedido na busca"
              >
                Próximo →
              </button>
            </div>
          )}

          {erroConfiguracoes && <AvisoInline tom="erro" titulo="Não foi possível carregar a regra de valor" acao={<button type="button" className="btn secundario" onClick={recarregarConfiguracoes}>Tentar novamente</button>}>{erroConfiguracoes}</AvisoInline>}
          {erro && <AvisoInline tom="erro" titulo="Revise o pedido antes de salvar">{erro}</AvisoInline>}

          <div className="section-box actions-grid">
            <button type="button" className="btn-action destaque" onClick={() => salvar()} disabled={salvando || carregandoConfiguracoes || !!erroConfiguracoes}>
              <IconeSalvar /> {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <div className="acoes-secundarias-mobile">
              {editando && cliente && !estaBloqueado && (
                <button type="button" className="btn-action" onClick={() => navigate(`/fonada/novo?clienteId=${cliente.id}`)}>
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

          <div className="section-box section-box-somente-leitura">
            <div className="section-title">Pagamento</div>
            <InfoLinha label="Pagou" valor={dados.pagou === 'SIM' ? 'Sim' : 'Não'} />
            <InfoLinha label="Data do pagamento" valor={dados.data_pagamento} />
            <InfoLinha label="Status" valor={dados.recebi} />
          </div>

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

      {remarcarAberto && (
        <Dialogo titulo={`Não atendeu — ${remarcarAberto}ª mensagem`} descricao="A tentativa será registrada agora. Escolha o novo dia e horário da mensagem." onClose={cancelarRemarcarMensagem}>
            <div className="grade grade-2">
              <div className="campo">
                <label>Novo dia *</label>
                <CampoData
                  placeholder="dd/mm/aa"
                  value={remarcadoDia}
                  onChange={(v) => setRemarcadoDia(formatarData(v))}
                  minimo={hojeSemHora()}
                  autoFocus
                />
              </div>
              <div className="campo">
                <label>Novo horário *</label>
                <input
                  placeholder="hh:mm"
                  value={remarcadoHorario}
                  onChange={(e) => setRemarcadoHorario(formatarHorario(e.target.value))}
                />
              </div>
            </div>
            <div className="campo">
              <label>Observação (opcional)</label>
              <input
                placeholder="Ex: caixa postal, número errado..."
                value={observacaoRemarcar}
                onChange={(e) => setObservacaoRemarcar(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn secundario" onClick={cancelarRemarcarMensagem}>Cancelar</button>
              <button type="button" className="btn" onClick={confirmarRemarcarMensagem} disabled={salvandoRemarcacao}>
                {salvandoRemarcacao ? 'Salvando...' : 'Registrar e remarcar'}
              </button>
            </div>
        </Dialogo>
      )}
      {confirmacaoDatasPassadas && (
        <Dialogo
          titulo="Confirmar data passada"
          descricao="Confira as datas antes de salvar este pedido."
          onClose={() => setConfirmacaoDatasPassadas(null)}
          className="confirmacao-contextual confirmacao-data-passada"
          centralizado
        >
          <p>Você quer salvar o pedido com {confirmacaoDatasPassadas.length === 1 ? 'esta data anterior a hoje' : 'estas datas anteriores a hoje'}?</p>
          <ul className="confirmacao-data-lista">
            {confirmacaoDatasPassadas.map(({ rotulo, data }) => <li key={rotulo}><span>{rotulo}</span><strong>{data}</strong></li>)}
          </ul>
          <div className="confirmacao-acoes">
            <button type="button" className="btn secundario" onClick={() => setConfirmacaoDatasPassadas(null)}>Voltar e revisar</button>
            <button type="button" className="btn" onClick={() => { setConfirmacaoDatasPassadas(null); salvar(true); }} disabled={salvando || carregandoConfiguracoes || !!erroConfiguracoes}>Confirmar e salvar</button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}

// Uma coluna com todos os campos de uma mensagem específica (1ª ou
// 2ª) — as duas colunas ficam visíveis lado a lado, sem precisar
// trocar de aba para ver a outra mensagem. O botão "P" (copiar) só
// aparece na coluna da 1ª mensagem, já que o fluxo normal é preencher
// a 1ª e copiar dali para a 2ª, não o contrário. Reúne o que antes
// eram duas seções separadas ("Ordem de serviço" e "Transmissão") —
// na prática é a mesma ordem de serviço, só com campos diferentes.
function ColunaMensagem({ numero, dados, set, setComMascara, onCopiar, bloqueada, copiarBloqueado, editando, salvandoBaixa, onDarBaixa, onNaoAtendeu, situacaoMensagem }) {
  const p = numero === 1 ? 'p1' : 'p2';
  const mostrarBotaoP = numero === 1;
  const diaPreenchido = Boolean(dados[`${p}_dia`]);
  const jaProcessada = Boolean(dados[`${p}_resultado`]);

  return (
    <div className="coluna-mensagem">
      <div className="coluna-mensagem-titulo">
        <span className={`bolinha-status ${dados[`${p}_dia`] ? 'usada' : 'livre'}`} /> {numero}ª mensagem
        {numero === 2 && situacaoMensagem && (
          <span className={`tag ${situacaoMensagem.status === 'DISPONIVEL' ? 'ok' : situacaoMensagem.status === 'EXPIRADA' ? 'pendente' : 'neutro'}`} style={{ marginLeft: 'auto' }}>
            {situacaoMensagem.status === 'DISPONIVEL' ? `Disponível até ${situacaoMensagem.dataExpiracao}` : situacaoMensagem.status === 'UTILIZADA' ? 'Utilizada' : situacaoMensagem.status === 'EXPIRADA' ? `Expirada em ${situacaoMensagem.dataExpiracao}` : situacaoMensagem.status === 'NAO_CONCEDIDA' ? 'Segunda mensagem indisponível' : 'Indisponível'}
          </span>
        )}
      </div>
      <div className="form-row linha-tema-numero-fonada">
        <label>Tema:</label>
        <input
          aria-label={`Tema da ${numero}ª mensagem`}
          value={dados[`${p}_tema`]}
          onChange={(e) => set(`${p}_tema`, e.target.value)}
          disabled={bloqueada}
        />
        <label style={{ minWidth: 'auto', marginLeft: 6 }}>Nº:</label>
        <input
          aria-label={`Número da ${numero}ª mensagem`}
          value={dados[`${p}_mensagem`]}
          onChange={(e) => set(`${p}_mensagem`, e.target.value)}
          disabled={bloqueada}
          style={{ maxWidth: 56, flex: '0 0 auto' }}
        />
        {mostrarBotaoP && (
          <BotaoP
            onClick={() => onCopiar(['tema', 'mensagem'], numero)}
            titulo="Copiar tema/nº para a 2ª mensagem"
            desabilitado={copiarBloqueado}
          />
        )}
      </div>
      <CampoComP label="Para" nomeCampo="para" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} copiarBloqueado={copiarBloqueado} classeExtra="campo-para-fonada" />
      <div className="form-row linha-fixo-celular">
        <label>Fixo:</label>
        <input aria-label={`Telefone fixo da ${numero}ª mensagem`} value={dados[`${p}_fixo`]} onChange={(e) => setComMascara(`${p}_fixo`, e.target.value, 'fixo')} disabled={bloqueada} className="campo-fixo-fonada" style={{ flex: '1 1 100px', minWidth: 90 }} />
        <label style={{ minWidth: 'auto', marginLeft: 4 }} className="label-cel-fonada">Cel.:</label>
        <input aria-label={`Celular da ${numero}ª mensagem`} value={dados[`${p}_celular`]} onChange={(e) => setComMascara(`${p}_celular`, e.target.value, 'celular')} disabled={bloqueada} className="campo-celular-fonada" style={{ flex: '1 1 110px', minWidth: 100 }} />
        {mostrarBotaoP && (
          <BotaoP
            onClick={() => onCopiar(['fixo', 'celular'], numero)}
            titulo="Copiar telefones para a 2ª mensagem"
            desabilitado={copiarBloqueado}
          />
        )}
      </div>
      <div className="form-row linha-dia-horario-fonada">
        <label>Dia:</label>
        <CampoData
          aria-label={`Dia da ${numero}ª mensagem`}
          placeholder="dd/mm/aa"
          value={dados[`${p}_dia`]}
          onChange={(v) => setComMascara(`${p}_dia`, v, 'data')}
          disabled={bloqueada}
          style={{ flex: '0 0 auto', width: 112, minWidth: 0 }}
        />
        <label style={{ minWidth: 'auto', marginLeft: 6 }}>Horário:</label>
        <input
          aria-label={`Horário da ${numero}ª mensagem`}
          placeholder="hh:mm"
          value={dados[`${p}_horario`]}
          onChange={(e) => setComMascara(`${p}_horario`, e.target.value, 'horario')}
          disabled={bloqueada}
          style={{ flex: '0 0 auto', width: 56, minWidth: 0 }}
        />
        {mostrarBotaoP && (
          <BotaoP
            onClick={() => onCopiar(['dia', 'horario'], numero)}
            titulo="Copiar dia/horário para a 2ª mensagem"
            desabilitado={copiarBloqueado}
          />
        )}
      </div>
      <CampoComP label="Quem oferece" nomeCampo="quem_oferece" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} copiarBloqueado={copiarBloqueado} classeExtra="campo-quem-oferece" multilinha />
      <CampoComP label="Resultado" nomeCampo="resultado" prefixo={p} numero={numero} dados={dados} set={set} onCopiar={onCopiar} mostrarBotaoP={mostrarBotaoP} desabilitado={bloqueada} copiarBloqueado={copiarBloqueado} negrito cor="var(--selo)" classeExtra="campo-resultado" />

      {editando && !bloqueada && diaPreenchido && situacaoMensagem?.status !== 'EXPIRADA' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--papel-alt)' }}>
          <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>
            {jaProcessada ? 'Situação da entrega' : 'Marcar entrega desta mensagem'}
          </span>
          {jaProcessada ? (
            <span className="tag ok">Passada</span>
          ) : (
            <div style={{ display: 'flex', gap: 5 }}>
              <button
                type="button"
                className="btn-action perigo-acao"
                style={{ width: 30, height: 30, padding: 0 }}
                onClick={() => onNaoAtendeu(numero)}
                disabled={salvandoBaixa === numero}
                title="Não atendeu"
              >
                <IconeNaoAtendeuMensagem />
              </button>
              <button
                type="button"
                className="btn-action"
                style={{ width: 30, height: 30, padding: 0, background: 'var(--carimbo)', color: 'var(--branco)', borderColor: 'var(--carimbo)' }}
                onClick={() => onDarBaixa(numero)}
                disabled={salvandoBaixa === numero}
                title="Marcar passada"
              >
                <IconeCheckMensagem />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampoComP({ label, nomeCampo, prefixo, numero, dados, set, onCopiar, mostrarBotaoP, desabilitado, copiarBloqueado, negrito, cor, classeExtra, multilinha }) {
  const valor = dados[`${prefixo}_${nomeCampo}`];
  return (
    <div className={`form-row ${classeExtra || ''}`}>
      <label>{label}:</label>
      {multilinha ? (
        <textarea
          aria-label={`${label} da ${numero}ª mensagem`}
          value={valor}
          onChange={(e) => set(`${prefixo}_${nomeCampo}`, e.target.value)}
          disabled={desabilitado}
          rows={3}
          style={{ ...(negrito ? { fontWeight: 700 } : {}), ...(cor ? { color: cor } : {}) }}
        />
      ) : (
        <input
          aria-label={`${label} da ${numero}ª mensagem`}
          value={valor}
          onChange={(e) => set(`${prefixo}_${nomeCampo}`, e.target.value)}
          disabled={desabilitado}
          style={{ ...(negrito ? { fontWeight: 700 } : {}), ...(cor ? { color: cor } : {}) }}
        />
      )}
      {mostrarBotaoP && (
        <BotaoP onClick={() => onCopiar(nomeCampo, numero)} titulo="Copiar para a 2ª mensagem" desabilitado={copiarBloqueado} />
      )}
    </div>
  );
}

function BotaoP({ onClick, titulo, desabilitado }) {
  return (
    <button
      type="button"
      className="btn-small botao-p-copiar"
      title={desabilitado ? 'Segunda mensagem indisponível para este pedido' : titulo}
      aria-label={desabilitado ? 'Cópia indisponível para este telefone' : titulo}
      onClick={onClick}
      disabled={desabilitado}
      style={{ flexShrink: 0 }}
    >
      →
    </button>
  );
}

function InfoLinha({ label, valor }) {
  return (
    <div className="info-linha">
      <span className="info-label">{label}</span>
      <span className="info-valor">{valor || '—'}</span>
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

function InfoSomenteLeitura({ label, valor }) {
  return (
    <div>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
        {label}
      </div>
      <div className="fs-md">{valor || '—'}</div>
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
