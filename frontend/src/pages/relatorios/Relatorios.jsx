import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { formatarData } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';
import { AvisoInline, CabecalhoPagina } from '../../components/Interface.jsx';
import { GraficoEvolucao, GraficoCategorias, GraficoComposicao } from './GraficosRelatorio.jsx';
import { CORES_RELATORIO as CORES, dinheiro, numero, nomePeriodo, diasPeriodo, dataRelatorio, campoData, periodoRapido, periodoAnterior, compararValores, resumoRelatorio, totaisFormas } from '../../utils/relatorios.js';
import './relatorios.css';

const ABAS = [{ id:'vendas', nome:'Vendas', icone:'↗' },{ id:'recebimentos', nome:'Recebimentos', icone:'↙' },{ id:'desempenho', nome:'Equipe', icone:'◎' }];
export default function Relatorios() {
  const [params,setParams] = useSearchParams();
  const tipo = ABAS.some(a=>a.id===params.get('aba')) ? params.get('aba') : 'vendas';
  const sistema = ['TODOS','FONADA','AOVIVO'].includes(params.get('sistema')) ? params.get('sistema') : 'TODOS';
  const padrao = periodoRapido('mes');
  const inicio = params.has('inicio') ? params.get('inicio') : padrao.inicio;
  const fim = params.has('fim') ? params.get('fim') : padrao.fim;
  const inicioB = params.get('inicioB') || '', fimB = params.get('fimB') || '';
  const comparando = params.get('comparando') === '1' || Boolean(inicioB);
  function mudar(valores) { setParams(atuais=>{const novos=new URLSearchParams(atuais);for(const [chave,valor] of Object.entries(valores)) valor===null ? novos.delete(chave) : novos.set(chave,valor);return novos;},{replace:true}); }
  function comparar() { const anterior=periodoAnterior(inicio,fim); mudar(comparando ? {comparando:null,inicioB:null,fimB:null} : {comparando:'1',inicioB:anterior?.inicio||'',fimB:anterior?.fim||''}); }
  function referencia(tipoReferencia) {
    const a=dataRelatorio(inicio),b=dataRelatorio(fim||inicio); if(!a||!b)return;
    if(tipoReferencia==='anterior') {const p=periodoAnterior(inicio,fim);if(p)mudar({inicioB:p.inicio,fimB:p.fim});}
    if(tipoReferencia==='mes') mudar({inicioB:campoData(new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()-1,1))),fimB:campoData(new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),0)))});
    if(tipoReferencia==='ano') { const anterior=d=>{const ano=d.getUTCFullYear()-1,mes=d.getUTCMonth(),dia=Math.min(d.getUTCDate(),new Date(Date.UTC(ano,mes+1,0)).getUTCDate());return campoData(new Date(Date.UTC(ano,mes,dia)));};mudar({inicioB:anterior(a),fimB:anterior(b)}); }
  }
  return <div className="relatorios-modernos">
    <CabecalhoPagina contexto="Visão do negócio" titulo="Relatórios" descricao="Explore os resultados, descubra o que mudou e compare os períodos que importam." />
    <div className="rel-navigation"><div className="rel-tabs" aria-label="Tipo de relatório">{ABAS.map(aba=><button type="button" key={aba.id} className={tipo===aba.id?'ativo':''} aria-pressed={tipo===aba.id} onClick={()=>mudar({aba:aba.id})}><span aria-hidden="true">{aba.icone}</span>{aba.nome}</button>)}</div><div className="rel-system"><span>Modalidade</span><div className="rel-system-options" role="group" aria-label="Modalidade do relatório">{[['TODOS','Todas'],['FONADA','Fonada'],['AOVIVO','Ao Vivo']].map(([valor,nome])=><button type="button" key={valor} aria-pressed={sistema===valor} onClick={()=>mudar({sistema:valor})}>{nome}</button>)}</div></div></div>
    <section className="rel-period-picker" aria-label="Escolher períodos">
      <div className="rel-presets">{[['hoje','Hoje'],['ontem','Ontem'],['semana','Esta semana'],['mes','Este mês'],['mes-anterior','Mês anterior']].map(([valor,nome])=><button type="button" key={valor} onClick={()=>mudar(periodoRapido(valor))}>{nome}</button>)}<button type="button" className={`rel-compare-toggle ${comparando?'ativo':''}`} aria-pressed={comparando} onClick={comparar}>{comparando?'× Remover comparação':'＋ Comparar períodos'}</button></div>
      <div className={`rel-period-grid ${comparando?'comparando':''}`}>
        <div className="rel-period-block"><div className="rel-period-name"><i style={{background:CORES.principal}}/><div><small>Período em análise</small><strong>{nomePeriodo(inicio,fim)}</strong></div></div><div className="rel-date-inputs"><div><label htmlFor="rel-inicio">De</label><CampoData id="rel-inicio" value={inicio} placeholder="dd/mm/aa" onChange={v=>mudar({inicio:formatarData(v)})}/></div><div><label htmlFor="rel-fim">Até</label><CampoData id="rel-fim" value={fim} placeholder="dd/mm/aa" onChange={v=>mudar({fim:formatarData(v)})}/></div></div></div>
        {comparando && <><button type="button" className="rel-swap" aria-label="Inverter os períodos da comparação" disabled={!diasPeriodo(inicio,fim)||!diasPeriodo(inicioB,fimB)} onClick={()=>mudar({inicio:inicioB,fim:fimB||inicioB,inicioB:inicio,fimB:fim||inicio})}>⇄<span>Inverter períodos</span></button><div className="rel-period-block referencia"><div className="rel-period-name"><i style={{background:CORES.comparado}}/><div><small>Comparar com</small><strong>{nomePeriodo(inicioB,fimB)}</strong></div></div><div className="rel-date-inputs"><div><label htmlFor="rel-inicio-ref">De</label><CampoData id="rel-inicio-ref" value={inicioB} placeholder="dd/mm/aa" onChange={v=>mudar({inicioB:formatarData(v)})}/></div><div><label htmlFor="rel-fim-ref">Até</label><CampoData id="rel-fim-ref" value={fimB} placeholder="dd/mm/aa" onChange={v=>mudar({fimB:formatarData(v)})}/></div></div><div className="rel-reference-presets"><button type="button" onClick={()=>referencia('anterior')}>Intervalo anterior</button><button type="button" onClick={()=>referencia('mes')}>Mês anterior</button><button type="button" onClick={()=>referencia('ano')}>Ano anterior</button></div></div></>}
      </div>
    </section>
    <ConteudoRelatorio key={`${tipo}|${sistema}`} tipo={tipo} sistema={sistema} inicio={inicio} fim={fim} inicioB={inicioB} fimB={fimB} comparando={comparando}/>
  </div>;
}

