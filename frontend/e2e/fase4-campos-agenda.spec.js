import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

test('FIELD-009/010: horário e observação do lembrete persistem e reabrem', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const titulo = `TESTE_QA_FIELDS_AGENDA_${Date.now()}`;
  let id;
  try {
    await page.getByRole('button', { name: '+ Lembrete', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Novo lembrete' });
    await modal.getByLabel('Título *').fill(titulo);
    await modal.locator('#lembrete-horario').focus();
    await modal.locator('#lembrete-horario').fill('14:35');
    await modal.locator('#lembrete-observacao').focus();
    await modal.locator('#lembrete-observacao').fill('Observação QA inicial');
    const resposta = page.waitForResponse((r) => r.url().endsWith('/api/agenda/lembretes') && r.request().method() === 'POST');
    await modal.getByRole('button', { name: 'Salvar lembrete' }).click();
    const criado = await resposta;
    expect(criado.status()).toBe(201);
    const dados = await criado.json();
    id = dados.id;
    expect(dados.horario).toBe('14:35');
    expect(dados.observacao).toBe('Observação QA inicial');
    await page.reload();
    await page.getByText(titulo).first().click();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    const edicao = page.getByRole('dialog', { name: 'Editar lembrete' });
    await expect(edicao.locator('#lembrete-horario')).toHaveValue('14:35');
    await expect(edicao.locator('#lembrete-observacao')).toHaveValue('Observação QA inicial');
    registrar('FIELD-009', page, '#lembrete-horario', 'foco/preencher/salvar/reabrir', 'horário 14:35 persistido');
    registrar('FIELD-010', page, '#lembrete-observacao', 'foco/preencher/salvar/reabrir', 'observação persistida');
  } finally { if (id) await request.delete(`/api/agenda/lembretes/${id}`, { headers }); }
});
