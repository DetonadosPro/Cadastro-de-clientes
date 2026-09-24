import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { usuario, senha, isolado, entrar, criarOperadorDeTeste } from './apoio.js';

test('API atribui O.S. distinta a pedidos paralelos mesmo sem número enviado', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_OS_API_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  const futura = new Date();
  futura.setDate(futura.getDate() + 7);
  const dia = `${String(futura.getDate()).padStart(2, '0')}/${String(futura.getMonth() + 1).padStart(2, '0')}/${String(futura.getFullYear()).slice(-2)}`;
  try {
    for (const caso of [
      { recurso: 'fonadas', campo: 'senha_os', dados: { valor: 10, cobranca: dia, periodo: 'MANHÃ' } },
      { recurso: 'ao-vivo', campo: 'numero_os', dados: { valor: 10, dia_entrega: dia } },
    ]) {
      const respostas = await Promise.all([0, 1].map(() => request.post(`/api/${caso.recurso}`, {
        headers, data: { cliente_id: cliente.id, ...caso.dados },
      })));
      expect(respostas.map((r) => r.status())).toEqual([201, 201]);
      const criados = await Promise.all(respostas.map((r) => r.json()));
      pedidos.push(...criados.map((p) => ({ recurso: caso.recurso, id: p.id })));
      expect(criados[0][caso.campo]).toBeTruthy();
      expect(criados[1][caso.campo]).toBeTruthy();
      expect(criados[0][caso.campo]).not.toBe(criados[1][caso.campo]);
    }
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('pedido fonada rejeita data impossível e persiste data válida', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige QA_E2E_ISOLATED_DB=1 e banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_PEDIDO_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  let pedidoId;
  try {
    await page.goto(`/fonada/novo?clienteId=${cliente.id}`);
    await page.getByRole('heading', { name: 'Novo pedido' }).waitFor();
    await page.locator('.input-valor-destaque').fill('10000');
    await page.locator('.campo-cobranca-fonada input').fill('310426');
    await page.locator('.form-row').filter({ hasText: 'Período:' }).locator('input').fill('MANHÃ');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Dia de cobrança precisa ser uma data válida.')).toBeVisible();
    await expect(page).toHaveURL(/\/fonada\/novo/);
    const futura = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 7); return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`; });
    await page.locator('.campo-cobranca-fonada input').fill(futura);
    let requisicoes = 0;
    await page.route('**/api/fonadas', async (route) => {
      if (route.request().method() === 'POST') {
        requisicoes++;
        await new Promise((resolver) => setTimeout(resolver, 600));
      }
      await route.continue();
    });
    await page.evaluate(() => {
      const botao = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Salvar');
      botao.click();
      botao.click();
    });
    await page.waitForURL(/\/fonada\/\d+$/);
    expect(requisicoes).toBe(1);
    pedidoId = Number(new URL(page.url()).pathname.split('/').pop());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Editar pedido' })).toBeVisible();
    const lido = await request.get(`/api/fonadas/${pedidoId}`, { headers });
    expect(lido.status()).toBe(200);
    expect((await lido.json()).cobranca).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
    const invalido = await request.put(`/api/fonadas/${pedidoId}`, { headers, data: { cobranca: '31/04/26' } });
    expect(invalido.status()).toBe(400);
  } finally {
    if (pedidoId) await request.delete(`/api/fonadas/${pedidoId}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('pedido ao vivo valida data do evento e mantém o registro após recarga', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const respostaCliente = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_AOVIVO_${Date.now()}` } });
  expect(respostaCliente.status()).toBe(201);
  const cliente = await respostaCliente.json();
  let pedidoId;
  try {
    await page.goto(`/ao-vivo/novo?clienteId=${cliente.id}`);
    await page.getByRole('heading', { name: 'Novo pedido' }).waitFor();
    await page.locator('.campo-valor-aovivo').fill('12500');
    await page.locator('.campo-dia-aovivo input').fill('310426');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('O dia do evento precisa ser uma data válida.')).toBeVisible();
    await expect(page).toHaveURL(/\/ao-vivo\/novo/);
    const futura = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 7); return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`; });
    await page.locator('.campo-dia-aovivo input').fill(futura);
    let requisicoes = 0;
    await page.route('**/api/ao-vivo', async (route) => {
      if (route.request().method() === 'POST') {
        requisicoes++;
        await new Promise((resolver) => setTimeout(resolver, 600));
      }
      await route.continue();
    });
    await page.evaluate(() => {
      const botao = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Salvar');
      botao.click();
      botao.click();
    });
    await page.waitForURL(/\/ao-vivo\/\d+$/);
    expect(requisicoes).toBe(1);
    pedidoId = Number(new URL(page.url()).pathname.split('/').pop());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Editar pedido' })).toBeVisible();
    const lido = await request.get(`/api/ao-vivo/${pedidoId}`, { headers });
    expect(lido.status()).toBe(200);
    expect((await lido.json()).dia_entrega).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
    const invalido = await request.put(`/api/ao-vivo/${pedidoId}`, { headers, data: { dia_entrega: '31/04/26' } });
    expect(invalido.status()).toBe(400);
  } finally {
    if (pedidoId) await request.delete(`/api/ao-vivo/${pedidoId}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
