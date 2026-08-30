import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, getNomeExibicao } from '../../api.js';
import {
  mensagemConfirmacao as mensagemConfirmacaoAgenda,
  mensagemRegistrarERemarcar,
} from '../../utils/mensagemAgenda.js';
import { useToast } from '../../ToastContext.jsx';
import { useAgendaAlerta, statusUrgenciaItem } from '../../AgendaAlertaContext.jsx';
import { formatarData, formatarHorario } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';
import { AvisoInline, CabecalhoPagina, Dialogo } from '../../components/Interface.jsx';

// Data de hoje no mesmo formato usado nos campos do sistema (dd/mm/aa).
function hojeFormatado() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  return `${dd}/${mm}/${aa}`;
}

// Data de hoje como objeto Date, zerada na hora — usada como `minimo`
// do CampoData, para impedir escolher um dia anterior a hoje ao
// remarcar uma mensagem.
function hojeSemHora() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Converte "dd/mm/aa" para Date (zerada na hora), ou null se incompleta.
function paraDataSemHora(dataBr) {
  const m = String(dataBr || '').match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, aa] = m;
  const d = new Date(2000 + parseInt(aa, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  d.setHours(0, 0, 0, 0);
  return d;
}

// Soma (ou subtrai) dias a uma data no formato dd/mm/aa, devolvendo o
// resultado no mesmo formato. Usado pelos botões "dia anterior"/"próximo".
function somarDias(dataBr, quantidade) {
  const m = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return dataBr;
  const [, dd, mm, aa] = m;
  const data = new Date(2000 + parseInt(aa, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  data.setDate(data.getDate() + quantidade);
  const novoDd = String(data.getDate()).padStart(2, '0');
  const novoMm = String(data.getMonth() + 1).padStart(2, '0');
  const novoAa = String(data.getFullYear()).slice(-2);
  return `${novoDd}/${novoMm}/${novoAa}`;
}

function rotuloDiaSemana(dataBr) {
  const data = paraDataSemHora(dataBr);
  if (!data) return '';
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][data.getDay()];
}

function pagamentoEhPrazo(pagamento) {
  return /^PRAZO(?:\s|-|$)/i.test(String(pagamento || '').trim());
}

export default function Agenda() {
  // A data e a aba selecionadas ficam na URL (não em useState solto) —
  // assim, ao abrir um pedido e depois "Fechar" (que usa o histórico do
  // navegador para voltar), a Agenda é restaurada exatamente no dia e
  // aba em que a pessoa estava, em vez de resetar para hoje.
  const [searchParams, setSearchParams] = useSearchParams();
  const dataSelecionada = searchParams.get('data') || hojeFormatado();
  const aba = searchParams.get('aba') || 'geral';
  const inicioUrl = searchParams.get('inicio');
  const itemUrl = searchParams.get('item');

  const [dataRef, setDataRef] = useState('');
  const [fonada, setFonada] = useState([]);
  const [aoVivo, setAoVivo] = useState([]);
  const [lembretes, setLembretes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [salvandoBaixa, setSalvandoBaixa] = useState(null);
  const [inicioJanela, setInicioJanela] = useState(() => paraDataSemHora(inicioUrl) ? inicioUrl : somarDias(dataSelecionada, -3));
  const [contagensPorData, setContagensPorData] = useState({});
  const [carregandoSemana, setCarregandoSemana] = useState(true);
  const [direcaoCarrossel, setDirecaoCarrossel] = useState(null);
  const temporizadorCarrosselRef = useRef(null);
  const [direcaoConteudo, setDirecaoConteudo] = useState('');
  const temporizadorConteudoRef = useRef(null);
  const [ehSmartphone, setEhSmartphone] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 430px)').matches
  ));

  const [itemRemarcarAberto, setItemRemarcarAberto] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [remarcadoDia, setRemarcadoDia] = useState('');
  const [remarcadoHorario, setRemarcadoHorario] = useState('');
  const [salvandoRemarcacao, setSalvandoRemarcacao] = useState(false);
  const [lembreteAberto, setLembreteAberto] = useState(null);
  const [formLembrete, setFormLembrete] = useState({ titulo: '', data: '', horario: '', observacao: '', concluido: false });
  const [salvandoLembrete, setSalvandoLembrete] = useState(false);
  const [concluidosAbertos, setConcluidosAbertos] = useState(false);

  // Item selecionado na lista compacta — chave única por tipo+id, já
  // que fonada usa pedidoId+mensagem e ao vivo usa só id.
  const [chaveSelecionada, setChaveSelecionada] = useState(itemUrl || null);

  const navigate = useNavigate();
  const { mostrarToast } = useToast();
  // O contexto compartilhado (mesmo que alimenta a bolinha do menu) é
  // consumido aqui só para que este componente re-renderize no mesmo
  // instante em que ele atualiza — assim a cor da borda dos cards muda
  // exatamente junto com a bolinha, em vez de cada um ter seu próprio
  // temporizador desalinhado.
  const { fonadaHoje, aoVivoHoje, agendaHojeCarregada } = useAgendaAlerta();

  // As ações de "Dar baixa" e "Não atendeu" só fazem sentido para o dia
  // de hoje — em qualquer outro dia, a Agenda serve só para consulta.
  const ehHoje = dataSelecionada === hojeFormatado();

  // A rotina automática do backend marca o Ao Vivo como entregue depois
  // do horário. O contexto consulta a Agenda a cada 30 segundos; espelhar
  // os dados dele aqui faz o item ir para "Concluídos" sem exigir que a
  // pessoa recarregue a página.
  useEffect(() => {
    if (!ehHoje || !agendaHojeCarregada) return;
    setFonada(fonadaHoje);
    setAoVivo(aoVivoHoje);
  }, [ehHoje, agendaHojeCarregada, fonadaHoje, aoVivoHoje]);

  function carregar(data = dataSelecionada) {
    setCarregando(true);
    setErro('');
    api.agenda.hoje(data)
      .then((resp) => {
        setDataRef(resp.data);
        setFonada(resp.fonada);
        setAoVivo(resp.aoVivo);
        setLembretes(resp.lembretes || []);
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar(dataSelecionada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSelecionada]);

  useEffect(() => {
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('inicio', inicioJanela);
      if (chaveSelecionada) novo.set('item', chaveSelecionada);
      else novo.delete('item');
      return novo;
    }, { replace: true });
  }, [inicioJanela, chaveSelecionada, setSearchParams]);

  useEffect(() => {
    let ativo = true;
    // Um dia de cada lado fica pré-carregado para o novo card entrar
    // durante a animação sem aparecer vazio.
    const dias = ehSmartphone
      ? Array.from({ length: 16 }, (_, indice) => somarDias(dataSelecionada, indice - 1))
      : Array.from({ length: 9 }, (_, indice) => somarDias(inicioJanela, indice - 1));
    const diasAindaNaoCarregados = dias.filter((data) => contagensPorData[data] === undefined);
    if (diasAindaNaoCarregados.length === 0) {
      setCarregandoSemana(false);
      return () => { ativo = false; };
    }
    Promise.all(diasAindaNaoCarregados.map((data) => api.agenda.hoje(data)))
      .then((respostas) => {
        if (!ativo) return;
        const novasContagens = {};
        respostas.forEach((resp, indice) => {
          const quantidadeFonada = agruparMensagensDuplas(resp.fonada).length;
          novasContagens[diasAindaNaoCarregados[indice]] = quantidadeFonada + resp.aoVivo.length + (resp.lembretes || []).length;
        });
        setContagensPorData((atual) => ({ ...atual, ...novasContagens }));
      })
      .catch(() => {
        // A faixa mantém as contagens já carregadas; uma falha pontual
        // não deve impedir a navegação nem apagar os cards.
      })
      .finally(() => { if (ativo) setCarregandoSemana(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicioJanela, ehSmartphone, dataSelecionada, contagensPorData]);

  // A faixa estreita do celular sempre nasce centrada no dia selecionado.
  // Em desktop o carrossel continua usando a janela de sete dias original;
  // a media query aqui só evita renderizar o dia selecionado fora da área
  // visível quando a viewport tem 430px ou menos.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 430px)');
    const atualizar = () => setEhSmartphone(media.matches);
    atualizar();
    media.addEventListener?.('change', atualizar);
    return () => media.removeEventListener?.('change', atualizar);
  }, []);

  useEffect(() => () => { clearTimeout(temporizadorCarrosselRef.current); clearTimeout(temporizadorConteudoRef.current); }, []);

  useEffect(() => {
    function navegarComTeclado(e) {
      const alvo = e.target;
      const digitando = alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement || alvo?.isContentEditable;
      if (digitando || itemRemarcarAberto || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); selecionarDiaAdjacente(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); selecionarDiaAdjacente(1); }
    }
    document.addEventListener('keydown', navegarComTeclado);
    return () => document.removeEventListener('keydown', navegarComTeclado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSelecionada, inicioJanela, direcaoCarrossel, itemRemarcarAberto]);

  function irParaDia(novaData) {
    if (novaData === dataSelecionada) return;
    const atual = paraDataSemHora(dataSelecionada);
    const proxima = paraDataSemHora(novaData);
    setDirecaoConteudo(atual && proxima && proxima < atual ? 'voltar' : 'avancar');
    clearTimeout(temporizadorConteudoRef.current);
    temporizadorConteudoRef.current = setTimeout(() => setDirecaoConteudo(''), 320);
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('data', novaData);
      return novo;
    }, { replace: true });
  }

  function moverJanela(direcao) {
    if (direcaoCarrossel) return;
    setDirecaoCarrossel(direcao);
    clearTimeout(temporizadorCarrosselRef.current);
    temporizadorCarrosselRef.current = setTimeout(() => {
      setInicioJanela((atual) => somarDias(atual, direcao === 'frente' ? 1 : -1));
      setDirecaoCarrossel(null);
    }, 240);
  }

  function selecionarDiaAdjacente(quantidade) {
    if (direcaoCarrossel) return;
    const novaData = somarDias(dataSelecionada, quantidade);
    const datasVisiveis = Array.from({ length: 7 }, (_, indice) => somarDias(inicioJanela, indice));
    if (!ehSmartphone && !datasVisiveis.includes(novaData)) moverJanela(quantidade > 0 ? 'frente' : 'tras');
    irParaDia(novaData);
  }

  function selecionarDataGarantindoVisibilidade(novaData) {
    const datasVisiveis = Array.from({ length: 7 }, (_, indice) => somarDias(inicioJanela, indice));
    if (!paraDataSemHora(novaData) || datasVisiveis.includes(novaData)) {
      irParaDia(novaData);
      return;
    }
    const data = paraDataSemHora(novaData);
    const inicio = paraDataSemHora(inicioJanela);
    clearTimeout(temporizadorCarrosselRef.current);
    setDirecaoCarrossel(null);
    setInicioJanela(somarDias(novaData, -3));
    irParaDia(novaData);
  }

  function irParaAba(novaAba) {
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('aba', novaAba);
      return novo;
    }, { replace: true });
  }

  function dataBrParaIso(dataBr) {
    const m = String(dataBr || '').match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    return m ? `20${m[3]}-${m[2]}-${m[1]}` : '';
  }

  function dataIsoParaBr(dataIso) {
    const m = String(dataIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1].slice(-2)}` : '';
  }

  function abrirNovoLembrete() {
    setFormLembrete({ titulo: '', data: dataBrParaIso(dataSelecionada), horario: '', observacao: '', concluido: false });
    setLembreteAberto({ novo: true });
  }

  function abrirEdicaoLembrete(lembrete) {
    setFormLembrete({ titulo: lembrete.titulo, data: lembrete.data, horario: lembrete.horario || '', observacao: lembrete.observacao || '', concluido: Boolean(lembrete.concluido) });
    setLembreteAberto(lembrete);
  }

  async function salvarLembrete() {
    if (!formLembrete.titulo.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(formLembrete.data)) {
      mostrarToast('Informe o título e a data do lembrete.', 'erro');
      return;
    }
    setSalvandoLembrete(true);
    try {
      if (lembreteAberto?.novo) await api.agenda.criarLembrete(formLembrete);
      else await api.agenda.atualizarLembrete(lembreteAberto.id, formLembrete);
      setLembreteAberto(null);
      mostrarToast(lembreteAberto?.novo ? 'Lembrete criado.' : 'Lembrete atualizado.');
      carregar();
    } catch (err) {
      mostrarToast(err.message, 'erro');
    } finally {
      setSalvandoLembrete(false);
    }
  }

  async function alternarLembrete(lembrete) {
    try {
      await api.agenda.atualizarLembrete(lembrete.id, { ...lembrete, concluido: !lembrete.concluido });
      carregar();
    } catch (err) { mostrarToast(err.message, 'erro'); }
  }

  async function excluirLembrete(lembrete) {
    if (!confirm(`Excluir o lembrete "${lembrete.titulo}"?`)) return;
    try {
      await api.agenda.excluirLembrete(lembrete.id);
      setChaveSelecionada(null);
      mostrarToast('Lembrete excluído.');
      carregar();
    } catch (err) { mostrarToast(err.message, 'erro'); }
  }

  async function darBaixa(item, par) {
    const chave = `${item.pedidoId}-${item.mensagem}`;
    setSalvandoBaixa(chave);
    try {
      await api.agenda.darBaixaFonada(item.pedidoId, item.mensagem);
      if (par) await api.agenda.darBaixaFonada(par.pedidoId, par.mensagem);
      mostrarToast('BAIXA DADA COM SUCESSO');
      abrirWhatsappSeExistir(item.whatsapp, mensagemConfirmacaoAgenda(item.nome_comprador, item.para, getNomeExibicao()));
      carregar();
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível registrar a baixa.', 'erro');
    } finally {
      setSalvandoBaixa(null);
    }
  }

  async function desfazerBaixa(item, par) {
    const chave = `desfazer-${item.pedidoId}-${item.mensagem}`;
    setSalvandoBaixa(chave);
    try {
      await api.agenda.desfazerBaixaFonada(item.pedidoId, item.mensagem);
      if (par) await api.agenda.desfazerBaixaFonada(par.pedidoId, par.mensagem);
      mostrarToast(par ? 'Baixa desfeita nas 2 mensagens.' : 'Baixa desfeita.');
      carregar();
    } catch (err) {
      mostrarToast('Não foi possível desfazer. Tente novamente.', 'erro');
    } finally {
      setSalvandoBaixa(null);
    }
  }

  function abrirRemarcar(item) {
    setItemRemarcarAberto({
      pedidoId: item.pedidoId, mensagem: item.mensagem, nome: item.nome_comprador,
      whatsapp: item.whatsapp, para: item.para,
    });
    setObservacao('');
    setRemarcadoDia(hojeFormatado());
    setRemarcadoHorario('');
  }

  function cancelarRemarcar() {
    setItemRemarcarAberto(null);
  }

  async function confirmarRemarcar() {
    if (!remarcadoDia.trim() || !remarcadoHorario.trim()) {
      mostrarToast('Informe o novo dia e horário para remarcar.', 'erro');
      return;
    }
    const dataEscolhida = paraDataSemHora(remarcadoDia.trim());
    if (dataEscolhida && dataEscolhida.getTime() < hojeSemHora().getTime()) {
      mostrarToast('Não é possível remarcar para um dia anterior a hoje.', 'erro');
      return;
    }
    setSalvandoRemarcacao(true);
    try {
      await api.agenda.naoAtendeuFonada(
        itemRemarcarAberto.pedidoId,
        itemRemarcarAberto.mensagem,
        observacao.trim() || null,
        remarcadoDia.trim(),
        remarcadoHorario.trim()
      );
      mostrarToast('Tentativa registrada e mensagem remarcada.');
      abrirWhatsappSeExistir(
        itemRemarcarAberto.whatsapp,
        mensagemRegistrarERemarcar(
          itemRemarcarAberto.nome,
          itemRemarcarAberto.para,
          getNomeExibicao()
        )
      );
      setItemRemarcarAberto(null);
      carregar();
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível registrar.', 'erro');
    } finally {
      setSalvandoRemarcacao(false);
    }
  }

  // Pendentes primeiro (ordenados por horário), já passados/pagos depois
  // (também ordenados por horário entre si) — em vez de escondidos, ficam
  // sempre visíveis no fim da lista, acinzentados.
  function ordenarPendentesPrimeiro(lista, chaveHorario) {
    return [...lista].sort((a, b) => {
      if (a.passada !== b.passada) return a.passada ? 1 : -1;
      return (a[chaveHorario] || '').localeCompare(b[chaveHorario] || '');
    });
  }

  // Junta a 1ª e a 2ª mensagem do mesmo pedido numa única linha da
  // lista quando são para o mesmo destinatário, mesmo dia e mesmo
  // horário — é o caso comum de quem compra as duas mensagens de uma
  // vez e passa as duas juntas na mesma ligação. Sem isso, as duas
  // apareciam como linhas separadas e não dava pra perceber, só
  // olhando a lista, que eram a mesma ligação.
  //
  // O dia entra na comparação (além do horário) porque, por
  // coincidência, dá pra ter a 1ª mensagem marcada pra um dia X e a 2ª
  // marcada bem depois pra outro dia Z, ambas pro mesmo destinatário e
  // no mesmo horário Y (ex: sempre liga às 14h) — sem checar o dia
  // também, essas duas ligações completamente separadas apareceriam
  // agrupadas como se fossem uma coisa só, o que estaria errado. Uma
  // mensagem já passada e a outra ainda pendente também não é
  // agrupada — nesse caso já não faz mais sentido tratar como "uma
  // coisa só" na lista.
  function agruparMensagensDuplas(lista) {
    const porPedido = new Map();
    for (const item of lista) {
      if (!porPedido.has(item.pedidoId)) porPedido.set(item.pedidoId, []);
      porPedido.get(item.pedidoId).push(item);
    }

    const idsAbsorvidos = new Set();
    for (const item of lista) {
      if (item.mensagem !== 1) continue;
      const doMesmoPedido = porPedido.get(item.pedidoId) || [];
      const par = doMesmoPedido.find((outro) => outro.mensagem === 2);
      const podeAgrupar = par
        && (item.para || '').trim().toUpperCase() === (par.para || '').trim().toUpperCase()
        && (item.para || '').trim() !== ''
        && item.dia === par.dia
        && item.dia
        && item.horario === par.horario
        && item.horario
        && item.passada === par.passada;
      if (podeAgrupar) idsAbsorvidos.add(`${par.pedidoId}-2`);
    }

    // Mantém a posição original da 1ª mensagem na lista (já ordenada
    // por horário) — só marca a 2ª mensagem absorvida para não
    // aparecer de novo como linha própria, sem reordenar nada.
    return lista
      .filter((item) => !idsAbsorvidos.has(`${item.pedidoId}-${item.mensagem}`))
      .map((item) => {
        if (item.mensagem !== 1) return item;
        const doMesmoPedido = porPedido.get(item.pedidoId) || [];
        const par = doMesmoPedido.find((outro) => outro.mensagem === 2 && idsAbsorvidos.has(`${outro.pedidoId}-2`));
        return par ? { ...item, agrupada: par } : item;
      });
  }

  const fonadaExibida = agruparMensagensDuplas(ehHoje ? ordenarPendentesPrimeiro(fonada, 'horario') : fonada);
  const aoVivoExibido = ehHoje ? ordenarPendentesPrimeiro(aoVivo, 'horario_entrega') : aoVivo;
  const lembretesExibidos = [...lembretes].sort((a, b) => {
    if (a.concluido !== b.concluido) return a.concluido ? 1 : -1;
    return (a.horario || '').localeCompare(b.horario || '');
  });
  const todosItens = [
    ...fonadaExibida.map((item) => ({ ...item, _tipo: 'fonada', _chave: `${item.pedidoId}-${item.mensagem}`, _horario: item.horario || '' })),
    ...aoVivoExibido.map((item) => ({ ...item, _tipo: 'aovivo', _chave: `aovivo-${item.id}`, _horario: item.horario_entrega || '' })),
    ...lembretesExibidos.map((item) => ({ ...item, _tipo: 'lembrete', _chave: `lembrete-${item.id}`, _horario: item.horario || '' })),
  ].sort((a, b) => a._horario.localeCompare(b._horario));
  const listasPorAba = {
    geral: todosItens,
    fonada: todosItens.filter((item) => item._tipo === 'fonada'),
    aovivo: todosItens.filter((item) => item._tipo === 'aovivo'),
    lembretes: todosItens.filter((item) => item._tipo === 'lembrete'),
  };
  const listaAtual = listasPorAba[aba] || todosItens;
  const chaveDoItem = (item) => item._chave;
  const itemEstaConcluido = (item) => (
    (item._tipo === 'fonada' && Boolean(item.passada))
    || (item._tipo === 'aovivo' && Boolean(item.passada))
    || (item._tipo === 'lembrete' && Boolean(item.concluido))
  );
  const itensPendentes = listaAtual.filter((item) => !itemEstaConcluido(item));
  const itensConcluidos = listaAtual.filter(itemEstaConcluido);
  const listaPendentes = useListaIncremental(itensPendentes, `${dataSelecionada}:${aba}:pendentes`);
  const listaConcluidos = useListaIncremental(itensConcluidos, `${dataSelecionada}:${aba}:concluidos`);

  // Ao trocar de dia ou de aba: no desktop, seleciona automaticamente o
  // primeiro item (painel de detalhes nunca fica vazio à toa). No
  // mobile isso é indesejado — abriria o drawer de detalhes sozinho a
  // cada troca — então lá só limpa a seleção que não existe mais,
  // deixando o usuário escolher o que ver tocando na lista.
  useEffect(() => {
    // Ao voltar da tela de um pedido, a seleção já vem na URL. Enquanto
    // a agenda recarrega, as listas ficam momentaneamente vazias; não
    // podemos interpretar esse estado transitório como item removido,
    // senão a chave restaurada é apagada antes dos dados chegarem.
    if (carregando) return;
    if (listaAtual.length === 0) {
      setChaveSelecionada(null);
      return;
    }
    const itemAindaExiste = listaAtual.find((item) => chaveDoItem(item) === chaveSelecionada);
    const itemFicouOculto = itemAindaExiste && itemEstaConcluido(itemAindaExiste) && !concluidosAbertos;
    if (!itemAindaExiste || itemFicouOculto) {
      const ehMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
      setChaveSelecionada(ehMobile || itensPendentes.length === 0 ? null : chaveDoItem(itensPendentes[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, dataSelecionada, fonada, aoVivo, lembretes, concluidosAbertos, carregando]);

  const itemSelecionado = listaAtual.find((item) => chaveDoItem(item) === chaveSelecionada) || null;
  const inicioRenderizacao = direcaoCarrossel === 'tras' ? -1 : 0;
  const quantidadeCards = ehSmartphone ? 14 : (direcaoCarrossel ? 8 : 7);
  const datasDosCards = Array.from(
    { length: quantidadeCards },
    (_, indice) => ehSmartphone
      ? somarDias(dataSelecionada, -1 + indice)
      : somarDias(inicioJanela, inicioRenderizacao + indice)
  );

  function renderizarLinhaAgenda(item) {
    const chave = item._chave;
    if (item._tipo === 'fonada') {
      const jaPassada = Boolean(item.passada);
      const urgencia = (ehHoje && !jaPassada) ? statusUrgenciaItem(item.horario) : null;
      return (
        <LinhaAgenda
          key={chave}
          selecionada={chaveSelecionada === chave}
          onClick={() => setChaveSelecionada(chave)}
          urgencia={urgencia}
          jaPassada={jaPassada}
          senhaOs={item.senha_os}
          horario={item.horario}
          titulo={item.nome_comprador}
          tagExtra={item.statusMensagemEmHaver === 'EXPIRADA'
            ? 'Expirada'
            : item.agrupada
              ? (aba === 'geral' ? 'Fonada · 1ª + 2ª juntas' : '1ª + 2ª juntas')
              : (aba === 'geral' ? 'Fonada' : `${item.mensagem}ª msg`)}
          tagExtraDestaque={Boolean(item.agrupada)}
          status={(!ehHoje || jaPassada) ? (item.resultado ? 'Passada' : 'Pendente') : null}
          statusOk={Boolean(item.resultado)}
        />
      );
    }
    if (item._tipo === 'aovivo') {
      const jaPassada = Boolean(item.passada);
      const urgencia = (ehHoje && !jaPassada) ? statusUrgenciaItem(item.horario_entrega) : null;
      return (
        <LinhaAgenda
          key={chave}
          selecionada={chaveSelecionada === chave}
          onClick={() => setChaveSelecionada(chave)}
          urgencia={urgencia}
          jaPassada={jaPassada}
          senhaOs={item.numero_os}
          horario={item.horario_entrega}
          titulo={item.comprador}
          detalhes={[
            item.bairro,
            item.brinde,
          ].filter(Boolean)}
          tagExtra={aba === 'geral' ? 'Ao vivo' : (jaPassada ? null : 'Agendado')}
          prazo={pagamentoEhPrazo(item.pagamento)}
          status={jaPassada ? 'Entregue' : (item.pagou === 'SIM' ? 'Pago' : null)}
          statusOk={jaPassada || item.pagou === 'SIM'}
        />
      );
    }
    return (
      <LinhaAgenda
        key={chave}
        selecionada={chaveSelecionada === chave}
        onClick={() => setChaveSelecionada(chave)}
        urgencia={ehHoje && !item.concluido ? statusUrgenciaItem(item.horario) : null}
        jaPassada={item.concluido}
        senhaOs="•"
        horario={item.horario || 'Dia'}
        titulo={item.titulo}
        tagExtra="Lembrete"
        status={item.concluido ? 'Concluído' : null}
        statusOk={item.concluido}
      />
    );
  }

  return (
    <div className="agenda-v2">
      <Relogio />
      <CabecalhoPagina
        className="agenda-cabecalho-v3"
        contexto="Operação diária"
        titulo="Agenda"
        descricao={ehHoje ? 'Acompanhe o ritmo de hoje e as próximas mensagens.' : `Consultando ${rotuloDiaSemana(dataSelecionada)}, ${dataSelecionada}.`}
        acoes={<div className="agenda-controles-v2">
          <button type="button" className="btn-small agenda-novo-lembrete" onClick={abrirNovoLembrete}>+ Lembrete</button>
          <button type="button" className="agenda-seta-dia" onClick={() => selecionarDiaAdjacente(-1)} aria-label="Dia anterior">←</button>
          <CampoData
            className="campo-data-agenda"
            placeholder="dd/mm/aa"
            value={dataSelecionada}
            onChange={(v) => selecionarDataGarantindoVisibilidade(formatarData(v))}
          />
          {!ehHoje && (
            <button type="button" className="btn-small agenda-hoje" onClick={() => selecionarDataGarantindoVisibilidade(hojeFormatado())}>
              Hoje
            </button>
          )}
          <button type="button" className="agenda-seta-dia" onClick={() => selecionarDiaAdjacente(1)} aria-label="Próximo dia">→</button>
          {!ehHoje && (
            <span className="aviso-consulta-agenda"><i /> Somente visualização</span>
          )}
        </div>}
      />

      <div className="carrossel-dias-agenda" aria-label="Navegação pelos dias da agenda">
        <button type="button" className="seta-carrossel-agenda" onClick={() => moverJanela('tras')} disabled={Boolean(direcaoCarrossel)} aria-label="Mostrar dia anterior">‹</button>
        <div className="faixa-semana-viewport">
          {carregandoSemana ? (
            <span className="fs-sm texto-suave">Carregando próximos dias...</span>
          ) : (
            <div className={`faixa-semana-agenda ${direcaoCarrossel ? `animando ${direcaoCarrossel}` : ''}`}>
              {datasDosCards.map((data) => {
                const total = contagensPorData[data];
                return (
                  <button key={data} type="button" className={`${data === dataSelecionada ? 'ativo' : ''} ${data === hojeFormatado() ? 'hoje' : ''}`} onClick={() => irParaDia(data)}>
                    <span>{data === hojeFormatado() ? 'Hoje' : rotuloDiaSemana(data)}</span>
                    <strong>{data.slice(0, 5)}</strong>
                    <small>{total ?? '…'} {total === 1 ? 'compromisso' : 'compromissos'}</small>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button type="button" className="seta-carrossel-agenda" onClick={() => moverJanela('frente')} disabled={Boolean(direcaoCarrossel)} aria-label="Mostrar próximo dia">›</button>
      </div>

      <div key={`${dataSelecionada}-${aba}`} className={`agenda-conteudo-transicao ${direcaoConteudo}`}>
      {erro && <AvisoInline tom="erro" titulo="Não foi possível atualizar a agenda">{erro}</AvisoInline>}

      {carregando && !dataRef ? (
        <SkeletonAgenda />
      ) : (
        <div className={`section-box secao-relatorios ${carregando ? 'agenda-carregando-dados' : ''}`} aria-busy={carregando}>
          {carregando && <div className="agenda-atualizando">Atualizando agenda...</div>}
          <div className="abas-cliente">
            <button
              type="button"
              className={`aba-cliente-botao ${aba === 'geral' ? 'ativa' : ''}`}
              onClick={() => irParaAba('geral')}
            >
              Geral <span className="aba-contagem">{todosItens.length}</span>
            </button>
            <button
              type="button"
              className={`aba-cliente-botao ${aba === 'fonada' ? 'ativa' : ''}`}
              onClick={() => irParaAba('fonada')}
            >
              Fonada <span className="aba-contagem">{fonadaExibida.length}</span>
            </button>
            <button
              type="button"
              className={`aba-cliente-botao ${aba === 'aovivo' ? 'ativa' : ''}`}
              onClick={() => irParaAba('aovivo')}
            >
              Ao vivo <span className="aba-contagem">{aoVivoExibido.length}</span>
            </button>
            <button
              type="button"
              className={`aba-cliente-botao ${aba === 'lembretes' ? 'ativa' : ''}`}
              onClick={() => irParaAba('lembretes')}
            >
              Lembretes <span className="aba-contagem">{lembretesExibidos.length}</span>
            </button>
          </div>

          <div className={`grid-agenda-lista-painel ${listaAtual.length === 0 ? 'sem-itens' : ''}`}>
            <div className="lista-agenda-compacta">
              {listaAtual.length === 0 ? (
                <AgendaVazia ehHoje={ehHoje} onNovo={abrirNovoLembrete} />
              ) : (
                <>
                  {itensPendentes.length > 0
                    ? listaPendentes.itensVisiveis.map(renderizarLinhaAgenda)
                    : <div className="agenda-pendentes-vazia">Nenhum item pendente.</div>}
                  <BotaoMostrarMais temMais={listaPendentes.temMais} restantes={listaPendentes.restantes} onClick={listaPendentes.mostrarMais} />
                  {itensConcluidos.length > 0 && (
                    <div className={`agenda-concluidos ${concluidosAbertos ? 'aberto' : ''}`}>
                      <button
                        type="button"
                        className="agenda-concluidos-toggle"
                        onClick={() => setConcluidosAbertos((aberto) => !aberto)}
                        aria-expanded={concluidosAbertos}
                        aria-controls="agenda-itens-concluidos"
                      >
                        <span className="agenda-concluidos-seta" aria-hidden="true">›</span>
                        <span>Concluídos</span>
                        <span className="agenda-concluidos-contagem">{itensConcluidos.length}</span>
                        <small>{concluidosAbertos ? 'Clique para recolher' : 'Clique para visualizar'}</small>
                      </button>
                      {concluidosAbertos && (
                        <div id="agenda-itens-concluidos" className="agenda-concluidos-lista">
                          {listaConcluidos.itensVisiveis.map(renderizarLinhaAgenda)}
                          <BotaoMostrarMais temMais={listaConcluidos.temMais} restantes={listaConcluidos.restantes} onClick={listaConcluidos.mostrarMais} />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {listaAtual.length > 0 && <div className={`painel-detalhes-agenda ${itemSelecionado ? 'drawer-aberto' : ''}`}>
              {itemSelecionado && (
                <button
                  type="button"
                  className="drawer-fechar-mobile"
                  onClick={() => setChaveSelecionada(null)}
                  aria-label="Fechar detalhes"
                >
                  ✕
                </button>
              )}
              {!itemSelecionado ? (
                <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '24px 12px' }}>
                  Selecione um item da lista para ver os detalhes.
                </p>
              ) : itemSelecionado._tipo === 'fonada' ? (
                <DetalhesFonada
                  item={itemSelecionado}
                  ehHoje={ehHoje}
                  salvandoBaixa={salvandoBaixa}
                  navigate={navigate}
                  onDarBaixa={darBaixa}
                  onDesfazerBaixa={desfazerBaixa}
                  onAbrirRemarcar={abrirRemarcar}
                />
              ) : itemSelecionado._tipo === 'aovivo' ? (
                <DetalhesAoVivo
                  item={itemSelecionado}
                  ehHoje={ehHoje}
                  navigate={navigate}
                />
              ) : (
                <DetalhesLembrete
                  item={itemSelecionado}
                  onEditar={abrirEdicaoLembrete}
                  onAlternar={alternarLembrete}
                  onExcluir={excluirLembrete}
                />
              )}
            </div>}
          </div>
        </div>
      )}
      </div>

      {itemSelecionado && (
        <div className="drawer-overlay-mobile" onClick={() => setChaveSelecionada(null)} />
      )}

      {itemRemarcarAberto && (
        <Dialogo
          titulo={`Não atendeu — ${itemRemarcarAberto.nome}`}
          descricao={`A tentativa será registrada agora. Escolha quando remarcar a ${itemRemarcarAberto.mensagem}ª mensagem.`}
          onClose={cancelarRemarcar}
        >
            <div className="grade grade-2">
              <div className="campo">
                <label>Novo dia *</label>
                <CampoData
                  placeholder="dd/mm/aa"
                  value={remarcadoDia}
                  onChange={(v) => setRemarcadoDia(formatarData(v))}
                  minimo={hojeSemHora()}
                />
              </div>
              <div className="campo">
                <label>Novo horário *</label>
                <input
                  placeholder="hh:mm"
                  value={remarcadoHorario}
                  onChange={(e) => setRemarcadoHorario(formatarHorario(e.target.value))}
                  autoFocus
                />
              </div>
            </div>
            <div className="campo">
              <label>Observação (opcional)</label>
              <input
                placeholder="Ex: caixa postal, número errado..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn secundario" onClick={cancelarRemarcar}>Cancelar</button>
              <button type="button" className="btn" onClick={confirmarRemarcar} disabled={salvandoRemarcacao}>
                {salvandoRemarcacao ? 'Salvando...' : 'Registrar e remarcar'}
              </button>
            </div>
        </Dialogo>
      )}

      {lembreteAberto && (
        <Dialogo titulo={lembreteAberto.novo ? 'Novo lembrete' : 'Editar lembrete'} descricao="Organize uma tarefa avulsa junto à agenda operacional." onClose={() => setLembreteAberto(null)} className="modal-lembrete">
            <div className="campo">
              <label>Título *</label>
              <input autoFocus maxLength={160} value={formLembrete.titulo} onChange={(e) => setFormLembrete((atual) => ({ ...atual, titulo: e.target.value }))} placeholder="Ex: Ligar para fornecedor" />
            </div>
            <div className="grade grade-2">
              <div className="campo">
                <label>Data *</label>
                <CampoData placeholder="dd/mm/aa" value={dataIsoParaBr(formLembrete.data) || formLembrete.data} onChange={(v) => { const formatada = formatarData(v); setFormLembrete((atual) => ({ ...atual, data: dataBrParaIso(formatada) || formatada })); }} />
              </div>
              <div className="campo">
                <label>Horário (opcional)</label>
                <input type="time" value={formLembrete.horario} onChange={(e) => setFormLembrete((atual) => ({ ...atual, horario: e.target.value }))} />
              </div>
            </div>
            <div className="campo">
              <label>Observação (opcional)</label>
              <textarea rows={4} value={formLembrete.observacao} onChange={(e) => setFormLembrete((atual) => ({ ...atual, observacao: e.target.value }))} placeholder="Informações úteis para lembrar" />
            </div>
            <div className="modal-lembrete-acoes">
              <button type="button" className="btn secundario" onClick={() => setLembreteAberto(null)}>Cancelar</button>
              <button type="button" className="btn" onClick={salvarLembrete} disabled={salvandoLembrete}>{salvandoLembrete ? 'Salvando...' : 'Salvar lembrete'}</button>
            </div>
        </Dialogo>
      )}

    </div>
  );
}

function SkeletonAgenda() {
  return <div className="agenda-skeleton section-box" aria-label="Carregando agenda"><div className="agenda-skeleton-tabs"><i/><i/></div><div className="agenda-skeleton-grid"><div>{Array.from({ length: 6 }, (_, i) => <span key={i}/>)}</div><aside><b/><i/><i/><i/></aside></div></div>;
}

function AgendaVazia({ ehHoje, onNovo }) {
  return <div className="agenda-vazia"><div className="agenda-vazia-icone">✓</div><strong>Agenda livre {ehHoje ? 'por enquanto' : 'neste dia'}</strong><p>Nenhum compromisso está marcado para {ehHoje ? 'hoje' : 'a data selecionada'}.</p><button type="button" className="btn-small" onClick={onNovo}>+ Criar lembrete</button></div>;
}

function DetalhesLembrete({ item, onEditar, onAlternar, onExcluir }) {
  const dataFormatada = item.data ? item.data.split('-').reverse().join('/') : '—';
  return (
    <div className={item.concluido ? 'lembrete-concluido' : ''}>
      <div className="detalhe-lembrete-topo"><span className="tag neutro">Lembrete</span>{item.concluido && <span className="tag ok">Concluído</span>}</div>
      <h2 className="detalhe-lembrete-titulo">{item.titulo}</h2>
      <div className="grade grade-2 detalhe-lembrete-dados"><Info label="Data" valor={dataFormatada} /><Info label="Horário" valor={item.horario || 'Dia inteiro'} /></div>
      {item.observacao && <div className="detalhe-lembrete-observacao"><Info label="Observação" valor={item.observacao} /></div>}
      <div className="detalhe-lembrete-acoes">
        <button type="button" className="btn-action destaque" onClick={() => onAlternar(item)}>{item.concluido ? 'Reabrir' : 'Marcar concluído'}</button>
        <button type="button" className="btn-action" onClick={() => onEditar(item)}>Editar</button>
        <button type="button" className="btn-action perigo-acao" onClick={() => onExcluir(item)}>Excluir</button>
      </div>
    </div>
  );
}

function IconeUsuario() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

function IconePedido() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

function IconeNaoAtendeu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8 10a16 16 0 0 0 6 6l1.3-1.4a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function IconeCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Seta de expandir/recolher — gira 180° quando o card está aberto.
function IconeChevron({ aberto }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 18, height: 18, flexShrink: 0, transition: 'transform 0.15s', transform: aberto ? 'rotate(180deg)' : 'none' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Uma linha fina e clicável na lista compacta — horário, nome, tag de
// urgência/status. Reduz cada item a uma tira baixa, para caber muitos
// na tela sem rolar, em vez do card grande com todos os campos aberto.
function LinhaAgenda({ selecionada, onClick, urgencia, jaPassada, senhaOs, horario, titulo, detalhes = [], tagExtra, tagExtraDestaque, prazo, status, statusOk }) {
  return (
    <div
      className={`linha-agenda ${selecionada ? 'selecionada' : ''} ${urgencia ? `urgencia-${urgencia}` : ''} ${jaPassada ? 'passada' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      {senhaOs && <span className="linha-agenda-os">{senhaOs}</span>}
      <span className="linha-agenda-horario" style={{ textDecoration: jaPassada ? 'line-through' : 'none' }}>
        {horario || '—'}
      </span>
      <span className="linha-agenda-conteudo">
        <span className="linha-agenda-titulo">{titulo || '—'}</span>
        {detalhes.length > 0 && (
          <span className="linha-agenda-detalhes">
            {detalhes.map((detalhe, indice) => (
              <React.Fragment key={detalhe}>
                {indice > 0 && <span className="linha-agenda-separador" aria-hidden="true">•</span>}
                <span>{detalhe}</span>
              </React.Fragment>
            ))}
          </span>
        )}
      </span>
      {(tagExtra || prazo || urgencia || status) && (
        <span className="linha-agenda-tags">
          {tagExtra && <span className="tag neutro linha-agenda-tag" style={tagExtraDestaque ? { fontWeight: 700 } : undefined}>{tagExtra}</span>}
          {prazo && <span className="tag aviso linha-agenda-tag">Prazo</span>}
          {urgencia === 'atrasada' && <span className="tag pendente linha-agenda-tag">Atrasado</span>}
          {urgencia === 'proxima' && <span className="tag aviso linha-agenda-tag">Chegando</span>}
          {status && <span className={`tag ${statusOk ? 'ok' : 'pendente'} linha-agenda-tag`}>{status}</span>}
        </span>
      )}
    </div>
  );
}

