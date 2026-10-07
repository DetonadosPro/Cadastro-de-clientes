import {test,expect} from '@playwright/test';

async function preparar(page,{vazio=false,erro=false,nomesMinusculos=false,total=31}={}) {
  await page.addInitScript(()=>{localStorage.setItem('pombo_token','token-simulado');localStorage.setItem('pombo_usuario','QA');sessionStorage.removeItem('ultimoAoVivoSelecionado');window.impressoesTeste=0;window.print=()=>{window.impressoesTeste++;};});
  const pedido={id:101,numero_os:'27001',cliente_id:1,comprador:'MARIA APARECIDA DA SILVA DE OLIVEIRA',celular:'(34) 9 9999-8888',para:'ANA CLARA (ANIVERSÁRIO DA MÃE)',dia_entrega:'07/10/26',horario_entrega:'18:30',endereco:'RUA DAS FLORES, 123 — CASA DO FUNDO',bairro:'JARDIM UBERABA',referencia:'PERTO DA PRAÇA CENTRAL, PORTÃO AZUL',musica_1:'CANÇÃO ESPECIAL DE ANIVERSÁRIO',musica_2:'MÚSICA PARA TODA A FAMÍLIA',valor:105,pagou:'SIM',pagamento:'PIX',resultado_entrega:'ENTREGUE AUTOMATICAMENTE',versao:1};
  const pedidos=[pedido,{...pedido,id:102,numero_os:'27002',comprador:'JOÃO CARLOS',pagou:'NÃO',pagamento:'PRAZO',resultado_entrega:'NÃO ENTREGUE'},{...pedido,id:103,numero_os:'27003',comprador:'LÚCIA',resultado_entrega:''}];
  if(nomesMinusculos)for(const p of pedidos)for(const campo of ['comprador','para'])p[campo]=p[campo].toLocaleLowerCase('pt-BR');
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/ao-vivo'||url.pathname==='/api/ao-vivo/hoje') {
      if(erro)return route.fulfill({status:500,json:{erro:'Falha simulada de consulta.'}});
      return route.fulfill({json:{data:'07/10/26',pedidos:vazio?[]:url.searchParams.get('pagina')==='2'?[{...pedido,id:104}]:pedidos,total:vazio?0:total}});
    }
    if(url.pathname==='/api/ao-vivo/imprimir')return route.fulfill({json:{pedidos:pedidos.filter(p=>url.searchParams.get('ids')?.split(',').includes(String(p.id))).map(p=>({...p,musicas:[p.musica_1,p.musica_2]}))}});
    if(url.pathname==='/api/ao-vivo/101')return route.fulfill({json:pedido});
    if(url.pathname==='/api/clientes/1')return route.fulfill({json:{cliente:{id:1,nome:pedido.comprador},fonada:[],aoVivo:[]}});
    if(url.pathname==='/api/configuracoes')return route.fulfill({json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}});
    if(url.pathname==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
    return route.fulfill({json:{tentativas:[],fonada:[],aoVivo:[],lembretes:[],contagens:[]}});
  });
}

for(const rota of ['/ao-vivo','/ao-vivo/hoje'])test(`${rota}: nomes, local e informações legíveis em todas as telas`,async({page},testInfo)=>{
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  await preparar(page,{total:20579});await page.goto(rota);
  await expect(page.locator('.aovivo-moderna')).toContainText('MARIA APARECIDA DA SILVA DE OLIVEIRA');
  await expect(page.locator('.aovivo-moderna')).toContainText('ANA CLARA (ANIVERSÁRIO DA MÃE)');
  for(const width of [1920,1600,1280,1024,768,390,320]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),`Transbordamento em ${width}`).toBe(false);
    if(rota.endsWith('hoje')) {
      for(const label of ['Para','Local','Referência','Celular'])await expect(page.locator('.operacao-dia-info small').filter({hasText:new RegExp(`^${label}$`)}).first()).toBeVisible();
      await expect(page.locator('.operacao-dia-musicas').first()).toContainText('CANÇÃO ESPECIAL DE ANIVERSÁRIO');
    }
    if([1600,390].includes(width))await page.screenshot({path:testInfo.outputPath(`aovivo-${rota.endsWith('hoje')?'hoje':'lista'}-${width}.png`),fullPage:true});
    if(rota==='/ao-vivo'&&[1600,320].includes(width))await page.getByRole('navigation',{name:'Paginação',exact:true}).screenshot({path:testInfo.outputPath(`paginacao-${width}.png`)});
  }
  expect(erros).toEqual([]);
  await page.getByRole('link',{name:rota.endsWith('hoje')?'Todos os pedidos':'Eventos de hoje',exact:true}).click();
  await expect(page).toHaveURL(rota.endsWith('hoje')?/\/ao-vivo$/:/\/ao-vivo\/hoje$/);
});

