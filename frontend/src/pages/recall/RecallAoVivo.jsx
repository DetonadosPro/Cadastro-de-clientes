import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, getNomeExibicao } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { useAtualizacaoTempoReal } from '../../TempoRealContext.jsx';
import { buildRecallAoVivoMessage, buildRecallAoVivoUrl } from '../../utils/mensagemRecall.js';
import NavegacaoDatasRecall from '../../components/NavegacaoDatasRecall.jsx';
import { dadosPedidoAoVivoRecall } from '../../utils/pedidoRecall.js';
import { AvisoInline, EstadoCarregando } from '../../components/Interface.jsx';

const normalizar = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export default function RecallAoVivo() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { mostrarToast } = useToast();
  const [data, setData] = useState(params.get('data') || hoje());
  const [busca, setBusca] = useState(params.get('busca') || '');
  const [filas, setFilas] = useState({ porDiaMensagem:[], porAniversario:[] });
  const [modo, setModo] = useState(params.get('modo') === 'aniversario' ? 'ANIVERSARIO' : 'DIA_MENSAGEM');
  const itens = modo === 'ANIVERSARIO' ? filas.porAniversario : filas.porDiaMensagem;
  const [chave, setChave] = useState(params.get('relacao'));
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const requisicao = useRef(0);
  async function carregar() {
    const atual = ++requisicao.current;
    setCarregando(true); setErro('');
    try { const resposta = await api.recall.filaAoVivo(data); if (atual === requisicao.current) setFilas({porDiaMensagem:resposta.porDiaMensagem || resposta.itens || [],porAniversario:resposta.porAniversario || []}); }
    catch (e) { if (atual === requisicao.current) { setErro(e.message); setFilas({porDiaMensagem:[],porAniversario:[]}); } }
    finally { if (atual === requisicao.current) setCarregando(false); }
  }
  useEffect(() => { carregar(); return () => { requisicao.current++; }; }, [data]);
  useAtualizacaoTempoReal(['recall'], carregar);
  const candidatos = busca.trim() ? [...itens,...(modo==='ANIVERSARIO'?filas.porDiaMensagem:filas.porAniversario)] : itens;
  const filtrados = candidatos.filter((i) => normalizar(`${i.clienteNome} ${i.aniversariante} ${i.ultimoPedido.tema} ${i.ultimoPedido.os}`).includes(normalizar(busca).trim()));
  const selecionado = filtrados.find((i) => i.relacaoChave === chave) || filtrados[0];
  const indice = filtrados.indexOf(selecionado);
  useEffect(() => { setParams((p) => { const n = new URLSearchParams(p); n.set('sistema', 'AOVIVO'); n.set('modo',modo==='ANIVERSARIO'?'aniversario':'dia-mensagem'); n.set('data', data); if (busca) n.set('busca', busca); else n.delete('busca'); if (selecionado) n.set('relacao', selecionado.relacaoChave); else n.delete('relacao'); return n; }, { replace: true }); }, [data, modo, busca, selecionado?.relacaoChave]);
  const retorno = `/recall?${new URLSearchParams({ sistema: 'AOVIVO', data, busca, modo:modo==='ANIVERSARIO'?'aniversario':'dia-mensagem', ...(selecionado ? { relacao: selecionado.relacaoChave } : {}) })}`;
  const invertido = selecionado?.modoFila === 'ANIVERSARIO';
  const dadosMensagem = selecionado && { modoFila: selecionado.modoFila, contato: selecionado.clienteNome, homenageado: selecionado.aniversariante, generoHomenageado: selecionado.aniversarianteGenero, usuario: getNomeExibicao(), ocasiao: selecionado.ocasiao, tema: selecionado.ultimoPedido.tema, dataReferencia: data, numeroOs: selecionado.ultimoPedido.os };
  const whatsapp = selecionado && !selecionado.clienteBloqueado && buildRecallAoVivoUrl(selecionado.telefone, dadosMensagem);
  function abrir(id) { navigate(`/ao-vivo/${id}`, { state: { returnTo: retorno } }); }
  async function criar() {
    setCriando(true);
    try {
      const origem = await api.aoVivo.buscar(selecionado.ultimoPedido.pedidoId);
      const q = new URLSearchParams({ clienteId: selecionado.clienteId, recallData: data, recallRelacao: selecionado.relacaoChave });
      let dadosNovo = dadosPedidoAoVivoRecall(origem, data);
      if(invertido) {
        const comprador = selecionado.compradorId ? (await api.clientes.buscarCadastro(selecionado.compradorId)).cliente : null;
        dadosNovo = {...dadosNovo,para:selecionado.aniversariante,tema_1:'ANIV GERAL',tema_2:'',tema_3:'',tema_4:'',celular_local:comprador?.celular || comprador?.whatsapp || origem.celular || origem.whatsapp || '',aniversario_destinatario:(selecionado.aniversarianteNascimento || '').slice(0,5),endereco:comprador?.endereco || '',bairro:comprador?.bairro || '',referencia:comprador?.referencia || ''};
      }
      navigate(`/ao-vivo/novo?${q}`, { state: { returnTo: retorno, recallAoVivo: dadosNovo } });
    } catch (e) { mostrarToast(e.message, 'erro'); }
    finally { setCriando(false); }
  }
  return <>
    <NavegacaoDatasRecall data={data} onChange={setData} />
    {!carregando && !erro && <div className="recall-fontes recall-seletor-pesquisas" role="tablist" aria-label="Tipo de pesquisa">{[['DIA_MENSAGEM','Pesquisa 1','Por dia da mensagem',filas.porDiaMensagem],['ANIVERSARIO','Pesquisa 2','Aniversário do cliente',filas.porAniversario]].map(([valor,titulo,descricao,fila])=><button type="button" role="tab" key={valor} aria-selected={modo===valor} className={modo===valor?'ativo':''} onClick={()=>{setModo(valor);setChave(null);}}><span className="recall-pesquisa-texto"><small>{titulo}</small><strong>{descricao}</strong></span><em aria-label={`${fila.length} pessoas`}>{fila.length}</em></button>)}</div>}
    {erro ? <AvisoInline tom="erro" titulo="Não foi possível montar a fila" acao={<button className="btn secundario" onClick={carregar}>Tentar novamente</button>}>{erro}</AvisoInline> : carregando ? <EstadoCarregando rotulo="Montando o Recall de Ao Vivo…" /> : <>
      <div className="recall-aovivo-resumo"><strong>{itens.length} oportunidade{itens.length !== 1 ? 's' : ''} · {itens.reduce((total, item) => total + item.quantidade, 0)} pedidos anteriores</strong><span>{modo==='ANIVERSARIO'?'Destinatário com celular → cliente aniversariante':'Comprador → pessoa homenageada'}</span></div>
      <div className="recall-workspace"><div className="recall-lista-coluna"><label className="recall-pesquisa-nome"><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, tema ou O.S." aria-label="Buscar no Recall de Ao Vivo" /></label><section className="recall-lista">{filtrados.map((i) => <button key={i.relacaoChave} className={`recall-linha ${i === selecionado ? 'selecionada' : ''}`} onClick={() => setChave(i.relacaoChave)}><span className="recall-avatar">{i.clienteNome[0]}</span><span><strong className="recall-lista-relacao"><span>{i.clienteNome}</span><b>→</b><span>{i.aniversariante}</span></strong><small className="recall-aovivo-tema">{i.ultimoPedido.tema || 'Homenagem especial'}</small></span></button>)}{!filtrados.length && <div className="recall-lista-sem-resultado">{itens.length ? 'Nenhum resultado para esta busca.' : modo==='ANIVERSARIO'?'Nenhum destinatário com celular para os clientes aniversariantes deste dia.':'Nenhuma homenagem de anos anteriores para este dia.'}</div>}</section></div>
      {selecionado && <aside className="painel recall-detalhes"><nav className="recall-navegacao-lista" aria-label="Navegar pelos compradores"><span><strong>{indice + 1}</strong> de {filtrados.length}</span><div><button disabled={indice === 0} onClick={() => setChave(filtrados[indice - 1].relacaoChave)} aria-label="Registro anterior">←</button><button disabled={indice === filtrados.length - 1} onClick={() => setChave(filtrados[indice + 1].relacaoChave)} aria-label="Próximo registro">→</button></div></nav>
        <div className="recall-detalhes-topo"><div><span>{invertido ? 'Destinatário a contatar' : 'Comprador a contatar'}</span><h2 className="recall-relacao-titulo"><span>{selecionado.clienteNome}</span><b>→</b><span className="recall-aniversariante-nome"><strong>{selecionado.aniversariante}</strong><em>Pessoa homenageada</em></span></h2><div className="recall-contato"><div><small>{invertido ? 'Celular do destinatário' : 'Telefone do comprador'}</small><strong>{selecionado.telefone || 'Não informado'}</strong></div>{whatsapp && <a className="btn recall-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp com a homenagem pronta" title="Abrir WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.3-4.7a8.5 8.5 0 1 1 16.2-4Z"/><path d="M8 8c0 4 4 8 8 8l1-2-3-1-1 1-3-3 1-1-1-3Z"/></svg></a>}</div></div></div>
        {selecionado.clienteBloqueado && <span className="recall-bloqueio-destaque">Cliente bloqueado</span>}
        <div className="recall-contexto">{selecionado.registro?.status === 'PEDIDO_CRIADO' && <span className="recall-status PEDIDO_CRIADO">Pedido criado</span>}<div className="recall-contexto-cabecalho"><h3>Última homenagem ao vivo</h3><time>{selecionado.ultimoPedido.data}</time></div><div className="recall-contexto-principal"><small>Tema escolhido</small><strong>{selecionado.ultimoPedido.tema || 'Não informado'}</strong></div><div className="recall-links"><button onClick={() => abrir(selecionado.ultimoPedido.pedidoId)}>Abrir O.S. {selecionado.ultimoPedido.os}</button>{selecionado.clienteId && <button onClick={() => navigate(`/clientes/${selecionado.clienteId}`, { state: { returnTo: retorno } })}>{invertido ? 'Abrir ficha do destinatário' : 'Abrir ficha do comprador'}</button>}</div></div>
        <details className="recall-historico-relacao"><summary><span>Histórico de homenagens</span><em>{selecionado.quantidade} pedido{selecionado.quantidade !== 1 ? 's' : ''}</em></summary><div className="recall-historico-itens">{selecionado.historico.map((h) => <button key={h.pedidoId} onClick={() => abrir(h.pedidoId)}><span className="recall-historico-conteudo"><strong>{h.tema || 'Homenagem especial'}</strong><small>{h.data}</small></span><em>O.S. {h.os}</em></button>)}</div></details>
        <details className="recall-aovivo-previa"><summary>Mensagem pronta para WhatsApp</summary><p>{buildRecallAoVivoMessage(dadosMensagem)}</p></details>
        {selecionado.clienteId ? <button className="btn recall-criar" disabled={criando || selecionado.clienteBloqueado} onClick={criar}>{criando ? 'Preparando pedido…' : '＋ Criar novo pedido Ao Vivo'}</button> : <button className="btn recall-criar" onClick={() => navigate('/clientes/novo', { state: { dadosIniciais: { nome: selecionado.clienteNome, whatsapp: selecionado.telefone }, returnTo: retorno } })}>{invertido ? '＋ Cadastrar destinatário' : '＋ Cadastrar comprador'}</button>}
      </aside>}</div>
    </>}
  </>;
}