// Painel de detalhes — mostra todos os campos e ações do item
// selecionado na lista, para caber mensagens/pedidos por dia sem abrir
// uma tela nova para cada um.
function DetalhesFonada({ item, ehHoje, salvandoBaixa, navigate, onDarBaixa, onDesfazerBaixa, onAbrirRemarcar }) {
  const chave = `${item.pedidoId}-${item.mensagem}`;
  const jaPassada = ehHoje && item.passada;
  const urgencia = (ehHoje && !jaPassada) ? statusUrgenciaItem(item.horario) : null;

  // Quando as duas mensagens do pedido têm o mesmo destinatário e
  // horário, vêm juntas nesse item (ver agruparMensagensDuplas) — o
  // painel mostra o tema/código das duas e dá baixa nas duas de uma vez,
  // já que na prática são passadas juntas na mesma ligação.
  const par = item.agrupada;
  const chavePar = par ? `${par.pedidoId}-${par.mensagem}` : null;
  const mensagemExpirada = (item.mensagem === 2 && item.statusMensagemEmHaver === 'EXPIRADA')
    || (par && par.statusMensagemEmHaver === 'EXPIRADA');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="carimbo-os carimbo-os-lista">{item.senha_os || item.pedidoId}</span>
        {par ? (
          <span className="tag neutro" style={{ fontWeight: 700 }}>1ª + 2ª mensagem juntas</span>
        ) : (
          <span className="tag neutro">{item.mensagem}ª mensagem</span>
        )}
        {urgencia === 'atrasada' && <span className="tag pendente">Atrasado</span>}
        {urgencia === 'proxima' && <span className="tag aviso">Chegando</span>}
        {mensagemExpirada && <span className="tag pendente">Expirada</span>}
        {(!ehHoje || jaPassada) && (
          <span className={`tag ${item.resultado ? 'ok' : 'pendente'}`}>
            {item.resultado ? 'Passada' : 'Pendente'}
          </span>
        )}
      </div>
      <div className="agenda-horario-detalhe">
        {item.horario || '—'}
      </div>

      <div className="agenda-destinatario-contato">
        <Info className="agenda-destinatario-principal" label="Destinatário" valor={item.para} />
        {item.celular && <InfoTelefone className="agenda-destinatario-celular" label="Celular" valor={item.celular} />}
        {item.fixo && <Info className="agenda-destinatario-fixo" label="Fixo" valor={item.fixo} />}
      </div>

      <div className="agenda-mensagem-contexto">
        {par ? (
          <>
            <div className="agenda-contexto-duplo">
              <section className="agenda-tema-bloco">
                <Info label="Tema da 1ª mensagem" valor={item.tema ? `${item.tema}${item.codigo ? ' · ' + item.codigo : ''}` : (item.codigo || null)} />
              </section>
              <section className="agenda-tema-bloco">
                <Info label="Tema da 2ª mensagem" valor={par.tema ? `${par.tema}${par.codigo ? ' · ' + par.codigo : ''}` : (par.codigo || null)} />
              </section>
            </div>
            {(item.quemOferece || par.quemOferece) && (
              <div className="agenda-contexto-duplo">
                <section className="agenda-oferece-bloco">
                  <Info label="Oferecimento da 1ª mensagem" valor={item.quemOferece || '—'} />
                </section>
                <section className="agenda-oferece-bloco">
                  <Info label="Oferecimento da 2ª mensagem" valor={par.quemOferece || '—'} />
                </section>
              </div>
            )}
          </>
        ) : (
          <>
            <section className="agenda-tema-bloco">
              <Info label="Tema" valor={item.tema ? `${item.tema}${item.codigo ? ' · ' + item.codigo : ''}` : (item.codigo || null)} />
            </section>
            {item.quemOferece && (
              <section className="agenda-oferece-bloco">
                <Info label="Quem oferece" valor={item.quemOferece} />
              </section>
            )}
          </>
        )}
      </div>

      <div className="agenda-cliente-secundario">
        <span>Cliente</span>
        <NomeComWhatsapp nome={item.nome_comprador} whatsapp={item.whatsapp} />
      </div>

      {(!ehHoje || jaPassada) && item.resultado && (
        <div style={{ marginBottom: 14 }}>
          <Info label={par ? 'Resultado (1ª)' : 'Resultado'} valor={item.resultado} />
        </div>
      )}
      {par && (!ehHoje || jaPassada) && par.resultado && (
        <div style={{ marginBottom: 14 }}>
          <Info label="Resultado (2ª)" valor={par.resultado} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: ehHoje && !jaPassada ? 8 : 0 }}>
        {item.cliente_id && (
          <button type="button" className="btn-action" style={{ flex: 1 }} onClick={() => navigate(`/clientes/${item.cliente_id}`)}>
            <IconeUsuario /> Ver cliente
          </button>
        )}
        <button type="button" className="btn-action" style={{ flex: 1 }} onClick={() => navigate(`/fonada/${item.pedidoId}`)}>
          <IconePedido /> Abrir pedido
        </button>
      </div>
      {mensagemExpirada && <div className="aviso-bloqueio" style={{ marginBottom: 10 }}>A segunda mensagem venceu em {item.dataExpiracaoMensagem || par?.dataExpiracaoMensagem} e não pode mais ser utilizada.</div>}
      {ehHoje && !jaPassada && !mensagemExpirada && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-action perigo-acao" style={{ flex: 1 }} onClick={() => onAbrirRemarcar(item)}>
            <IconeNaoAtendeu /> Não atendeu
          </button>
          <button
            type="button"
            className="btn-action destaque"
            style={{ flex: 1 }}
            onClick={() => (par ? onDarBaixa(item, par) : onDarBaixa(item))}
            disabled={salvandoBaixa === chave || (par && salvandoBaixa === chavePar)}
          >
            <IconeCheck /> {(salvandoBaixa === chave || (par && salvandoBaixa === chavePar)) ? 'Salvando...' : (par ? 'Marcar as 2 passadas' : 'Marcar passada')}
          </button>
        </div>
      )}
      {ehHoje && jaPassada && (
        <button
          type="button"
          className="btn-action"
          style={{ width: '100%' }}
          onClick={() => (par ? onDesfazerBaixa(item, par) : onDesfazerBaixa(item))}
          disabled={salvandoBaixa === `desfazer-${chave}` || (par && salvandoBaixa === `desfazer-${chavePar}`)}
        >
          {(salvandoBaixa === `desfazer-${chave}` || (par && salvandoBaixa === `desfazer-${chavePar}`)) ? 'Desfazendo...' : (par ? 'Desfazer as 2' : 'Desfazer')}
        </button>
      )}

      <CardRemarcacoes pedidoId={item.pedidoId} mensagem={item.mensagem} />
      {par && <CardRemarcacoes pedidoId={par.pedidoId} mensagem={par.mensagem} />}
    </div>
  );
}

