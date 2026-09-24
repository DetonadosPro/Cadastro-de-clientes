import { test, expect } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entrar, isolado } from './apoio.js';

const evidencia = resolve('../docs/auditoria/evidencias/interacoes-fase4-qa.ndjson');

function registrar(id, page, evento, efeito) {
  appendFileSync(evidencia, `${JSON.stringify({ id, timestamp: new Date().toISOString(), rota: new URL(page.url()).pathname,
    locator: 'role=dialog', texto: id, evento, efeitoObservado: efeito, teste: test.info().title })}\n`);
}

async function verificarDialogo(page, nome, botaoConfirmar) {
  const dialogo = page.getByRole('dialog', { name: nome });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.locator('h2')).toHaveText(nome);
  await expect.poll(() => dialogo.evaluate((el) => el.contains(document.activeElement) || el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  for (const [width, height] of [[390, 844], [320, 480]]) {
    await page.setViewportSize({ width, height });
    const geometria = await dialogo.boundingBox();
    expect(geometria).toBeTruthy();
    expect(geometria.x).toBeGreaterThanOrEqual(-1);
    expect(geometria.x + geometria.width).toBeLessThanOrEqual(width + 1);
    expect(geometria.y).toBeGreaterThanOrEqual(-1);
    expect(geometria.y + geometria.height).toBeLessThanOrEqual(height + 1);
    const confirmar = dialogo.getByRole('button', { name: botaoConfirmar });
    await confirmar.scrollIntoViewIfNeeded();
    const caixa = await confirmar.boundingBox();
    expect(caixa).toBeTruthy();
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(height + 1);
    await dialogo.getByRole('button', { name: 'Cancelar' }).scrollIntoViewIfNeeded();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  return dialogo;
}

async function cabecalhos(page) {
  return { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
}

test('MODAL-006: lembrete fecha por todos os caminhos e confirma apenas após salvar', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = await cabecalhos(page);
  const abrir = page.getByRole('button', { name: '+ Lembrete', exact: true });
  const titulo = `TESTE_QA_MODAL_006_${Date.now()}`;
  let id;
  const abrirModal = async () => { await abrir.click(); return verificarDialogo(page, 'Novo lembrete', 'Salvar lembrete'); };
  try {
    let dialogo = await abrirModal();
    registrar('MODAL-006', page, 'abrir/foco/mobile', 'título, foco, Tab, Shift+Tab e botões visíveis em 390×844 e 320×480');
    await dialogo.getByLabel('Título *').fill(titulo);
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(abrir).toBeFocused();
    registrar('MODAL-006', page, 'cancelar', 'diálogo fechado e foco devolvido sem criação');

    dialogo = await abrirModal();
    await dialogo.getByRole('button', { name: 'Fechar' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(abrir).toBeFocused();
    registrar('MODAL-006', page, 'fechar X', 'diálogo fechado e foco devolvido');

    dialogo = await abrirModal();
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
    await expect(abrir).toBeFocused();
    registrar('MODAL-006', page, 'Escape', 'diálogo fechado e foco devolvido');

    dialogo = await abrirModal();
    await page.locator('.dialogo-fundo').click({ position: { x: 2, y: 2 } });
    await expect(dialogo).toHaveCount(0);
    await expect(abrir).toBeFocused();
    registrar('MODAL-006', page, 'clique externo', 'diálogo fechado e foco devolvido');

    const consulta = await request.get('/api/agenda/hoje', { headers });
    expect(JSON.stringify(await consulta.json())).not.toContain(titulo);
    dialogo = await abrirModal();
    await dialogo.getByLabel('Título *').fill(titulo);
    const resposta = page.waitForResponse((r) => r.url().endsWith('/api/agenda/lembretes') && r.request().method() === 'POST');
    await dialogo.getByRole('button', { name: 'Salvar lembrete' }).click();
    const criado = await resposta;
    expect(criado.status()).toBe(201);
    id = (await criado.json()).id;
    await expect(page.getByText(titulo).first()).toBeVisible();
    registrar('MODAL-006', page, 'confirmar', `lembrete ${id} persistido e visível`);
  } finally {
    if (id) await request.delete(`/api/agenda/lembretes/${id}`, { headers });
  }
});

test('MODAL-015: bloqueio cancela sem alterar cadastro e confirmação persiste', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = await cabecalhos(page);
  const criado = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_MODAL_015_${Date.now()}` } });
  expect(criado.status()).toBe(201);
  const cliente = await criado.json();
  const abrir = async () => page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  try {
    await page.goto(`/clientes/${cliente.id}`);
    await abrir();
    let dialogo = await verificarDialogo(page, `Bloquear ${cliente.nome}`, 'Confirmar bloqueio');
    registrar('MODAL-015', page, 'abrir/foco/mobile', 'título, foco e ações visíveis nos dois viewports móveis');
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    expect((await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente.bloqueado).toBe(false);
    registrar('MODAL-015', page, 'cancelar', 'cliente permaneceu desbloqueado');
    await abrir();
    dialogo = page.getByRole('dialog');
    await dialogo.getByRole('button', { name: 'Fechar' }).click();
    await expect(dialogo).toHaveCount(0);
    await abrir();
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
    await abrir();
    await page.locator('.dialogo-fundo').click({ position: { x: 2, y: 2 } });
    await expect(dialogo).toHaveCount(0);
    registrar('MODAL-015', page, 'X/Escape/clique externo', 'diálogo fechado nos três caminhos sem bloqueio');
    await abrir();
    await dialogo.getByPlaceholder('Ex: não pagou, pediu para não ligarem mais...').fill('QA motivo');
    await dialogo.getByRole('button', { name: 'Confirmar bloqueio' }).click();
    await expect(page.getByRole('button', { name: 'Desbloquear' })).toBeVisible();
    const atual = (await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente;
    expect(atual.bloqueado).toBe(true);
    expect(atual.bloqueio_motivo).toBe('QA motivo');
    registrar('MODAL-015', page, 'confirmar', 'cliente bloqueado e motivo persistido');
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('MODAL-017: exclusão em lote preserva cliente no cancelamento e remove ao confirmar', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = await cabecalhos(page);
  const criado = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_MODAL_017_${Date.now()}` } });
  expect(criado.status()).toBe(201);
  const cliente = await criado.json();
  try {
    await page.goto(`/clientes?busca=${encodeURIComponent(cliente.nome)}`);
    await page.getByRole('row').filter({ hasText: cliente.nome }).getByRole('checkbox').check();
    const abrir = page.getByRole('button', { name: 'Enviar para lixeira' });
    await abrir.click();
    let dialogo = await verificarDialogo(page, 'Enviar para a lixeira?', 'Confirmar');
    registrar('MODAL-017', page, 'abrir/foco/mobile', 'título, foco e ações visíveis nos dois viewports móveis');
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    expect((await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente.excluido_em).toBeNull();
    registrar('MODAL-017', page, 'cancelar', 'cliente permaneceu ativo');
    await abrir.click();
    dialogo = page.getByRole('dialog');
    await dialogo.getByRole('button', { name: 'Fechar' }).click();
    await abrir.click();
    await page.keyboard.press('Escape');
    await abrir.click();
    await page.locator('.dialogo-fundo').click({ position: { x: 2, y: 2 } });
    registrar('MODAL-017', page, 'X/Escape/clique externo', 'diálogo fechado sem exclusão');
    await abrir.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByText(cliente.nome)).toHaveCount(0);
    const atual = (await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente;
    expect(atual.excluido_em).toBeTruthy();
    registrar('MODAL-017', page, 'confirmar', 'cliente enviado à lixeira e persistido');
  } finally {
    const lido = await request.get(`/api/clientes/${cliente.id}`, { headers });
    if (lido.status() === 200) {
      const atual = (await lido.json()).cliente;
      if (!atual.excluido_em) await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
