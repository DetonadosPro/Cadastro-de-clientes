import {test,expect} from '@playwright/test';

async function abrir(page) {
  let envios=0;
  await page.addInitScript(()=>{localStorage.setItem('pombo_token','token-simulado');localStorage.setItem('pombo_usuario','QA');});
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/configuracoes')return route.fulfill({json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}});
    if(url.pathname==='/api/fonadas/123'){
      if(route.request().method()==='PUT'){envios++;return route.fulfill({json:{...route.request().postDataJSON(),versao:2}});}
      return route.fulfill({json:{id:123,cliente_id:1,nome_comprador:'CLIENTE TESTE',valor:12,cobranca:'08/10/26',periodo:'MANHÃ',p1_dia:'08/10/26',p2_dia:'',versao:1}});
    }
    if(url.pathname==='/api/clientes/1')return route.fulfill({json:{cliente:{id:1,nome:'CLIENTE TESTE'},fonada:[],aoVivo:[]}});
    if(url.pathname==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
    return route.fulfill({json:{tentativas:[],fonada:[],aoVivo:[],lembretes:[],contagens:[]}});
  });
  await page.goto('/fonada/123');
  await expect(page.getByRole('textbox',{name:'Valor do pedido Fonada'})).toHaveValue('R$ 12,00');
  return ()=>envios;
}

test('erro de campo retornado pelo servidor também recebe foco e destaque',async({page})=>{
  await abrir(page);
  await page.route('**/api/fonadas/123',async route=>{
    if(route.request().method()==='PUT')return route.fulfill({status:400,json:{erro:'Revise a data informada.',campo:'p1_dia'}});
    return route.fallback();
  });
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  const input=page.getByRole('textbox',{name:'Dia da 1ª mensagem',exact:true});
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-invalid','true');
});

for(const [nome,valor] of [['Valor do pedido Fonada','10000'],['Dia da cobrança Fonada','310226'],['Dia da 1ª mensagem','310226'],['Dia da 2ª mensagem','310226'],['Período de cobrança Fonada','']]) {
  test(`Salvar aponta e seleciona ${nome}`,async({page})=>{
    const envios=await abrir(page);
    const input=page.getByRole('textbox',{name:nome,exact:true});
    await input.fill(valor);
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-invalid','true');
    expect(await input.evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length)).toBe(true);
    expect(envios()).toBe(0);
    await input.fill(nome.includes('Dia')?'081026':nome.includes('Valor')?'9999':'MANHÃ');
    await expect(input).not.toHaveAttribute('aria-invalid','true');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    await expect.poll(envios).toBe(1);
  });
}
