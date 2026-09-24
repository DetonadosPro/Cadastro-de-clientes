import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { usuario, senha, isolado, entrar, criarOperadorDeTeste } from './apoio.js';

test('Agenda: lembrete pode ser criado, concluído, editado e excluído', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const titulo = `TESTE_QA_LEMBRETE_${Date.now()}`;
  let lembreteId;
  try {
    await page.getByRole('button', { name: '+ Lembrete', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Título *').fill(titulo);
    const resposta = page.waitForResponse((r) => r.url().endsWith('/api/agenda/lembretes') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Salvar lembrete' }).click();
    const criado = await resposta;
    expect(criado.status()).toBe(201);
    lembreteId = (await criado.json()).id;
    await expect(page.getByText(titulo).first()).toBeVisible();
    await page.getByText(titulo).first().click();
    await page.getByRole('button', { name: 'Marcar concluído' }).click();
    await page.getByRole('button', { name: /Concluídos/ }).click();
    await page.getByText(titulo).first().click();
    await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible();
    await page.getByRole('button', { name: 'Reabrir' }).click();
    await page.getByText(titulo).first().click();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByLabel('Título *').fill(`${titulo}_EDITADO`);
    await page.getByRole('button', { name: 'Salvar lembrete' }).click();
    await expect(page.getByText(`${titulo}_EDITADO`).first()).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByText(`${titulo}_EDITADO`)).toHaveCount(0);
  } finally {
    if (lembreteId) await request.delete(`/api/agenda/lembretes/${lembreteId}`, { headers });
  }
});
