import {test,expect} from '@playwright/test';

async function preparar(page,{erro=false,vazio=false}={}){
  await page.addInitScript(()=>{localStorage.setItem('pombo_token','token-simulado');localStorage.setItem('pombo_usuario','QA');});
  const historico=[{pedidoId:123,os:'2688',mensagem:1,data:'07/10/25',tema:'ANIVERSÁRIO ESPECIAL',texto:'F203'},{pedidoId:122,os:'2000',mensagem:2,data:'07/10/24',tema:'ANIV GERAL',texto:'F100'}];
  const item={relacaoChave:'relacao-1',clienteId:7,clienteNome:'KATIA EMILLY SILVA DE OLIVEIRA',aniversariante:'MÁRCIA HELENA (NÃO É MAIS - NÃO LIGAR)',telefone:'(34) 9 9999-9999',ocasiao:'ANIVERSARIO',historico,ultimoPedido:historico[0],quantidade:2,mensagensEmHaver:[{pedidoId:130,os:'2800',dataExpiracao:'07/01/27'}]};
  const invertido={...item,relacaoChave:'relacao-2',clienteId:3,clienteNome:'MÁRCIA HELENA',aniversariante:'KATIA EMILLY SILVA',modoFila:'ANIVERSARIO',mensagensEmHaver:[]};
  await page.route('**/api/**',async route=>{
    const caminho=new URL(route.request().url()).pathname;
    if(caminho==='/api/recall/fila'||caminho==='/api/recall/ao-vivo/fila'){
      if(erro)return route.fulfill({status:500,json:{erro:'Erro simulado de consulta.'}});
      return route.fulfill({json:{itens:vazio?[]:[item],porDiaMensagem:vazio?[]:[item,{...item,relacaoChave:'bloqueado',clienteNome:'CARLOS ALBERTO',clienteId:8,clienteBloqueado:true,mensagensEmHaver:[]}],porAniversario:vazio?[]:[invertido]}});
    }
    if(caminho==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
    return route.fulfill({json:{fonada:[],aoVivo:[],lembretes:[],contagens:[]}});
  });
}

for(const sistema of ['FONADA','AOVIVO'])for(const modo of ['dia-mensagem','aniversario']){
  test(`${sistema} ${modo}: histórico e contatos permanecem legíveis em todas as telas`,async({page},testInfo)=>{
    const erros=[];page.on('pageerror',e=>erros.push(e.message));
    await preparar(page);
    await page.goto(`/recall?sistema=${sistema}&data=2026-10-07&modo=${modo}`);
    await expect(page.getByRole('tab',{name:/Pesquisa 1/})).toBeVisible({timeout:15000});
    await expect(page.locator('.recall-dias-navegacao').getByRole('tab',{name:sistema==='FONADA'?'Fonada':'Ao Vivo',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('tab',{name:/Pesquisa 2/})).toHaveAttribute('aria-selected',String(modo==='aniversario'));
    await expect(page.locator('.recall-linha')).toHaveCount(modo==='aniversario'?1:2);
    if(modo==='dia-mensagem'){
      await expect(page.locator('.recall-linha').first()).toContainText('KATIA EMILLY SILVA DE OLIVEIRA');
      await expect(page.locator('.recall-linha').first()).toContainText('MÁRCIA HELENA (NÃO É MAIS - NÃO LIGAR)');
    }
    await page.locator('.recall-historico-relacao > summary').click();
    await expect(page.locator('.recall-historico-itens button')).toHaveCount(2);
    if(sistema==='AOVIVO'){
      await page.getByText('Mensagem pronta para WhatsApp',{exact:true}).click();
      await expect(page.locator('.recall-aovivo-previa p')).toContainText('Mensagem ao Vivo');
    }else if(modo==='dia-mensagem'){
      await expect(page.locator('.recall-saldo-mensagens')).toContainText('Mensagem em haver');
    }
    for(const width of [1720,1440,1024,768,390,320]){
      await page.setViewportSize({width,height:1000});
      await page.evaluate(()=>{ window.scrollTo(0,0); document.querySelectorAll('*').forEach(el=>el.scrollTop=0); });
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),`Transbordamento em ${width}px`).toBe(false);
      if(width===1720||width===390)await page.screenshot({path:testInfo.outputPath(`recall-${sistema}-${modo}-${width}.png`),fullPage:true});
    }
    await page.getByRole('searchbox').fill('Nome inexistente');
    await expect(page.locator('.recall-linha')).toHaveCount(0);
    await expect(page.locator('.recall-lista-sem-resultado')).toBeVisible();
    await page.getByRole('searchbox').fill('');
    if(modo==='dia-mensagem'){
      await page.getByRole('button',{name:/CARLOS ALBERTO/}).click();
      await expect(page.locator('.recall-criar')).toBeDisabled();
    }
    expect(erros).toEqual([]);
  });
}

for(const sistema of ['FONADA','AOVIVO'])test(`${sistema}: estados sem resultados e falha permitem navegação`,async({page})=>{
  await preparar(page,{vazio:true});
  await page.goto(`/recall?sistema=${sistema}&data=2026-10-07`);
  await expect(page.getByRole('tab',{name:/Pesquisa 2/})).toBeVisible({timeout:15000});
  await expect(page.locator(sistema==='FONADA'?'.recall-vazio':'.recall-lista-sem-resultado')).toBeVisible();
  await preparar(page,{erro:true});
  await page.goto(`/recall?sistema=${sistema}&data=2026-10-07`);
  await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:sistema==='FONADA'?'Ao Vivo':'Fonada',exact:true})).toBeVisible();
});
