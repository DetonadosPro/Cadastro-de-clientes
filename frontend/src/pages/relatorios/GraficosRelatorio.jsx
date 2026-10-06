import React, { useEffect, useId, useRef, useState } from 'react';
import { CORES_RELATORIO as CORES, dinheiro, numero, seriesCalendario } from '../../utils/relatorios.js';

const PALETA = ['#3861ed', '#9062da', '#168574', '#dc8a16', '#ce587d', '#54758f', '#6b773b', '#9a6048'];
const pct = (valor, total) => total ? `${numero(valor / total * 100)}%` : '0%';
const compacto = v => Number(v) >= 1000000 ? `R$ ${numero(v / 1000000)} mi` : Number(v) >= 1000 ? `R$ ${numero(v / 1000)} mil` : `R$ ${numero(v)}`;

function Legenda({ itens, toggle }) {
  return <div className="rel-legend" aria-label="Legenda do gráfico">{itens.map((item, i) => toggle
    ? <button type="button" key={item.nome} aria-pressed={!item.oculto} onClick={() => toggle(i)} className={item.oculto ? 'oculta' : ''}><i style={{ background: item.cor }} className={item.tracejada ? 'tracejada' : ''} />{item.nome}</button>
    : <span key={item.nome}><i style={{ background: item.cor }} />{item.nome}</span>)}</div>;
}
function Valores({ info, compacto = false }) {
  if (info.grupos) return <div className={`rel-detail-periods ${compacto ? 'compacto' : ''}`}>
    {info.grupos.map((grupo, i) => <section className="rel-detail-period" key={i} style={{ '--period-color': grupo.cor }}>
      <header><i aria-hidden="true" /><strong>{grupo.nome}</strong>{grupo.data && <small>{grupo.data}</small>}</header>
      <div className="rel-period-main"><span>{grupo.linhas[0].nome}</span><strong>{grupo.linhas[0].valor}</strong>{grupo.linhas[0].extra && <small>{grupo.linhas[0].extra}</small>}</div>
      {!compacto && grupo.linhas.length > 1 && <div className="rel-period-breakdown">{grupo.linhas.slice(1).map((linha, j) => <div key={j}><span>{linha.nome}</span><strong>{linha.valor}</strong>{linha.extra && <small>{linha.extra}</small>}</div>)}</div>}
    </section>)}
  </div>;
  return <div className="rel-detail-values">{info.linhas.map((linha, i) => <div key={i}><span>{linha.cor && <i style={{ background: linha.cor }} />}{linha.nome}</span><strong>{linha.valor}</strong>{linha.extra && <small>{linha.extra}</small>}</div>)}</div>;
}
function useExploracao() {
  const [hover, setHover] = useState(null), [selecionado, setSelecionado] = useState(null);
  const limpar = () => { setHover(null); setSelecionado(null); };
  const eventos = info => ({ onMouseEnter: () => setHover(info), onFocus: () => setHover(info), onBlur: () => setHover(null), onClick: () => setSelecionado(info), onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelecionado(info); } } });
  return { hover, selecionado, eventos, limpar, sair: () => setHover(null) };
}
function Painel({ titulo, descricao, legenda, controles, exploracao, children, amplo = false }) {
  return <section className={`rel-chart ${amplo ? 'rel-chart-wide' : ''}`} aria-label={titulo}>
    <header className="rel-chart-header"><div><h2>{titulo}</h2><p>{descricao}</p></div>{controles}</header>
    {legenda}
    <div className="rel-chart-stage" onMouseLeave={exploracao.sair}>
      {children}
      {exploracao.hover && <div className="rel-tooltip" role="tooltip"><strong>{exploracao.hover.titulo}</strong><Valores info={exploracao.hover} compacto /><small>Clique para ver o detalhamento</small></div>}
    </div>
    <div className="rel-chart-hint"><span aria-hidden="true">↗</span> Passe o mouse ou toque para explorar. Clique para fixar os detalhes.</div>
    {exploracao.selecionado && <aside className="rel-selection" aria-label="Detalhes selecionados"><div className="rel-selection-header"><div><small>Detalhe selecionado</small><h3>{exploracao.selecionado.titulo}</h3></div><button type="button" onClick={exploracao.limpar} aria-label="Limpar seleção do gráfico">×</button></div><Valores info={exploracao.selecionado} /></aside>}
  </section>;
}

