import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSmartBack } from '../../hooks/useSmartBack.js';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';
import CampoEnderecoAutocomplete from '../../components/CampoEnderecoAutocomplete.jsx';
import { enderecoComNumero, separarEnderecoNumero } from '../../enderecoAutocomplete.js';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';
import { AvisoInline, CabecalhoPagina, Dialogo, EstadoCarregando } from '../../components/Interface.jsx';
import { filtrarPedidosPorMesDaMensagem, MESES, mensagensDoPedidoNoMes } from '../../utils/filtroMesMensagens.js';

function IconeVoltar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function IconeEditar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
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
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-4.7A8.5 8.5 0 1 1 20.5 11.5Z" /><path d="M8.1 7.8c.3-.7.7-.7 1-.7h.4c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.6.8c-.2.2-.1.4 0 .6.7 1.2 1.7 2.1 2.9 2.7.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.5 0 .3-.2 1.5-1 2.1-.6.5-1.4.8-2.3.6-1.1-.2-2.6-.8-4.4-2.4-1.5-1.4-2.5-3.1-2.8-4.2-.3-1 0-1.9.3-2.5Z" /></svg>;
}

function valorUtil(valor) {
  const texto = String(valor || '').trim();
  return texto && !/^0+$/.test(texto) && texto !== '-' && texto !== '00/00/0000' ? texto : '';
}

function nascimentoValido(valor) {
  const texto = valorUtil(valor);
  const partes = texto.match(/^(\d{2})\/(\d{2})(?:\/(\d{2}|\d{4}))?$/);
  if (!partes) return false;
  const dia = Number(partes[1]); const mes = Number(partes[2]);
  const ano = partes[3] ? Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]) : 2000;
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= new Date(ano, mes, 0).getDate();
}

function dataBrParaNumero(valor) {
  const partes = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!partes) return null;
  const ano = Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]);
  return Date.UTC(ano, Number(partes[2]) - 1, Number(partes[1]));
}

