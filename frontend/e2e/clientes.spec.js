import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { usuario, senha, isolado, entrar, criarOperadorDeTeste } from './apoio.js';

test('cliente: criar, recarregar, editar, buscar e enviar à lixeira', async ({ page }) => {
  test.skip(!isolado, 'Fluxo de escrita exige QA_E2E_ISOLATED_DB=1 e banco isolado.');
  await entrar(page);
  const nome = `TESTE_QA_Érica D'Ávila_${Date.now()}`;
  const nomeEditado = `${nome}_EDITADO`;
  await page.goto('/clientes/novo');
  await page.getByRole('heading', { name: 'Novo cliente' }).waitFor();
  await page.getByLabel('Nome *').fill(nome);
  await page.getByLabel('WhatsApp').fill('11999999999');
  await page.getByRole('button', { name: 'Salvar cliente' }).click();
  await page.waitForURL(/\/clientes\/\d+$/);
  const ficha = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();

  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('#editar-nome').fill('  ');
  const escritaInvalida = page.waitForResponse((r) => r.url().endsWith(ficha.replace('/clientes/', '/api/clientes/')) && r.request().method() === 'PUT', { timeout: 1000 }).catch(() => null);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  expect(await escritaInvalida).toBeNull();
  await expect(page.locator('#editar-nome')).toBeFocused();
  await page.locator('#editar-nome').fill(nomeEditado);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: nomeEditado })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: nomeEditado })).toBeVisible();

  await page.goto('/clientes');
  await page.locator('#cliente-busca').fill(nomeEditado);
  await expect(page.getByText(nomeEditado).first()).toBeVisible();
  await page.goto(ficha);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.waitForURL('**/clientes');
  await page.goto('/clientes/lixeira');
  await expect(page.getByText(nomeEditado).first()).toBeVisible();
  const id = Number(ficha.split('/').pop());
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const removido = await page.request.delete(`/api/clientes/${id}/definitivo`, { headers: { Authorization: `Bearer ${token}` } });
  expect(removido.status()).toBe(200);
});

test('clique duplo rápido em Salvar cliente cria apenas um cadastro', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const nome = `TESTE_QA_DUPLO_CLIQUE_${Date.now()}`;
  let requisicoes = 0;
  await page.route('**/api/clientes', async (route) => {
    if (route.request().method() === 'POST') {
      requisicoes++;
      await new Promise((resolver) => setTimeout(resolver, 600));
    }
    await route.continue();
  });
  await page.goto('/clientes/novo');
  await page.getByRole('heading', { name: 'Novo cliente' }).waitFor();
  await page.getByLabel('Nome *').fill(nome);
  await page.evaluate(() => {
    const botao = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Salvar cliente');
    botao.click();
    botao.click();
  });
  await page.waitForURL(/\/clientes\/\d+$/);
  expect(requisicoes).toBe(1);
  const id = Number(new URL(page.url()).pathname.split('/').pop());
  const listagem = await request.get(`/api/clientes?busca=${encodeURIComponent(nome)}`, { headers });
  expect((await listagem.json()).total).toBe(1);
  await request.delete(`/api/clientes/${id}`, { headers });
  await request.delete(`/api/clientes/${id}/definitivo`, { headers });
});

test('API rejeita nome vazio e protege rotas sem sessão', async ({ request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige QA_E2E_ISOLATED_DB=1 e banco isolado.');
  const login = await request.post('/api/auth/login', { data: { usuario, senha } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const semSessao = await request.get('/api/clientes');
  expect(semSessao.status()).toBe(401);
  const invalido = await request.post('/api/clientes', { headers, data: { nome: '   ' } });
  expect(invalido.status()).toBe(400);
  const criado = await request.post('/api/clientes', { headers, data: { nome: 'TESTE_QA_API_NOME' } });
  expect(criado.status()).toBe(201);
  const { id } = await criado.json();
  try {
    const editado = await request.put(`/api/clientes/${id}`, { headers, data: { nome: '  ' } });
    expect(editado.status()).toBe(400);
    const lido = await request.get(`/api/clientes/${id}`, { headers });
    expect((await lido.json()).cliente.nome).toBe('TESTE_QA_API_NOME');
  } finally {
    await request.delete(`/api/clientes/${id}`, { headers });
    await request.delete(`/api/clientes/${id}/definitivo`, { headers });
  }
});

test('WhatsApp só oferece link para telefone brasileiro válido', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const resposta = await request.post('/api/clientes', {
    headers,
    data: { nome: `TESTE_QA_WHATSAPP_${Date.now()}`, whatsapp: '00000000000' },
  });
  expect(resposta.status()).toBe(201);
  const cliente = await resposta.json();
  try {
    await page.goto(`/clientes/${cliente.id}`);
    await page.getByRole('heading', { name: cliente.nome }).waitFor();
    await expect(page.locator('a[href*="whatsapp.com/send"]')).toHaveCount(0);
    const atualizada = await request.put(`/api/clientes/${cliente.id}`, {
      headers,
      data: { whatsapp: '+55 (34) 9 9999-9999', versao: cliente.versao },
    });
    expect(atualizada.status()).toBe(200);
    await page.reload();
    await expect(page.locator('a[href*="whatsapp.com/send?phone=5534999999999"]')).toHaveCount(1);
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('diálogo de bloqueio fecha com Escape e bloqueio impede pedido', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const criado = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_BLOQUEIO_${Date.now()}` } });
  expect(criado.status()).toBe(201);
  const cliente = await criado.json();
  try {
    await page.goto(`/clientes/${cliente.id}`);
    await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar bloqueio' }).click();
    await expect(page.getByRole('button', { name: 'Desbloquear' })).toBeVisible();
    const pedido = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 10 } });
    expect(pedido.status()).toBe(403);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(page.getByRole('button', { name: 'Bloquear', exact: true })).toBeVisible();
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
