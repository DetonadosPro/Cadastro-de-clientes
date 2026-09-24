import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { usuario, senha, isolado, entrar } from './apoio.js';

test('Cobrança rejeita datas inexistentes sem registrar pagamento ou reagendamento', async ({ request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  const login = await request.post('/api/auth/login', { data: { usuario, senha } });
  expect(login.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).token}` };
  const respostaCliente = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_COBRANCA_DATA_${Date.now()}` } });
  expect(respostaCliente.status()).toBe(201);
  const cliente = await respostaCliente.json();
  const pedidos = [];
  try {
    const dataFutura = new Date();
    dataFutura.setDate(dataFutura.getDate() + 7);
    const cobranca = `${String(dataFutura.getDate()).padStart(2, '0')}/${String(dataFutura.getMonth() + 1).padStart(2, '0')}/${String(dataFutura.getFullYear()).slice(-2)}`;
    const aoVivo = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 100 } });
    expect(aoVivo.status()).toBe(201);
    pedidos.push({ recurso: 'ao-vivo', id: (await aoVivo.json()).id });
    const fonada = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 100, cobranca, periodo: 'MANHÃ' } });
    expect(fonada.status()).toBe(201);
    pedidos.push({ recurso: 'fonadas', id: (await fonada.json()).id });

    const respostas = await Promise.all([
      request.put(`/api/cobranca/ao-vivo/${pedidos[0].id}/baixa`, { headers, data: { dataPagamento: '31/04/26', valorRecebido: 100, formaRecebimento: 'PIX' } }),
      request.put(`/api/cobranca/ao-vivo/${pedidos[0].id}/reagendar`, { headers, data: { dataCobranca: '31/09/26' } }),
      request.put(`/api/cobranca/${pedidos[1].id}/baixa`, { headers, data: { pagou: 'SIM', dataPagamento: '31/04/26' } }),
      request.put('/api/cobranca/acoes/baixa-lote', { headers, data: { ids: [pedidos[1].id], dataPagamento: '31/04/26' } }),
      request.put('/api/cobranca/acoes/reagendar-lote', { headers, data: { ids: [pedidos[1].id], cobrarDia: '31/09/26' } }),
    ]);
    expect(respostas.map((r) => r.status())).toEqual([400, 400, 400, 400, 400]);
    const lidoAoVivo = await request.get(`/api/ao-vivo/${pedidos[0].id}`, { headers });
    const lidoFonada = await request.get(`/api/fonadas/${pedidos[1].id}`, { headers });
    expect((await lidoAoVivo.json()).pagou).not.toBe('SIM');
    expect((await lidoFonada.json()).pagou).not.toBe('SIM');
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('Ao Vivo: pagamento pela interface persiste e pode ser desfeito', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const nome = `TESTE_QA_RECEBIMENTO_${Date.now()}`;
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  let pedidoId;
  try {
    const pedidoResposta = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 125.5 } });
    expect(pedidoResposta.status()).toBe(201);
    pedidoId = (await pedidoResposta.json()).id;
    await page.goto('/cobranca?sistema=AOVIVO');
    await page.getByRole('heading', { name: 'Cobrança' }).waitFor();
    await page.getByPlaceholder('Nome do comprador').fill(nome);
    await expect(page.getByText(nome).first()).toBeVisible();
    await page.getByRole('button', { name: 'Dar baixa', exact: true }).click();
    await expect(page.getByText(`Dar baixa — O.S.`)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await expect.poll(async () => {
      const resposta = await request.get(`/api/ao-vivo/${pedidoId}`, { headers });
      return (await resposta.json()).pagou;
    }).toBe('SIM');
    await page.reload();
    await page.getByRole('button', { name: 'Recebidas no mês' }).click();
    await page.getByPlaceholder('Nome do comprador').fill(nome);
    await expect(page.getByText(nome).first()).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Desfazer baixa' }).click();
    await expect.poll(async () => {
      const resposta = await request.get(`/api/ao-vivo/${pedidoId}`, { headers });
      return (await resposta.json()).pagou;
    }).not.toBe('SIM');
  } finally {
    if (pedidoId) await request.delete(`/api/ao-vivo/${pedidoId}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('baixa em lote é recusada integralmente com cliente bloqueado e aceita após desbloqueio', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const clientes = [];
  const pedidos = [];
  const data = new Date();
  data.setDate(data.getDate() + 7);
  const cobranca = `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${String(data.getFullYear()).slice(-2)}`;
  try {
    for (let i = 0; i < 2; i++) {
      const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_LOTE_${Date.now()}_${i}` } });
      expect(clienteResposta.status()).toBe(201);
      const cliente = await clienteResposta.json();
      clientes.push(cliente);
      const pedidoResposta = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 80 + i, cobranca, periodo: 'MANHÃ' } });
      expect(pedidoResposta.status()).toBe(201);
      pedidos.push(await pedidoResposta.json());
    }
    const ids = pedidos.map((p) => p.id);
    const bloqueio = await request.put(`/api/clientes/${clientes[1].id}/bloqueio`, { headers, data: { bloqueado: true, motivo: 'Teste QA' } });
    expect(bloqueio.status()).toBe(200);
    const recusada = await request.put('/api/cobranca/acoes/baixa-lote', { headers, data: { ids, recebi: 'Operador QA', dataPagamento: cobranca } });
    expect(recusada.status()).toBe(403);
    for (const pedido of pedidos) {
      const lido = await request.get(`/api/fonadas/${pedido.id}`, { headers });
      expect((await lido.json()).pagou).not.toBe('SIM');
    }
    expect((await request.put(`/api/clientes/${clientes[1].id}/bloqueio`, { headers, data: { bloqueado: false } })).status()).toBe(200);
    const baixa = await request.put('/api/cobranca/acoes/baixa-lote', { headers, data: { ids, recebi: 'Operador QA', dataPagamento: cobranca } });
    expect(baixa.status()).toBe(200);
    expect((await baixa.json()).quantidade).toBe(2);
    for (const pedido of pedidos) {
      const lido = await request.get(`/api/fonadas/${pedido.id}`, { headers });
      const atual = await lido.json();
      expect(atual.pagou).toBe('SIM');
      expect(atual.data_pagamento).toBe(cobranca);
    }
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    for (const cliente of clientes) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