export function GraficoEvolucao({ titulo, descricao, series = [], alinhar = false }) {
  const exploracao = useExploracao(), id = useId().replaceAll(':', '');
  const svgRef = useRef(null);
  const [largura, setLargura] = useState(800);
  useEffect(() => {
    const observador = new ResizeObserver(([entrada]) => setLargura(Math.max(260, Math.round(entrada.contentRect.width))));
    observador.observe(svgRef.current);
    return () => observador.disconnect();
  }, []);
  const [ocultas, setOcultas] = useState([]);
  const pontos = seriesCalendario(series.map(s => s.pontos || []), series.map(s => s.periodo));
  const ativas = series.map((s,i) => ({ ...s, pontos: pontos[i], indice: i })).filter(s => !ocultas.includes(s.indice));
  const quantidade = Math.max(1, ...pontos.map(s => s.length));
  const altura = largura < 500 ? 250 : 300, esquerda = largura < 500 ? 64 : 76, direita = 24, topo = 24, base = altura - 49;
  const maximoBruto = Math.max(1, ...ativas.flatMap(s => s.pontos.map(p => p.valor)));
  const magnitude = 10 ** Math.floor(Math.log10(maximoBruto));
  const maximo = Math.ceil(maximoBruto / magnitude) * magnitude;
  const x = i => quantidade === 1 ? (largura + esquerda - direita) / 2 : esquerda + i * (largura - esquerda - direita) / (quantidade - 1);
  const y = v => base - Number(v || 0) / maximo * (base - topo);
  const toggle = i => setOcultas(atual => atual.includes(i) ? atual.filter(n => n !== i) : atual.length < series.length - 1 ? [...atual,i] : atual);
  const rotulos = Math.min(quantidade, largura < 500 ? 3 : 6);
  const indices = [...new Set(Array.from({length: rotulos}, (_,i) => Math.round(i * (quantidade - 1) / Math.max(rotulos - 1,1))))];
  const infoPonto = i => ({ titulo: alinhar ? `${series.some(s => s.dias > 90) ? 'Faixa' : 'Dia'} ${i + 1}` : (ativas[0]?.pontos[i]?.data || ativas.find(s => s.pontos[i])?.pontos[i]?.data || 'Detalhe'), grupos: ativas.map(s => {
    const p = s.pontos[i];
    if (!p) return { nome: s.nome, cor: s.cor, linhas: [{ nome: 'Total', valor: '—', extra: 'Fora deste período' }] };
    const data = p.data === p.fim ? p.data : `${p.data} a ${p.fim}`;
    return { nome: s.nome, cor: s.cor, data: alinhar ? data : undefined, linhas: [
      { nome: 'Total', valor: dinheiro(p.valor), extra: s.semQuantidade ? 'Pela data da venda' : `${numero(p.quantidade)} registros` },
      ...(!s.semQuantidade && p.quantidade ? [{ nome: 'Média por registro', valor: dinheiro(p.valor / p.quantidade) }] : []),
      ...(p.fonada || p.aoVivo ? [{ nome: 'Fonada', valor: dinheiro(p.fonada), extra: `${numero(p.quantidadeFonada)} registros · ${pct(p.fonada,p.valor)}` }, { nome: 'Ao Vivo', valor: dinheiro(p.aoVivo), extra: `${numero(p.quantidadeAoVivo)} registros · ${pct(p.aoVivo,p.valor)}` }] : []),
    ] };
  }) });
  return <Painel titulo={titulo} descricao={descricao} amplo exploracao={exploracao} legenda={<Legenda itens={series.map((s,i) => ({...s, oculto: ocultas.includes(i)}))} toggle={toggle}>
  </Legenda>}>
    <svg ref={svgRef} className="rel-line-svg" viewBox={`0 0 ${largura} ${altura}`} role="group" aria-label={titulo}>
      <defs>{ativas.map(s => <linearGradient id={`${id}-${s.indice}`} key={s.indice} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={s.cor} stopOpacity=".16" /><stop offset="100%" stopColor={s.cor} stopOpacity=".01" /></linearGradient>)}</defs>
      {[0,.25,.5,.75,1].map(f => <g key={f}><line className="rel-grid-line" x1={esquerda} x2={largura-direita} y1={y(maximo*f)} y2={y(maximo*f)} /><text className="rel-axis" x={esquerda-12} y={y(maximo*f)+4} textAnchor="end">{compacto(maximo*f)}</text></g>)}
      {ativas.map(s => { const coords = s.pontos.map((p,i) => `${x(i)},${y(p.valor)}`).join(' '); return <g key={s.indice}><polygon points={`${x(0)},${base} ${coords} ${x(s.pontos.length-1)},${base}`} fill={`url(#${id}-${s.indice})`} /><polyline points={coords} fill="none" stroke={s.cor} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.tracejada ? '7 5' : undefined} />{s.pontos.map((p,i) => <circle key={i} cx={x(i)} cy={y(p.valor)} r={quantidade < 45 ? 3.5 : 2} fill="white" stroke={s.cor} strokeWidth="2" />)}</g>; })}
      {indices.map(i => <text className="rel-axis" key={i} x={x(i)} y={altura-22} textAnchor="middle">{alinhar ? `${series.some(s => s.dias > 90) ? 'Faixa' : 'Dia'} ${i + 1}` : (pontos[0]?.[i]?.data || pontos.find(p => p[i])?.[i]?.data || '').slice(0,5)}</text>)}
      {Array.from({length:quantidade},(_,i) => { const info=infoPonto(i), faixa=(largura-esquerda-direita)/Math.max(quantidade-1,1); return <g className="rel-chart-hit" role="button" tabIndex="0" key={i} aria-label={`Detalhar ${info.titulo}`} data-index={i} {...exploracao.eventos(info)}><rect x={quantidade===1 ? esquerda : Math.max(esquerda-8,x(i)-faixa/2)} y={topo} width={quantidade===1 ? largura-esquerda-direita : Math.min(faixa,largura-direita-Math.max(esquerda-8,x(i)-faixa/2))} height={base-topo} fill="transparent" /><line className="rel-crosshair" x1={x(i)} x2={x(i)} y1={topo} y2={base} /></g>; })}
    </svg>
    {alinhar && <p className="rel-axis-note">Os pontos comparam dias contados desde o início de cada período. Os detalhes mostram as datas correspondentes.</p>}
    {quantidade && series.some(s => s.dias > 90) && <p className="rel-axis-note">Os valores foram somados em faixas de dias para manter a leitura do intervalo completo.</p>}
  </Painel>;
}

