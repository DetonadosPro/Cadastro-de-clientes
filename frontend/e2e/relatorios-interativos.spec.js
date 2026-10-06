import { test, expect } from '@playwright/test';

const URL_RELATORIO='/relatorios?inicio=01%2F09%2F26&fim=30%2F09%2F26&inicioB=01%2F08%2F26&fimB=31%2F08%2F26';
const br = n => `R$ ${n.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
function respostaRelatorio(url,opcoes={}) {
  const tipo=url.pathname.split('/').pop(),inicio=url.searchParams.get('inicio'),fim=url.searchParams.get('fim')||inicio,sistema=url.searchParams.get('sistema')||'TODOS';
  const anterior=inicio?.slice(3,5)==='08';
  const quantidade=anterior ? opcoes.zero?0:50 : 80;
  const itens=Array.from({length:quantidade},(_,i)=>({id:(anterior?2000:1000)+i,os:String((anterior?2000:1000)+i),nome:`Cliente de exemplo ${i+1}`,sistema:i<(anterior?30:60)?'FONADA':'AOVIVO',valor:100,forma:i%3?'PIX':'DINHEIRO',data:`${String(i%10+1).padStart(2,'0')}/${inicio.slice(3)}`,statusPagamento:'SIM'})).filter(i=>sistema==='TODOS'||i.sistema===sistema);
  const valorTotal=itens.reduce((s,i)=>s+i.valor,0),q=itens.length;
  const resumo=modalidade=>{const lista=itens.filter(i=>i.sistema===modalidade);return {valorTotal:lista.length*100,quantidade:lista.length,ticketMedio:lista.length?100:0,totalRecall:Math.floor(lista.length*.3),totalOutros:lista.length-Math.floor(lista.length*.3)};};
  const fonada=sistema==='AOVIVO'?null:resumo('FONADA'),aoVivo=sistema==='FONADA'?null:resumo('AOVIVO');
  const dias=Array.from({length:10},(_,i)=>{const data=`${String(i+1).padStart(2,'0')}/${inicio.slice(3)}`,lista=itens.filter(x=>x.data===data);return {data,valor:lista.length*100,quantidade:lista.length,fonada:lista.filter(x=>x.sistema==='FONADA').length*100,aoVivo:lista.filter(x=>x.sistema==='AOVIVO').length*100,quantidadeFonada:lista.filter(x=>x.sistema==='FONADA').length,quantidadeAoVivo:lista.filter(x=>x.sistema==='AOVIVO').length};});
  const pagamentosPorDia=dias.map(d=>({data:d.data,total:d.quantidade,formas:{PIX:itens.filter(i=>i.data===d.data&&i.forma==='PIX').length,DINHEIRO:itens.filter(i=>i.data===d.data&&i.forma==='DINHEIRO').length}}));
  const limite=Number(url.searchParams.get('limite')||50),pagina=Number(url.searchParams.get('pagina')||1);
  const funcionarios=['Maria','João'].map((usuario,i)=>{const n=i?Math.ceil(q/2):Math.floor(q/2);return {usuario,vendasTotal:n,valorVendidoTotal:n*100,ticketMedio:n?100:0,participacaoPercentual:50,vendasFonada:Math.floor(n*.75),valorVendidoFonada:Math.floor(n*.75)*100,vendasAoVivo:n-Math.floor(n*.75),valorVendidoAoVivo:(n-Math.floor(n*.75))*100};});
  return {inicio,fim,sistema,geral:{valorTotal,quantidade:q,ticketMedio:q?100:0},fonada,aoVivo,valorTotal,quantidade:q,valorVendido:valorTotal,valorRecebidoVendasPeriodo:valorTotal*.75,valorAReceberVendasPeriodo:valorTotal*.25,valorEquipe:valorTotal,funcionarios,graficos:{vendasPorDia:dias,recebidoPorDia:dias,vendidoPorDia:dias.map(d=>({data:d.data,valor:d.valor*1.2})),pagamentosPorDia,recebimentosPorForma:['PIX','DINHEIRO'].map(categoria=>({categoria,valor:itens.filter(i=>i.forma===categoria).length*100,quantidade:itens.filter(i=>i.forma===categoria).length})),origemFonada:fonada?[{categoria:'RECALL',quantidade:fonada.totalRecall,valor:fonada.totalRecall},{categoria:'CLIENTES',quantidade:fonada.totalOutros,valor:fonada.totalOutros}]:[]},itens:itens.slice((pagina-1)*limite,pagina*limite),itensTotal:q,pagina,limite,totalPaginas:Math.max(1,Math.ceil(q/limite))};
}
async function preparar(page,opcoes={}) {
  await page.addInitScript(()=>{localStorage.setItem('pombo_token','token-simulado');localStorage.setItem('pombo_usuario','QA');localStorage.setItem('pombo_nome','Operador de exemplo');});
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/relatorios/')){
      if(opcoes.atraso?.[url.searchParams.get('sistema')])await new Promise(resolve=>setTimeout(resolve,opcoes.atraso[url.searchParams.get('sistema')]));
      return route.fulfill({json:respostaRelatorio(url,opcoes)});
    }
    if(url.pathname==='/api/configuracoes')return route.fulfill({json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}});
    if(url.pathname==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n'});
    return route.fulfill({json:{fonada:[],aoVivo:[],lembretes:[],contagens:[]}});
  });
  await page.goto(URL_RELATORIO);
  await expect(page.locator('.rel-results-heading h2')).toHaveText('Setembro de 2026');
}

test('comparação nomeia meses, mostra vencedor e inverte valores e base percentual',async({page})=>{
  await preparar(page);
  await expect(page.locator('.rel-conclusion-text h3')).toHaveText('Setembro de 2026 vendeu mais');
  await expect(page.locator('.rel-conclusion-text > p').first()).toContainText('3.000,00');
  await expect(page.locator('.rel-conclusion-change strong')).toHaveText('+60%');
  await expect(page.locator('.rel-duration-note')).toContainText('30 e 31 dias');
  await expect(page.locator('.rel-records')).not.toHaveAttribute('open');
  await page.getByRole('button',{name:'Inverter os períodos da comparação'}).click();
  await expect(page.locator('.rel-results-heading h2')).toHaveText('Agosto de 2026');
  await expect(page.locator('.rel-conclusion-text h3')).toHaveText('Setembro de 2026 vendeu mais');
  await expect(page.locator('.rel-conclusion-change strong')).toHaveText('-37,5%');
  await expect(page.locator('.rel-conclusion-change span')).toHaveText('Agosto de 2026 em relação a Setembro de 2026');
});
test('hover resume os meses; clique abre modalidades e legenda controla séries',async({page})=>{
  await preparar(page);
  const grafico=page.getByRole('region',{name:'Evolução das vendas'});
  const ponto=grafico.locator('.rel-chart-hit').first();
  await ponto.hover();
  await expect(grafico.getByRole('tooltip')).toContainText('01/09/26');
  await expect(grafico.getByRole('tooltip')).toContainText('01/08/26');
  await expect(grafico.getByRole('tooltip').locator('.rel-detail-period')).toHaveCount(2);
  await expect(grafico.getByRole('tooltip')).not.toContainText('Média por registro');
  await expect(grafico.getByRole('tooltip')).not.toContainText('Fonada');
  await ponto.click();
  await page.locator('.rel-results-heading').hover();
  await expect(grafico.locator('.rel-selection')).toContainText('Setembro de 2026');
  await expect(grafico.locator('.rel-selection')).toContainText('Agosto de 2026');
  await expect(grafico.locator('.rel-selection')).toContainText('Média por registro');
  await expect(grafico.locator('.rel-selection')).toContainText('Fonada');
  await grafico.getByRole('button',{name:'Limpar seleção do gráfico'}).click();
  await expect(grafico.locator('.rel-selection')).toHaveCount(0);
  await grafico.getByRole('button',{name:'Setembro de 2026',exact:true}).click();
  await expect(grafico.getByRole('button',{name:'Setembro de 2026',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(grafico.locator('polyline')).toHaveCount(1);
});
test('barras e composição abrem dados por categoria e modalidade',async({page})=>{
  await preparar(page);
  const pagamentos=page.getByRole('region',{name:'Forma prevista de pagamento'});
  await pagamentos.getByRole('button',{name:'Detalhar PIX',exact:true}).click();
  await expect(pagamentos.locator('.rel-selection')).toContainText('Agosto de 2026');
  const composicao=page.getByRole('region',{name:'Fonada e Ao Vivo'});
  await expect(composicao.locator('.rel-donut-period > strong').first()).toHaveCSS('display','flex');
  const donut=composicao.getByRole('group',{name:'Composição de Setembro de 2026'});
  const tamanho=await donut.boundingBox();
  await donut.hover({position:{x:tamanho.width*.77,y:tamanho.height*.23}});
  await expect(composicao.getByRole('tooltip')).toContainText('Fonada');
  await expect(composicao.getByRole('tooltip')).toContainText('Setembro de 2026');
  await donut.hover({position:{x:tamanho.width*.23,y:tamanho.height*.23}});
  await expect(composicao.getByRole('tooltip')).toContainText('Ao Vivo');
  await expect(composicao.getByRole('tooltip')).toContainText('Setembro de 2026');
  await composicao.getByRole('button',{name:'Detalhar Ao Vivo em Setembro de 2026'}).focus();
  await page.keyboard.press('Enter');
  await expect(composicao.locator('.rel-selection')).toContainText('Ticket médio');
  await expect(composicao.locator('.rel-selection')).toContainText('2.000,00');
});
test('recebimentos e equipe possuem exploração própria e valores corretos',async({page})=>{
  await preparar(page);
  await page.getByRole('button',{name:'Recebimentos',exact:true}).click();
  await expect(page.locator('.rel-conclusion-text h3')).toHaveText('Setembro de 2026 recebeu mais');
  await page.getByRole('region',{name:'Como o dinheiro foi recebido'}).getByRole('button',{name:'Detalhar PIX',exact:true}).click();
  await expect(page.getByRole('region',{name:'Como o dinheiro foi recebido'}).locator('.rel-selection')).toContainText('R$');
  await page.getByRole('button',{name:'Equipe',exact:true}).click();
  await expect(page.getByRole('region',{name:'Desempenho por pessoa'})).toBeVisible();
  await page.getByRole('button',{name:'Quantidade de vendas',exact:true}).click();
  const equipe=page.getByRole('region',{name:'Desempenho por pessoa'});
  await equipe.getByRole('button',{name:'Detalhar Maria',exact:true}).click();
  await expect(equipe.locator('.rel-selection')).toContainText('Fonada');
  await page.getByRole('button',{name:'Ticket médio',exact:true}).click();
  await expect(equipe.locator('.rel-bar-row').first()).toContainText('100,00');
});
test('paginação de pedidos não altera os totais dos gráficos',async({page})=>{
  await preparar(page);
  await page.locator('.rel-records summary').click();
  await expect(page.locator('.rel-table-scroll tbody tr')).toHaveCount(50);
  await page.getByRole('button',{name:'Próxima',exact:true}).click();
  await expect(page.locator('.rel-table-scroll tbody tr')).toHaveCount(30);
  await expect(page.locator('.rel-kpi.destaque > strong')).toHaveText(br(8000));
  await page.getByRole('button',{name:'Anterior',exact:true}).click();
  await expect(page.locator('.rel-table-scroll tbody tr')).toHaveCount(50);
});
test('referência zerada não cria percentual infinito',async({page})=>{
  await preparar(page,{zero:true});
  await expect(page.locator('.rel-conclusion-change strong')).toHaveText('—');
  await expect(page.locator('.rel-conclusion-change span')).toHaveText('O período comparado não teve movimento.');
  await expect(page.locator('.relatorios-modernos')).not.toContainText('NaN');
  await expect(page.locator('.relatorios-modernos')).not.toContainText('Infinity');
});

test('filtro de modalidade e remoção da comparação atualizam resultados sem perder o período',async({page})=>{
  await preparar(page);
  await page.getByRole('group',{name:'Modalidade do relatório'}).getByRole('button',{name:'Fonada',exact:true}).click();
  await expect(page.locator('.rel-kpi.destaque > strong')).toHaveText(br(6000));
  await expect(page.locator('.rel-conclusion-text h3')).toHaveText('Setembro de 2026 vendeu mais');
  await page.getByRole('button',{name:'× Remover comparação',exact:true}).click();
  await expect(page.locator('.rel-comparison-conclusion')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Evolução das vendas'}).locator('polyline')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.rel-results-heading h2')).toHaveText('Setembro de 2026');
  await expect(page.locator('.rel-kpi.destaque > strong')).toHaveText(br(6000));
});

test('modalidade responde ao mouse e teclado e filtra os dois meses', async ({ page }) => {
  await preparar(page);
  const seletor = page.getByRole('group', {name:'Modalidade do relatório'});
  for (const [modalidade,valor,comparado] of [['Fonada',6000,3000],['Ao Vivo',2000,2000],['Todas',8000,5000]]) {
    const botao = seletor.getByRole('button',{name:modalidade,exact:true});
    await botao.click();
    await expect(botao).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.rel-kpi.destaque > strong')).toHaveText(br(valor));
    await expect(page.locator('.rel-period-values > span').nth(1)).toContainText(br(comparado));
  }
  await seletor.getByRole('button',{name:'Ao Vivo',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.rel-kpi.destaque > strong')).toHaveText(br(2000));
  await page.reload();
  await expect(seletor.getByRole('button',{name:'Ao Vivo',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.rel-kpi.destaque > strong')).toHaveText(br(2000));
});

test('troca de modalidade mostra carregamento e ignora a resposta anterior atrasada',async({page})=>{
  await preparar(page,{atraso:{FONADA:1200,AOVIVO:500}});
  const seletor=page.getByRole('group',{name:'Modalidade do relatório'});
  const chegouFonada=page.waitForRequest(r=>r.url().includes('/api/relatorios/')&&new URL(r.url()).searchParams.get('sistema')==='FONADA');
  const terminouFonada=page.waitForResponse(r=>r.url().includes('/api/relatorios/')&&new URL(r.url()).searchParams.get('sistema')==='FONADA');
  await seletor.getByRole('button',{name:'Fonada',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Carregando Fonada');
  await expect(page.locator('.rel-results')).toHaveCount(0);
  await chegouFonada;
  await seletor.getByRole('button',{name:'Ao Vivo',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Carregando Ao Vivo');
  await expect(page.locator('.rel-kpi.destaque > strong')).toHaveText(br(2000));
  await terminouFonada;
  await expect(page.locator('.rel-kpi.destaque > strong')).toHaveText(br(2000));
  await expect(page.locator('.rel-period-values > span').nth(1)).toContainText(br(2000));
  await expect(seletor.getByRole('button',{name:'Ao Vivo',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('datas inválidas não exibem resultados atribuídos ao período errado',async({page})=>{
  await preparar(page);
  await page.locator('#rel-inicio').fill('31/02/26');
  await expect(page.getByText('Revise os períodos',{exact:true})).toBeVisible();
  await expect(page.locator('.rel-results')).toHaveCount(0);
  await page.locator('#rel-inicio').fill('01/09/26');
  await expect(page.locator('.rel-conclusion-text h3')).toHaveText('Setembro de 2026 vendeu mais');
});
test('layout mantém leitura e interação em computador, tablet e celular',async({page},testInfo)=>{
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  await preparar(page);
  for(const width of [1440,1024,768,390,320]){
    await page.setViewportSize({width,height:950});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    expect(overflow,`Transbordamento em ${width}px`).toBe(false);
    await expect(page.locator('.workspace-relogio')).toBeVisible();
    await expect(page.getByRole('region',{name:'Evolução das vendas'})).toBeVisible();
    const grafico=page.getByRole('region',{name:'Evolução das vendas'});
    await grafico.locator('.rel-chart-hit').first().hover();
    const tooltip=grafico.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    const limites=await tooltip.boundingBox();
    expect(limites.x).toBeGreaterThanOrEqual(0);
    expect(limites.x+limites.width).toBeLessThanOrEqual(width);
    if(width===1440||width===390){
      await page.screenshot({path:testInfo.outputPath(`relatorios-${width}.png`),fullPage:true});
      await page.getByRole('region',{name:'Evolução das vendas'}).scrollIntoViewIfNeeded();
      await page.screenshot({path:testInfo.outputPath(`graficos-${width}.png`)});
    }
    await page.locator('.rel-results-heading').hover();
  }
  await page.getByRole('region',{name:'Forma prevista de pagamento'}).getByRole('button',{name:'Detalhar PIX',exact:true}).tap();
  await expect(page.getByRole('region',{name:'Forma prevista de pagamento'}).locator('.rel-selection')).toBeVisible();
  expect(erros).toEqual([]);
});
