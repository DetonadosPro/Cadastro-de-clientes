import { test, expect } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entrar, isolado } from './apoio.js';

const evidencia = resolve('../docs/auditoria/evidencias/interacoes-fase4-qa.ndjson');
function registrar(id, page, evento, efeito) {
  appendFileSync(evidencia, `${JSON.stringify({ id, timestamp: new Date().toISOString(), rota: new URL(page.url()).pathname,
    locator: 'role=dialog', texto: id, evento, efeitoObservado: efeito, teste: test.info().title })}\n`);
}
async function conferirViewports(page, dialogo, acao) {
  await dialogo.evaluate(async (el) => Promise.all(el.getAnimations().map((animacao) => animacao.finished.catch(() => {}))));
  for (const [width, height] of [[1440, 900], [390, 844], [320, 480]]) {
    await page.setViewportSize({ width, height });
    const caixa = await dialogo.boundingBox();
    expect(caixa).toBeTruthy();
    expect(caixa.x).toBeGreaterThanOrEqual(-1);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(width + 1);
    expect(caixa.y).toBeGreaterThanOrEqual(-1);
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(height + 1);
    await acao.scrollIntoViewIfNeeded();
    const botao = await acao.boundingBox();
    expect(botao).toBeTruthy();
    expect(botao.y + botao.height).toBeLessThanOrEqual(height + 1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('MODAL-001: painel do cliente fecha e navega com foco contido em desktop e mobile', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const nome = `TESTE_QA_MODAL_001_${Date.now()}`;
  const resposta = await request.post('/api/clientes', { headers, data: { nome } });
  expect(resposta.status()).toBe(201);
  const cliente = await resposta.json();
  try {
    await page.goto(`/clientes?busca=${encodeURIComponent(nome)}`);
    const abrir = page.getByRole('button', { name: nome, exact: true });
    const abrirPainel = async () => {
      await abrir.click();
      const painel = page.getByRole('dialog', { name: 'Resumo do cliente' });
      await expect(painel.getByRole('heading', { name: nome })).toBeVisible();
      return painel;
    };
    let painel = await abrirPainel();
    await expect(painel.getByRole('button', { name: 'Fechar painel' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => painel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(() => painel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await conferirViewports(page, painel, painel.getByRole('button', { name: 'Ficha completa' }));
    registrar('MODAL-001', page, 'abrir/foco/mobile', 'cliente correto, foco contido, ações alcançáveis em 390×844 e 320×480');

    await painel.getByRole('button', { name: 'Fechar painel' }).click();
    await expect(painel).toHaveCount(0);
    await expect(abrir).toBeFocused();
    registrar('MODAL-001', page, 'fechar X', 'painel fechado e foco devolvido');
    painel = await abrirPainel();
    await page.keyboard.press('Escape');
    await expect(painel).toHaveCount(0);
    await expect(abrir).toBeFocused();
    registrar('MODAL-001', page, 'Escape', 'painel fechado e foco devolvido');
    painel = await abrirPainel();
    await page.locator('.drawer-cliente-overlay').click({ position: { x: 2, y: 2 } });
    await expect(painel).toHaveCount(0);
    await expect(abrir).toBeFocused();
    registrar('MODAL-001', page, 'clique externo', 'painel fechado e foco devolvido');
    painel = await abrirPainel();
    await painel.getByRole('button', { name: 'Ficha completa' }).click();
    await expect(page).toHaveURL(new RegExp(`/clientes/${cliente.id}$`));
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
    registrar('MODAL-001', page, 'ação principal', 'ficha correta aberta sem alterar cliente');
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('MODAL-002: busca global fecha por teclado/fundo e executa resultado', async ({ page }) => {
  await entrar(page);
  const abrir = page.getByRole('button', { name: 'Abrir busca global' });
  const abrirBusca = async () => {
    await abrir.click();
    const busca = page.getByRole('dialog', { name: 'Busca global' });
    await expect(busca).toBeVisible();
    await expect(busca.getByRole('textbox', { name: /Buscar no sistema/ })).toBeFocused();
    return busca;
  };
  let busca = await abrirBusca();
  await conferirViewports(page, busca, busca.getByRole('button', { name: /Abrir Agenda/ }));
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => busca.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => busca.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  registrar('MODAL-002', page, 'abrir/foco/mobile', 'campo focado, resultados e foco contidos em desktop/390×844/320×480');

  await page.keyboard.press('Escape');
  await expect(busca).toHaveCount(0);
  await expect(abrir).toBeFocused();
  registrar('MODAL-002', page, 'Escape', 'busca fechada e foco devolvido');
  busca = await abrirBusca();
  await page.locator('.command-overlay').click({ position: { x: 2, y: 2 } });
  await expect(busca).toHaveCount(0);
  await expect(abrir).toBeFocused();
  registrar('MODAL-002', page, 'clique externo', 'busca fechada e foco devolvido');
  busca = await abrirBusca();
  await busca.getByRole('textbox', { name: /Buscar no sistema/ }).fill('Relatórios');
  await busca.getByRole('button', { name: /Abrir Relatórios/ }).click();
  await expect(page).toHaveURL(/\/relatorios$/);
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
  registrar('MODAL-002', page, 'selecionar resultado', 'rota Relatórios aberta');
});
