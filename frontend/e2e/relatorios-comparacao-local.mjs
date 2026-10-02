import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const erros = []; const chamadas = [];
page.on('pageerror', e => erros.push(e.message));
await page.addInitScript(() => { localStorage.setItem('pombo_token', 'teste'); localStorage.setItem('pombo_usuario', 'TESTE'); });
await page.route('**/api/**', async route => {
 const u = new URL(route.request().url()); let json = {};
 if(u.pathname === '/api/eventos') return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
 if(u.pathname === '/api/configuracoes') json={limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1};
 if(u.pathname.includes('/relatorios/')) {
  chamadas.push(u); const b=u.searchParams.get('inicio')==='01/08/26'; const valor=b?120:300; const quantidade=b?2:5; const data=b?'01/08/26':'01/09/26';
  const serie=[{data,valor,quantidade,fonada:valor,aoVivo:0,quantidadeFonada:quantidade,quantidadeAoVivo:0}];
  json={inicio:u.searchParams.get('inicio'),fim:u.searchParams.get('fim'),geral:{valorTotal:valor,quantidade,ticketMedio:60},fonada:{valorTotal:valor,quantidade,ticketMedio:60,totalRecall:quantidade,totalOutros:0},valorTotal:valor,quantidade,valorVendido:valor+60,valorRecebidoVendasPeriodo:valor,valorAReceberVendasPeriodo:60,totalPix:quantidade,totalRecibo:0,valorEquipe:valor,funcionarios:[{usuario:b?'VENDEDOR B':'VENDEDOR A',vendasTotal:quantidade,valorVendidoTotal:valor,valorVendidoFonada:valor,valorVendidoAoVivo:0,ticketMedio:60,participacaoPercentual:100,vendasFonada:quantidade,vendasAoVivo:0}],graficos:{vendasPorDia:serie,periodoAnterior:b?[]:[{...serie[0],valor:120,data:'01/08/26'}],vendidoPorDia:serie,recebidoPorDia:serie,pagamentosPorDia:[{data,total:quantidade,formas:{PIX:quantidade}}],recebimentosPorForma:[{categoria:'PIX',valor,quantidade}],origemFonada:[{categoria:'RECALL',valor:quantidade,quantidade}]},itens:[{id:1,sistema:'FONADA',os:b?'OS-B':'OS-A',nome:b?'CLIENTE B':'CLIENTE A',data,valor,forma:'PIX',statusPagamento:'SIM'}],itensTotal:1,pagina:1,totalPaginas:1,limite:100};
 }
 await route.fulfill({json});
});
try {
 for(const aba of ['vendas','recebimentos','desempenho']) {
  await page.goto(`http://127.0.0.1:5189/relatorios?aba=${aba}&inicio=01/09/26&fim=30/09/26&inicioB=01/08/26&fimB=31/08/26&sistema=FONADA`);
  const visivel=page.locator('.secao-relatorios > div').last().locator('> div:visible');
  await visivel.locator('.comparacao-indicadores').waitFor();
  assert.ok(await visivel.locator('.grafico-comparado').count()>=2);
  assert.ok((await visivel.locator('.comparacao-indicadores').innerText()).includes('180,00'));
  for(const width of [1920,2560,390]) {
   await page.setViewportSize({width,height:1080});
   const boxes=await visivel.locator('.grade-graficos-relatorio > *').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom}}));
   for(let i=1;i<boxes.length;i++) {assert.ok(Math.abs(boxes[i].x-boxes[0].x)<1);assert.ok(boxes[i].y>=boxes[i-1].bottom);}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:`test-results/relatorios-${aba}-comparacao.png`,fullPage:true});
  await page.getByRole('button',{name:'Remover comparação',exact:true}).click();
  await visivel.locator('.grafico-relatorio').first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await visivel.locator('.comparacao-indicadores').count(),0);
 }
 assert.ok(chamadas.some(u=>u.searchParams.get('inicio')==='01/08/26'&&!u.searchParams.has('inicioB')));
 assert.deepEqual(erros,[]);
 console.log('Comparação completa nas três abas, períodos A/B, remoção e layout 1920/2560/celular: OK');
} finally {await browser.close();}