function ConteudoRelatorio({tipo,sistema,inicio,fim,inicioB,fimB,comparando}) {
  const [snapshot,setSnapshot]=useState(null),[carregando,setCarregando]=useState(false),[erro,setErro]=useState(''),[tentativa,setTentativa]=useState(0);
  const requisicao=useRef(0);
  const validar=(a,b,nome)=>!dataRelatorio(a)|| (b&&!dataRelatorio(b)) ? `Preencha datas válidas para ${nome}.` : !diasPeriodo(a,b) ? `A data final deve ser igual ou posterior à inicial em ${nome}.` : '';
  const erroDatas=validar(inicio,fim,'o período em análise') || (comparando ? validar(inicioB,fimB,'o período de comparação') : '');
  useEffect(()=>{
    const atual=++requisicao.current;
    if(erroDatas){setCarregando(false);return;}
    setCarregando(true);setErro('');
    const timer=setTimeout(async()=>{
      try {
        const [principal,comparado]=await Promise.all([api.relatorios[tipo](inicio,fim,sistema,{limite:50,pagina:1}),comparando ? api.relatorios[tipo](inicioB,fimB,sistema,{limite:50,pagina:1}) : Promise.resolve(null)]);
        if(atual===requisicao.current)setSnapshot({principal,comparado,sistema,tipo});
      } catch(e){if(atual===requisicao.current)setErro(e.message);}
      finally{if(atual===requisicao.current)setCarregando(false);}
    },250);
    return()=>{clearTimeout(timer);requisicao.current++;};
  },[tipo,sistema,inicio,fim,inicioB,fimB,comparando,erroDatas,tentativa]);
  if(erroDatas)return <AvisoInline tom="aviso" titulo="Revise os períodos">{erroDatas}</AvisoInline>;
  if(erro)return <AvisoInline tom="erro" titulo="Não foi possível atualizar o relatório" acao={<button type="button" className="btn secundario" onClick={()=>setTentativa(v=>v+1)}>Tentar novamente</button>}>{erro}</AvisoInline>;
  if(!snapshot)return <div className="rel-loading" role="status"><span/><strong>Carregando {sistema==='TODOS'?'todas as modalidades':sistema==='FONADA'?'Fonada':'Ao Vivo'}…</strong><p>Organizando os gráficos e a comparação.</p></div>;
  const {principal,comparado}=snapshot;
  const nomes={principal:nomePeriodo(principal.inicio,principal.fim),comparado:comparado ? nomePeriodo(comparado.inicio,comparado.fim) : ''};
  const a=resumoRelatorio(principal,tipo),b=comparado ? resumoRelatorio(comparado,tipo) : null;
  const chave=`${principal.inicio}|${principal.fim}|${comparado?.inicio}|${comparado?.fim}|${snapshot.sistema}`;
  const quantidadeNome=tipo==='recebimentos'?'Recebimentos':'Pedidos vendidos';
  return <div className={`rel-results ${carregando?'atualizando':''}`} aria-busy={carregando}>
    <div className="rel-results-heading"><div><span className="rel-eyebrow">{tipo==='recebimentos'?'Visão de recebimentos':tipo==='desempenho'?'Vendas atribuídas à equipe':'Visão de vendas'}</span><h2>{nomes.principal}</h2><p>{principal.inicio} a {principal.fim||principal.inicio} · {snapshot.sistema==='TODOS'?'Fonada e Ao Vivo':snapshot.sistema==='FONADA'?'Fonada':'Ao Vivo'}</p></div>{carregando && <span className="rel-updating" role="status">Atualizando…</span>}</div>
    {comparado && <ConclusaoComparacao principal={principal} comparado={comparado} a={a} b={b} tipo={tipo} nomes={nomes}/>}
    <div className="rel-kpis"><Indicador titulo={tipo==='recebimentos'?'Total recebido':'Total vendido'} valor={a.valor} anterior={b?.valor} moeda destaque nomes={nomes}/><Indicador titulo={quantidadeNome} valor={a.quantidade} anterior={b?.quantidade} nomes={nomes}/><Indicador titulo={tipo==='recebimentos'?'Valor médio recebido':'Ticket médio'} valor={a.ticket} anterior={b?.ticket} moeda nomes={nomes}/></div>
    <div className="rel-interaction-zone" inert={carregando?'':undefined} key={chave}>
      {tipo==='vendas' && <GraficosVendas principal={principal} comparado={comparado} nomes={nomes}/>}
      {tipo==='recebimentos' && <GraficosRecebimentos principal={principal} comparado={comparado} nomes={nomes}/>}
      {tipo==='desempenho' && <GraficosEquipe principal={principal} comparado={comparado} nomes={nomes}/>}
      <DetalhesRelatorio principal={principal} comparado={comparado} tipo={tipo} nomes={nomes}/>
    </div>
  </div>;
}
function Indicador({titulo,valor,anterior,moeda,destaque,nomes}) {
  const formatar=moeda?dinheiro:numero,c=anterior===undefined?null:compararValores(valor,anterior);
  return <section className={`rel-kpi ${destaque?'destaque':''}`}><span>{titulo}</span><strong>{formatar(valor)}</strong>{c ? <div className="rel-kpi-comparison"><b className={c.diferenca>0?'positivo':c.diferenca<0?'negativo':'neutro'}>{c.percentual===null?'Sem base percentual':`${c.percentual>0?'+':''}${numero(c.percentual)}%`}</b><small>vs. {nomes.comparado}<em>{formatar(anterior)} no período comparado</em></small></div> : <small>{nomes.principal}</small>}</section>;
}
function ConclusaoComparacao({principal,comparado,a,b,tipo,nomes}) {
  const c=compararValores(a.valor,b.valor),maior=c.vencedor==='principal'?nomes.principal:nomes.comparado,menor=c.vencedor==='principal'?nomes.comparado:nomes.principal;
  const verbo=tipo==='recebimentos'?'recebeu':'vendeu';
  const diasA=diasPeriodo(principal.inicio,principal.fim),diasB=diasPeriodo(comparado.inicio,comparado.fim);
  return <section className="rel-comparison-conclusion" aria-label="Resultado da comparação"><div className="rel-conclusion-icon" aria-hidden="true">{c.vencedor==='empate'?'＝':'↗'}</div><div className="rel-conclusion-text"><small>Resultado da comparação</small><h3>{c.vencedor==='empate'?a.valor===0?'Nenhum movimento nos dois períodos':'Os dois períodos tiveram o mesmo total':`${maior} ${verbo} mais`}</h3><p>{c.vencedor==='empate'?`Total de ${dinheiro(a.valor)} em cada período.`:`${dinheiro(Math.abs(c.diferenca))} a mais que ${menor}.`}</p><div className="rel-period-values"><span><i style={{background:CORES.principal}}/>{nomes.principal}<b>{dinheiro(a.valor)}</b></span><span><i style={{background:CORES.comparado}}/>{nomes.comparado}<b>{dinheiro(b.valor)}</b></span></div>{diasA!==diasB && <p className="rel-duration-note">Os intervalos têm {diasA} e {diasB} dias. Média diária: {dinheiro(a.valor/diasA)} em {nomes.principal} e {dinheiro(b.valor/diasB)} em {nomes.comparado}.</p>}</div><div className="rel-conclusion-change"><strong>{c.percentual===null?'—':`${c.percentual>0?'+':''}${numero(c.percentual)}%`}</strong><span>{c.percentual===null?'O período comparado não teve movimento.':`${nomes.principal} em relação a ${nomes.comparado}`}</span></div></section>;
}
function serie(dados,nome,cor,campo='vendasPorDia',tracejada=false) { return {nome,cor,pontos:dados?.graficos?.[campo]||[],periodo:{inicio:dados.inicio,fim:dados.fim},dias:diasPeriodo(dados.inicio,dados.fim),tracejada}; }
function modalidades(dados) {return [['fonada','Fonada'],['aoVivo','Ao Vivo']].filter(([k])=>dados[k]).map(([k,categoria])=>({categoria,valor:Number(dados[k].valorTotal||0),quantidade:Number(dados[k].quantidade||0)}));}
function GraficosVendas({principal,comparado,nomes}) {
  return <div className="rel-charts-grid"><GraficoEvolucao titulo="Evolução das vendas" descricao="O valor vendido ao longo de cada período, incluindo os dias sem vendas." series={[serie(principal,nomes.principal,CORES.principal),...(comparado?[serie(comparado,nomes.comparado,CORES.comparado,'vendasPorDia',true)]:[])]} alinhar={Boolean(comparado)}/><GraficoComposicao titulo="Fonada e Ao Vivo" principal={modalidades(principal)} comparado={comparado?modalidades(comparado):null} nomes={nomes}/><GraficoCategorias titulo="Forma prevista de pagamento" descricao="Quantidade de pedidos por forma informada na venda." dados={totaisFormas(principal.graficos?.pagamentosPorDia)} referencia={comparado?totaisFormas(comparado.graficos?.pagamentosPorDia):null} nomes={nomes} quantidade metrica="quantidade"/>{principal.fonada && <GraficoCategorias titulo="Origem dos pedidos Fonada" descricao="Pedidos originados pelo Recall e por outros atendimentos." dados={principal.graficos?.origemFonada||[]} referencia={comparado?comparado.graficos?.origemFonada||[]:null} nomes={nomes} quantidade metrica="quantidade"/>}</div>;
}
function GraficosRecebimentos({principal,comparado,nomes}) {
  const [fluxoPeriodo,setFluxoPeriodo]=useState('principal');
  const fluxo=fluxoPeriodo==='comparado'&&comparado?comparado:principal,nomeFluxo=fluxo===principal?nomes.principal:nomes.comparado;
  return <><div className="rel-financial-strip"><div><span>Vendido em {nomes.principal}</span><strong>{dinheiro(principal.valorVendido)}</strong></div><div><span>Recebido dessas vendas</span><strong>{dinheiro(principal.valorRecebidoVendasPeriodo)}</strong></div><div><span>A receber dessas vendas</span><strong>{dinheiro(principal.valorAReceberVendasPeriodo)}</strong></div><p>O total recebido no período também pode incluir pedidos vendidos antes dele.</p></div><div className="rel-charts-grid"><GraficoEvolucao titulo="Evolução dos recebimentos" descricao="Entradas registradas pela data do pagamento." series={[serie(principal,nomes.principal,CORES.principal,'recebidoPorDia'),...(comparado?[serie(comparado,nomes.comparado,CORES.comparado,'recebidoPorDia',true)]:[])]} alinhar={Boolean(comparado)}/><GraficoComposicao titulo="Recebimentos por modalidade" principal={modalidades(principal)} comparado={comparado?modalidades(comparado):null} nomes={nomes}/><GraficoCategorias titulo="Como o dinheiro foi recebido" descricao="Valor e quantidade de recebimentos por forma de pagamento." dados={principal.graficos?.recebimentosPorForma||[]} referencia={comparado?comparado.graficos?.recebimentosPorForma||[]:null} nomes={nomes}/></div><div className="rel-flow-selector"><span>Vendas e entradas de caixa</span>{comparado && <div><button type="button" aria-pressed={fluxoPeriodo==='principal'} onClick={()=>setFluxoPeriodo('principal')}>{nomes.principal}</button><button type="button" aria-pressed={fluxoPeriodo==='comparado'} onClick={()=>setFluxoPeriodo('comparado')}>{nomes.comparado}</button></div>}</div><GraficoEvolucao key={nomeFluxo} titulo={`Vendido e recebido · ${nomeFluxo}`} descricao="São movimentos pela data da venda e pela data do pagamento. A diferença diária não representa saldo devedor." series={[{...serie(fluxo,'Vendido',CORES.principal,'vendidoPorDia'),semQuantidade:true},serie(fluxo,'Recebido',CORES.recebido,'recebidoPorDia')]}/></>;
}
function funcionarios(dados) {return (dados.funcionarios||[]).map(f=>({categoria:f.usuario,valor:Number(f.valorVendidoTotal||0),quantidade:Number(f.vendasTotal||0),ticket:Number(f.ticketMedio||0),fonada:Number(f.valorVendidoFonada||0),aoVivo:Number(f.valorVendidoAoVivo||0),quantidadeFonada:Number(f.vendasFonada||0),quantidadeAoVivo:Number(f.vendasAoVivo||0)}));}
function GraficosEquipe({principal,comparado,nomes}) {
  const [metrica,setMetrica]=useState('valor');
  const a=funcionarios(principal),b=comparado?funcionarios(comparado):null;
  const composicao=lista=>[{categoria:'Fonada',valor:lista.reduce((s,f)=>s+f.fonada,0),quantidade:lista.reduce((s,f)=>s+f.quantidadeFonada,0)},{categoria:'Ao Vivo',valor:lista.reduce((s,f)=>s+f.aoVivo,0),quantidade:lista.reduce((s,f)=>s+f.quantidadeAoVivo,0)}];
  return <><div className="rel-team-note">Pedidos antigos sem vendedor informado ficam fora dos resultados da equipe.</div><div className="rel-metric-selector" aria-label="Métrica do ranking">{[['valor','Valor vendido'],['quantidade','Quantidade de vendas'],['ticket','Ticket médio']].map(([id,nome])=><button type="button" key={id} aria-pressed={metrica===id} className={metrica===id?'ativo':''} onClick={()=>setMetrica(id)}>{nome}</button>)}</div><div className="rel-charts-grid"><GraficoCategorias key={metrica} titulo="Desempenho por pessoa" descricao="Compare as pessoas nos mesmos períodos. Clique para abrir as modalidades e os valores." dados={a} referencia={b} nomes={nomes} metrica={metrica} quantidade={metrica==='quantidade'} equipe/><GraficoComposicao titulo="Modalidades vendidas pela equipe" principal={composicao(a)} comparado={b?composicao(b):null} nomes={nomes}/></div></>;
}

