import { test, expect } from '@playwright/test';

async function abrirPedido(page) {
  let pedido = {id:123, cliente_id:1, numero_os:'2688', para:'MERILYN', endereco:'RUA MANDAGUARI, 72', bairro:'J. UBERABA', dia_entrega:'04/10/26', horario_entrega:'18:30', valor:105, versao:1, resultado_entrega:'ENTREGUE AUTOMATICAMENTE, 04/10/26 ÀS 18:40 PELO SISTEMA'};
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado');
    localStorage.setItem('pombo_usuario', 'QA');
  });
  await page.route('**/api/**', async route => {
    const caminho = new URL(route.request().url()).pathname;
    if (caminho === '/api/ao-vivo/123') {
      if(route.request().method()==='PUT')pedido={...pedido,...route.request().postDataJSON(),versao:pedido.versao+1};
      return route.fulfill({json:pedido});
    }
    if (caminho === '/api/clientes/1') return route.fulfill({ json:{cliente:{id:1,nome:'MICHELLE SILVA'},fonada:[],aoVivo:[]} });
    if (caminho === '/api/eventos') return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
    return route.fulfill({json:{fonada:[],aoVivo:[],lembretes:[],contagens:[]}});
  });
  await page.goto('/ao-vivo/123');
  await expect(page.locator('.endereco-autocomplete input')).toHaveValue('RUA MANDAGUARI',{timeout:15000});
}

test('pedido carregado não consulta o localizador e não mostra o bloco de entrega',async({page})=>{
  let consultas=0;
  await page.route('https://viacep.com.br/**',route=>{consultas++;return route.fulfill({json:[]});});
  await abrirPedido(page);
  const endereco=page.locator('.endereco-autocomplete input');
  await endereco.focus();
  // Espera maior que o debounce para detectar a consulta indevida ao carregar ou focar.
  await page.waitForTimeout(700);
  expect(consultas).toBe(0);
  await expect(endereco).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.endereco-autocomplete-lista')).toHaveCount(0);
  await expect(page.locator('.section-title').filter({hasText:/^Entrega$/})).toHaveCount(0);
  for(const nome of ['Marcar entregue','Marcar não entregue','Desfazer entrega']) await expect(page.getByRole('button',{name:nome,exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Salvar',exact:true})).toBeVisible();
});

test('celular e aniversário do destinatário são salvos e reaparecem ao abrir o pedido',async({page},testInfo)=>{
  await abrirPedido(page);
  await page.getByRole('textbox',{name:'Celular do destinatário',exact:true}).fill('34999998888');
  await page.getByRole('textbox',{name:'Aniversário do destinatário',exact:true}).fill('2902');
  const salvamento=page.waitForRequest(r=>r.method()==='PUT'&&new URL(r.url()).pathname==='/api/ao-vivo/123');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  const enviado=(await salvamento).postDataJSON();
  expect(enviado.celular_local.replace(/\D/g,'')).toBe('34999998888');
  expect(enviado.aniversario_destinatario).toBe('29/02');
  expect(enviado.aniversario).toBeUndefined();
  await expect(page.getByText('Pedido salvo com sucesso.',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox',{name:'Aniversário do destinatário',exact:true})).toHaveValue('29/02');
  await expect(page.getByRole('textbox',{name:'Celular do destinatário',exact:true})).toHaveValue(enviado.celular_local);
  for(const width of [1720,1440,390]){
    await page.setViewportSize({width,height:950});
    await page.locator('.secao-homenageado-aovivo').screenshot({path:testInfo.outputPath(`homenageado-${width}.png`)});
  }
  await page.getByRole('textbox',{name:'Aniversário do destinatário',exact:true}).fill('3102');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await expect(page.getByText('O aniversário do destinatário precisa ser uma data válida.',{exact:true})).toBeVisible();
});

test('localizador continua sugerindo ao digitar e não reabre após sair do campo',async({page})=>{
  await page.route('https://viacep.com.br/**',async route=>{
    await new Promise(resolve=>setTimeout(resolve,300));
    await route.fulfill({json:[{logradouro:'Rua Mandaguari',bairro:'Jardim Uberaba',cep:'38057-600'}]});
  });
  await abrirPedido(page);
  const endereco=page.locator('.endereco-autocomplete input');
  const consulta=page.waitForResponse(r=>r.url().startsWith('https://viacep.com.br/'));
  await endereco.fill('Mandaguari');
  await page.getByRole('button',{name:'Salvar',exact:true}).focus();
  await consulta;
  await expect(endereco).toHaveAttribute('aria-expanded','false');
  await endereco.focus();
  await expect(page.getByRole('option',{name:/Rua Mandaguari, 72/})).toBeVisible();
  await page.getByRole('option',{name:/Rua Mandaguari, 72/}).click();
  await expect(endereco).toHaveValue('Rua Mandaguari');
  await expect(endereco).toHaveAttribute('aria-expanded','false');
});
