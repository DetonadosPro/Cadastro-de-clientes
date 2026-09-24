import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { entrar, isolado } from './apoio.js';

function dia(dias = 0) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000)); }

test('API-004/035/054: conflitos de duplicidade e versão retornam 409', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const master = { 'x-senha-mestra': process.env.QA_E2E_MASTER_PASSWORD };
  const usuario = `TESTE_QA_CONFLITO_${Date.now()}`;
  const credenciais = { usuario, senha: 'QA_OPERADOR_FORTE_2026!', nome: 'QA Conflito' };
  let usuarioId, cliente, pedido;
  const evidencia = [];
  try {
    const criado = await request.post('/api/auth/usuarios', { headers: master, data: credenciais });
    expect(criado.status()).toBe(201);
    const lista = await (await request.get('/api/auth/usuarios', { headers: master })).json();
    usuarioId = lista.usuarios.find((item) => item.usuario === usuario)?.id;
    const repetido = await request.post('/api/auth/usuarios', { headers: master, data: credenciais });
    evidencia.push({ id: 'API-004', condicao: 'conflict', status: repetido.status(), corpo: await repetido.json() });
    expect(repetido.status()).toBe(409);
    const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_HTTP_CONFLITO_${Date.now()}` } });
    expect(clienteResp.status()).toBe(201); cliente = await clienteResp.json();
    const pedidoResp = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 30, dia_entrega: dia(2), pagamento: `PRAZO - DIA ${dia(3)} - MP - PIX`, para: 'QA' } });
    expect(pedidoResp.status()).toBe(201); pedido = await pedidoResp.json();
    const pagou = await request.post(`/api/ao-vivo/${pedido.id}/pagou`, { headers, data: { pagou: 'SIM', versao: pedido.versao + 1 } });
    evidencia.push({ id: 'API-035', condicao: 'conflict', status: pagou.status(), corpo: await pagou.json() });
    expect(pagou.status()).toBe(409);
    const reagendar = await request.put(`/api/cobranca/ao-vivo/${pedido.id}/reagendar`, { headers, data: { dataCobranca: dia(5), versao: pedido.versao + 1 } });
    evidencia.push({ id: 'API-054', condicao: 'conflict', status: reagendar.status(), corpo: await reagendar.json() });
    expect(reagendar.status()).toBe(409);
    const atual = await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers })).json();
    expect(atual.pagou).not.toBe('SIM');
    expect(atual.data_cobranca).toBeFalsy();
  } finally {
    writeFileSync('../docs/auditoria/evidencias/http-conflitos-fase4-qa.json', JSON.stringify(evidencia, null, 2));
    if (pedido) await request.delete(`/api/ao-vivo/${pedido.id}`, { headers });
    if (cliente) { await request.delete(`/api/clientes/${cliente.id}`, { headers }); await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers }); }
    if (usuarioId) await request.delete(`/api/auth/usuarios/${usuarioId}`, { headers: master });
  }
});
