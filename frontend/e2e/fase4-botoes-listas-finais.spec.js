import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function dia() { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date()); }

test('BTN-009/013/032: erro e mensagem em haver no painel; overlay móvel', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const nome = `TESTE_QA_DRAWER_FINAL_${Date.now()}`;
  const resposta = await request.post('/api/clientes', { headers, data: { nome } });
  expect(resposta.status()).toBe(201);
  const cliente = await resposta.json();
  let pedido;
  try {
    const criado = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, data_pedido: dia(), p1_celular: '34999999999', p1_tema: 'QA', valor: 10, cobranca: dia(), periodo: 'MANHÃ' } });
    expect(criado.status()).toBe(201);
    pedido = await criado.json();
    await page.goto(`/clientes?busca=${encodeURIComponent(nome)}`);
    const abrir = page.getByRole('button', { name: nome, exact: true });
    await expect(abrir).toBeVisible();
    await page.route(`**/api/clientes/${cliente.id}/resumo`, (rota) => rota.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ erro: 'Falha QA' }) }));
    await abrir.click();
    const painel = page.getByRole('dialog', { name: 'Resumo do cliente' });
    await expect(painel.getByText('Não foi possível abrir o cliente')).toBeVisible();
    await painel.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(painel).toHaveCount(0);
    registrar('BTN-009', page, '.drawer-cliente-erro button:has-text("Fechar")', 'clicar em erro', 'painel fechado');
    await page.unroute(`**/api/clientes/${cliente.id}/resumo`);
    await abrir.click();
    await expect(painel.getByText(/Fonada · O.S./).first()).toBeVisible();
    await painel.locator('.drawer-atividade').first().getByRole('button').first().click();
    await expect(page).toHaveURL(new RegExp(`/fonada/${pedido.id}$`));
    registrar('BTN-013', page, '.drawer-atividade:first-of-type button', 'abrir mensagem em haver', 'pedido correspondente aberto');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(page.locator('.layout-overlay')).toBeVisible();
    await page.locator('.layout-overlay').click({ position: { x: 380, y: 400 } });
    await expect(page.locator('.layout-overlay')).toHaveCount(0);
    registrar('BTN-032', page, '.layout-overlay', 'clicar no fundo móvel', 'menu fechado');
  } finally {
    if (pedido) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('BTN-137/139/143/144/149/150: filtros, seleção e linha de clientes', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const nome = `TESTE_QA_CLIENTES_FINAIS_${Date.now()}`;
  const resp = await request.post('/api/clientes', { headers, data: { nome } });
  expect(resp.status()).toBe(201);
  const cliente = await resp.json();
  try {
    await page.goto('/clientes');
    await page.locator('.clientes-filtros-rapidos button').first().click();
    await expect(page.locator('.clientes-filtros-rapidos button').first()).toHaveAttribute('aria-pressed', 'true');
    registrar('BTN-137', page, '.clientes-filtros-rapidos button:first-child', 'aplicar filtro rápido', 'filtro marcado');
    await page.getByRole('button', { name: 'Limpar tudo' }).click();
    await expect(page.locator('.clientes-filtros-rapidos button').first()).toHaveAttribute('aria-pressed', 'false');
    await page.getByLabel('Nome', { exact: true }).fill(nome);
    await expect(page.getByRole('button', { name: nome, exact: true })).toBeVisible();
    await page.getByLabel(`Selecionar ${nome}`).check();
    await expect(page.getByRole('button', { name: 'Limpar seleção' })).toBeVisible();
    await page.getByRole('button', { name: 'Limpar seleção' }).click();
    await expect(page.getByRole('button', { name: 'Limpar seleção' })).toHaveCount(0);
    registrar('BTN-139', page, 'button:has-text("Limpar seleção")', 'limpar seleção', 'barra de seleção desapareceu');
    await page.locator('tr').filter({ has: page.getByRole('button', { name: nome, exact: true }) }).locator('td[data-label="Selecionar"]').click();
    await expect(page).toHaveURL(/\/clientes(?:\?.*)?$/);
    registrar('BTN-150', page, 'td[data-label="Selecionar"]', 'clicar célula', 'não abriu ficha nem painel');
    await page.locator('tr').filter({ has: page.getByRole('button', { name: nome, exact: true }) }).click();
    await expect(page.getByRole('dialog', { name: 'Resumo do cliente' })).toBeVisible();
    registrar('BTN-149', page, 'tr:has(button:has-text("TESTE_QA_CLIENTES_FINAIS"))', 'clicar linha', 'painel do cliente aberto');
    await page.getByRole('button', { name: 'Fechar painel' }).click();
    await page.getByLabel('Nome', { exact: true }).fill('QA_NENHUM_RESULTADO_999');
    await expect(page.getByRole('button', { name: 'Limpar filtros' })).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('');
    registrar('BTN-143', page, 'button:has-text("Limpar filtros")', 'clicar no vazio', 'busca limpa');
    await page.getByLabel('Nome', { exact: true }).fill('QA_NENHUM_RESULTADO_999');
    await page.getByRole('button', { name: 'Novo cliente' }).last().click();
    await expect(page).toHaveURL(/\/clientes\/novo$/);
    registrar('BTN-144', page, '.estado-vazio-acao button:has-text("Novo cliente")', 'clicar no vazio', 'cadastro aberto');
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('BTN-157/159: linha e área de ações da lixeira', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const nome = `TESTE_QA_LIXEIRA_FINAL_${Date.now()}`;
  const resp = await request.post('/api/clientes', { headers, data: { nome } });
  expect(resp.status()).toBe(201);
  const cliente = await resp.json();
  try {
    expect((await request.delete(`/api/clientes/${cliente.id}`, { headers })).status()).toBe(200);
    await page.goto('/clientes/lixeira');
    const linha = page.getByRole('row').filter({ hasText: nome });
    await expect(linha).toBeVisible();
    await linha.locator('.lixeira-acoes').click();
    await expect(linha.getByRole('button', { name: `Mostrar pedidos de ${nome}` })).toBeVisible();
    registrar('BTN-159', page, '.lixeira-acoes', 'clicar na área de ações', 'linha permaneceu fechada');
    await linha.click();
    await expect(linha.getByRole('button', { name: `Ocultar pedidos de ${nome}` })).toBeVisible();
    registrar('BTN-157', page, 'tr:has-text("TESTE_QA_LIXEIRA_FINAL")', 'clicar linha', 'detalhes expandidos');
  } finally {
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('BTN-231/232: recarga de erro e estado vazio de usuários', async ({ page }) => {
  const segredoTeste = process.env.QA_E2E_MASTER_PASSWORD;
  test.skip(!segredoTeste, 'Exige senha mestra QA.');
  let falhar = true;
  await page.route('**/api/auth/usuarios', (rota) => falhar
    ? rota.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ erro: 'Falha QA' }) })
    : rota.fulfill({ status: 200, contentType: 'application/json', body: '{"usuarios":[]}' }));
  await page.goto('/gerenciar-usuarios');
  await page.getByLabel('Senha mestra').fill(segredoTeste);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  falhar = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Nenhum usuário cadastrado')).toBeVisible();
  registrar('BTN-231', page, 'button:has-text("Tentar novamente")', 'recarregar', 'estado vazio carregado');
  await page.getByRole('button', { name: 'Criar usuário' }).click();
  await expect(page.getByLabel('Usuário (login) *')).toBeVisible();
  registrar('BTN-232', page, '.estado-vazio-acao button:has-text("Criar usuário")', 'abrir formulário', 'campos de cadastro visíveis');
});
