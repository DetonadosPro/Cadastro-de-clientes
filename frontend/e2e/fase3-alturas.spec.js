import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { entrar } from './apoio.js';

const tamanhos = [
  [320, 480], [360, 560], [1024, 600], [1280, 600], [1366, 650],
];
const rotas = ['/agenda', '/clientes', '/clientes/novo', '/cobranca', '/recall', '/relatorios', '/fonada', '/ao-vivo'];

test('alturas baixas conservam rolagem e acesso às ações das principais telas', async ({ page }) => {
  test.setTimeout(180000);
  await entrar(page);
  const evidencia = [];
  for (const [width, height] of tamanhos) {
    await page.setViewportSize({ width, height });
    for (const rota of rotas) {
      await page.goto(rota);
      await page.locator('.layout-pagina').waitFor();
      const controles = page.locator('.layout-pagina button:visible, .layout-pagina a[href]:visible, .layout-pagina input:visible, .layout-pagina select:visible');
      await expect.poll(() => controles.count()).toBeGreaterThan(0);
      await page.waitForTimeout(400);
      const ultimo = controles.last();
      await ultimo.evaluate((el) => el.scrollIntoView({ block: 'end' }));
      let box = await ultimo.boundingBox();
      for (let tentativa = 0; tentativa < 10 && box && (box.y < -1 || box.y + box.height > height + 1); tentativa += 1) {
        await page.mouse.move(Math.max(20, Math.min(width - 20, box.x + box.width / 2)), height - 40);
        await page.mouse.wheel(0, 450);
        await page.waitForTimeout(80);
        box = await ultimo.boundingBox();
      }
      const geometria = await page.evaluate(() => ({ larguraDocumento: document.documentElement.scrollWidth, larguraVisivel: document.documentElement.clientWidth }));
      const elemento = await ultimo.evaluate((el) => ({
        html: el.outerHTML.slice(0, 300), scroll: document.documentElement.scrollTop, janela: window.scrollY,
        conteudo: (() => { const c = document.querySelector('.layout-conteudo'); return { scrollTop: c.scrollTop, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight, overflowY: getComputedStyle(c).overflowY }; })(),
        painel: (() => { const c = el.closest('.painel-detalhes-agenda'); return c && { scrollTop: c.scrollTop, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight, overflowY: getComputedStyle(c).overflowY, rect: c.getBoundingClientRect().toJSON() }; })(),
      }));
      const resultado = { rota, width, height, ...geometria, elemento, ultimoVisivel: !!box && box.y >= -1 && box.y + box.height <= height + 1 };
      evidencia.push(resultado);
      fs.writeFileSync(path.resolve('../docs/auditoria/evidencias/alturas-qa.json'), JSON.stringify({ verificacoes: evidencia }, null, 2));
      expect(resultado.larguraDocumento).toBeLessThanOrEqual(resultado.larguraVisivel + 1);
      expect(resultado.ultimoVisivel, JSON.stringify({ ...resultado, box })).toBe(true);
    }
  }
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/agenda');
  await page.getByRole('button', { name: '+ Lembrete', exact: true }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  const salvar = dialogo.getByRole('button', { name: 'Salvar lembrete' });
  await salvar.scrollIntoViewIfNeeded();
  const box = await salvar.boundingBox();
  expect(box).toBeTruthy();
  expect(box.y + box.height).toBeLessThanOrEqual(481);
  await page.keyboard.press('Escape');
  fs.writeFileSync(path.resolve('../docs/auditoria/evidencias/alturas-qa.json'), JSON.stringify({ verificacoes: evidencia, modal320x480: true }, null, 2));
});
