import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('lixeira restaura cliente e os dois tipos de pedido após recarga', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const nome = `TESTE_QA_RESTAURAR_${Date.now()}`;
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  try {
    const futura = new Date();
    futura.setDate(futura.getDate() + 7);
    const dia = `${String(futura.getDate()).padStart(2, '0')}/${String(futura.getMonth() + 1).padStart(2, '0')}/${String(futura.getFullYear()).slice(-2)}`;
    for (const recurso of ['fonadas', 'ao-vivo']) {
      const dados = recurso === 'fonadas' ? { cobranca: dia, periodo: 'MANHÃ' } : { dia_entrega: dia };
      const criado = await request.post(`/api/${recurso}`, { headers, data: { cliente_id: cliente.id, valor: 42, ...dados } });
      expect(criado.status(), recurso).toBe(201);
      pedidos.push({ recurso, id: (await criado.json()).id });
    }
    expect((await request.delete(`/api/clientes/${cliente.id}`, { headers })).status()).toBe(200);
    await page.goto('/clientes/lixeira');
    await expect(page.getByText(nome).first()).toBeVisible();
    const expandir = page.getByRole('button', { name: `Mostrar pedidos de ${nome}` });
    await expandir.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('FONADA (1)')).toBeVisible();
    await expect(page.getByText('AO VIVO (1)')).toBeVisible();
    await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
    await expect(page.getByText(nome)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(nome)).toHaveCount(0);
    const lido = await request.get(`/api/clientes/${cliente.id}`, { headers });
    expect(lido.status()).toBe(200);
    expect((await lido.json()).cliente.excluido_em).toBeNull();
    for (const pedido of pedidos) {
      const resposta = await request.get(`/api/${pedido.recurso}/${pedido.id}`, { headers });
      expect(resposta.status()).toBe(200);
      expect((await resposta.json()).excluido_em).toBeNull();
    }
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
