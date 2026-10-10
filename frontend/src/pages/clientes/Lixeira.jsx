import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { AvisoInline, Dialogo, EstadoCarregando, EstadoVazio, Paginacao } from '../../components/Interface.jsx';
import Icone from '../../components/IconeAdministracao.jsx';
import '../administracao.css';

const quantidade=c=>Number(c.total_fonada||0)+Number(c.total_aovivo||0);
const contato=c=>[c.whatsapp,c.celular,c.fixo].find(v=>v&&/[1-9]/.test(String(v)))||'Contato não informado';
const data=v=>v&&!Number.isNaN(new Date(v).getTime())?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Data não informada';
const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function Lixeira() {
  const [params,setParams]=useSearchParams();
  const buscaUrl=params.get('busca')||'',situacao=params.get('situacao')||'',ordem=params.get('ordenarPor')||'recentes';
  const pagina=Math.max(1,Number.parseInt(params.get('pagina')||'1',10)||1);
  const [busca,setBusca]=useState(buscaUrl),[itens,setItens]=useState([]),[total,setTotal]=useState(0),[carregando,setCarregando]=useState(true),[erro,setErro]=useState(''),[revisao,setRevisao]=useState(0);
  const [expandido,setExpandido]=useState(null),[pedidos,setPedidos]=useState({}),[errosPedidos,setErrosPedidos]=useState({}),[consultando,setConsultando]=useState(new Set());
  const [selecionados,setSelecionados]=useState(new Set()),[acao,setAcao]=useState(null),[processando,setProcessando]=useState(false),[textoExclusao,setTextoExclusao]=useState('');
  const ocupado=useRef(false),consultas=useRef(new Set());
  const { mostrarToast }=useToast();
  const totalPaginas=Math.max(1,Math.ceil(total/30));
  function mudar(valores) {setParams(atuais=>{const novos=new URLSearchParams(atuais);for(const [k,v]of Object.entries(valores))v?novos.set(k,String(v)):novos.delete(k);return novos;},{replace:true});}
  useEffect(()=>{setBusca(buscaUrl);setSelecionados(new Set());setExpandido(null);},[buscaUrl,situacao,ordem,pagina]);
  useEffect(()=>{const timer=setTimeout(()=>{if(busca!==buscaUrl)mudar({busca:busca,pagina:1});},350);return()=>clearTimeout(timer);},[busca,buscaUrl]);
  useEffect(()=>{
    const controle=new AbortController();setCarregando(true);setErro('');
    api.clientes.listarLixeira(buscaUrl,pagina,{situacao,ordenarPor:ordem,signal:controle.signal}).then(r=>{
      if(controle.signal.aborted)return;
      const ultima=Math.max(1,Math.ceil(r.total/30));
      if(pagina>ultima){setParams(atuais=>{const novos=new URLSearchParams(atuais);novos.set('pagina',String(ultima));return novos;},{replace:true});return;}
      setItens(r.clientes);setTotal(r.total);
      setSelecionados(atuais=>new Set([...atuais].filter(id=>r.clientes.some(c=>c.id===id))));
    }).catch(e=>{if(!controle.signal.aborted)setErro(e.message);}).finally(()=>{if(!controle.signal.aborted)setCarregando(false);});
    return()=>controle.abort();
  },[buscaUrl,situacao,ordem,pagina,revisao,setParams]);
  async function carregarPedidos(c) {
    if(consultas.current.has(c.id))return;
    consultas.current.add(c.id);setConsultando(atuais=>new Set(atuais).add(c.id));setErrosPedidos(atuais=>({...atuais,[c.id]:''}));
    try {const r=await api.clientes.pedidosLixeira(c.id);setPedidos(atuais=>({...atuais,[c.id]:r}));}
    catch(e){setErrosPedidos(atuais=>({...atuais,[c.id]:e.message}));}
    finally{consultas.current.delete(c.id);setConsultando(atuais=>{const novos=new Set(atuais);novos.delete(c.id);return novos;});}
  }
  function alternar(c) {setExpandido(expandido===c.id?null:c.id);if(expandido!==c.id&&!pedidos[c.id])carregarPedidos(c);}
  function selecionar(id) {setSelecionados(atuais=>{const novos=new Set(atuais);novos.has(id)?novos.delete(id):novos.add(id);return novos;});}
  async function executarRestauracao(lista) {
    if(ocupado.current)return;
    ocupado.current=true;setProcessando(true);
    try {
      const resultados=await Promise.allSettled(lista.map(c=>api.clientes.restaurar(c.id)));
      const falharam=lista.filter((_,i)=>resultados[i].status==='rejected'),n=lista.length-falharam.length;
      setSelecionados(new Set(falharam.map(c=>c.id)));setAcao(null);setExpandido(null);
      mostrarToast(falharam.length?`${n} restaurado(s); ${falharam.length} não puderam ser restaurados. Tente novamente.`:lista.length===1?`"${lista[0].nome}" foi restaurado.`:`${n} clientes e seus pedidos foram restaurados.`,falharam.length?'erro':undefined);
      setRevisao(v=>v+1);
    }finally{ocupado.current=false;setProcessando(false);}
  }
  async function excluir() {
    if(ocupado.current||textoExclusao!=='EXCLUIR'||!acao?.cliente)return;
    ocupado.current=true;setProcessando(true);
    try {await api.clientes.apagarDefinitivo(acao.cliente.id);mostrarToast(`"${acao.cliente.nome}" foi apagado para sempre.`);setAcao(null);setTextoExclusao('');setExpandido(null);setRevisao(v=>v+1);}
    catch(e){mostrarToast(e.message||'Não foi possível apagar. Tente novamente.','erro');}
    finally{ocupado.current=false;setProcessando(false);}
  }
  const temFiltros=Boolean(buscaUrl||situacao),pedidosPagina=itens.reduce((s,c)=>s+quantidade(c),0);
  return <div className="admin-workspace recuperacao-renovada">
    <header className="admin-header"><div><span className="admin-eyebrow">Central de recuperação</span><h1>Lixeira</h1><p>Confira o que foi removido. Recupere o que precisa voltar.</p></div><Link className="btn secundario" to="/clientes">Voltar aos clientes</Link></header>
    <section className="recovery-overview" aria-label="Resumo da lixeira"><div className="recovery-stat principal"><Icone tipo="pasta"/><span>{temFiltros?'Cadastros encontrados':'Cadastros na lixeira'}</span><strong>{carregando?'—':total.toLocaleString('pt-BR')}</strong><small>{temFiltros?'De acordo com os filtros':'Disponíveis para recuperação'}</small></div><div className="recovery-stat"><Icone tipo="pedido"/><span>Pedidos vinculados na página</span><strong>{carregando?'—':pedidosPagina.toLocaleString('pt-BR')}</strong><small>Dos {itens.length} cadastros exibidos</small></div><div className="recovery-guide"><span className="admin-icon"><Icone tipo="restaurar"/></span><div><strong>Uma restauração, todo o histórico</strong><p>Restaurar um cliente também recupera seus pedidos Fonada e Ao Vivo. Confira a pasta antes de decidir.</p></div></div></section>
    <section className="admin-card recovery-filters" aria-label="Busca e filtros da lixeira"><form onSubmit={e=>{e.preventDefault();mudar({busca,pagina:1});}}><label htmlFor="busca-lixeira">Encontrar cadastro removido</label><div className="recovery-search"><Icone tipo="busca"/><input id="busca-lixeira" type="search" placeholder="Busque pelo nome do cliente" value={busca} onChange={e=>setBusca(e.target.value)}/><button type="submit" className="btn secundario">Buscar</button></div></form><div className="recovery-filter-row"><div role="group" aria-label="Pedidos vinculados">{[['','Todos'],['com_pedidos','Com pedidos'],['sem_pedidos','Sem pedidos']].map(([id,nome])=><button type="button" key={id} aria-pressed={situacao===id} onClick={()=>mudar({situacao:id,pagina:1})}>{nome}</button>)}</div><label>Ordenar por <select aria-label="Ordenar lixeira" value={ordem} onChange={e=>mudar({ordenarPor:e.target.value,pagina:1})}><option value="recentes">Removidos mais recentes</option><option value="antigos">Removidos mais antigos</option><option value="nome">Nome do cliente</option></select></label>{(temFiltros||busca)&&<button className="btn-small" onClick={()=>{setBusca('');mudar({busca:null,situacao:null,pagina:1});}}>Limpar filtros</button>}</div></section>
    <div className="recovery-list-top"><label><input type="checkbox" aria-label="Selecionar todos os cadastros da página" checked={!!itens.length&&itens.every(c=>selecionados.has(c.id))} disabled={carregando||processando||!itens.length} onChange={()=>setSelecionados(selecionados.size===itens.length?new Set():new Set(itens.map(c=>c.id)))}/>Selecionar página</label><span role="status">{carregando?'Atualizando lixeira…':`${total.toLocaleString('pt-BR')} cadastro${total===1?'':'s'} · página ${pagina} de ${totalPaginas}`}</span><button className="btn-small" disabled={carregando||processando} onClick={()=>setRevisao(v=>v+1)}>Atualizar</button></div>
    {selecionados.size>0&&<div className="recovery-selection"><strong>{selecionados.size} selecionado{selecionados.size===1?'':'s'}</strong><button className="btn-small" disabled={processando} onClick={()=>setSelecionados(new Set())}>Limpar seleção</button><button className="btn" disabled={processando||carregando||!!erro} onClick={()=>setAcao({tipo:'restaurar',clientes:itens.filter(c=>selecionados.has(c.id))})}><Icone tipo="restaurar"/>Restaurar selecionados</button></div>}
    {erro&&<AvisoInline titulo="Não foi possível carregar a lixeira" acao={<button className="btn secundario" onClick={()=>setRevisao(v=>v+1)}>Tentar novamente</button>}>{erro}</AvisoInline>}
    {carregando&&!itens.length?<EstadoCarregando rotulo="Carregando cadastros removidos…" linhas={5}/>:!itens.length&&!erro?<EstadoVazio icone="♲" titulo={temFiltros?'Nenhum cadastro removido encontrado':'A lixeira está vazia'} descricao={temFiltros?'Tente outro nome ou limpe os filtros.':'Os cadastros removidos aparecerão aqui para conferência e recuperação.'} acao={temFiltros?<button className="btn secundario" onClick={()=>{setBusca('');mudar({busca:null,situacao:null,pagina:1});}}>Limpar filtros</button>:<Link className="btn secundario" to="/clientes">Ver clientes</Link>}/>:<div className="recovery-list" aria-busy={carregando}>
      {itens.map(c=>{const aberto=expandido===c.id,conteudo=pedidos[c.id];return <article key={c.id} className={`recovery-folder ${aberto?'aberta':''} ${selecionados.has(c.id)?'selecionada':''}`}>
        <div className="recovery-folder-head"><input type="checkbox" aria-label={`Selecionar ${c.nome}`} checked={selecionados.has(c.id)} disabled={processando||carregando||!!erro} onChange={()=>selecionar(c.id)}/><button type="button" className="recovery-open" aria-label={`${aberto?'Ocultar':'Mostrar'} pedidos de ${c.nome}`} aria-expanded={aberto} aria-controls={`pasta-${c.id}`} disabled={carregando} onClick={()=>alternar(c)}><span className="recovery-folder-icon"><Icone tipo="pasta"/></span><span><strong>{c.nome||`Cliente ${c.id}`}</strong><small>#{c.id} · {contato(c)}</small></span><span className="recovery-chevron" aria-hidden="true">{aberto?'⌃':'⌄'}</span></button><div className="recovery-orders-count"><strong>{quantidade(c)} pedidos</strong><small>{c.total_fonada||0} Fonada · {c.total_aovivo||0} Ao Vivo</small></div><div className="recovery-date"><small>Removido em</small><span>{data(c.excluido_em)}</span></div><div className="recovery-actions"><button className="btn-small recovery-restore" disabled={processando||carregando||!!erro} onClick={()=>executarRestauracao([c])}><Icone tipo="restaurar"/>Restaurar</button><button className="recovery-delete" title="Apagar definitivamente" aria-label={`Apagar definitivamente ${c.nome}`} disabled={processando||carregando||!!erro} onClick={()=>{setTextoExclusao('');setAcao({tipo:'excluir',cliente:c});}}><Icone tipo="excluir"/></button></div></div>
        {aberto&&<div id={`pasta-${c.id}`} className="recovery-folder-body">{errosPedidos[c.id]?<AvisoInline titulo="Não foi possível consultar os pedidos" acao={<button className="btn-small" onClick={()=>carregarPedidos(c)}>Tentar novamente</button>}>{errosPedidos[c.id]}</AvisoInline>:consultando.has(c.id)||!conteudo?<p role="status">Carregando pedidos…</p>:<><div className="recovery-folder-meta"><span>{[c.bairro,c.endereco].filter(Boolean).join(' · ')||'Endereço não informado'}</span><span>Nascimento: {c.nascimento&&c.nascimento!=='00/00/0000'?c.nascimento:'não informado'}</span></div>{!(conteudo.fonada?.length||conteudo.aoVivo?.length)?<p className="recovery-no-orders">Este cliente não tinha pedidos.</p>:<div className="recovery-orders-grid">{[['fonada','FONADA'],['aoVivo','AO VIVO']].map(([chave,nome])=>!!conteudo[chave]?.length&&<section key={chave}><h2>{nome} ({conteudo[chave].length})</h2>{conteudo[chave].map(p=><div className="recovery-order" key={p.id}><span className="recovery-os">O.S. {p.senha_os||p.numero_os||p.id}</span><span><strong>{p.nome_comprador||p.comprador||c.nome}</strong><small>{chave==='fonada'?'Compra':'Entrega'}: {p.data_pedido||p.dia_entrega||'não informada'}</small></span><b>{moeda(p.valor)}</b></div>)}</section>)}</div>}</>}</div>}
      </article>;})}
    </div>}
    {!!total&&!erro&&<Paginacao carregando={carregando||processando} pagina={pagina} totalPaginas={totalPaginas} total={total} rotulo="cadastros removidos" onAnterior={()=>mudar({pagina:pagina-1})} onProxima={()=>mudar({pagina:pagina+1})}/>}
    {acao&&<Dialogo titulo={acao.tipo==='restaurar'?'Restaurar os cadastros selecionados?':'Apagar definitivamente?'} descricao={acao.tipo==='restaurar'?`${acao.clientes.length} clientes e todos os seus pedidos vinculados voltarão à operação.`:'O cadastro e todos os pedidos vinculados serão excluídos sem possibilidade de restauração.'} onClose={()=>{if(!processando)setAcao(null);}} className="admin-dialog">
      {acao.tipo==='excluir'&&<><div className="recovery-delete-preview"><strong>{acao.cliente.nome}</strong><span>{quantidade(acao.cliente)} pedidos vinculados · cadastro #{acao.cliente.id}</span></div><div className="campo"><label htmlFor="confirmar-exclusao">Digite EXCLUIR para confirmar</label><input id="confirmar-exclusao" autoComplete="off" value={textoExclusao} disabled={processando} onChange={e=>setTextoExclusao(e.target.value)}/></div></>}
      <div className="admin-dialog-actions"><button className="btn secundario" disabled={processando} onClick={()=>setAcao(null)}>Cancelar</button><button className={`btn ${acao.tipo==='excluir'?'perigo':''}`} disabled={processando||(acao.tipo==='excluir'&&textoExclusao!=='EXCLUIR')} onClick={()=>acao.tipo==='restaurar'?executarRestauracao(acao.clientes):excluir()}>{processando?'Processando…':acao.tipo==='restaurar'?'Confirmar restauração':'Apagar de vez'}</button></div>
    </Dialogo>}
  </div>;
}
