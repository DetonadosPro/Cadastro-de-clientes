import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';

function isoLocal(data = new Date()) { return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`; }
function somarDias(iso, dias) { const d=new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+dias); return isoLocal(d); }
function dataLegivel(iso) { return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).replace('.',''); }
function proximaOcorrencia(dataBr) { const m=String(dataBr||'').match(/^(\d{2})\/(\d{2})/); if(!m)return isoLocal(); const hoje=isoLocal(); let ano=Number(hoje.slice(0,4)); let alvo=`${ano}-${m[2]}-${m[1]}`; if(alvo<hoje)alvo=`${ano+1}-${m[2]}-${m[1]}`; return alvo; }
function linkWhatsapp(telefone) { const digitos=String(telefone||'').replace(/\D/g,''); if(!digitos)return null; return `https://wa.me/${digitos.startsWith('55')?digitos:`55${digitos}`}`; }
function IconeWhatsapp() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.3-4.7a8.5 8.5 0 1 1 16.2-4Z"/><path d="M8.2 7.8c.2-.5.4-.5.8-.5h.5c.2 0 .4.1.5.4l.8 2c.1.3 0 .5-.2.7l-.6.7c-.2.2-.1.4 0 .6.7 1.2 1.7 2.2 3 2.8.3.1.5.1.7-.1l.8-1c.2-.2.4-.3.7-.2l2 .9c.3.1.4.3.4.5 0 .4-.2 1.5-.9 2.1-.6.6-1.5.8-2.5.5-1.2-.3-2.8-.9-4.7-2.5-1.5-1.3-2.5-2.9-2.8-4-.3-1.2 0-2.3.5-2.9Z"/></svg>; }

export default function Recall() {
  const navigate=useNavigate(); const { mostrarToast }=useToast(); const [params,setParams]=useSearchParams();
  const [aba,setAba]=useState(params.get('aba')==='buscar'?'buscar':'fila'); const [data,setData]=useState(params.get('data')||isoLocal());
  const [modoFila,setModoFila]=useState(params.get('modo')==='aniversario'?'ANIVERSARIO':'DIA_MENSAGEM');
  const [dados,setDados]=useState(null); const [selecionado,setSelecionado]=useState(null); const [carregando,setCarregando]=useState(false);
  const [termo,setTermo]=useState(''); const [busca,setBusca]=useState({enviouPara:[],recebeuDe:[]});

  function listaDoModo(resposta=dados, modo=modoFila){return modo==='ANIVERSARIO'?(resposta?.porAniversario||[]):(resposta?.porDiaMensagem||[]);}
  async function carregarFila(dataAlvo=data, relacaoAlvo=null, modoAlvo=modoFila) { setCarregando(true); try { const r=await api.recall.fila(dataAlvo); const lista=listaDoModo(r,modoAlvo); setDados(r); setSelecionado((atual)=>lista.find(i=>i.relacaoChave===(relacaoAlvo||atual?.relacaoChave))||lista[0]||null); } catch(e){mostrarToast(e.message,'erro');} finally{setCarregando(false);} }
  useEffect(()=>{ if(aba==='fila') carregarFila(data,params.get('relacao')||null,modoFila); },[aba,data]);
  useEffect(()=>{ setParams((p)=>{ const n=new URLSearchParams(p); n.set('aba',aba); if(aba==='fila'){n.set('data',data);n.set('modo',modoFila==='ANIVERSARIO'?'aniversario':'dia-mensagem');if(selecionado?.relacaoChave)n.set('relacao',selecionado.relacaoChave);else if(dados)n.delete('relacao');}else{n.delete('data');n.delete('modo');n.delete('relacao');} return n; },{replace:true}); },[aba,data,modoFila,selecionado?.relacaoChave]);
  useEffect(()=>{if(aba==='fila'&&dados){const lista=listaDoModo(dados,modoFila);setSelecionado(lista.find(i=>i.relacaoChave===selecionado?.relacaoChave)||lista[0]||null);}},[modoFila]);
  function urlRetornoFila(relacao=selecionado?.relacaoChave) { const q=new URLSearchParams({aba:'fila',data,modo:modoFila==='ANIVERSARIO'?'aniversario':'dia-mensagem'}); if(relacao)q.set('relacao',relacao); return `/recall?${q}`; }
  function criarPedido() { const q=new URLSearchParams({clienteId:String(selecionado.clienteId),recallPara:selecionado.aniversariante,recallData:data,recallRelacao:selecionado.relacaoChave}); navigate(`/fonada/novo?${q}`,{state:{returnTo:urlRetornoFila()}}); }
  async function pesquisar(e){e?.preventDefault(); if(termo.trim().length<2)return; setCarregando(true); try{const r=await api.recall.buscar(termo);setBusca({enviouPara:r.enviouPara||[],recebeuDe:r.recebeuDe||[]});}catch(err){mostrarToast(err.message,'erro');}finally{setCarregando(false);}}
  const dias=useMemo(()=>Array.from({length:7},(_,i)=>somarDias(isoLocal(),i)),[]);
  const itensAtivos=listaDoModo(); const resumoAtivo=modoFila==='ANIVERSARIO'?dados?.resumos?.porAniversario:dados?.resumos?.porDiaMensagem;

  return <div className="recall-page">
    <header className="recall-cabecalho"><div><span className="recall-sobretitulo">Central de relacionamento</span><h1>Recall</h1><p>Duas pesquisas diferentes, organizadas em filas sem pessoas repetidas.</p></div></header>
    <div className="abas-cliente recall-abas"><button className={`aba-cliente-botao ${aba==='fila'?'ativa':''}`} onClick={()=>setAba('fila')}>Fila diária</button><button className={`aba-cliente-botao ${aba==='buscar'?'ativa':''}`} onClick={()=>setAba('buscar')}>Buscar aniversariante</button></div>
    {aba==='fila'&&<>
      <div className="recall-dias">{dias.map((d,i)=><button key={d} className={d===data?'ativo':''} onClick={()=>setData(d)}><small>{i===0?'Hoje':i===1?'Amanhã':dataLegivel(d).split(' ')[0]}</small><strong>{dataLegivel(d).split(' ').slice(-1)}</strong></button>)}</div>
      {dados&&<div className="recall-fontes"><button className={modoFila==='DIA_MENSAGEM'?'ativo':''} onClick={()=>setModoFila('DIA_MENSAGEM')}><span>Pesquisa 1</span><strong>Por dia da mensagem</strong><small>Compradores com mensagem de qualquer tipo de aniversário marcada nesta data</small><em>{dados.porDiaMensagem?.length||0} pessoas</em></button><button className={modoFila==='ANIVERSARIO'?'ativo':''} onClick={()=>setModoFila('ANIVERSARIO')}><span>Pesquisa 2</span><strong>Aniversário do cliente</strong><small>Destinatários 1 e 2 de todos os pedidos feitos pelos clientes que aniversariam nesta data</small><em>{dados.porAniversario?.length||0} pessoas</em></button></div>}
      {resumoAtivo&&<div className="recall-metricas"><div><strong>{resumoAtivo.oportunidades}</strong><span>pessoas para ligar</span></div><div><strong>{resumoAtivo.aniversariantes}</strong><span>aniversariantes</span></div></div>}
      {carregando?<div className="painel recall-vazio">Montando a fila…</div>:!itensAtivos.length?<div className="painel recall-vazio"><strong>Fila livre para este dia</strong><span>Nenhuma relação foi encontrada nesta pesquisa.</span></div>:<div className="recall-workspace">
        <section className="recall-lista">{itensAtivos.map(i=><button key={i.relacaoChave} className={`recall-linha ${selecionado?.relacaoChave===i.relacaoChave?'selecionada':''}`} onClick={()=>setSelecionado(i)}><span className="recall-avatar">{i.clienteNome?.charAt(0)}</span><span><strong>{i.clienteNome}</strong><small>{modoFila==='ANIVERSARIO'?`recebeu mensagem de ${i.aniversariante}; ligar para oferecer uma mensagem de volta`:`comprou mensagem para ${i.aniversariante}`} · {i.quantidade} mensagem{i.quantidade!==1?'s':''}</small></span></button>)}</section>
        {selecionado&&<Detalhes item={selecionado} modoFila={modoFila} criarPedido={criarPedido} navigate={navigate} returnTo={urlRetornoFila()}/>}
      </div>}
    </>}
    {aba==='buscar'&&<div className="painel recall-busca"><form onSubmit={pesquisar}><input autoFocus value={termo} onChange={e=>setTermo(e.target.value)} placeholder="Nome do aniversariante, por exemplo João"/><button className="btn">Buscar</button></form>
      {busca.enviouPara.length>0&&<div className="recall-direcao"><h2>Para quem o aniversariante já mandou</h2><p>Estas são as pessoas para ligar e perguntar se querem mandar uma mensagem de volta para o aniversariante.</p></div>}
      {busca.enviouPara.map(g=><div className="recall-resultado" key={`enviou-${g.aniversariante}-${g.nascimento||''}`}><h3>{g.aniversariante}<small>{g.nascimento?`Aniversário ${g.nascimento.slice(0,5)}`:'Nascimento não cadastrado'} · {g.totalMensagens} mensagens enviadas</small></h3>{g.pessoas.map(p=><div key={p.relacaoChave}><span><strong>{p.clienteNome}</strong><small>{p.telefone||'Telefone não informado'} · recebeu {p.quantidade} vez(es) · última em {p.ultimoPedido.data}</small></span><span className="recall-resultado-acoes">{p.telefone&&<a className="btn" href={`tel:${String(p.telefone).replace(/\D/g,'')}`}>Ligar</a>}<button className="btn secundario" onClick={()=>navigate(`/fonada/${p.ultimoPedido.pedidoId}`,{state:{returnTo:'/recall?aba=buscar'}})}>Pedido</button>{g.nascimento&&<button className="btn secundario" onClick={()=>{const alvo=proximaOcorrencia(g.nascimento);setModoFila('ANIVERSARIO');setAba('fila');setData(alvo);carregarFila(alvo,p.relacaoChave,'ANIVERSARIO');}}>Abrir na fila</button>}</span></div>)}</div>)}
      {busca.recebeuDe.length>0&&<details className="recall-direcao-secundaria"><summary>Também ver quem já mandou para o aniversariante</summary>{busca.recebeuDe.map(g=><div className="recall-resultado" key={`recebeu-${g.aniversariante}`}><h3>{g.aniversariante}<small>{g.totalMensagens} mensagens recebidas</small></h3>{g.pessoas.map(p=><div key={p.relacaoChave}><span><strong>{p.clienteNome}</strong><small>{p.telefone||'Telefone não informado'} · mandou {p.quantidade} vez(es)</small></span>{p.telefone&&<a className="btn" href={`tel:${String(p.telefone).replace(/\D/g,'')}`}>Ligar</a>}</div>)}</div>)}</details>}
      {!carregando&&termo.trim().length>=2&&busca.enviouPara.length===0&&busca.recebeuDe.length===0&&<div className="recall-vazio">Nenhum histórico encontrado para esse nome.</div>}
    </div>}
  </div>;
}

function Detalhes({item,modoFila,criarPedido,navigate,returnTo}) {
  const pesquisaPorAniversariante=modoFila==='ANIVERSARIO';
  return <aside className="painel recall-detalhes"><div className="recall-detalhes-topo"><div><span>Contato atual</span><h2>{item.clienteNome}</h2><p>{pesquisaPorAniversariante?'Já recebeu mensagem de':'Já comprou mensagem para'} <strong>{item.aniversariante}</strong></p></div></div>
    <div className="recall-contato"><div><small>Telefone principal</small><strong>{item.telefone||'Não informado'}</strong></div>{linkWhatsapp(item.telefone)&&<a className="btn recall-whatsapp" href={linkWhatsapp(item.telefone)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp de ${item.clienteNome}`} title="Abrir WhatsApp"><IconeWhatsapp/></a>}</div>
    <div className="recall-contexto"><h3>{pesquisaPorAniversariante?'Última mensagem recebida desse aniversariante':'Contexto da última mensagem comprada'}</h3><dl><div><dt>Data</dt><dd>{item.ultimoPedido.data||'Não informada'}</dd></div><div><dt>Tema · Nº</dt><dd>{item.ultimoPedido.tema||'Não informado'}{item.ultimoPedido.texto?` · Nº ${item.ultimoPedido.texto}`:''}</dd></div><div><dt>Pedido</dt><dd>O.S. {item.ultimoPedido.os||item.ultimoPedido.pedidoId}</dd></div></dl><div className="recall-links">{item.clienteId&&<button onClick={()=>navigate(`/clientes/${item.clienteId}`)}>Abrir cliente</button>}<button onClick={()=>navigate(`/fonada/${item.ultimoPedido.pedidoId}`,{state:{returnTo}})}>Abrir pedido</button></div></div>
    <details className="recall-historico-relacao"><summary>Ver histórico da relação ({item.quantidade})</summary>{item.historico.map((h,i)=><button type="button" key={`${h.pedidoId}-${h.mensagem}`} onClick={()=>navigate(`/fonada/${h.pedidoId}`,{state:{returnTo}})}><strong>{h.data}</strong><span>{h.tema||'Tema não informado'}{h.texto?` · Nº ${h.texto}`:''} · O.S. {h.os||h.pedidoId}</span><b>›</b></button>)}</details>
    <button className="btn recall-criar" disabled={!item.clienteId} onClick={criarPedido}>＋ Criar novo pedido</button>
  </aside>;
}
