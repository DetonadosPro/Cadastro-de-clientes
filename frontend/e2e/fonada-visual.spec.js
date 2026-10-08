import {test,expect} from '@playwright/test';

async function preparar(page,{vazio=false,erro=false,nomesMinusculos=false,total=31}={}) {
  await page.addInitScript(()=>{localStorage.setItem('pombo_token','token-simulado');localStorage.setItem('pombo_usuario','QA');sessionStorage.removeItem('ultimoFonadaSelecionado');});
  const pedido={id:101,senha_os:'37001',cliente_id:1,nome_comprador:'MARIA APARECIDA DA SILVA DE OLIVEIRA',comprador_celular:'(34) 9 9999-8888',p1_para:'ANA CLARA (MENSAGEM DE ANIVERSÁRIO DA MÃE)',p1_dia:'07/10/26',p1_horario:'09:30',p1_tema:'ANIVERSÁRIO ESPECIAL',p1_celular:'(34) 9 9999-8888',p1_quem_oferece:'TODA A FAMÍLIA E AMIGOS',data_pedido:'07/10/26',horario_pedido:'14:30',valor:12,pagou:'SIM',recall:'SIM',versao:1,mensagemEmHaver:{status:'DISPONIVEL',dataExpiracao:'06/01/27'}};
  const pedidos=[pedido,{...pedido,id:102,nome_comprador:'JOÃO CARLOS',pagou:'NÃO',recall:'NÃO',mensagemEmHaver:{status:'EXPIRADA',dataExpiracao:'01/10/26'}},{...pedido,id:103,nome_comprador:'LÚCIA',p2_para:'PEDRO',p2_dia:'08/10/26',p2_horario:'18:00',mensagemEmHaver:{status:'UTILIZADA'}}];
  if(nomesMinusculos)for(const p of pedidos)for(const campo of ['nome_comprador','p1_para','p2_para','p1_quem_oferece'])if(p[campo])p[campo]=p[campo].toLocaleLowerCase('pt-BR');
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/fonadas'||url.pathname==='/api/fonadas/hoje') {
      if(erro)return route.fulfill({status:500,json:{erro:'Falha simulada de consulta.'}});
      return route.fulfill({json:{data:'07/10/26',fonadas:vazio?[]:url.searchParams.get('pagina')==='2'?[{...pedido,id:104}]:pedidos,total:vazio?0:total}});
    }
    if(url.pathname==='/api/fonadas/101')return route.fulfill({json:pedido});
    if(url.pathname==='/api/clientes/1')return route.fulfill({json:{cliente:{id:1,nome:pedido.nome_comprador},fonada:[],aoVivo:[]}});
    if(url.pathname==='/api/configuracoes')return route.fulfill({json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}});
    if(url.pathname==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
    return route.fulfill({json:{tentativas:[],fonada:[],aoVivo:[],lembretes:[],contagens:[]}});
  });
}

for(const rota of ['/fonada','/fonada/hoje'])test(`${rota}: nomes e detalhes legíveis no computador e celular`,async({page},testInfo)=>{
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  await preparar(page,{total:20579});await page.goto(rota);
  await expect(page.locator('.fonada-moderna')).toContainText('MARIA APARECIDA DA SILVA DE OLIVEIRA');
  await expect(page.locator('.fonada-moderna')).toContainText('ANA CLARA (MENSAGEM DE ANIVERSÁRIO DA MÃE)');
  for(const width of [1920,1600,1280,1024,768,390,320]){
    await page.setViewportSize({width,height:1000});
    if(rota.endsWith('hoje'))for(const seletor of ['.venda-fonada-cliente','.venda-fonada-mensagem','.venda-fonada-pagamento','.venda-fonada-valor'])await expect(page.locator(seletor).first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),`Transbordamento em ${width}`).toBe(false);
    if([1600,390].includes(width))await page.screenshot({path:testInfo.outputPath(`fonada-${rota.endsWith('hoje')?'hoje':'lista'}-${width}.png`),fullPage:true});
    if(rota==='/fonada'&&[1600,320].includes(width))await page.getByRole('navigation',{name:'Paginação',exact:true}).screenshot({path:testInfo.outputPath(`paginacao-${width}.png`)});
  }
  expect(erros).toEqual([]);
  await page.getByRole('link',{name:rota.endsWith('hoje')?'Todos os pedidos':'Vendas de hoje',exact:true}).click();
  await expect(page).toHaveURL(rota.endsWith('hoje')?/\/fonada$/:/\/fonada\/hoje$/);
});

