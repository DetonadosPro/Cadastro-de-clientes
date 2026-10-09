import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const clientes = [
  { id:1, nome:'MARIA APARECIDA DA SILVA DE OLIVEIRA', nascimento:'09/10', whatsapp:'(34) 9 9999-8888', bairro:'JARDIM DAS FLORES', endereco:'RUA DAS MARGARIDAS, 125', total_fonada:12, total_aovivo:3, ultimo_pedido_data:'08/10/26', valor_pendente:'35.50' },
  { id:2, nome:'JOÃO CARLOS', nascimento:'23/05/1980', celular:'(34) 9 9999-7777', bairro:'CENTRO', endereco:'AVENIDA PRINCIPAL, 34', total_fonada:3, total_aovivo:0, ultimo_pedido_data:'07/10/26', valor_pendente:0, bloqueado:true },
  { id:3, nome:'ANA CLARA', nascimento:'00/00/0000', whatsapp:'00000000', fixo:'-', bairro:'PLANALTO', total_fonada:0, total_aovivo:0, valor_pendente:0 },
];

async function preparar(page, { muitos=false, vazio=false, erro=false }={}) {
  await page.addInitScript(() => { localStorage.setItem('pombo_token','token-simulado'); localStorage.setItem('pombo_usuario','QA'); localStorage.setItem('pombo_nome','Operador de exemplo'); });
  const estado = { erro, consultas:[], escritas:[], lista:vazio ? [] : muitos ? Array.from({length:36},(_,i)=>({...clientes[i%3],id:i+1,nome:`CLIENTE ${String(i+1).padStart(2,'0')}`})) : clientes };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') estado.escritas.push(url.pathname);
    if (url.pathname === '/api/clientes') {
      estado.consultas.push(url.searchParams.toString());
      if (estado.erro) return route.fulfill({status:500,json:{erro:'Falha simulada.'}});
      let lista = estado.lista.filter(c=>c.nome.toLowerCase().includes((url.searchParams.get('busca')||'').toLowerCase()));
      const telefone=(url.searchParams.get('telefone')||'').replace(/\D/g,'');
      if (telefone) lista=lista.filter(c=>[c.whatsapp,c.celular,c.fixo].some(v=>String(v||'').replace(/\D/g,'').includes(telefone)));
      if (url.searchParams.get('aniversario')) lista=lista.filter(c=>c.nascimento.startsWith(url.searchParams.get('aniversario')));
      const situacao=url.searchParams.get('situacao');
      if(situacao==='pendencia')lista=lista.filter(c=>Number(c.valor_pendente)>0);
      if(situacao==='bloqueados')lista=lista.filter(c=>c.bloqueado);
      if(situacao==='sem_pedidos')lista=lista.filter(c=>!c.total_fonada&&!c.total_aovivo);
      if(situacao==='aniversariantes')lista=lista.filter(c=>c.nascimento==='09/10');
      const campo=url.searchParams.get('ordenarPor')||'nome', desc=url.searchParams.get('direcao')==='desc';
      const valor=c=>campo==='nome'?c.nome:campo==='total_pedidos'?c.total_fonada+c.total_aovivo:Number(c.valor_pendente);
      lista.sort((a,b)=>(valor(a)<valor(b)?-1:valor(a)>valor(b)?1:0)*(desc?-1:1));
      const pagina=Number(url.searchParams.get('pagina')||1);
      return route.fulfill({json:{clientes:lista.slice((pagina-1)*30,pagina*30),total:lista.length}});
    }
    if (/^\/api\/clientes\/\d+\/resumo$/.test(url.pathname)) return route.fulfill({json:{cliente:clientes[0],resumo:{total_pedidos:15,total_fonada:12,total_aovivo:3,valor_pendente:35.5},ultimasCompras:[],mensagensEmHaver:[]}});
    if (/^\/api\/clientes\/\d+$/.test(url.pathname)) return route.fulfill({json:{cliente:clientes[0],fonada:[],aoVivo:[]}});
    if(url.pathname==='/api/clientes/possiveis-duplicatas')return route.fulfill({json:{pares:[]}});
    if(url.pathname==='/api/configuracoes')return route.fulfill({json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}});
    if(url.pathname==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
    return route.fulfill({json:{fonada:[],aoVivo:[],lembretes:[],contagens:[]}});
  });
  await page.goto('/clientes');
  await expect(page.locator('.clientes-status')).not.toContainText('Atualizando');
  return estado;
}

test('resumo distingue toda a base dos totais da página e mostra bloqueio e contato ausente', async({page})=>{
  await preparar(page);
  await expect(page.getByRole('heading',{name:'Clientes.'})).toBeVisible();
  const cards=page.locator('.clientes-indicador');
  await expect(cards.nth(0)).toContainText('3');
  await expect(cards.nth(1)).toContainText('18');
  await expect(cards.nth(2)).toContainText('R$ 35,50');
  await expect(cards.nth(3)).toContainText('1');
  const joao=page.locator('tbody tr').filter({hasText:'JOÃO CARLOS'});
  await expect(joao).toContainText('Bloqueado');
  await expect(joao).toContainText('Em dia');
  await expect(page.locator('tbody tr').filter({hasText:'ANA CLARA'})).toContainText('Complete o cadastro');
  await expect(page.getByRole('link',{name:'Abrir WhatsApp de MARIA APARECIDA DA SILVA DE OLIVEIRA'})).toHaveAttribute('href','https://wa.me/5534999998888');
  await expect(page.locator('a.cliente-whatsapp')).toHaveCount(1);
});

