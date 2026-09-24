import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar } from './apoio.js';

test('falha de rede mostra mensagem clara e permite tentar novamente', async ({ page }) => {
  await entrar(page);
  await page.route('**/api/clientes?**', (route) => route.abort('failed'));
  await page.goto('/clientes');
  const aviso = page.getByRole('alert').filter({ hasText: 'Não foi possível atualizar os clientes' });
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('Não foi possível conectar ao servidor.');
  await page.unroute('**/api/clientes?**');
  await aviso.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(aviso).toHaveCount(0);
});