test('nomes de clientes, destinatários e oferecimento permanecem em caixa alta',async({page})=>{
  await preparar(page,{nomesMinusculos:true});
  for(const rota of ['/fonada','/fonada/hoje']) {
    await page.goto(rota);
    const seletor=rota.endsWith('hoje')?'.venda-fonada-cliente > strong,.venda-fonada-mensagem > strong':'.lista-fonada-cliente-nome,.resumo-mensagem-nome';
    await expect(page.locator(seletor).first()).toBeVisible();
    for(const width of [1600,390]) {
      await page.setViewportSize({width,height:1000});
      for(const nome of await page.locator(seletor).all()) {
        const texto=await nome.textContent();await expect(nome).toHaveCSS('text-transform','uppercase');
        expect(await nome.innerText()).toBe(texto.toLocaleUpperCase('pt-BR'));
      }
    }
  }
});

test('todos os campos de pesquisa, limpeza e paginação continuam funcionando',async({page})=>{
  await preparar(page);await page.goto('/fonada');
  const filtro=page.getByRole('combobox',{name:'Campo de busca de Fonada'});
  for(const campo of ['aniversario','celular_comprador','celular_destinatario','dia_mensagem','endereco','fixo_comprador','fixo_destinatario','nome_comprador','destinatario','os']) {
    await filtro.selectOption(campo);
    await expect(page).toHaveURL(new RegExp(`campo=${campo}`));
  }
  await page.getByRole('textbox',{name:'Buscar pedidos de Fonada'}).fill('MARIA');
  await expect(page).toHaveURL(/busca=MARIA/);
  await page.getByRole('button',{name:'Limpar',exact:true}).click();
  await expect(filtro).toHaveValue('');
  await expect(page).not.toHaveURL(/busca=/);
  await page.getByRole('button',{name:/Próxima/}).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.locator('.tabela-fonada tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button',{name:/Próxima/})).toBeDisabled();
  await page.getByRole('button',{name:/Anterior/}).click();await expect(page).toHaveURL(/pagina=1/);await expect(page.getByRole('button',{name:/Anterior/})).toBeDisabled();
});

test('pedido abre pelo teclado e retorno preserva o destaque da lista',async({page})=>{
  await preparar(page);await page.goto('/fonada?campo=nome_comprador&busca=MARIA');
  const item=page.locator('#fonada-101');await item.focus();await item.press('Enter');
  await expect(page).toHaveURL(/\/fonada\/101$/);
  await expect(page.locator('.pagina-fonada-ampliada')).not.toHaveClass(/fonada-moderna/);
  await page.goBack();
  await expect(page.locator('#fonada-101')).toHaveClass(/linha-ultimo-selecionado/);
  await expect(page.getByRole('textbox',{name:'Buscar pedidos de Fonada'})).toHaveValue('MARIA');
});

for(const rota of ['/fonada','/fonada/hoje'])for(const estado of ['vazio','erro'])test(`${rota}: estado ${estado}`,async({page})=>{
  await preparar(page,{[estado]:true});await page.goto(rota);
  await expect(page.getByText(estado==='erro'?'Falha simulada de consulta.':rota.endsWith('hoje')?'Nenhuma venda de Fonada hoje':'Nenhum pedido de Fonada ainda',{exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Visualizações de Fonada'})).toBeVisible();
});