test('filtros se combinam, limpam a busca e continuam na URL ao recarregar', async({page})=>{
  const estado=await preparar(page);
  await page.getByLabel('Nome',{exact:true}).fill('maria');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('.clientes-indicador').first()).toContainText('Clientes encontrados');
  await page.getByRole('button',{name:'Com cobrança pendente',exact:true}).click();
  await page.getByLabel('Telefone ou WhatsApp').fill('34999998888');
  await page.getByLabel('Aniversário',{exact:true}).fill('0910');
  await expect.poll(()=>new URL(page.url()).searchParams.get('aniversario')).toBe('09/10');
  await page.reload();
  await expect(page.getByLabel('Nome',{exact:true})).toHaveValue('maria');
  await expect(page.getByRole('button',{name:'Com cobrança pendente',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Limpar tudo',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button',{name:'Sem pedidos',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('ANA CLARA');
  await page.getByRole('button',{name:'Aniversariantes de hoje',exact:true}).click();
  await expect(page.locator('tbody tr')).toContainText('MARIA');
  await page.getByRole('button',{name:'Novos em 30 dias',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('situacao')).toBe('recentes');
  await page.getByRole('button',{name:'Bloqueados',exact:true}).click();
  await expect(page.locator('tbody tr')).toContainText('JOÃO');
  await page.getByRole('button',{name:'Todos',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button',{name:'Todos',exact:true}).click();
  await expect(page.locator('.clientes-status')).not.toContainText('Atualizando');
  expect(estado.escritas).toEqual([]);
});

test('ordenação e paginação consideram toda a base, indicadores consideram a página atual', async({page})=>{
  await preparar(page,{muitos:true});
  await expect(page.locator('tbody tr')).toHaveCount(30);
  await expect(page.locator('.clientes-indicador').first()).toContainText('36');
  await page.getByRole('button',{name:'Próxima →',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.locator('.clientes-status')).toContainText('31–36 de 36');
  await page.getByLabel('Ordenar por',{exact:true}).selectOption('total_pedidos');
  await expect.poll(()=>new URL(page.url()).searchParams.get('direcao')).toBe('desc');
  await expect(page.locator('tbody tr')).toHaveCount(30);
  await expect(page.locator('.clientes-status')).toContainText('página 1');
  await expect(page.locator('tbody tr').first()).toContainText('15');
  await page.getByRole('button',{name:'Mudar para ordem crescente'}).click();
  await expect(page.locator('tbody tr').first()).toContainText('0 fonada');
});

test('visão rápida, ficha, seleção, comparação e revisão continuam acessíveis sem escrita', async({page})=>{
  const estado=await preparar(page);
  await page.getByRole('button',{name:clientes[0].nome,exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Resumo do cliente'})).toContainText(clientes[0].nome);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel(`Selecionar ${clientes[0].nome}`,{exact:true}).check();
  await page.getByLabel('Selecionar JOÃO CARLOS',{exact:true}).check();
  await expect(page.locator('.selecao-toolbar')).toContainText('2');
  await page.getByRole('button',{name:'Comparar e mesclar',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Dados que serão mantidos');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Limpar seleção'}).click();
  await page.getByRole('button',{name:'Revisar duplicatas'}).click();
  await expect(page.getByText('Nenhuma sugestão de duplicata pendente')).toBeVisible();
  await page.getByRole('link',{name:`Ver ficha de ${clientes[0].nome}`}).click();
  await expect(page).toHaveURL(/\/clientes\/1$/);
  expect(estado.escritas).toEqual([]);
});

test('layout responsivo mantém informações e ações visíveis, sem transbordamento e com contraste', async({page},testInfo)=>{
  const erros=[]; page.on('pageerror',err=>erros.push(err.message));
  await preparar(page);
  for(const width of [1920,1600,1280,1024,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),`Transbordamento em ${width}px`).toBe(false);
    const maria=page.locator('tbody tr').filter({hasText:clientes[0].nome});
    await expect(maria.locator('.cliente-pendencia')).toBeVisible();
    await expect(maria.locator('.cliente-ficha-link')).toBeVisible();
    const acao=await maria.locator('.cliente-ficha-link').boundingBox();
    expect(acao.x+acao.width,`Ação cortada em ${width}px`).toBeLessThanOrEqual(width);
    if([1600,390].includes(width))await page.screenshot({path:testInfo.outputPath(`clientes-${width}.png`),fullPage:true});
    if(width===1600)expect((await maria.boundingBox()).height).toBeLessThan(110);
    if(width===1600) {
      const resultado=await new AxeBuilder({page}).include('.clientes-renovada').withTags(['wcag2a','wcag2aa']).analyze();
      expect(resultado.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
    }
  }
  expect(erros).toEqual([]);
  const resultado=await new AxeBuilder({page}).include('.clientes-renovada').withTags(['wcag2a','wcag2aa']).analyze();
  expect(resultado.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});

test('estado vazio e falha de consulta oferecem recuperação', async({page})=>{
  const estado=await preparar(page,{erro:true});
  await expect(page.getByText('Não foi possível atualizar os clientes')).toBeVisible();
  estado.erro=false;
  await page.getByRole('button',{name:'Tentar novamente'}).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Nome',{exact:true}).fill('inexistente');
  await expect(page.getByText('Nenhum cliente encontrado')).toBeVisible();
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
});
