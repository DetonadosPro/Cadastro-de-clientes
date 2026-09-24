import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar } from './apoio.js';

test('diálogo da Agenda mantém foco no teclado, fecha com Escape e devolve foco', async ({ page }) => {
  await entrar(page);
  const abrir = page.getByRole('button', { name: '+ Lembrete', exact: true });
  await abrir.focus();
  await page.keyboard.press('Enter');
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialogo.getByRole('button', { name: 'Fechar' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialogo.getByRole('button', { name: 'Salvar lembrete' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  await expect(abrir).toBeFocused();
});

test('layout e ações principais permanecem acessíveis em escala visual de 200%', async ({ page }) => {
  await entrar(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await page.goto('/clientes');
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  const dimensoes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    conteudo: document.documentElement.scrollWidth,
  }));
  expect(dimensoes.conteudo).toBeLessThanOrEqual(dimensoes.viewport + 1);
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Novo cliente/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Novo cliente' })).toBeVisible();
});
