import { test, expect } from '@playwright/test';

async function abrirPedido(page) {
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado');
    localStorage.setItem('pombo_usuario', 'QA');
  });
  await page.route('**/api/**', async route => {
    const caminho = new URL(route.request().url()).pathname;
    if (caminho === '/api/ao-vivo/123') return route.fulfill({ json: {
      id:123, cliente_id:1, numero_os:'2688', para:'MERILYN', endereco:'RUA MANDAGUARI, 72', bairro:'J. UBERABA',
      dia_entrega:'04/10/26', horario_entrega:'18:30', valor:105, versao:1,
      resultado_entrega:'ENTREGUE AUTOMATICAMENTE, 04/10/26 ÀS 18:40 PELO SISTEMA',
    }});
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