function DetalhesRelatorio({principal,comparado,tipo,nomes}) {
  const [aberto,setAberto]=useState(false),[periodo,setPeriodo]=useState('principal');
  const escolhido=periodo==='comparado'&&comparado?comparado:principal;
  return <details className="rel-records" onToggle={e=>setAberto(e.currentTarget.open)}><summary><div><strong>{tipo==='desempenho'?'Consultar números da equipe':'Consultar pedidos do relatório'}</strong><span>Abra para conferir os registros que compõem os resultados.</span></div><span aria-hidden="true">⌄</span></summary>{aberto && <div className="rel-records-content">{comparado && <div className="rel-records-tabs"><button type="button" aria-pressed={periodo==='principal'} onClick={()=>setPeriodo('principal')}>{nomes.principal}</button><button type="button" aria-pressed={periodo==='comparado'} onClick={()=>setPeriodo('comparado')}>{nomes.comparado}</button></div>}{tipo==='desempenho'?<TabelaEquipe dados={escolhido}/>:<PedidosPeriodo key={`${escolhido.inicio}|${escolhido.fim}`} dados={escolhido} tipo={tipo}/>}</div>}</details>;
}
function PedidosPeriodo({dados,tipo}) {
  const [pagina,setPagina]=useState(1),[limite,setLimite]=useState(50),[resposta,setResposta]=useState(dados),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false),[tentativa,setTentativa]=useState(0);
  const navegar=useNavigate(),atual=useRef(0);
  useEffect(()=>{const id=++atual.current;if(pagina===1&&limite===50&&!tentativa){setResposta(dados);setCarregando(false);setErro('');return;}setCarregando(true);setErro('');api.relatorios[tipo](dados.inicio,dados.fim,dados.sistema,{pagina,limite}).then(r=>{if(id===atual.current)setResposta(r);}).catch(e=>{if(id===atual.current)setErro(e.message);}).finally(()=>{if(id===atual.current)setCarregando(false);});return()=>{atual.current++;};},[pagina,limite,tentativa,dados,tipo]);
  return <div aria-busy={carregando}>{erro && <AvisoInline tom="erro" titulo="Não foi possível carregar os pedidos" acao={<button type="button" className="btn secundario" onClick={()=>setTentativa(t=>t+1)}>Tentar novamente</button>}>{erro}</AvisoInline>}<div className="rel-table-tools"><span>{numero(resposta.itensTotal||0)} registros no período</span><label>Por página <select aria-label="Pedidos por página" value={limite} disabled={carregando} onChange={e=>{setPagina(1);setLimite(Number(e.target.value));}}>{[50,100,200,500].map(n=><option key={n}>{n}</option>)}</select></label><button type="button" disabled={carregando||pagina<=1} onClick={()=>setPagina(p=>p-1)}>Anterior</button><span>{resposta.pagina||1} / {resposta.totalPaginas||1}</span><button type="button" disabled={carregando||pagina>=(resposta.totalPaginas||1)} onClick={()=>setPagina(p=>p+1)}>Próxima</button></div><div className="rel-table-scroll" inert={carregando?'':undefined}><table><thead><tr><th>Data</th><th>O.S.</th><th>Cliente</th><th>Modalidade</th><th>Forma</th><th>{tipo==='recebimentos'?'Recebido':'Vendido'}</th><th>Pagamento</th></tr></thead><tbody>{(resposta.itens||[]).map(item=><tr key={`${item.sistema}-${item.id}`}><td>{item.data}</td><td><button type="button" className="rel-order-link" onClick={()=>navegar(item.sistema==='FONADA'?`/fonada/${item.id}`:`/ao-vivo/${item.id}`,{state:{returnTo:`/relatorios${window.location.search}`}})}>{item.os}</button></td><td>{item.nome}</td><td>{item.sistema==='FONADA'?'Fonada':'Ao Vivo'}</td><td>{item.forma}</td><td className="rel-table-money">{dinheiro(item.valor)}</td><td><span className={`tag ${item.statusPagamento==='SIM'?'ok':'pendente'}`}>{item.statusPagamento==='SIM'?'Pago':'Pendente'}</span></td></tr>)}</tbody></table>{!(resposta.itens||[]).length && <p className="rel-chart-empty">Nenhum pedido neste período.</p>}</div></div>;
}
function TabelaEquipe({dados}) {return <div className="rel-table-scroll"><table><thead><tr><th>Pessoa</th><th>Vendas</th><th>Valor vendido</th><th>Ticket médio</th><th>Participação</th><th>Fonada</th><th>Ao Vivo</th></tr></thead><tbody>{(dados.funcionarios||[]).map(f=><tr key={f.usuario}><td><strong>{f.usuario}</strong></td><td>{numero(f.vendasTotal)}</td><td className="rel-table-money">{dinheiro(f.valorVendidoTotal)}</td><td>{dinheiro(f.ticketMedio)}</td><td>{numero(f.participacaoPercentual)}%</td><td>{numero(f.vendasFonada)}</td><td>{numero(f.vendasAoVivo)}</td></tr>)}</tbody></table>{!dados.funcionarios?.length&&<p className="rel-chart-empty">Nenhuma venda atribuída à equipe neste período.</p>}</div>;}
