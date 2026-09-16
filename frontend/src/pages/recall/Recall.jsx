import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, getNomeExibicao } from '../../api.js';
import { buildRecallWhatsAppUrl } from '../../utils/mensagemRecall.js';
import { AvisoInline, CabecalhoPagina, EstadoCarregando } from '../../components/Interface.jsx';

function isoLocal(data = new Date()) { return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`; }
function somarDias(iso, dias) { const d=new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+dias); return isoLocal(d); }
function dataLegivel(iso) { return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).replace('.',''); }
function nomeCurto(nome) { return String(nome||'').trim().split(/\s+/).filter(Boolean).slice(0,2).join(' '); }
function nomePessoaValido(nome) { const texto=String(nome||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); return /[A-Za-z]/.test(texto)&&!/^.*\d.*$/.test(texto); }
function linkWhatsapp(telefone) {
  const digitos=String(telefone||'').replace(/\D/g,'');
  const nacional=digitos.startsWith('55')&&[12,13].includes(digitos.length)?digitos.slice(2):digitos;
  if(!/^\d{10,11}$/.test(nacional)||/^0+$/.test(nacional)||!/^\d{2}[2-9]\d{7,8}$/.test(nacional))return null;
  return `https://api.whatsapp.com/send?phone=55${nacional}`;
}
function IconeWhatsapp() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.3-4.7a8.5 8.5 0 1 1 16.2-4Z"/><path d="M8.2 7.8c.2-.5.4-.5.8-.5h.5c.2 0 .4.1.5.4l.8 2c.1.3 0 .5-.2.7l-.6.7c-.2.2-.1.4 0 .6.7 1.2 1.7 2.2 3 2.8.3.1.5.1.7-.1l.8-1c.2-.2.4-.3.7-.2l2 .9c.3.1.4.3.4.5 0 .4-.2 1.5-.9 2.1-.6.6-1.5.8-2.5.5-1.2-.3-2.8-.9-4.7-2.5-1.5-1.3-2.5-2.9-2.8-4-.3-1.2 0-2.3.5-2.9Z"/></svg>; }
function IconePessoa() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.7-4.1 3.1-6.2 7.5-6.2s6.8 2.1 7.5 6.2"/></svg>; }
function IconeBusca() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>; }
function normalizarBusca(valor) { return String(valor||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function correspondeBusca(valor, termo) { const alvo=normalizarBusca(valor); const compacto=(texto)=>texto.replace(/[^a-z0-9]/g,''); return alvo.includes(termo)||compacto(alvo).includes(compacto(termo)); }

export default function Recall() {
  const navigate=useNavigate(); const [params,setParams]=useSearchParams();
  const [data,setData]=useState(params.get('data')||isoLocal());
  const [modoFila,setModoFila]=useState(params.get('modo')==='aniversario'?'ANIVERSARIO':'DIA_MENSAGEM');
  const [dados,setDados]=useState(null); const [selecionado,setSelecionado]=useState(null); const [carregando,setCarregando]=useState(false); const [erro,setErro]=useState(''); const [buscaNome,setBuscaNome]=useState(params.get('busca')||'');
  const listaRef=useRef(null);

  function listaDoModo(resposta=dados, modo=modoFila){const lista=modo==='ANIVERSARIO'?(resposta?.porAniversario||[]):(resposta?.porDiaMensagem||[]);return lista.filter(i=>nomePessoaValido(i.clienteNome)&&nomePessoaValido(i.aniversariante));}
  async function carregarFila(dataAlvo=data, relacaoAlvo=null, modoAlvo=modoFila) { setCarregando(true); setErro(''); try { const r=await api.recall.fila(dataAlvo); const lista=listaDoModo(r,modoAlvo); setDados(r); setSelecionado((atual)=>lista.find(i=>i.relacaoChave===(relacaoAlvo||atual?.relacaoChave))||lista[0]||null); } catch(e){setDados(null);setSelecionado(null);setErro(e.message||'Não foi possível montar a fila.');} finally{setCarregando(false);} }
  useEffect(()=>{ carregarFila(data,params.get('relacao')||null,modoFila); },[data]);
  useEffect(()=>{ setParams((p)=>{ const n=new URLSearchParams(p); n.set('aba','fila'); n.set('data',data); n.set('modo',modoFila==='ANIVERSARIO'?'aniversario':'dia-mensagem'); if(selecionado?.relacaoChave)n.set('relacao',selecionado.relacaoChave);else if(dados)n.delete('relacao'); if(buscaNome)n.set('busca',buscaNome);else n.delete('busca'); return n; },{replace:true}); },[data,modoFila,selecionado?.relacaoChave,buscaNome]);
  useEffect(()=>{if(dados){const lista=listaDoModo(dados,modoFila);setSelecionado(lista.find(i=>i.relacaoChave===selecionado?.relacaoChave)||lista[0]||null);}},[modoFila]);
  function urlRetornoFila(relacao=selecionado?.relacaoChave) { const q=new URLSearchParams({aba:'fila',data,modo:modoFila==='ANIVERSARIO'?'aniversario':'dia-mensagem'}); if(relacao)q.set('relacao',relacao); if(buscaNome)q.set('busca',buscaNome); return `/recall?${q}`; }
  function criarPedido() { const q=new URLSearchParams({clienteId:String(selecionado.clienteId),recallPara:selecionado.aniversariante,recallData:data,recallRelacao:selecionado.relacaoChave}); navigate(`/fonada/novo?${q}`,{state:{returnTo:urlRetornoFila()}}); }
  const dias=useMemo(()=>Array.from({length:7},(_,i)=>somarDias(isoLocal(),i)),[]);
  const itensAtivos=listaDoModo();
  const termoBusca=normalizarBusca(buscaNome);
  const outroModo=modoFila==='ANIVERSARIO'?'DIA_MENSAGEM':'ANIVERSARIO';
  const resultadosDasDuasPesquisas=[
    ...itensAtivos.map((i)=>({...i,_modoFila:modoFila})),
    ...listaDoModo(dados,outroModo).map((i)=>({...i,_modoFila:outroModo})),
  ].filter((item,indice,todos)=>todos.findIndex((outro)=>outro.relacaoChave===item.relacaoChave)===indice);
  const itensFiltrados=termoBusca?resultadosDasDuasPesquisas.filter((i)=>correspondeBusca(`${i.clienteNome} ${i.aniversariante} ${i.ultimoPedido?.texto||''} ${i.ultimoPedido?.os||''}`,termoBusca)):itensAtivos;
  useEffect(()=>{if(!dados)return;setSelecionado((atual)=>itensFiltrados.find(i=>i.relacaoChave===atual?.relacaoChave)||itensFiltrados[0]||null);},[buscaNome,modoFila,dados]);
  const chaveScrollLista=`recall-lista-scroll:${data}:${modoFila}:${normalizarBusca(buscaNome)}`;
  useEffect(()=>{
    const lista=listaRef.current;
    if(carregando||!lista)return undefined;
    const posicao=Number(sessionStorage.getItem(chaveScrollLista)||0);
    const frame=requestAnimationFrame(()=>{lista.scrollTop=posicao;});
    return ()=>{
      cancelAnimationFrame(frame);
    };
  },[chaveScrollLista,carregando,itensFiltrados.length]);
  function guardarScrollLista(e){sessionStorage.setItem(chaveScrollLista,String(e.currentTarget.scrollTop));}
  const indiceSelecionado=itensFiltrados.findIndex((item)=>item.relacaoChave===selecionado?.relacaoChave);
  function navegarNaLista(deslocamento){
    const novoIndice=indiceSelecionado+deslocamento;
    if(novoIndice<0||novoIndice>=itensFiltrados.length)return;
    setSelecionado(itensFiltrados[novoIndice]);
    requestAnimationFrame(()=>{
      listaRef.current?.querySelectorAll('.recall-linha')[novoIndice]?.scrollIntoView({block:'nearest'});
    });
  }

  return <div className="recall-page">
    <CabecalhoPagina contexto="Central de relacionamento" titulo="Recall" descricao="Duas pesquisas complementares, organizadas em filas sem pessoas repetidas." />
    <>
      <div className="recall-dias">{dias.map((d,i)=><button key={d} className={d===data?'ativo':''} onClick={()=>setData(d)}><small>{i===0?'Hoje':i===1?'Amanhã':dataLegivel(d).split(' ')[0]}</small><strong>{dataLegivel(d).split(' ').slice(-1)}</strong></button>)}</div>
      {dados&&<div className="recall-fontes recall-seletor-pesquisas" role="tablist" aria-label="Tipo de pesquisa"><button type="button" role="tab" aria-selected={modoFila==='DIA_MENSAGEM'} className={modoFila==='DIA_MENSAGEM'?'ativo':''} onClick={()=>setModoFila('DIA_MENSAGEM')}><span className="recall-pesquisa-texto"><small>Pesquisa 1</small><strong>Por dia da mensagem</strong></span><em aria-label={`${listaDoModo(dados,'DIA_MENSAGEM').length} pessoas`}>{listaDoModo(dados,'DIA_MENSAGEM').length}</em></button><button type="button" role="tab" aria-selected={modoFila==='ANIVERSARIO'} className={modoFila==='ANIVERSARIO'?'ativo':''} onClick={()=>setModoFila('ANIVERSARIO')}><span className="recall-pesquisa-texto"><small>Pesquisa 2</small><strong>Aniversário do cliente</strong></span><em aria-label={`${listaDoModo(dados,'ANIVERSARIO').length} pessoas`}>{listaDoModo(dados,'ANIVERSARIO').length}</em></button></div>}
      {erro?<AvisoInline tom="erro" titulo="Não foi possível montar a fila" acao={<button type="button" className="btn secundario" onClick={()=>carregarFila()}>Tentar novamente</button>}>{erro}</AvisoInline>:carregando?<EstadoCarregando className="recall-estado-carregando" rotulo="Montando a fila de relacionamento…" linhas={3}/>:!itensAtivos.length?<div className="painel recall-vazio"><strong>Fila livre para este dia</strong><span>Nenhuma relação foi encontrada nesta pesquisa.</span></div>:<div className="recall-workspace">
        <div className="recall-lista-coluna"><label className="recall-pesquisa-nome"><IconeBusca/><input type="search" value={buscaNome} onChange={(e)=>setBuscaNome(e.target.value)} placeholder="Buscar por nome ou senha..." aria-label="Buscar nas duas pesquisas por nome ou senha"/></label><section className="recall-lista" ref={listaRef} onScroll={guardarScrollLista}>{itensFiltrados.length?itensFiltrados.map(i=><button key={i.relacaoChave} className={`recall-linha ${selecionado?.relacaoChave===i.relacaoChave?'selecionada':''}`} onClick={()=>setSelecionado(i)}><span className="recall-avatar">{i.clienteNome?.charAt(0)}</span><span><strong className="recall-lista-relacao"><span title={i.clienteNome}>{nomeCurto(i.clienteNome)}{i.clienteBloqueado&&<em className="recall-bloqueado">Bloqueado</em>}</span>{!i.clienteBloqueado&&<><b>→</b><span title={i.aniversariante}>{nomeCurto(i.aniversariante)}{i.aniversarianteBloqueado&&<em className="recall-bloqueado">Bloqueado</em>}</span></>}</strong></span></button>):<div className="recall-lista-sem-resultado">Nenhum nome ou senha encontrado.</div>}</section></div>
        {selecionado&&<Detalhes item={selecionado} modoFila={selecionado._modoFila||modoFila} modoWhatsapp={modoFila} criarPedido={criarPedido} navigate={navigate} returnTo={urlRetornoFila()} posicao={indiceSelecionado+1} total={itensFiltrados.length} onAnterior={()=>navegarNaLista(-1)} onProximo={()=>navegarNaLista(1)}/>}
      </div>}
    </>
  </div>;
}

function Detalhes({item,modoFila,modoWhatsapp,criarPedido,navigate,returnTo,posicao,total,onAnterior,onProximo}) {
  const pesquisaPorAniversariante=modoFila==='ANIVERSARIO';
  const whatsappUrl=buildRecallWhatsAppUrl(item.telefone,{
    modoFila:modoWhatsapp,
    contato:item.clienteNome,
    aniversariante:item.aniversariante,
    usuario:getNomeExibicao(),
    generoAniversariante:item.aniversarianteGenero,
    numeroOs:item.ultimoPedido?.os||item.ultimoPedido?.pedidoId,
  },linkWhatsapp);
  return <aside className="painel recall-detalhes"><nav className="recall-navegacao-lista" aria-label="Navegar pelos registros da lista"><span><strong>{posicao}</strong> de {total}</span><div><button type="button" onClick={onAnterior} disabled={posicao<=1} aria-label="Registro anterior" title="Registro anterior">←</button><button type="button" onClick={onProximo} disabled={posicao>=total} aria-label="Próximo registro" title="Próximo registro">→</button></div></nav><div className="recall-detalhes-topo"><div><span>Contato atual</span><h2 className="recall-relacao-titulo"><span>{item.clienteNome}</span><b>→</b><span className="recall-aniversariante-nome"><strong>{item.aniversariante}</strong><em>Aniversariante</em>{item.aniversarianteBloqueado&&<em className="recall-bloqueado">Bloqueado</em>}</span></h2><div className="recall-contato"><div><small>Telefone principal</small><strong>{item.telefone||'Não informado'}</strong></div>{whatsappUrl&&<a className="btn recall-whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp de ${item.clienteNome}`} title="Abrir WhatsApp"><IconeWhatsapp/></a>}</div></div><div className="recall-cadastro-canto">{item.clienteBloqueado&&<em className="recall-bloqueio-destaque">Bloqueado</em>}{item.clienteId&&<button className="recall-abrir-cliente" onClick={()=>navigate(`/clientes/${item.clienteId}`,{state:{returnTo}})} aria-label={`Abrir cadastro de ${item.clienteNome}`} title={`Abrir cadastro de ${item.clienteNome}`}><IconePessoa/></button>}</div></div>
    <div className="recall-contexto">
      <div className="recall-contexto-cabecalho"><h3>{pesquisaPorAniversariante?'Última mensagem recebida':'Última mensagem comprada'}</h3><div><time>{item.ultimoPedido.data||'Data não informada'}</time><span>O.S. {item.ultimoPedido.os||item.ultimoPedido.pedidoId}</span></div></div>
      <div className="recall-contexto-principal"><small>Tema da mensagem</small><strong>{item.ultimoPedido.tema||'Tema não informado'}{item.ultimoPedido.texto?` · Nº ${item.ultimoPedido.texto}`:''}</strong></div>
      <div className="recall-links"><button onClick={()=>navigate(`/fonada/${item.ultimoPedido.pedidoId}`,{state:{returnTo}})}>Abrir este pedido</button></div>
    </div>
    <details className="recall-historico-relacao"><summary><span>Histórico da relação</span><em>{item.quantidade} mensagem{item.quantidade!==1?'s':''}</em></summary><div className="recall-historico-itens">{item.historico.map((h)=><button type="button" key={`${h.pedidoId}-${h.mensagem}`} onClick={()=>navigate(`/fonada/${h.pedidoId}`,{state:{returnTo}})}><span className="recall-historico-conteudo"><strong>{h.tema||'Tema não informado'}{h.texto?` · Nº ${h.texto}`:''}</strong><small>{h.data||'Data não informada'}</small></span><em>O.S. {h.os||h.pedidoId}</em><b>›</b></button>)}</div></details>
    {item.clienteBloqueado?<button className="btn recall-criar" disabled>Cliente bloqueado — novo pedido indisponível</button>:item.clienteId?<button className="btn recall-criar" onClick={criarPedido}>＋ Criar novo pedido</button>:<button className="btn recall-criar" onClick={()=>navigate('/clientes/novo',{state:{dadosIniciais:{nome:item.clienteNome,whatsapp:item.telefone||''},returnTo}})}>＋ Cadastrar novo cliente</button>}
  </aside>;
}
