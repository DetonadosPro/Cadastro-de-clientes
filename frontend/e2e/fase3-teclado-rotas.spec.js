import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { usuario, senha, isolado } from './apoio.js';

const arquivoEvidencia = path.resolve('../docs/auditoria/evidencias/teclado-rotas-qa.json');

async function tabAte(page, seletor, limite = 100) {
  for (let passos = 1; passos <= limite; passos += 1) {
    await page.keyboard.press('Tab');
    const foco = await page.evaluate((s) => document.activeElement?.matches(s), seletor);
    if (foco) return passos;
  }
  throw new Error(`Tab não alcançou ${seletor} em ${limite} passos`);
}

test('login e navegação principal funcionam somente com teclado', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Usuário', { exact: true })).toBeFocused();
  await page.keyboard.type(usuario);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
  await page.keyboard.type(senha);
  await tabAte(page, '.acesso-submit', 8);
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/agenda');

  // Após uma nova navegação o foco começa no documento. Percorremos a barra lateral
  // com Tab e acionamos os destinos com Enter, sem click() ou focus().
  for (const [nome, url] of [
    ['Clientes', '/clientes'], ['Cobrança', '/cobranca'], ['Recall', '/recall'],
    ['Relatórios', '/relatorios'], ['Fonada', '/fonada'], ['Ao vivo', '/ao-vivo'],
    ['Agenda', '/agenda'],
  ]) {
    await page.goto('/agenda');
    const seletor = `[aria-label="${nome}"]`;
    const passos = await tabAte(page, `.layout-nav ${seletor}`);
    expect(passos).toBeLessThan(25);
    await expect(page.locator(`.layout-nav ${seletor}`)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe(url);
  }
});

test('controles do conteúdo são alcançáveis e têm foco visível em todas as rotas', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  test.setTimeout(180000);
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/agenda');
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  let cliente;
  const evidencia = [];
  try {
    const criado = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_TECLADO_${Date.now()}` } });
    expect(criado.status()).toBe(201);
    cliente = await criado.json();
    const rotas = [
      '/agenda', '/clientes', '/clientes/novo', `/clientes/${cliente.id}`, '/clientes/lixeira',
      '/fonada', '/fonada/novo', '/fonada/hoje', '/ao-vivo', '/ao-vivo/novo',
      '/ao-vivo/hoje', '/cobranca', '/recall', '/relatorios',
    ];
    for (const rota of rotas) {
      await page.goto(rota);
      await page.locator('.layout-pagina').waitFor();
      const seletor = '.layout-pagina button:not([disabled]), .layout-pagina input:not([disabled]), .layout-pagina select:not([disabled]), .layout-pagina textarea:not([disabled]), .layout-pagina a[href], .layout-pagina [tabindex="0"]';
      if (['/fonada/hoje', '/ao-vivo/hoje'].includes(rota)) {
        await expect.poll(async () => (await page.locator(seletor).count()) > 0 ||
          (await page.getByRole('heading', { name: /Nenhum|Nenhuma/ }).count()) > 0).toBe(true);
        if (await page.locator(seletor).count() === 0) {
          evidencia.push({ rota, estado: 'vazio', controleOperacional: 'N/A' });
          continue;
        }
      }
      await expect.poll(async () => page.locator(seletor).count()).toBeGreaterThan(0);
      const passos = await tabAte(page, seletor, 120);
      const primeiro = await page.evaluate(() => ({ tag: document.activeElement?.tagName, texto: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 80) || '' }));
      expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      expect(await page.evaluate((s) => document.activeElement?.matches(s), seletor)).toBe(true);
      evidencia.push({ rota, passos, primeiro, focoVisivel: true, retornoShiftTab: true });
    }
    expect(evidencia).toHaveLength(rotas.length);
  } finally {
    fs.writeFileSync(arquivoEvidencia, JSON.stringify(evidencia, null, 2));
    if (cliente) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
