import { test, expect } from '@playwright/test';
import { entrar } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

test('BTN-035: limite de erro recarrega a página após falha de renderização', async ({ page }) => {
  await entrar(page);
  let falhar = true;
  await page.route('**/api/relatorios/desempenho?*', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(falhar ? { funcionarios: null, valorEquipe: 0 } : { funcionarios: [], valorEquipe: 0 }) }));
  await page.goto('/relatorios?aba=desempenho&inicio=01%2F09%2F26&fim=23%2F09%2F26');
  await expect(page.getByRole('button', { name: 'Recarregar' })).toBeVisible();
  falhar = false;
  const recarga = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Recarregar' }).click();
  await recarga;
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recarregar' })).toHaveCount(0);
  registrar('BTN-035', page, 'button:has-text("Recarregar")', 'recarregar após erro de renderização', 'página restabelecida');
});
