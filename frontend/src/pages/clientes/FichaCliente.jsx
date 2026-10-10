import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSmartBack } from '../../hooks/useSmartBack.js';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';
import CampoEnderecoAutocomplete from '../../components/CampoEnderecoAutocomplete.jsx';
import { enderecoComNumero, separarEnderecoNumero } from '../../enderecoAutocomplete.js';
import { useListaIncremental } from '../../components/ListaIncremental.jsx';
import { AvisoInline, Dialogo, EstadoCarregando } from '../../components/Interface.jsx';
import { filtrarHistorico, resumoFicha } from '../../utils/fichaCliente.js';
import FichaClienteVisao from './FichaClienteVisao.jsx';
import { numeroWhatsAppBrasil } from '../../utils/telefoneWhatsApp.js';

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

function linkWhatsApp(numero) {
  const digitos = numeroWhatsAppBrasil(numero);
  if (!digitos) return null;
  return `https://api.whatsapp.com/send?phone=${digitos}`;
}

export default function FichaCliente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [busca, setBusca] = useState(() => searchParams.get('busca') || '');
  const [pagamento, setPagamento] = useState(() => searchParams.get('pagamento') || '');
  const [ordem, setOrdem] = useState(() => searchParams.get('ordem') || 'recentes');
  const filtros = { busca, pagamento, ordem, mes: mesMensagens };
  const pedidosFonadaFiltrados = filtrarHistorico(pedidosFonada, 'fonada', filtros);
  const pedidosAoVivoFiltrados = filtrarHistorico(pedidosAoVivo, 'aovivo', filtros);
  const listaFonada = useListaIncremental(pedidosFonadaFiltrados, `${id}:fonada:${mesMensagens}:${busca}:${pagamento}:${ordem}`);
  const listaAoVivo = useListaIncremental(pedidosAoVivoFiltrados, `${id}:aovivo:${busca}:${pagamento}:${ordem}`);

  function atualizarFiltro(campo, valor) {
    ({ busca: setBusca, pagamento: setPagamento, ordem: setOrdem, mes: setMesMensagens })[campo](valor);
    setPedidoSelecionado('');
    setSearchParams(atuais => { const params = new URLSearchParams(atuais); valor ? params.set(campo, valor) : params.delete(campo); params.delete('pedido'); return params; }, { replace: true });
  }

  function mudarAba(tipo) {
    setAba(tipo); setPedidoSelecionado('');
    setSearchParams(atuais => { const params = new URLSearchParams(atuais); params.set('aba', tipo); params.delete('pedido'); return params; }, { replace: true });
  }

  function limparFiltros() {
    setBusca(''); setPagamento(''); setMesMensagens(''); setPedidoSelecionado('');
    setSearchParams(atuais => { const params = new URLSearchParams(atuais); ['busca', 'pagamento', 'mes', 'pedido'].forEach(c => params.delete(c)); return params; }, { replace: true });
  }

  async function copiarContato(telefone) {
    try { await navigator.clipboard.writeText(telefone); mostrarToast('Telefone copiado.'); }
    catch { mostrarToast('Não foi possível copiar. Selecione o telefone para copiar.', 'erro'); }
  }


  function carregar() {
    setCarregando(true);
    setErro('');
    api.clientes.buscar(id)
      .then((resp) => {
        setCliente(resp.cliente);
        setPedidosFonada(resp.pedidosFonada || []);
        setPedidosAoVivo(resp.pedidosAoVivo || []);
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
    const pedidosDaAba = aba === 'aovivo' ? pedidosAoVivoFiltrados : pedidosFonadaFiltrados;
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
    const parametros = new URLSearchParams(searchParams);
    parametros.set('aba', tipo);
    parametros.set('pedido', String(pedidoId));
    if (tipo === 'fonada' && mesMensagens) parametros.set('mes', mesMensagens);
    const filtrados = tipo === 'fonada' ? pedidosFonadaFiltrados : pedidosAoVivoFiltrados;
    if (!filtrados.some(p => String(p.id) === String(pedidoId))) {
      ['busca', 'pagamento', 'mes'].forEach(campo => parametros.delete(campo));
    }
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
    if (!String(dadosEdicao.nome || '').trim()) {
      mostrarToast('O nome é obrigatório.', 'erro');
      document.getElementById('editar-nome')?.focus();
      return;
    }
    setSalvando(true);
    try {
      const { numero, ...dadosPersistidos } = dadosEdicao;
      const atualizado = await api.clientes.atualizar(id, {
        ...dadosPersistidos,
        versao: cliente.versao,
        nome: dadosEdicao.nome.trim(),
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
  if (erro) return <AvisoInline tom="erro" titulo="Não foi possível abrir a ficha" acao={<><button type="button" className="btn secundario" onClick={carregar}>Tentar novamente</button><button type="button" className="btn secundario" onClick={voltar}>Voltar aos clientes</button></>}>{erro}</AvisoInline>;
  if (!cliente) return null;

  const resumo = resumoFicha(pedidosFonada, pedidosAoVivo);
  const whatsappLink = [cliente.whatsapp, cliente.celular].map(linkWhatsApp).find(Boolean);

  return <>
    <FichaClienteVisao cliente={cliente} resumo={resumo} pedidosFonada={pedidosFonada} pedidosAoVivo={pedidosAoVivo}
      nascimento={nascimentoValido(cliente.nascimento) ? cliente.nascimento : ''} whatsappLink={whatsappLink}
      historico={{ aba, filtros, atualizarFiltro, mudarAba, limpar: limparFiltros, abrirPedido,
        lista: aba === 'aovivo' ? listaAoVivo : listaFonada,
        pedidos: aba === 'aovivo' ? pedidosAoVivoFiltrados : pedidosFonadaFiltrados, selecionado: pedidoSelecionado }}
      acoes={{ novaFonada: novoPedidoFonada, novoAoVivo: novoPedidoAoVivo, voltar,
        editar: iniciarEdicao, copiarContato, verCobranca: () => navigate(`/cobranca?nome=${encodeURIComponent(cliente.nome)}`),
        bloquear: () => setMostrandoBloqueio(true), desbloquear, excluir: excluirCliente }} />
    {editando && <Dialogo titulo="Editar cliente" descricao="Atualize os dados de contato e as informações do cadastro." onClose={() => { if (!salvando) setEditando(false); }} className="fc-dialogo-edicao">
      <form onSubmit={evento => { evento.preventDefault(); if (!salvando) salvarEdicao(); }}>
            <div className="grade grade-2">
              <div className="campo">
                <label htmlFor="editar-nome">Nome</label>
                <input id="editar-nome" required value={dadosEdicao.nome} onChange={(e) => setEdicao('nome', e.target.value)} />
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
              <button type="button" className="btn secundario" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</button>
              <button type="submit" className="btn" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
      </form>
    </Dialogo>}
    {mostrandoBloqueio && (
        <Dialogo titulo={`Bloquear ${cliente.nome}`} descricao="O bloqueio impede novos pedidos e alterações em Fonada, Ao vivo, Cobrança e Agenda até que o cliente seja desbloqueado." onClose={() => setMostrandoBloqueio(false)}>
            <div className="campo">
              <label htmlFor="fc-motivo-bloqueio">Motivo (opcional)</label>
              <input
                id="fc-motivo-bloqueio"
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
  </>;
}
