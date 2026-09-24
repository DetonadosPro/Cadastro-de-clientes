import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('Cobrança Fonada registra e desfaz baixa pela interface sem aceitar versão antiga', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const nome = `TESTE_QA_COB_FONADA_UI_${Date.now()}`;
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  let pedido;
  try {
    const pedidoResposta = await request.post('/api/fonadas', { headers, data: {
      cliente_id: cliente.id, valor: 19.99, cobranca: '22/09/26', periodo: 'MANHÃ',
    } });
    expect(pedidoResposta.status()).toBe(201);
    pedido = await pedidoResposta.json();
    await page.goto(`/cobranca?nome=${encodeURIComponent(nome)}`);
    await expect(page.getByText(nome).first()).toBeVisible();
    await page.getByRole('button', { name: 'Dar baixa', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Dar baixa — ${nome}` })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    expect((await (await request.get(`/api/fonadas/${pedido.id}`, { headers })).json()).pagou).not.toBe('SIM');
    await page.getByRole('button', { name: 'Dar baixa', exact: true }).click();
    await page.getByPlaceholder('Observação do recebimento...').fill('Recebido pela operadora QA');
    await page.getByRole('button', { name: 'Confirmar baixa' }).click();
    await expect(page.getByText('BAIXA DADA COM SUCESSO')).toBeVisible();
    let atual = await (await request.get(`/api/fonadas/${pedido.id}`, { headers })).json();
    expect(atual.pagou).toBe('SIM');
    expect(atual.recebi).toBe('Recebido pela operadora QA');
    expect(atual.data_pagamento).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
    const versaoPaga = atual.versao;

    await page.getByRole('button', { name: 'Recebidas', exact: true }).click();
    await expect(page.getByText(nome).first()).toBeVisible();
    await page.getByRole('button', { name: 'Desfazer baixa', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Desfazer baixa — O.S. ${pedido.senha_os}` })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    expect((await (await request.get(`/api/fonadas/${pedido.id}`, { headers })).json()).pagou).toBe('SIM');
    await page.getByRole('button', { name: 'Desfazer baixa', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar desfazer' }).click();
    await expect(page.getByText('BAIXA DESFEITA COM SUCESSO')).toBeVisible();
    atual = await (await request.get(`/api/fonadas/${pedido.id}`, { headers })).json();
    expect(atual.pagou).toBe('NÃO');
    expect(atual.recebi).toBeNull();
    expect(atual.data_pagamento).toBeNull();
    expect(atual.versao).toBe(versaoPaga + 1);
    const obsoleto = await request.put(`/api/cobranca/${pedido.id}/baixa`, { headers, data: { pagou: 'SIM', dataPagamento: '22/09/26', versao: versaoPaga } });
    expect(obsoleto.status()).toBe(409);
  } finally {
    if (pedido) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
