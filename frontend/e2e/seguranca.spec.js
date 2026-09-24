import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('nome com HTML é exibido como texto e busca suspeita não altera a consulta', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const nome = '<img src=x onerror=window.__qaInjected=1> TESTE QA';
  const criado = await request.post('/api/clientes', { headers, data: { nome } });
  expect(criado.status()).toBe(201);
  const cliente = await criado.json();
  try {
    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
    expect(await page.evaluate(() => window.__qaInjected)).toBeUndefined();
    await expect(page.locator('img[onerror]')).toHaveCount(0);

    const busca = await request.get(`/api/clientes?busca=${encodeURIComponent("' OR '1'='1")}`, { headers });
    expect(busca.status()).toBe(200);
    expect((await busca.json()).total).toBe(0);
    const semSessao = await request.get(`/api/clientes/${cliente.id}`);
    expect(semSessao.status()).toBe(401);
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
