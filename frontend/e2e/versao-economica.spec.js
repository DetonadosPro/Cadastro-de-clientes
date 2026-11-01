import {test,expect} from '@playwright/test';

test('verifica versão a cada dois minutos visíveis, retoma no foco e preserva o SSE',async({page})=>{
  await page.clock.install({time:new Date('2026-11-01T12:00:00Z')});
  await page.addInitScript(()=>{
    localStorage.setItem('pombo_token','token-simulado');
    Object.defineProperty(document,'visibilityState',{get:()=>window.visibilidadeTeste||'visible'});
  });
  let verificacoes=0,eventos=0;
  await page.route('**/version.json*',route=>{verificacoes++;return route.fulfill({json:{versao:null}});});
  await page.route('**/api/**',route=>{
    if(new URL(route.request().url()).pathname==='/api/eventos'){
      eventos++;return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n'});
    }
    return route.fulfill({json:{fonada:[],aoVivo:[],lembretes:[],contagens:[],cliente:{}}});
  });
  await page.goto('/recall');
  await expect.poll(()=>verificacoes).toBeGreaterThan(0);
  await expect.poll(()=>eventos).toBeGreaterThan(0);
  await page.clock.pauseAt(new Date('2026-11-01T12:00:01Z'));
  const iniciais=verificacoes; // O ambiente dev monta os efeitos duas vezes no StrictMode.
  await page.clock.runFor(118000);
  expect(verificacoes).toBe(iniciais);
  await page.clock.runFor(3000);
  await expect.poll(()=>verificacoes).toBe(iniciais+1);
  await page.evaluate(()=>{window.visibilidadeTeste='hidden';document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(240000);
  expect(verificacoes).toBe(iniciais+1);
  await page.evaluate(()=>{window.visibilidadeTeste='visible';document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>verificacoes).toBe(iniciais+2);
  await page.route('**/version.json*',route=>{verificacoes++;return route.fulfill({json:{versao:'nova-versao-qa'}});});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Nova versão disponível',{exact:true})).toBeVisible();
});
