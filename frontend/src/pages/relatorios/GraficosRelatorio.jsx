import React from 'react';

const CORES = {
  azul: '#245fa4',
  azulClaro: '#86acd5',
  aoVivo: '#d77b61',
  verde: '#2f9466',
  grade: '#dfe7f0',
};

function reais(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function reaisCurto(valor) {
  const numero = Number(valor || 0);
  if (numero >= 1000000) return `R$ ${(numero / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (numero >= 1000) return `R$ ${(numero / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(numero)}`;
}

function dataCurta(data) {
  return String(data || '').slice(0, 5);
}

function PainelGrafico({ titulo, subtitulo, legenda, children, amplo = false }) {
  return (
    <section className={`painel grafico-relatorio ${amplo ? 'grafico-amplo' : ''}`}>
      <header className="grafico-cabecalho">
        <div><strong>{titulo}</strong><span>{subtitulo}</span></div>
        {legenda && <div className="grafico-legenda">{legenda}</div>}
      </header>
      {children}
    </section>
  );
}

function Legenda({ cor, children, tracejada = false }) {
  return <span className={tracejada ? 'tracejada' : ''} style={{ '--cor-legenda': cor }}><i />{children}</span>;
}

function EstadoSemDados() {
  return <div className="grafico-sem-dados">Sem dados para construir este gráfico.</div>;
}

const MARGEM_X = 62;
const MARGEM_Y = 35;

function pontosLinha(dados, maximo, largura, altura, margemX = MARGEM_X, margemY = MARGEM_Y) {
  if (!dados.length) return '';
  const espaco = dados.length > 1 ? (largura - margemX * 2) / (dados.length - 1) : 0;
  return dados.map((ponto, indice) => {
    const x = dados.length > 1 ? margemX + indice * espaco : largura / 2;
    const y = altura - margemY - (Number(ponto.valor || 0) / maximo) * (altura - margemY * 2);
    return `${x},${y}`;
  }).join(' ');
}

function RotulosEixo({ dados, largura, altura, margemX = MARGEM_X }) {
  if (!dados.length) return null;
  const quantidade = Math.min(dados.length, 6);
  const indices = [...new Set(Array.from({ length: quantidade }, (_, i) =>
    Math.round(i * (dados.length - 1) / Math.max(quantidade - 1, 1))))];
  return indices.map((indice) => {
    const x = dados.length > 1 ? margemX + indice * ((largura - margemX * 2) / (dados.length - 1)) : largura / 2;
    return <text key={indice} x={x} y={altura - 5} textAnchor="middle">{dataCurta(dados[indice]?.data)}</text>;
  });
}

function tituloPonto(ponto, substantivo = 'pedido') {
  const total = Number(ponto.valor || 0);
  const fonada = Number(ponto.fonada || 0);
  const aoVivo = Number(ponto.aoVivo || 0);
  const percentual = (valor) => total ? Math.round(valor / total * 1000) / 10 : 0;
  return `${ponto.data}\nTotal: ${reais(total)} · ${ponto.quantidade || 0} ${substantivo}(s)\nFonada: ${reais(fonada)} · ${ponto.quantidadeFonada || 0} · ${percentual(fonada)}%\nAo Vivo: ${reais(aoVivo)} · ${ponto.quantidadeAoVivo || 0} · ${percentual(aoVivo)}%`;
}

export function GraficoEvolucaoVendas({ atual = [], anterior = [], sistema = 'TODOS' }) {
  const largura = 720; const altura = 245;
  const maximo = Math.max(1, ...atual.map((p) => Number(p.valor || 0)), ...anterior.map((p) => Number(p.valor || 0)));
  return (
    <PainelGrafico
      titulo={`Evolução das vendas · ${sistema === 'TODOS' ? 'Todos' : sistema === 'FONADA' ? 'Fonada' : 'Ao Vivo'}`}
      subtitulo="Valor e volume diário; a linha pontilhada representa o período B escolhido"
      amplo
      legenda={<><Legenda cor={CORES.azul}>Período A</Legenda>{anterior.length > 0 && <Legenda cor={CORES.azulClaro} tracejada>Período B</Legenda>}</>}
    >
      {!atual.length ? <EstadoSemDados /> : (
        <div className="grafico-svg-scroll"><svg className="grafico-svg" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Evolução diária das vendas">
          {[0, .25, .5, .75, 1].map((fator) => {
            const y = altura - MARGEM_Y - fator * (altura - MARGEM_Y * 2);
            return <g key={fator}><line x1={MARGEM_X} y1={y} x2={largura - MARGEM_X} y2={y} /><text className="grafico-valor-eixo" x={MARGEM_X - 10} y={y + 4} textAnchor="end">{reaisCurto(maximo * fator)}</text></g>;
          })}
          {anterior.length > 0 && <polyline className="grafico-linha anterior" points={pontosLinha(anterior, maximo, largura, altura)} />}
          <polyline className="grafico-linha atual" points={pontosLinha(atual, maximo, largura, altura)} />
          {atual.map((ponto, indice) => {
            const x = atual.length > 1 ? MARGEM_X + indice * ((largura - MARGEM_X * 2) / (atual.length - 1)) : largura / 2;
            const y = altura - MARGEM_Y - (Number(ponto.valor || 0) / maximo) * (altura - MARGEM_Y * 2);
            return <circle className="grafico-ponto-interativo" tabIndex="0" key={`${ponto.data}-${indice}`} cx={x} cy={y} r="5"><title>{tituloPonto(ponto)}</title></circle>;
          })}
          <g className="grafico-eixo"><RotulosEixo dados={atual} largura={largura} altura={altura} /></g>
        </svg></div>
      )}
    </PainelGrafico>
  );
}

export function GraficoVendasPorSistema({ dados = [], sistema = 'TODOS' }) {
  const largura = 720; const altura = 245;
  const maximo = Math.max(1, ...dados.map((p) => Number(p.fonada || 0) + Number(p.aoVivo || 0)));
  const faixa = (largura - MARGEM_X * 2) / Math.max(dados.length, 1);
  const barra = Math.max(7, Math.min(34, faixa * .62));
  return (
    <PainelGrafico titulo={sistema === 'TODOS' ? 'Composição Fonada × Ao Vivo' : `Volume diário · ${sistema === 'FONADA' ? 'Fonada' : 'Ao Vivo'}`} subtitulo="Valor, quantidade e participação em cada dia" amplo legenda={sistema === 'TODOS' ? <><Legenda cor={CORES.azul}>Fonada</Legenda><Legenda cor={CORES.aoVivo}>Ao Vivo</Legenda></> : null}>
      {!dados.length ? <EstadoSemDados /> : <div className="grafico-svg-scroll"><svg className="grafico-svg" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Vendas de Fonada e Ao Vivo por dia">
        {[0, .25, .5, .75, 1].map((fator) => { const y = altura - MARGEM_Y - fator * (altura - MARGEM_Y * 2); return <g key={fator}><line x1={MARGEM_X} y1={y} x2={largura - MARGEM_X} y2={y} /><text className="grafico-valor-eixo" x={MARGEM_X - 10} y={y + 4} textAnchor="end">{reaisCurto(maximo * fator)}</text></g>; })}
        {dados.map((ponto, indice) => {
          const x = MARGEM_X + faixa * indice + faixa / 2 - barra / 2;
          const hFonada = Number(ponto.fonada || 0) / maximo * (altura - MARGEM_Y * 2);
          const hAoVivo = Number(ponto.aoVivo || 0) / maximo * (altura - MARGEM_Y * 2);
          const base = altura - MARGEM_Y;
          return <g className="grafico-ponto-interativo" tabIndex="0" key={ponto.data}><title>{tituloPonto(ponto)}</title><rect className="barra-fonada" x={x} y={base - hFonada} width={barra} height={hFonada} /><rect className="barra-aovivo" x={x} y={base - hFonada - hAoVivo} width={barra} height={hAoVivo} /></g>;
        })}
        <g className="grafico-eixo"><RotulosEixo dados={dados} largura={largura} altura={altura} /></g>
      </svg></div>}
    </PainelGrafico>
  );
}

function combinarFluxo(vendido, recebido) {
  const mapa = new Map();
  vendido.forEach((p) => mapa.set(p.data, { data: p.data, vendido: Number(p.valor || 0), recebido: 0 }));
  recebido.forEach((p) => mapa.set(p.data, { ...(mapa.get(p.data) || { data: p.data, vendido: 0 }), recebido: Number(p.valor || 0) }));
  return [...mapa.values()].sort((a, b) => String(a.data).split('/').reverse().join('').localeCompare(String(b.data).split('/').reverse().join('')));
}

export function GraficoVendidoRecebido({ vendido = [], recebido = [], sistema = 'TODOS' }) {
  const dados = combinarFluxo(vendido, recebido);
  const largura = 720; const altura = 245;
  const maximo = Math.max(1, ...dados.flatMap((p) => [p.vendido, p.recebido]));
  const faixa = (largura - MARGEM_X * 2) / Math.max(dados.length, 1);
  const barra = Math.max(6, Math.min(25, faixa * .45));
  const pontos = dados.map((p) => ({ data: p.data, valor: p.vendido }));
  return <PainelGrafico titulo={`Vendido × recebido · ${sistema === 'TODOS' ? 'Todos' : sistema === 'FONADA' ? 'Fonada' : 'Ao Vivo'}`} subtitulo="Recebimentos do dia podem pertencer a vendas anteriores" amplo legenda={<><Legenda cor={CORES.verde}>Recebido</Legenda><Legenda cor={CORES.azul}>Vendido</Legenda></>}>
    {!dados.length ? <EstadoSemDados /> : <div className="grafico-svg-scroll"><svg className="grafico-svg" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Valores vendidos e recebidos por dia">
      {[0, .25, .5, .75, 1].map((fator) => { const y = altura - MARGEM_Y - fator * (altura - MARGEM_Y * 2); return <g key={fator}><line x1={MARGEM_X} y1={y} x2={largura - MARGEM_X} y2={y} /><text className="grafico-valor-eixo" x={MARGEM_X - 10} y={y + 4} textAnchor="end">{reaisCurto(maximo * fator)}</text></g>; })}
      {dados.map((p, indice) => { const x = MARGEM_X + faixa * indice + faixa / 2 - barra / 2; const h = p.recebido / maximo * (altura - MARGEM_Y * 2); return <rect key={p.data} className="barra-recebido" x={x} y={altura - MARGEM_Y - h} width={barra} height={h}><title>{p.data} · Recebido: {reais(p.recebido)}</title></rect>; })}
      <polyline className="grafico-linha atual" points={pontosLinha(pontos, maximo, largura, altura)} />
      <g className="grafico-eixo"><RotulosEixo dados={dados} largura={largura} altura={altura} /></g>
    </svg></div>}
  </PainelGrafico>;
}

export function GraficoBarrasCategorias({ titulo, subtitulo, dados = [], usarQuantidade = false }) {
  const metrica = (item) => Number(usarQuantidade ? item.quantidade : item.valor || 0);
  const maximo = Math.max(1, ...dados.map(metrica));
  return <PainelGrafico titulo={titulo} subtitulo={subtitulo}>
    {!dados.length ? <EstadoSemDados /> : <div className="grafico-barras-horizontais">{dados.map((item) => <div className="grafico-barra-linha" key={item.categoria} title={`${item.categoria}: ${usarQuantidade ? `${item.quantidade} pedido(s)` : `${reais(item.valor)} · ${item.quantidade} pagamento(s)`}`}><div><strong>{item.categoria}</strong><span>{usarQuantidade ? item.quantidade : reais(item.valor)}</span></div><div className="grafico-barra-trilho"><i style={{ width: `${Math.max(3, metrica(item) / maximo * 100)}%` }} /></div><small>{usarQuantidade ? `${Math.round(metrica(item) / Math.max(dados.reduce((s, d) => s + metrica(d), 0), 1) * 100)}% dos pedidos` : `${item.quantidade} pagamento(s)`}</small></div>)}</div>}
  </PainelGrafico>;
}

export function GraficoRankingEquipe({ funcionarios = [] }) {
  const maximo = Math.max(1, ...funcionarios.map((f) => Number(f.valorVendidoTotal || 0)));
  return <PainelGrafico titulo="Ranking da equipe" subtitulo="Valor vendido, dividido por modalidade" amplo legenda={<><Legenda cor={CORES.azul}>Fonada</Legenda><Legenda cor={CORES.aoVivo}>Ao Vivo</Legenda></>}>
    {!funcionarios.length ? <EstadoSemDados /> : <div className="grafico-ranking">{funcionarios.map((f, indice) => { const total = Number(f.valorVendidoTotal || 0); return <div className="grafico-ranking-linha" key={f.usuario}><b>{indice + 1}</b><strong>{f.usuario}</strong><div className="grafico-ranking-trilho" title={`${f.usuario}: ${reais(total)}`}><i className="fonada" style={{ width: `${Number(f.valorVendidoFonada || 0) / maximo * 100}%` }} /><i className="aovivo" style={{ width: `${Number(f.valorVendidoAoVivo || 0) / maximo * 100}%` }} /></div><span>{reais(total)}</span></div>; })}</div>}
  </PainelGrafico>;
}

export function GraficoQuantidadeTicket({ funcionarios = [] }) {
  const maxQuantidade = Math.max(1, ...funcionarios.map((f) => Number(f.vendasTotal || 0)));
  const maxTicket = Math.max(1, ...funcionarios.map((f) => Number(f.ticketMedio || 0)));
  return <PainelGrafico titulo="Volume e ticket médio" subtitulo="Quantidade de vendas e valor médio por pessoa" amplo legenda={<><Legenda cor={CORES.azul}>Quantidade</Legenda><Legenda cor={CORES.verde}>Ticket médio</Legenda></>}>
    {!funcionarios.length ? <EstadoSemDados /> : <div className="grafico-duas-metricas">{funcionarios.map((f) => <div className="grafico-metrica-linha" key={f.usuario}><strong>{f.usuario}</strong><div><span>Vendas</span><div className="grafico-barra-trilho"><i className="quantidade" style={{ width: `${Number(f.vendasTotal || 0) / maxQuantidade * 100}%` }} /></div><b>{f.vendasTotal}</b></div><div><span>Ticket</span><div className="grafico-barra-trilho"><i className="ticket" style={{ width: `${Number(f.ticketMedio || 0) / maxTicket * 100}%` }} /></div><b>{reais(f.ticketMedio)}</b></div></div>)}</div>}
  </PainelGrafico>;
}