function linkWhatsApp(numero) {
  let digitos = String(numero || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  if (digitos.length <= 11) digitos = `55${digitos}`;
  return `https://api.whatsapp.com/send?phone=${digitos}`;
}

export default function FichaCliente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const voltarHistorico = useSmartBack('/clientes');
  const { mostrarToast } = useToast();

  const [cliente, setCliente] = useState(null);
  const [pedidosFonada, setPedidosFonada] = useState([]);
  const [pedidosAoVivo, setPedidosAoVivo] = useState([]);
  const [aba, setAba] = useState(() => searchParams.get('aba') === 'aovivo' ? 'aovivo' : 'fonada');
  const [editando, setEditando] = useState(false);
  const [dadosEdicao, setDadosEdicao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [mostrandoBloqueio, setMostrandoBloqueio] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [salvandoBloqueio, setSalvandoBloqueio] = useState(false);
  const [mesMensagens, setMesMensagens] = useState(() => searchParams.get('mes') || '');
  const [pedidoSelecionado, setPedidoSelecionado] = useState(() => searchParams.get('pedido') || '');
  const pedidosFonadaFiltrados = filtrarPedidosPorMesDaMensagem(pedidosFonada, mesMensagens);
  const listaFonada = useListaIncremental(pedidosFonadaFiltrados, `${id}:fonada:${mesMensagens}`);
  const listaAoVivo = useListaIncremental(pedidosAoVivo, `${id}:aovivo`);

  function carregar() {
    setCarregando(true);
    setErro('');
    api.clientes.buscar(id)
      .then((resp) => {
        setCliente(resp.cliente);
        setPedidosFonada(resp.pedidosFonada);
        setPedidosAoVivo(resp.pedidosAoVivo);
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (carregando || !pedidoSelecionado) return undefined;
    const pedidosDaAba = aba === 'aovivo' ? pedidosAoVivo : pedidosFonadaFiltrados;
    const listaDaAba = aba === 'aovivo' ? listaAoVivo : listaFonada;
    const indice = pedidosDaAba.findIndex((pedido) => String(pedido.id) === String(pedidoSelecionado));
    if (indice >= listaDaAba.itensVisiveis.length) {
      listaDaAba.mostrarAte(indice + 1);
      return undefined;
    }
    const quadro = requestAnimationFrame(() => {
      document.querySelector(`[data-pedido-id="${pedidoSelecionado}"]`)?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(quadro);
  }, [carregando, pedidoSelecionado, aba, listaFonada.itensVisiveis.length, listaAoVivo.itensVisiveis.length]);

  function abrirPedido(tipo, pedidoId) {
    const parametros = new URLSearchParams();
    parametros.set('aba', tipo);
    parametros.set('pedido', String(pedidoId));
    if (tipo === 'fonada' && mesMensagens) parametros.set('mes', mesMensagens);
    const retorno = `/clientes/${id}?${parametros.toString()}`;

    // Atualiza a entrada atual antes de abrir o pedido. Assim, tanto o
    // botão Voltar da tela quanto o voltar do navegador restauram o mesmo
    // contexto da ficha, inclusive a linha que originou a navegação.
    navigate(retorno, { replace: true });
    navigate(`/${tipo === 'fonada' ? 'fonada' : 'ao-vivo'}/${pedidoId}`, { state: { returnTo: retorno } });
  }

  function iniciarEdicao() {
    const enderecoSeparado = separarEnderecoNumero(cliente.endereco);
    setDadosEdicao({
      ...cliente,
      endereco: enderecoSeparado.logradouro,
      numero: enderecoSeparado.numero,
    });
    setEditando(true);
  }

  function setEdicao(campo, valor) {
    setDadosEdicao((d) => ({ ...d, [campo]: valor }));
  }

  function setEdicaoComMascara(campo, valorBruto, tipoMascara) {
    const formatadores = { celular: formatarCelular, fixo: formatarFixo, data: formatarData };
    setEdicao(campo, formatadores[tipoMascara](valorBruto));
  }

  async function salvarEdicao() {
    setSalvando(true);
    try {
      const { numero, ...dadosPersistidos } = dadosEdicao;
      const atualizado = await api.clientes.atualizar(id, {
        ...dadosPersistidos,
        endereco: enderecoComNumero(dadosEdicao.endereco, numero),
      });
      setCliente(atualizado);
      setEditando(false);
      mostrarToast('Dados do cliente atualizados.');
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function novoPedidoFonada() {
    if (cliente.bloqueado) {
      mostrarToast('Este cliente está bloqueado. Desbloqueie antes de criar um novo pedido.', 'erro');
      return;
    }
    navigate(`/fonada/novo?clienteId=${id}`, { state: { returnTo: `/clientes/${id}` } });
  }

  function novoPedidoAoVivo() {
    if (cliente.bloqueado) {
      mostrarToast('Este cliente está bloqueado. Desbloqueie antes de criar um novo pedido.', 'erro');
      return;
    }
    navigate(`/ao-vivo/novo?clienteId=${id}`, { state: { returnTo: `/clientes/${id}` } });
  }

  async function confirmarBloqueio() {
    setSalvandoBloqueio(true);
    try {
      const atualizado = await api.clientes.bloquear(id, true, motivoBloqueio.trim() || null);
      setCliente(atualizado);
      setMostrandoBloqueio(false);
      setMotivoBloqueio('');
      mostrarToast('Cliente bloqueado. Não será mais possível criar ou editar pedidos dele.');
    } catch (err) {
      mostrarToast('Não foi possível bloquear o cliente. Tente novamente.', 'erro');
    } finally {
      setSalvandoBloqueio(false);
    }
  }

  async function desbloquear() {
    if (!confirm(`Desbloquear "${cliente.nome}"? Voltará a ser possível criar e editar pedidos dele normalmente.`)) return;
    try {
      const atualizado = await api.clientes.bloquear(id, false);
      setCliente(atualizado);
      mostrarToast('Cliente desbloqueado.');
    } catch (err) {
      mostrarToast('Não foi possível desbloquear o cliente. Tente novamente.', 'erro');
    }
  }

  function voltar() {
    voltarHistorico();
  }

  async function excluirCliente() {
    const totalPedidos = pedidosFonada.length + pedidosAoVivo.length;
    const aviso = totalPedidos > 0
      ? `Excluir "${cliente.nome}" também envia ${totalPedidos} pedido(s) vinculado(s) para a lixeira. Confirma?`
      : `Excluir "${cliente.nome}"? Vai para a lixeira, dá pra restaurar depois.`;
    if (!confirm(aviso)) return;

    try {
      await api.clientes.excluir(id);
      mostrarToast('Cliente enviado para a lixeira.');
      navigate('/clientes');
    } catch (err) {
      mostrarToast('Não foi possível excluir. Tente novamente.', 'erro');
    }
  }

  if (carregando) return <EstadoCarregando rotulo="Carregando a ficha do cliente…" linhas={7} />;
  if (erro) return <AvisoInline tom="erro" titulo="Não foi possível abrir a ficha" acao={<button type="button" className="btn secundario" onClick={voltar}>Voltar aos clientes</button>}>{erro}</AvisoInline>;
  if (!cliente) return null;

  const totalFonada = pedidosFonada.reduce((soma, p) => soma + (p.valor || 0), 0);
  const totalAoVivo = pedidosAoVivo.reduce((soma, p) => soma + (p.valor || 0), 0);
  const totalGeral = totalFonada + totalAoVivo;
  const totalPedidos = pedidosFonada.length + pedidosAoVivo.length;
  const valorPendente = pedidosFonada
    .filter((p) => p.pagou !== 'SIM' && valorUtil(p.cobranca))
    .reduce((soma, p) => soma + Number(p.valor || 0), 0)
    + pedidosAoVivo
      .filter((p) => p.pagou !== 'SIM' && String(p.pagamento || '').toUpperCase().includes('PRAZO'))
      .reduce((soma, p) => soma + Number(p.valor || 0), 0);
  const todosPedidos = [...pedidosFonada, ...pedidosAoVivo];
  const ultimoPedido = todosPedidos
    .map((p) => p.data_pedido).filter((data) => dataBrParaNumero(data) != null)
    .sort((a, b) => dataBrParaNumero(b) - dataBrParaNumero(a))[0];
  const hojeUtc = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const proximaCobranca = pedidosFonada
    .map((p) => p.cobranca_reagendada || p.cobranca)
    .filter((data) => dataBrParaNumero(data) != null && dataBrParaNumero(data) >= hojeUtc)
    .sort((a, b) => dataBrParaNumero(a) - dataBrParaNumero(b))[0];
  const whatsappLink = linkWhatsApp(cliente.whatsapp || cliente.celular);
  const cadastroIncompleto = ![cliente.whatsapp, cliente.celular, cliente.fixo].some(valorUtil);

  function formatarReais(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  return (
    <div className="form-pagina">
      <CabecalhoPagina
        contexto="Ficha do cliente"
        titulo={<span className="ficha-cliente-titulo"><span>{cliente.nome}</span>{cliente.bloqueado && <span className="tag pendente">Bloqueado</span>}{cadastroIncompleto && <span className="tag aviso">Contato não informado</span>}</span>}
        descricao={`Cliente desde ${new Date(cliente.criado_em).toLocaleDateString('pt-BR')} · ${totalPedidos} pedido${totalPedidos === 1 ? '' : 's'} registrado${totalPedidos === 1 ? '' : 's'}`}
        acoes={<div className="acoes-ficha-cliente">
          <div className="acoes-pedido-cliente"><button className="btn" onClick={novoPedidoFonada}>Nova fonada</button><button className="btn btn-tonal" onClick={novoPedidoAoVivo}>Novo ao vivo</button></div>
          {whatsappLink && <a className="btn-small cobranca-whatsapp whatsapp-mobile-ficha" href={whatsappLink} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp" title="Abrir WhatsApp"><IconeWhatsApp /></a>}
          <button className="btn secundario" onClick={() => navigate(`/cobranca?nome=${encodeURIComponent(cliente.nome)}`)}>Ver cobrança</button>
          <button className="btn secundario" onClick={voltar} style={{ gap: 6 }}>
            <IconeVoltar /> Voltar
          </button>
        </div>}
      />

      {cliente.bloqueado && (
        <div className="aviso-bloqueio">
          <strong>Cliente bloqueado.</strong> Não é possível criar ou editar pedidos dele em nenhuma tela do sistema.
          {cliente.bloqueio_motivo && <> Motivo: {cliente.bloqueio_motivo}</>}
        </div>
      )}

      {mostrandoBloqueio && (
        <Dialogo titulo={`Bloquear ${cliente.nome}`} descricao="O bloqueio impede novos pedidos e alterações em Fonada, Ao vivo, Cobrança e Agenda até que o cliente seja desbloqueado." onClose={() => setMostrandoBloqueio(false)}>
            <div className="campo">
              <label>Motivo (opcional)</label>
              <input
                value={motivoBloqueio}
                onChange={(e) => setMotivoBloqueio(e.target.value)}
                placeholder="Ex: não pagou, pediu para não ligarem mais..."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn secundario" onClick={() => setMostrandoBloqueio(false)}>
                Cancelar
              </button>
              <button type="button" className="btn perigo" onClick={confirmarBloqueio} disabled={salvandoBloqueio}>
                {salvandoBloqueio ? 'Bloqueando...' : 'Confirmar bloqueio'}
              </button>
            </div>
        </Dialogo>
      )}

      <div className="ficha-cliente-visao-geral">
      <div className="section-box ficha-cliente-dados">
        <div className="section-title">
          <span>Dados do cliente</span>
          {!editando && <div className="acoes-dados-cliente">
            <button type="button" className="btn-small" onClick={iniciarEdicao} style={{ gap: 5 }}><IconeEditar /> Editar</button>
            {cliente.bloqueado
              ? <button type="button" className="btn-small" onClick={desbloquear}>Desbloquear</button>
              : <button type="button" className="btn-small" onClick={() => setMostrandoBloqueio(true)}>Bloquear</button>}
            <button type="button" className="btn-small perigo" onClick={excluirCliente}>Excluir</button>
          </div>}
        </div>

        {!editando ? (
          <div className="ficha-informacoes-grupos">
            <section><h3>Identificação e contato</h3><div className="grade grade-2">
            <Info label="Nascimento" valor={nascimentoValido(cliente.nascimento) ? cliente.nascimento : ''} />
            <Info label="Telefone fixo" valor={valorUtil(cliente.fixo)} />
            <Info label="WhatsApp" valor={valorUtil(cliente.whatsapp)} />
            <Info label="Celular" valor={valorUtil(cliente.celular)} />
            </div></section>
            <section><h3>Endereço e referência</h3><div className="grade grade-2">
            <Info label="Endereço" valor={valorUtil(cliente.endereco)} />
            <Info label="Complemento" valor={valorUtil(cliente.complemento)} />
            <Info label="Bairro" valor={valorUtil(cliente.bairro)} />
            <Info label="Referência" valor={valorUtil(cliente.referencia)} />
            </div></section>
          </div>
        ) : (
          <>
            <div className="grade grade-2">
              <div className="campo">
                <label htmlFor="editar-nome">Nome</label>
                <input id="editar-nome" value={dadosEdicao.nome} onChange={(e) => setEdicao('nome', e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="editar-nascimento">Nascimento</label>
                <input id="editar-nascimento" inputMode="numeric" placeholder="dd/mm/aa" value={dadosEdicao.nascimento || ''} onChange={(e) => setEdicaoComMascara('nascimento', e.target.value, 'data')} />
              </div>
            </div>
            <div className="grade grade-3">
              <div className="campo">
                <label htmlFor="editar-fixo">Telefone fixo</label>
                <input id="editar-fixo" inputMode="tel" autoComplete="tel" value={dadosEdicao.fixo || ''} onChange={(e) => setEdicaoComMascara('fixo', e.target.value, 'fixo')} />
              </div>
              <div className="campo">
                <label htmlFor="editar-whatsapp">WhatsApp</label>
                <input id="editar-whatsapp" inputMode="tel" autoComplete="tel" value={dadosEdicao.whatsapp || ''} onChange={(e) => setEdicaoComMascara('whatsapp', e.target.value, 'celular')} />
              </div>
              <div className="campo">
                <label htmlFor="editar-celular">Celular</label>
                <input id="editar-celular" inputMode="tel" autoComplete="tel" value={dadosEdicao.celular || ''} onChange={(e) => setEdicaoComMascara('celular', e.target.value, 'celular')} />
              </div>
            </div>
            <div className="linha-form-cliente endereco-numero-cliente" style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 18 }}>
              <div className="campo" style={{ flex: '1 1 auto', minWidth: 0, marginBottom: 0 }}>
                <label htmlFor="editar-endereco">Endereço</label>
                <CampoEnderecoAutocomplete id="editar-endereco"
                  value={dadosEdicao.endereco || ''}
                  numero={dadosEdicao.numero || ''}
                  onChange={(valor) => setEdicao('endereco', valor)}
                  onSelecionar={({ logradouro, bairro }) => setDadosEdicao((atual) => ({
                    ...atual,
                    endereco: logradouro,
                    bairro: bairro || atual.bairro,
                  }))}
                />
              </div>
              <div className="campo campo-numero-cliente" style={{ flex: '0 0 96px', width: 96, marginBottom: 0 }}>
                <label htmlFor="editar-numero">Nº</label>
                <input id="editar-numero" value={dadosEdicao.numero || ''} onChange={(e) => setEdicao('numero', e.target.value)} placeholder="Nº / S/N" />
              </div>
            </div>
            <div className="grade grade-3">
              <div className="campo">
                <label htmlFor="editar-complemento">Complemento</label>
                <input id="editar-complemento" value={dadosEdicao.complemento || ''} onChange={(e) => setEdicao('complemento', e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="editar-bairro">Bairro</label>
                <input id="editar-bairro" value={dadosEdicao.bairro || ''} onChange={(e) => setEdicao('bairro', e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="editar-referencia">Referência</label>
                <input id="editar-referencia" value={dadosEdicao.referencia || ''} onChange={(e) => setEdicao('referencia', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn secundario" onClick={() => setEditando(false)}>Cancelar</button>
              <button type="button" className="btn" onClick={salvarEdicao} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="section-box ficha-cliente-resumo">
        <div className="section-title">Resumo do cliente</div>
        <div className="resumo-operacional-cliente">
          <CartaoIndicador label="Último pedido" valor={ultimoPedido || 'Sem pedidos'} />
          <CartaoIndicador label="Total de pedidos" valor={String(totalPedidos)} detalhe={`${pedidosFonada.length} fonada · ${pedidosAoVivo.length} ao vivo`} />
          <CartaoIndicador label="Total gasto" valor={formatarReais(totalGeral)} />
          <CartaoIndicador label="Valor pendente" valor={formatarReais(valorPendente)} destaque={valorPendente > 0} />
          <CartaoIndicador label="Próxima cobrança" valor={proximaCobranca || 'Nenhuma'} />
        </div>
      </div>
      </div>

      <div className="section-box" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="abas-cliente">
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'fonada' ? 'ativa' : ''}`}
            onClick={() => { setAba('fonada'); setPedidoSelecionado(''); }}
          >
            Fonada <span className="aba-contagem">{pedidosFonada.length}</span>
          </button>
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'aovivo' ? 'ativa' : ''}`}
            onClick={() => { setAba('aovivo'); setPedidoSelecionado(''); }}
          >
            Ao vivo <span className="aba-contagem">{pedidosAoVivo.length}</span>
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {aba === 'fonada' && (
            <>
              {pedidosFonada.length > 0 && (
                <div className="historico-filtro-mes">
                  <div className="historico-filtro-mes-campo">
                    <label htmlFor="filtro-mes-mensagem">Mês da mensagem</label>
                    <select
                      id="filtro-mes-mensagem"
                      value={mesMensagens}
                      onChange={(evento) => { setMesMensagens(evento.target.value); setPedidoSelecionado(''); }}
                    >
                      <option value="">Todos os meses</option>
                      {MESES.map((mes, indice) => <option key={mes} value={indice + 1}>{mes}</option>)}
                    </select>
                  </div>
                  {mesMensagens && (
                    <div className="historico-filtro-mes-resultado" role="status">
                      <strong>{pedidosFonadaFiltrados.length}</strong>
                      <span>pedido{pedidosFonadaFiltrados.length === 1 ? '' : 's'} com mensagem em {MESES[Number(mesMensagens) - 1]}</span>
                      <button type="button" onClick={() => setMesMensagens('')}>Limpar filtro</button>
                    </div>
                  )}
                </div>
              )}
              {pedidosFonada.length === 0 ? (
                <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '20px 0' }}>
                  Nenhum pedido de mensagem fonada ainda.
                </p>
              ) : pedidosFonadaFiltrados.length === 0 ? (
                <div className="historico-filtro-vazio">
                  <strong>Nenhuma mensagem em {MESES[Number(mesMensagens) - 1]}</strong>
                  <span>Este cliente não possui 1ª ou 2ª mensagem registrada nesse mês.</span>
                  <button type="button" className="btn secundario" onClick={() => setMesMensagens('')}>Ver todos os pedidos</button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div className="fs-xs" style={{ display: 'flex', gap: 14, marginBottom: 10, color: 'var(--tinta-suave)' }}>
                    <span><span className="bolinha-status usada" /> MARCADA</span>
                    <span><span className="bolinha-status livre" /> DISPONÍVEL</span>
                  </div>
                  <table className="tabela-lista">
                    <thead>
                      <tr>
                        <th>O.S.</th>
                        <th>Data</th>
                        <th>Destinatários</th>
                        <th>Situação</th>
                        <th>Pagamento</th>
                        <th>Cobrança</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaFonada.itensVisiveis.map((p) => {
                        const mensagensNoMes = mensagensDoPedidoNoMes(p, mesMensagens);
                        return (
                        <tr
                          key={p.id}
                          data-pedido-id={p.id}
                          className={`${mesMensagens ? 'historico-pedido-filtrado ' : ''}${String(pedidoSelecionado) === String(p.id) ? 'historico-pedido-selecionado' : ''}`.trim()}
                          onClick={() => abrirPedido('fonada', p.id)}
                        >
                          <td><span className="carimbo-os carimbo-os-lista">{p.senha_os || p.id}</span></td>
                          <td>{p.data_pedido || '—'}</td>
                          <td>
                            <span className={`historico-destinatario ${mensagensNoMes.includes(1) ? 'no-mes' : ''}`}>
                              <strong>1ª:</strong> {mensagensNoMes.includes(1) && <span className="historico-seta-mes" aria-label={`Primeira mensagem em ${MESES[Number(mesMensagens) - 1]}`}>→</span>} {valorUtil(p.p1_para) || '—'}
                            </span>
                            {valorUtil(p.p2_para) && <span className={`historico-destinatario ${mensagensNoMes.includes(2) ? 'no-mes' : ''}`}>
                              <strong>2ª:</strong> {mensagensNoMes.includes(2) && <span className="historico-seta-mes" aria-label={`Segunda mensagem em ${MESES[Number(mesMensagens) - 1]}`}>→</span>} {valorUtil(p.p2_para)}
                            </span>}
                          </td>
                          <td><span className={`historico-situacao ${p.p1_passada_por || p.p2_passada_por || p.p1_resultado || p.p2_resultado ? 'transmitida' : ''}`}>{p.p1_passada_por || p.p2_passada_por || p.p1_resultado || p.p2_resultado ? 'Transmitida' : 'Agendada'}</span></td>
                          <td><span className={`tag ${p.pagou === 'SIM' ? 'ok' : 'pendente'}`}>{p.pagou === 'SIM' ? 'Recebido' : 'Pendente'}</span><span className="historico-cliente-secundario">{p.periodo || 'Presencial'}</span></td>
                          <td>{p.cobranca_reagendada || p.cobranca || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{p.valor != null ? formatarReais(p.valor) : '—'}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <BotaoMostrarMais temMais={listaFonada.temMais} restantes={listaFonada.restantes} onClick={listaFonada.mostrarMais} />
                </div>
              )}
            </>
          )}

          {aba === 'aovivo' && (
            <>
              {pedidosAoVivo.length === 0 ? (
                <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '20px 0' }}>
                  Nenhum pedido de mensagem ao vivo ainda.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="tabela-lista">
                    <thead>
                      <tr>
                        <th>O.S.</th>
                        <th>Data</th>
                        <th>Entrega</th>
                        <th>Para</th>
                        <th>Situação</th>
                        <th>Pagamento</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaAoVivo.itensVisiveis.map((p) => (
                        <tr
                          key={p.id}
                          data-pedido-id={p.id}
                          className={String(pedidoSelecionado) === String(p.id) ? 'historico-pedido-selecionado' : ''}
                          onClick={() => abrirPedido('aovivo', p.id)}
                        >
                          <td><span className="carimbo-os carimbo-os-lista">{p.numero_os || p.id}</span></td>
                          <td>{p.data_pedido || '—'}</td>
                          <td>{p.dia_entrega || '—'}</td>
                          <td>{p.para || '—'}</td>
                          <td><span className="tag neutro">{p.dia_entrega ? 'Agendado' : 'Sem data'}</span></td>
                          <td><span className={`tag ${p.pagou === 'SIM' ? 'ok' : 'pendente'}`}>{p.pagou === 'SIM' ? 'Recebido' : 'A receber'}</span><span className="historico-cliente-secundario">{valorUtil(p.pagamento) || 'Presencial'}</span></td>
                          <td style={{ textAlign: 'right' }}>{p.valor != null ? formatarReais(p.valor) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <BotaoMostrarMais temMais={listaAoVivo.temMais} restantes={listaAoVivo.restantes} onClick={listaAoVivo.mostrarMais} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, valor }) {
  return (
    <div className="ficha-cliente-info">
      <div className="info-label">{label}</div>
      <div className="info-valor">{valor || '—'}</div>
    </div>
  );
}

function CartaoIndicador({ label, valor, detalhe, destaque }) {
  return (
    <div className={`cartao-valor ${destaque ? 'destaque' : ''}`}>
      <div className="cartao-valor-label">{label}</div>
      <div className="cartao-valor-numero">{valor}</div>
      {detalhe && <div className="historico-cliente-secundario">{detalhe}</div>}
    </div>
  );
}

const estilos = {
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
};