export function GraficoCategorias({ titulo, descricao, dados = [], referencia = null, nomes, quantidade = false, metrica = 'valor', equipe = false }) {
  const exploracao = useExploracao();
  const categorias = [...new Set([...dados,...(referencia || [])].map(d => d.categoria))];
  const valor = d => Number(d?.[metrica] || 0);
  const total = dados.reduce((s,d) => s + valor(d),0), totalB = (referencia || []).reduce((s,d) => s + valor(d),0);
  const maximo = Math.max(1,...[...dados,...(referencia || [])].map(valor));
  const formatar = quantidade ? numero : dinheiro;
  const lista = categorias.map(c => ({categoria:c,a:dados.find(d=>d.categoria===c),b:referencia?.find(d=>d.categoria===c)})).sort((a,b) => Math.max(valor(b.a),valor(b.b))-Math.max(valor(a.a),valor(a.b)));
  const legendas = referencia ? [{nome:nomes.principal,cor:CORES.principal},{nome:nomes.comparado,cor:CORES.comparado}] : lista.map((item,i) => ({nome:item.categoria,cor:PALETA[i % PALETA.length]}));
  return <Painel titulo={titulo} descricao={descricao} exploracao={exploracao} legenda={<Legenda itens={legendas} />}>
    {!lista.length ? <div className="rel-chart-empty">Nenhum registro neste período.</div> : <div className="rel-bars">{lista.map((item,i) => {
      const linhas = [[item.a,nomes.principal,referencia ? CORES.principal : PALETA[i % PALETA.length],total], ...(referencia ? [[item.b,nomes.comparado,CORES.comparado,totalB]] : [])];
      const info = {titulo:item.categoria,grupos:linhas.map(([d,nome,cor,t]) => ({ nome, cor: referencia ? cor : CORES.principal, linhas: [
        {nome:quantidade ? 'Quantidade' : metrica === 'ticket' ? 'Ticket médio' : 'Valor',valor:formatar(valor(d)),extra:metrica === 'ticket' ? `${numero(d?.quantidade)} vendas` : `${quantidade ? '' : `${numero(d?.quantidade)} registros · `}${pct(valor(d),t)} do total`},
        ...(!quantidade && metrica !== 'ticket' && d?.quantidade ? [{nome:'Ticket médio',valor:dinheiro(Number(d.valor||0)/d.quantidade)}] : []),
        ...(equipe && d ? [{nome:'Fonada',valor:dinheiro(d.fonada),extra:`${numero(d.quantidadeFonada)} vendas`},{nome:'Ao Vivo',valor:dinheiro(d.aoVivo),extra:`${numero(d.quantidadeAoVivo)} vendas`}] : []),
      ] }))};
      return <button className="rel-bar-row" type="button" key={item.categoria} aria-label={`Detalhar ${item.categoria}`} {...exploracao.eventos(info)}><div className="rel-bar-label"><strong>{item.categoria}</strong>{!referencia && <span>{formatar(valor(item.a))}</span>}</div>{linhas.map(([d,nome,cor],j) => <div className="rel-bar-series" key={j}>{referencia && <small title={nome}>{nome}</small>}<div className="rel-bar-track"><i style={{width:`${valor(d)/maximo*100}%`,background:cor}} /></div>{referencia && <b>{formatar(valor(d))}</b>}</div>)}</button>;
    })}</div>}
  </Painel>;
}

