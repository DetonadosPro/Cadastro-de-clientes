// Verificação isolada de interface: todas as respostas de API são simuladas.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
let configuracoes = { limite_segunda_mensagem: 12, versao: 1 };
let salvo = null;
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem('pombo_token', 'teste-local');
  localStorage.setItem('pombo_usuario', 'TESTE');
  localStorage.setItem('pombo_nome', 'Operador de teste');
});
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  let dados = {};
  if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true,"versao":0,"instancia":"teste"}\n\n' });
  if (url.pathname === '/api/configuracoes') {
    if (route.request().method() === 'PUT') configuracoes = { ...route.request().postDataJSON(), versao: configuracoes.versao + 1 };
    dados = configuracoes;
  } else if (url.pathname === '/api/clientes/1') dados = { cliente: { id: 1, nome: 'Cliente de teste', nascimento: '01/01/90' } };
  else if (url.pathname === '/api/fonadas/proxima-os') dados = { proximaOs: '99999' };
  else if (url.pathname === '/api/fonadas' && route.request().method() === 'POST') { salvo = route.request().postDataJSON(); dados = { ...salvo, id: 99, versao: 1 }; }
  else if (url.pathname === '/api/fonadas/99') dados = { ...salvo, id: 99, versao: 1 };
  else if (url.pathname.includes('tentativas')) dados = { tentativas: [] };
  else if (url.pathname.includes('alerta')) dados = { dias: [], itens: [] };
  await route.fulfill({ json: dados });
});
try {
  await page.goto('http://127.0.0.1:5189/configuracoes');
  await page.getByLabel('Limite do pedido (R$)').waitFor();
  assert.equal(await page.getByLabel('Limite do pedido (R$)').inputValue(), 'R$ 12,00');
  await page.screenshot({ path: 'test-results/configuracoes-desktop.png', fullPage: true });
  await page.getByLabel('Limite do pedido (R$)').fill('2000');
  await page.getByLabel('Validade da mensagem em haver (meses)').fill('6');
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
  await page.getByText('Configurações salvas.', { exact: true }).waitFor();
  assert.equal(configuracoes.limite_segunda_mensagem, 20);
  assert.equal(configuracoes.meses_mensagem_em_haver, 6);
  await page.goto('http://127.0.0.1:5189/fonada/novo?clienteId=1');
  const valor = page.getByLabel('Valor do pedido Fonada');
  const segunda = page.getByLabel('Tema da 2ª mensagem');
  await valor.waitFor();
  assert.equal(await page.getByText('Segunda mensagem somente para pedidos', { exact: false }).count(), 0);
  await valor.fill('2000');
  assert.equal(await segunda.isEnabled(), true);
  await segunda.fill('ANIV GERAL');
  await valor.fill('2001');
  assert.equal(await segunda.isDisabled(), true);
  await page.getByLabel('Dia da cobrança Fonada').fill('011026');
  await page.getByLabel('Período de cobrança Fonada').fill('Manhã');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByText('Pedido salvo com sucesso.', { exact: true }).waitFor();
  assert.equal(salvo.valor, 20.01);
  assert.equal(salvo.p2_tema, '');
  configuracoes = { limite_segunda_mensagem: 12, versao: 3 };
  await page.goto('http://127.0.0.1:5189/fonada/novo?clienteId=1');
  await valor.waitFor();
  await valor.fill('1200');
  await page.getByLabel('Celular da 1ª mensagem').fill('11999999999');
  assert.equal(await segunda.isEnabled(), true);
  await valor.fill('1201');
  assert.equal(await segunda.isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5189/configuracoes');
  await page.getByLabel('Limite do pedido (R$)').waitFor();
  await page.screenshot({ path: 'test-results/configuracoes-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(erros, []);
  console.log('Configurações, persistência simulada, bloqueio por valor, DDD independente, salvamento e mobile: OK.');
} finally { await browser.close(); }
