import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('handlers de impressão e reagendamento financeiro persistem nos dois sistemas', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_REAGENDAR_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  try {
    const fonadaResposta = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 18, cobranca: '01/12/26', periodo: 'MANHÃ' } });
    expect(fonadaResposta.status()).toBe(201);
    const fonada = await fonadaResposta.json();
    pedidos.push({ recurso: 'fonadas', id: fonada.id });
    const aoVivoResposta = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 27, dia_entrega: '01/12/26' } });
    expect(aoVivoResposta.status()).toBe(201);
    const aoVivo = await aoVivoResposta.json();
    pedidos.push({ recurso: 'ao-vivo', id: aoVivo.id });

    const impresso = await request.put('/api/cobranca/acoes/marcar-impressos', { headers, data: { ids: [fonada.id] } });
    expect(impresso.status()).toBe(200);
    expect((await impresso.json()).quantidade).toBe(1);
    const atualFonada = await (await request.get(`/api/fonadas/${fonada.id}`, { headers })).json();
    expect(atualFonada.impresso).toBe('SIM');
    const reagendarFonada = await request.put('/api/cobranca/acoes/reagendar-lote', { headers, data: { ids: [fonada.id], versoes: { [fonada.id]: atualFonada.versao }, cobrarDia: '02/12/26' } });
    expect(reagendarFonada.status()).toBe(200);
    expect((await (await request.get(`/api/fonadas/${fonada.id}`, { headers })).json()).cobranca_reagendada).toBe('02/12/26');

    const reagendarAoVivo = await request.put(`/api/cobranca/ao-vivo/${aoVivo.id}/reagendar`, { headers, data: { dataCobranca: '03/12/26', versao: aoVivo.versao } });
    expect(reagendarAoVivo.status()).toBe(200);
    expect((await (await request.get(`/api/ao-vivo/${aoVivo.id}`, { headers })).json()).data_cobranca).toBe('03/12/26');
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