export function GraficoComposicao({ titulo, principal, comparado, nomes }) {
  const exploracao = useExploracao();
  const series = [[principal,nomes.principal], ...(comparado ? [[comparado,nomes.comparado]] : [])];
  return <Painel titulo={titulo} descricao="Participação no valor total. Selecione uma modalidade para ver volume e ticket." exploracao={exploracao} legenda={<Legenda itens={[{nome:'Fonada',cor:CORES.fonada},{nome:'Ao Vivo',cor:CORES.aoVivo}]} />}>
    <div className={`rel-donuts ${comparado ? 'comparando' : ''}`}>{series.map(([dados,nome],j) => {
      const total = (dados || []).reduce((s,d) => s+Number(d.valor||0),0); let acumulado=0;
      return <div className="rel-donut-period" key={j}><strong><i style={{background:j ? CORES.comparado : CORES.principal}} />{nome}</strong><div className="rel-donut-wrap"><svg viewBox="0 0 200 200" role="group" aria-label={`Composição de ${nome}`}><circle cx="100" cy="100" r="76" fill="none" stroke="#edf0f7" strokeWidth="24" />{(dados || []).map(d => {const proporcao=total ? Number(d.valor||0)/total*100 : 0, offset=acumulado;acumulado+=proporcao;const cor=d.categoria==='Fonada' ? CORES.fonada : CORES.aoVivo;const info={titulo:d.categoria,grupos:[{nome,cor:j ? CORES.comparado : CORES.principal,linhas:[{nome:'Valor',valor:dinheiro(d.valor),extra:`${numero(d.quantidade)} registros · ${pct(d.valor,total)} do total`},{nome:'Participação',valor:pct(d.valor,total)},{nome:'Quantidade',valor:`${numero(d.quantidade)} registros`},{nome:'Ticket médio',valor:dinheiro(d.quantidade ? d.valor/d.quantidade : 0)}]}]};return proporcao>0 && <circle className="rel-donut-hit" key={d.categoria} cx="100" cy="100" r="76" fill="none" stroke={cor} strokeWidth="24" pathLength="100" strokeDasharray={`${proporcao} ${100-proporcao}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" tabIndex="0" role="button" aria-label={`Detalhar ${d.categoria} em ${nome}`} {...exploracao.eventos(info)} />; })}</svg><div className="rel-donut-center"><small>{total ? 'Total do período' : 'Sem movimento'}</small><b>{dinheiro(total)}</b></div></div><div className="rel-donut-totals">{(dados || []).map(d=><span key={d.categoria}><i style={{background:d.categoria==='Fonada' ? CORES.fonada : CORES.aoVivo}} />{d.categoria}<b>{pct(d.valor,total)}</b></span>)}</div></div>;
    })}</div>
  </Painel>;
}
