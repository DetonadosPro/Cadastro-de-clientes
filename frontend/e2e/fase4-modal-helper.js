import { expect, test } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const evidencia = resolve('../docs/auditoria/evidencias/interacoes-fase4-qa.ndjson');

export function registrar(id, page, locator, evento, efeito) {
  appendFileSync(evidencia, `${JSON.stringify({ id, timestamp: new Date().toISOString(), rota: new URL(page.url()).pathname,
    locator, texto: id, evento, efeitoObservado: efeito, teste: test.info().title })}\n`);
}

export async function verificarDialogo(page, dialogo, titulo, confirmar, cancelar = 'Cancelar') {
  await expect(dialogo).toBeVisible();
  await expect(dialogo.locator('h2')).toHaveText(titulo);
  await expect.poll(() => dialogo.evaluate((el) => el.contains(document.activeElement) || el === document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  for (const [width, height] of [[1440, 900], [390, 844], [320, 480]]) {
    await page.setViewportSize({ width, height });
    const caixa = await dialogo.boundingBox();
    expect(caixa).toBeTruthy();
    expect(caixa.x).toBeGreaterThanOrEqual(-1);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(width + 1);
    expect(caixa.y).toBeGreaterThanOrEqual(-1);
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(height + 1);
    for (const nome of [cancelar, confirmar]) {
      const acao = dialogo.getByRole('button', { name: nome });
      await acao.scrollIntoViewIfNeeded();
      const posicao = await acao.boundingBox();
      expect(posicao).toBeTruthy();
      expect(posicao.y + posicao.height).toBeLessThanOrEqual(height + 1);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

export async function exercitarFechamentos(page, id, abrir, titulo, confirmar, semEfeito, cancelar = 'Cancelar') {
  let dialogo = await abrir();
  await verificarDialogo(page, dialogo, titulo, confirmar, cancelar);
  registrar(id, page, 'role=dialog', 'abrir/foco/mobile', 'conteúdo, foco, Tab, Shift+Tab e ações visíveis em desktop/390×844/320×480');
  await dialogo.getByRole('button', { name: cancelar }).click();
  await expect(dialogo).toHaveCount(0);
  await semEfeito();
  registrar(id, page, `role=button[name=${cancelar}]`, 'cancelar', 'nenhuma alteração persistida');

  dialogo = await abrir();
  await dialogo.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialogo).toHaveCount(0);
  await semEfeito();
  registrar(id, page, 'role=button[name=Fechar]', 'fechar X', 'nenhuma alteração persistida');

  dialogo = await abrir();
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  await semEfeito();
  registrar(id, page, 'keyboard=Escape', 'Escape', 'nenhuma alteração persistida');

  dialogo = await abrir();
  // O clique no próprio backdrop evita depender da posição da janela durante
  // mudanças de viewport e ainda verifica o fechamento por clique externo.
  await page.locator('.dialogo-fundo').click({ position: { x: 2, y: 2 } });
  await expect(dialogo).toHaveCount(0);
  await semEfeito();
  registrar(id, page, '.dialogo-fundo', 'clique externo', 'nenhuma alteração persistida');
  return abrir();
}