// Card separado, abaixo dos detalhes da fonada — clicável para expandir
// e mostrar o histórico de tentativas ("não atendeu" + remarcação) desse
// pedido/mensagem específico. Busca sob demanda (só quando o item
// selecionado muda), e fica escondido quando não há nenhuma tentativa.
function CardRemarcacoes({ pedidoId, mensagem }) {
  const [tentativas, setTentativas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setAberto(false);
    api.agenda.buscarTentativas(pedidoId)
      .then((resp) => {
        if (cancelado) return;
        setTentativas((resp.tentativas || []).filter((t) => t.mensagem === mensagem));
      })
      .catch(() => { if (!cancelado) setTentativas([]); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [pedidoId, mensagem]);

  if (carregando || tentativas.length === 0) return null;

  return (
    <div className="section-box" style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          borderBottom: '1px solid var(--papel-alt)', paddingBottom: 8, marginBottom: aberto ? 10 : 0,
          font: 'inherit', color: 'inherit',
        }}
      >
        <span className="fs-xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
          Remarcações
          <span className="aba-contagem">{tentativas.length}</span>
        </span>
        <IconeChevron aberto={aberto} />
      </button>

      {aberto && (
        <div style={{ display: 'grid', gap: 8 }}>
          {tentativas.map((t) => (
            <div key={t.id} className="info-linha" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                <span className="fs-sm" style={{ fontWeight: 700 }}>
                  Ligou em {t.data_hora_tentativa}
                </span>
                <span className="tag pendente">Não atendeu</span>
              </div>
              {t.observacao && (
                <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>Obs.: {t.observacao}</span>
              )}
              {t.remarcado_dia && (
                <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>
                  Remarcado para {t.remarcado_dia} às {t.remarcado_horario}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Igual a CardRemarcacoes, mas para o histórico de "não recebeu no dia
// previsto" do prazo de pagamento do Ao Vivo — sem o conceito de
// mensagem (1ª/2ª) nem de horário, só o dia do prazo.
function CardRemarcacoesPrazo({ pedidoId }) {
  const [tentativas, setTentativas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setAberto(false);
    api.aoVivo.buscarTentativasPrazo(pedidoId)
      .then((resp) => {
        if (cancelado) return;
        setTentativas(resp.tentativas || []);
      })
      .catch(() => { if (!cancelado) setTentativas([]); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [pedidoId]);

  if (carregando || tentativas.length === 0) return null;

  return (
    <div className="section-box" style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          borderBottom: '1px solid var(--papel-alt)', paddingBottom: 8, marginBottom: aberto ? 10 : 0,
          font: 'inherit', color: 'inherit',
        }}
      >
        <span className="fs-xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
          Remarcações
          <span className="aba-contagem">{tentativas.length}</span>
        </span>
        <IconeChevron aberto={aberto} />
      </button>

      {aberto && (
        <div style={{ display: 'grid', gap: 8 }}>
          {tentativas.map((t) => (
            <div key={t.id} className="info-linha" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
                <span className="fs-sm" style={{ fontWeight: 700 }}>
                  Verificado em {t.data_hora_tentativa}
                </span>
                <span className="tag pendente">Não recebeu</span>
              </div>
              {t.observacao && (
                <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>Obs.: {t.observacao}</span>
              )}
              {t.remarcado_dia && (
                <span className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>
                  Remarcado para {t.remarcado_dia}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetalhesAoVivo({ item, ehHoje, navigate }) {
  const urgencia = (ehHoje && !item.passada) ? statusUrgenciaItem(item.horario_entrega) : null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="carimbo-os carimbo-os-lista">{item.numero_os || item.id}</span>
        {urgencia === 'atrasada' && <span className="tag neutro">Horário passado</span>}
        {urgencia === 'proxima' && <span className="tag aviso">Chegando</span>}
        {item.passada && <span className="tag ok">Entregue</span>}
        <span className="tag neutro">Agenda</span>
        {item.pagou === 'SIM' && <span className="tag ok">Pago</span>}
      </div>
      <div className="fs-lg" style={{ fontWeight: 700, marginBottom: 2 }}>{item.comprador || '—'}</div>
      <div className="fs-sm" style={{ color: 'var(--tinta-suave)', marginBottom: 14, paddingBottom: 14, borderBottom: '2px solid var(--papel-alt)' }}>{item.horario_entrega || '—'}</div>
      {item.resultado_entrega && <div className="fs-xs texto-suave" style={{ marginBottom: 14 }}>{item.resultado_entrega}</div>}
      <div className="grade grade-2" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--papel-alt)' }}>
        <Info label="Destinatário" valor={item.para} />
        <Info label="Endereço" valor={item.endereco} />
        <Info label="Bairro" valor={item.bairro} />
        <Info label="Referência" valor={item.referencia} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {item.cliente_id && <button type="button" className="btn-action" style={{ flex: 1 }} onClick={() => navigate(`/clientes/${item.cliente_id}`)}><IconeUsuario /> Ver cliente</button>}
        <button type="button" className="btn-action" style={{ flex: 1 }} onClick={() => navigate(`/ao-vivo/${item.id}`)}><IconePedido /> Abrir pedido</button>
      </div>
      <p className="fs-xs texto-suave" style={{ margin: 0 }}>A Agenda é somente informativa. O pagamento é controlado na tela de Cobrança.</p>
    </div>
  );
}

// Relógio no canto superior direito da tela — só na Agenda, para
// comparar rápido com os horários das mensagens/entregas do dia.
// Atualiza a cada segundo (para trocar de minuto na hora certa),
// exibindo só HH:MM.
function Relogio() {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    const intervalo = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);
  const hh = String(agora.getHours()).padStart(2, '0');
  const mm = String(agora.getMinutes()).padStart(2, '0');
  return (
    <div className="relogio-topo nao-imprimir" aria-label={`Hora atual: ${hh}:${mm}`}>
      {hh}:{mm}
    </div>
  );
}

// Monta o link do WhatsApp a partir de um número de telefone qualquer
// — DDI 55 + DDD + número, só dígitos. Usado tanto no nome do
// comprador quanto no campo Celular do card de detalhes. Quando
// `mensagem` é informada, ela já vem preenchida na conversa ao abrir
// o link.
//
// Usa api.whatsapp.com/send em vez de wa.me — no wa.me, o app
// desktop/Web do WhatsApp historicamente tem bugs para decodificar
// certos emojis (surrogate pairs) vindos da URL, mesmo com o link
// funcionando certinho no celular; api.whatsapp.com costuma ser mais
// consistente entre plataformas.
function linkWhatsappDe(valor, mensagem) {
  const somenteDigitos = String(valor || '').replace(/\D/g, '');
  if (!somenteDigitos) return null;
  const numeroComDDI = somenteDigitos.startsWith('55') ? somenteDigitos : `55${somenteDigitos}`;
  if (numeroComDDI.length < 12) return null;
  const base = `https://api.whatsapp.com/send?phone=${numeroComDDI}`;
  return mensagem ? `${base}&text=${encodeURIComponent(mensagem)}` : base;
}

// Abre o WhatsApp com a mensagem indicada, só se o cliente tiver um
// whatsapp cadastrado — chamado depois de uma ação (marcar passada,
// remarcar) ter concluído com sucesso, não em vez dela.
function abrirWhatsappSeExistir(whatsapp, mensagem) {
  const link = linkWhatsappDe(whatsapp, mensagem);
  if (link) window.open(link, '_blank', 'noopener,noreferrer');
}

// Nome do comprador como título do card — vira link clicável para abrir
// a conversa no WhatsApp quando o cliente tiver esse número cadastrado.
// A mensagem de confirmação/remarcação é enviada só ao concluir as
// ações "Marcar passada" e "Não atendeu" (ver abrirWhatsappSeExistir),
// não ao clicar no nome — aqui abre sempre a conversa vazia.
function NomeComWhatsapp({ nome, whatsapp }) {
  const link = linkWhatsappDe(whatsapp);
  if (!link) {
    return <span className="agenda-cliente-nome">{nome || '—'}</span>;
  }
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="agenda-cliente-nome link-whatsapp"
      title="Abrir conversa no WhatsApp"
    >
      {nome || '—'}
    </a>
  );
}

function Info({ label, valor, className = '' }) {
  return (
    <div className={className}>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
        {label}
      </div>
      <div className="fs-md">{valor || '—'}</div>
    </div>
  );
}

// Igual a Info, mas o valor vira link clicável para abrir a conversa no
// WhatsApp (wa.me), usado no Celular — mesmo padrão de formatação de
// número usado no cadastro (DDI 55 + DDD + número, só dígitos).
function InfoTelefone({ label, valor, mensagem, className = '' }) {
  const linkWhatsapp = linkWhatsappDe(valor, mensagem);

  return (
    <div className={className}>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
        {label}
      </div>
      {linkWhatsapp ? (
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="fs-md link-whatsapp"
          title={mensagem ? 'Enviar confirmação no WhatsApp' : 'Abrir conversa no WhatsApp'}
        >
          {valor}
        </a>
      ) : (
        <div className="fs-md">{valor || '—'}</div>
      )}
    </div>
  );
}

const estilos = {
  navegacaoData: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  itemAgenda: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    flexWrap: 'wrap',
  },
  itemPassado: {
    opacity: 0.55,
  },
};