test('entrega após o horário, alinhada entre pedidos, e nomes em caixa alta',async({page},testInfo)=>{
  await preparar(page,{nomesMinusculos:true});await page.goto('/ao-vivo');
  for(const width of [1600,1280,1024,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    const eventos=await page.locator('.lista-aovivo-evento').evaluateAll(els=>els.map(el=>{
      const data=el.querySelector('.lista-aovivo-evento-data').getBoundingClientRect();
      const tag=el.querySelector('.tag').getBoundingClientRect();
      const linha=el.closest('tr').getBoundingClientRect();
      return {dataFim:data.right,dataCentro:data.y+data.height/2,tagX:tag.x,tagCentro:tag.y+tag.height/2,tagFim:tag.right,linhaFim:linha.right,deslocamento:tag.x-linha.x};
    }));
    for(const e of eventos) {
      expect(e.tagX).toBeGreaterThan(e.dataFim);
      expect(Math.abs(e.dataCentro-e.tagCentro)).toBeLessThan(1);
      expect(e.tagFim).toBeLessThanOrEqual(e.linhaFim);
      expect(Math.abs(e.deslocamento-eventos[0].deslocamento)).toBeLessThan(1);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
    for(const nome of await page.locator('.lista-aovivo-cliente-nome,.lista-aovivo-destino').all()) {
      const texto=await nome.textContent();await expect(nome).toHaveCSS('text-transform','uppercase');
      expect(await nome.innerText()).toBe(texto.toLocaleUpperCase('pt-BR'));
    }
    if([1600,320].includes(width))await page.screenshot({path:testInfo.outputPath(`entrega-alinhada-${width}.png`),fullPage:true});
  }
  await page.goto('/ao-vivo/hoje');
  for(const nome of await page.locator('.operacao-dia-topo > strong,.operacao-dia-info-nome strong').all())await expect(nome).toHaveCSS('text-transform','uppercase');
});

test('filtros, limpeza e paginação continuam funcionando',async({page})=>{
  await preparar(page);await page.goto('/ao-vivo');
  const filtro=page.getByRole('combobox',{name:'Campo de busca de Ao Vivo'});
  for(const campo of ['aniversario','celular_comprador','dia_mensagem','endereco','comprador','destinatario','os']) {
    await filtro.selectOption(campo);await expect(page).toHaveURL(new RegExp(`campo=${campo}`));
  }
  await page.getByRole('textbox',{name:'Buscar pedidos de Ao Vivo'}).fill('MARIA');await expect(page).toHaveURL(/busca=MARIA/);
  await page.getByRole('button',{name:'Limpar',exact:true}).click();await expect(filtro).toHaveValue('');await expect(page).not.toHaveURL(/busca=/);
  await page.getByRole('button',{name:/Próxima/}).click();await expect(page).toHaveURL(/pagina=2/);await expect(page.locator('.tabela-aovivo tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button',{name:/Próxima/})).toBeDisabled();
  await page.getByRole('button',{name:/Anterior/}).click();await expect(page).toHaveURL(/pagina=1/);await expect(page.getByRole('button',{name:/Anterior/})).toBeDisabled();
});

test('seleção pelo teclado não abre pedido e impressão usa somente os selecionados',async({page})=>{
  await preparar(page);await page.goto('/ao-vivo');
  const selecionar=page.getByRole('checkbox',{name:'Selecionar pedido Ao Vivo O.S. 27001',exact:true});
  await selecionar.focus();await selecionar.press('Space');await expect(selecionar).toBeChecked();await expect(page).toHaveURL(/\/ao-vivo$/);
  await page.getByRole('checkbox',{name:'Selecionar pedido Ao Vivo O.S. 27002',exact:true}).check();
  const req=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/ao-vivo/imprimir');
  await page.getByRole('button',{name:'Imprimir selecionados (2)',exact:true}).click();
  expect(new URL((await req).url()).searchParams.get('ids')).toBe('101,102');
  await expect(page.locator('.folha-a4-aovivo')).toHaveCount(2);
  await expect.poll(()=>page.evaluate(()=>window.impressoesTeste)).toBe(1);
  await page.emulateMedia({media:'print'});await expect(page.locator('.aovivo-navegacao')).not.toBeVisible();
  await expect(page.locator('.folhas-aovivo')).toBeVisible();
});

test('pedido abre pelo teclado e retorno mantém pesquisa e destaque',async({page})=>{
  await preparar(page);await page.goto('/ao-vivo?campo=comprador&busca=MARIA');
  const item=page.locator('#aovivo-101');await item.focus();await item.press('Enter');await expect(page).toHaveURL(/\/ao-vivo\/101$/);
  await expect(page.locator('.pagina-aovivo-ampliada')).not.toHaveClass(/aovivo-moderna/);
  await page.goBack();await expect(page.locator('#aovivo-101')).toHaveClass(/linha-ultimo-selecionado/);
  await expect(page.getByRole('textbox',{name:'Buscar pedidos de Ao Vivo'})).toHaveValue('MARIA');
});

for(const rota of ['/ao-vivo','/ao-vivo/hoje'])for(const estado of ['vazio','erro'])test(`${rota}: estado ${estado}`,async({page})=>{
  await preparar(page,{[estado]:true});await page.goto(rota);
  await expect(page.getByText(estado==='erro'?'Falha simulada de consulta.':rota.endsWith('hoje')?'Nenhuma entrega marcada para hoje':'Nenhum pedido encontrado',{exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Visualizações de Ao Vivo'})).toBeVisible();
});
