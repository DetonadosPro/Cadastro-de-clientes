import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

test('BTN-020/021: paginação real de clientes', async ({ page, request }) => {
  test.setTimeout(120000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const prefixo = `TESTE_QA_PAG_${Date.now()}_`;
  const ids = [];
  try {
    for (let n = 0; n < 31; n += 1) {
      const resposta = await request.post('/api/clientes', { headers, data: { nome: `${prefixo}${String(n).padStart(2, '0')}` } });
      expect(resposta.status()).toBe(201);
      ids.push((await resposta.json()).id);
    }
    await page.goto(`/clientes?busca=${encodeURIComponent(prefixo)}`);
    const paginacao = page.getByRole('navigation', { name: 'Paginação' });
    await expect(paginacao.getByRole('button', { name: 'Próxima →' })).toBeEnabled();
    await paginacao.getByRole('button', { name: 'Próxima →' }).click();
    await expect(page).toHaveURL(/pagina=2/);
    await expect(page.getByRole('button', { name: `${prefixo}30`, exact: true })).toBeVisible();
    registrar('BTN-021', page, 'nav[aria-label="Paginação"] button:has-text("Próxima")', 'próxima página', '31º cliente na página 2');
    await paginacao.getByRole('button', { name: '← Anterior' }).click();
    await expect(page).toHaveURL(/pagina=1/);
    await expect(page.getByRole('button', { name: `${prefixo}00`, exact: true })).toBeVisible();
    registrar('BTN-020', page, 'nav[aria-label="Paginação"] button:has-text("Anterior")', 'página anterior', 'primeiro cliente na página 1');
  } finally {
    for (const id of ids) {
      await request.delete(`/api/clientes/${id}`, { headers });
      await request.delete(`/api/clientes/${id}/definitivo`, { headers });
    }
  }
});

test('BTN-132/133/134/135/265: erro, sugestão, comparação e notificação', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const prefixo = `TESTE_QA_DUP_FINAL_${Date.now()}`;
  const clientes = [];
  try {
    for (let i = 0; i < 2; i += 1) {
      const resposta = await request.post('/api/clientes', { headers, data: { nome: `${prefixo}_${i}`, nascimento: '01/01/90' } });
      expect(resposta.status()).toBe(201); clientes.push(await resposta.json());
    }
    let falharConsulta = true;
    let falharDescartar = true;
    await page.route('**/api/clientes/possiveis-duplicatas*', (rota) => falharConsulta
      ? rota.fulfill({ status: 503, contentType: 'application/json', body: '{"erro":"Falha QA"}' })
      : rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pares: [{ a: clientes[0], b: clientes[1] }] }) }));
    await page.route('**/api/clientes/descartar-duplicata', (rota) => falharDescartar
      ? rota.fulfill({ status: 503, contentType: 'application/json', body: '{"erro":"Falha QA"}' })
      : rota.continue());
    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Revisar duplicatas' }).click();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    falharConsulta = false;
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByRole('button', { name: 'Não é duplicata' })).toBeVisible();
    registrar('BTN-132', page, 'button:has-text("Tentar novamente")', 'repetir consulta', 'sugestão de duplicata carregada');
    await page.getByRole('button', { name: /possível duplicata encontrada/ }).click();
    await expect(page.getByRole('button', { name: 'Não é duplicata' })).toHaveCount(0);
    registrar('BTN-133', page, 'button:has-text("possível duplicata encontrada")', 'recolher painel', 'sugestões ocultas');
    await page.getByRole('button', { name: 'Revisar duplicatas' }).click();
    await page.getByRole('button', { name: 'Comparar e mesclar' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    registrar('BTN-135', page, 'button:has-text("Comparar e mesclar")', 'abrir comparação', 'diálogo de mescla aberto');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Não é duplicata' }).click();
    await expect(page.getByRole('button', { name: 'Fechar notificação' })).toBeVisible();
    await page.getByRole('button', { name: 'Fechar notificação' }).click();
    await expect(page.getByRole('button', { name: 'Fechar notificação' })).toHaveCount(0);
    registrar('BTN-265', page, 'button[aria-label="Fechar notificação"]', 'fechar toast de erro', 'notificação removida');
    await expect(page.getByRole('button', { name: 'Não é duplicata' })).toBeVisible();
    falharDescartar = false;
    await page.getByRole('button', { name: 'Não é duplicata' }).click();
    await expect(page.getByRole('button', { name: 'Não é duplicata' })).toHaveCount(0);
    const par = await request.get('/api/clientes/possiveis-duplicatas', { headers });
    expect(par.status()).toBe(200);
    registrar('BTN-134', page, 'button:has-text("Não é duplicata")', 'descartar sugestão', 'sugestão removida da interface');
  } finally {
    for (const cliente of clientes) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});

test('BTN-264: nova versão oferece atualização imediata', async ({ page }) => {
  await page.route('**/version.json*', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: '{"versao":"QA-VERSAO-DIFERENTE"}' }));
  await entrar(page);
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeVisible();
  const carregou = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await carregou;
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeVisible();
  registrar('BTN-264', page, 'button:has-text("Atualizar agora")', 'recarregar após aviso de versão', 'documento recarregado');
});
