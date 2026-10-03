import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();const erros=[];const gravacoes=[];
page.on('pageerror',e=>erros.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('pombo_token','teste');localStorage.setItem('pombo_usuario','TESTE');});
await page.route('**/api/**',async r=>{const u=new URL(r.request().url());let json={};
if(u.pathname==='/api/eventos')return r.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
if(r.request().method()==='POST')gravacoes.push({path:u.pathname,dados:r.request().postDataJSON()});
if(u.pathname==='/api/configuracoes')json={limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1};
if(u.pathname==='/api/clientes')json=r.request().method()==='POST'?{id:1}:{clientes:[],total:0};
if(u.pathname==='/api/clientes/1')json={cliente:{id:1,nome:'CLIENTE TESTE',nascimento:''},fonadas:[],aoVivo:[]};
if(u.pathname.includes('proxima-os'))json={proximaOs:'99999'};
await r.fulfill({json});});
try{
await page.goto('http://127.0.0.1:5189/clientes/novo');
await page.locator('#novo-nome').fill('CLIENTE RASCUNHO');
await page.locator('#novo-whatsapp').fill('34999998888');
const fechar=page.getByRole('button',{name:/^Fechar rascunho Cadastro:/});await fechar.waitFor();
await page.getByRole('link',{name:'Cobrança',exact:true}).click();
await page.getByRole('link',{name:/↻ CLIENTE RASCUNHO/}).click();
assert.equal(await page.locator('#novo-nome').inputValue(),'CLIENTE RASCUNHO');
assert.ok((await page.locator('#novo-whatsapp').inputValue()).includes('8888'));
await fechar.click();await page.getByRole('button',{name:'Continuar editando',exact:true}).click();
assert.equal(await fechar.count(),1);
await fechar.click();await page.getByRole('button',{name:'Descartar rascunho',exact:true}).click();await page.waitForURL('**/clientes');
assert.equal(await fechar.count(),0);assert.equal(gravacoes.length,0);
await page.goto('http://127.0.0.1:5189/clientes/novo');await page.locator('#novo-nome').fill('CADASTRO SALVO');await fechar.waitFor();
await page.locator('form').evaluate(f=>f.requestSubmit());await page.waitForURL('**/clientes/1');assert.equal(await fechar.count(),0);assert.equal(gravacoes.length,1);
await page.goto('http://127.0.0.1:5189/fonada/novo?clienteId=1&recallPara=DESTINATARIO&recallData=2026-10-03');
await page.getByLabel('Código de Recall do pedido Fonada').waitFor();
await page.waitForTimeout(500);
// Simula exatamente o estado enviado pelo Recall e remonta o formulário.
await page.evaluate(()=>{history.replaceState({...history.state,usr:{recallDadosMensagem:{osAnterior:'36947',tema:'ANIV GERAL',fixo:'3433331111',celular:'34999998888'}}},'',location.href);});
await page.reload();
await page.locator('input').filter({visible:true}).first().waitFor();
await page.waitForTimeout(600);
assert.equal(await page.getByLabel('Código de Recall do pedido Fonada').inputValue(),'36947');
assert.ok((await page.locator('body').innerText()).includes('99999'));
assert.deepEqual(erros,[]);console.log('Cadastro: restaurar, cancelar descarte, descartar e salvar; Fonada: OS antiga no Recall e OS nova independente: OK');
}finally{await browser.close();}

