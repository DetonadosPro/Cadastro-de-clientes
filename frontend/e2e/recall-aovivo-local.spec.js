import {test,expect} from '@playwright/test';

async function preparar(page,{vazia=false}={}){
  await page.addInitScript(()=>{localStorage.setItem('pombo_token','token-simulado');localStorage.setItem('pombo_usuario','QA');});
  const historico=[{pedidoId:123,os:'2688',data:'07/10/25',tema:'ANIV GERAL'}];
  const original={relacaoChave:'AOVIVO:ID:7|PARA:MARCIA',clienteId:7,clienteNome:'KATIA',aniversariante:'MÁRCIA',telefone:'34999999999',ocasiao:'ANIVERSARIO',historico,ultimoPedido:historico[0],quantidade:1};
  const invertido={...original,relacaoChave:'AOVIVO:ANIVERSARIO:NOME:MARCIA|PARA:ID:7',clienteId:3,clienteNome:'MÁRCIA',aniversariante:'KATIA',telefone:'34988887777',compradorId:7,aniversarianteNascimento:'07/10/90',modoFila:'ANIVERSARIO'};
  await page.route('**/api/**',async route=>{
    const caminho=new URL(route.request().url()).pathname;
    if(caminho==='/api/recall/ao-vivo/fila')return route.fulfill({json:{itens:[original],porDiaMensagem:[original],porAniversario:vazia?[]:[invertido]}});
    if(caminho==='/api/ao-vivo/123')return route.fulfill({json:{id:123,numero_os:'2688',cliente_id:7,para:'MÁRCIA',endereco:'Rua Exemplo, 72',dia_entrega:'07/10/25',tema_1:'ANIV GERAL',valor:100,versao:1}});
    if(caminho==='/api/clientes/7')return route.fulfill({json:{cliente:{id:7,nome:'KATIA',celular:'34999999999',endereco:'Rua da Katia',bairro:'Centro'}}});
    if(caminho==='/api/clientes/3')return route.fulfill({json:{cliente:{id:3,nome:'MÁRCIA',celular:'34988887777'}}});
    if(caminho==='/api/ao-vivo/proxima-os')return route.fulfill({json:{proximaOs:'3000'}});
    if(caminho==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
    return route.fulfill({json:{fonada:[],aoVivo:[],lembretes:[],contagens:[]}});
  });
  await page.goto('/recall?sistema=AOVIVO&data=2026-10-07');
  await expect(page.getByRole('tab',{name:/Pesquisa 1/})).toBeVisible({timeout:15000});
}

test('Pesquisa 2 usa contato do destinatário e preserva seleção ao recarregar e voltar do pedido',async({page},testInfo)=>{
  await preparar(page);
  await expect(page.locator('.recall-detalhes .recall-whatsapp')).toHaveAttribute('href',/phone=5534999999999/);
  await page.getByRole('tab',{name:/Pesquisa 2/}).click();
  await expect(page.getByText('Destinatário a contatar',{exact:true})).toBeVisible();
  await expect(page.locator('.recall-detalhes .recall-whatsapp')).toHaveAttribute('href',/phone=5534988887777/);
  await expect(page.locator('.recall-relacao-titulo')).toContainText('MÁRCIA');
  await expect(page.locator('.recall-relacao-titulo')).toContainText('KATIA');
  await page.reload();
  await expect(page.getByRole('tab',{name:/Pesquisa 2/})).toHaveAttribute('aria-selected','true');
  await page.getByRole('button',{name:'Abrir O.S. 2688',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Destinatário do Ao Vivo',exact:true})).toHaveValue('MÁRCIA',{timeout:15000});
  await page.getByRole('button',{name:'Voltar',exact:true}).click();
  await expect(page.getByRole('tab',{name:/Pesquisa 2/})).toHaveAttribute('aria-selected','true');
  for(const width of [1720,390]){
    await page.setViewportSize({width,height:950});
    await page.screenshot({path:testInfo.outputPath(`recall-pesquisa2-${width}.png`),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
  }
  await page.getByRole('button',{name:'＋ Criar novo pedido Ao Vivo',exact:true}).click();
  await expect(page).toHaveURL(/clienteId=3/);
  await expect(page.getByRole('textbox',{name:'Destinatário do Ao Vivo',exact:true})).toHaveValue('KATIA');
  await expect(page.getByRole('textbox',{name:'Aniversário do destinatário',exact:true})).toHaveValue('07/10');
  await expect(page.getByRole('textbox',{name:'Celular do destinatário',exact:true})).toHaveValue('34999999999');
});

test('Pesquisa 2 vazia continua acessível e busca encontra as duas pesquisas',async({page})=>{
  await preparar(page,{vazia:true});
  await page.getByRole('tab',{name:/Pesquisa 2/}).click();
  await expect(page.getByText('Nenhum destinatário com celular para os clientes aniversariantes deste dia.',{exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'Buscar no Recall de Ao Vivo',exact:true}).fill('2688');
  await expect(page.locator('.recall-linha')).toHaveCount(1);
  await expect(page.getByText('Comprador a contatar',{exact:true})).toBeVisible();
});
