import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('clientes: busca sem acento, telefone, filtros, ordenação e nome extenso', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const chave = Date.now();
  const nomes = [
    `TESTE_QA_José_${chave}`,
    `TESTE_QA_JOSE_${chave}`,
    `TESTE_QA_${'A'.repeat(180)}_${chave}`,
  ];
  const ids = [];
  try {
    for (const [indice, nome] of nomes.entries()) {
      const resposta = await request.post('/api/clientes', {
        headers,
        data: { nome, whatsapp: indice === 0 ? '34999999999' : null, nascimento: indice === 0 ? '15/04/90' : null },
      });
      expect(resposta.status()).toBe(201);
      ids.push((await resposta.json()).id);
    }
    const consulta = await request.get('/api/clientes?busca=jose&ordenarPor=nome&direcao=asc', { headers });
    expect(consulta.status()).toBe(200);
    const encontrados = (await consulta.json()).clientes.map((c) => c.id);
    expect(encontrados).toContain(ids[0]);
    expect(encontrados).toContain(ids[1]);

    await page.goto('/clientes');
    await page.locator('#cliente-busca').fill('jose');
    await expect(page).toHaveURL(/busca=jose/);
    await expect(page.getByText(nomes[0]).first()).toBeVisible();
    await expect(page.getByText(nomes[1]).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('#cliente-busca')).toHaveValue('jose');
    await expect(page.getByText(nomes[0]).first()).toBeVisible();
    await page.getByRole('button', { name: 'Limpar tudo' }).click();
    await page.locator('#cliente-telefone').fill('34 99999-9999');
    await expect(page.getByText(nomes[0]).first()).toBeVisible();
    await expect(page.getByText(nomes[1])).toHaveCount(0);
    await page.getByRole('button', { name: 'Limpar tudo' }).click();
    await page.locator('#cliente-aniversario').fill('1504');
    await expect(page.getByText(nomes[0]).first()).toBeVisible();
    await page.getByRole('button', { name: 'Limpar tudo' }).click();
    await page.locator('#cliente-busca').fill(chave.toString());
    await expect(page.getByText(nomes[2]).first()).toBeVisible();
    await page.setViewportSize({ width: 320, height: 700 });
    const largura = await page.evaluate(() => ({ tela: document.documentElement.clientWidth, pagina: document.documentElement.scrollWidth }));
    expect(largura.pagina).toBeLessThanOrEqual(largura.tela + 1);
  } finally {
    for (const id of ids) {
      await request.delete(`/api/clientes/${id}`, { headers });
      await request.delete(`/api/clientes/${id}/definitivo`, { headers });
    }
  }
});
