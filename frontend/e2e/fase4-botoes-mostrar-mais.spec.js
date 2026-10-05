import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function dia(dias = 0) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000)); }
function responder(rota, dados) { return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) }); }

test('BTN-096/224: listas de hoje mostram o 51º pedido', async ({ page }) => {
  const pedidosAv = Array.from({ length: 51 }, (_, n) => ({ id: n + 1, numero_os: n + 1, comprador: `QA AO VIVO ${n + 1}`, horario_entrega: '10:00', para: 'QA' }));
  const pedidosFo = Array.from({ length: 51 }, (_, n) => ({ id: n + 1, senha_os: n + 1, nome_comprador: `QA FONADA ${n + 1}`, p1_dia: dia(), p1_horario: '10:00', p1_para: 'QA' }));
  await page.route('**/api/ao-vivo/hoje', (rota) => responder(rota, { data: dia(), pedidos: pedidosAv }));
  await page.route('**/api/fonadas/hoje', (rota) => responder(rota, { data: dia(), fonadas: pedidosFo }));
  await entrar(page);
  await page.goto('/ao-vivo/hoje');
  await expect(page.locator('.operacao-dia-item')).toHaveCount(50);
  await page.getByRole('button', { name: /Mostrar mais/ }).click();
  await expect(page.locator('.operacao-dia-item')).toHaveCount(51);
  registrar('BTN-096', page, '.operacao-dia-lista .lista-mostrar-mais button', 'mostrar mais Ao Vivo', '51º pedido exibido');
  await page.goto('/fonada/hoje');
  await expect(page.locator('.operacao-dia-item')).toHaveCount(50);
  await page.getByRole('button', { name: /Mostrar mais/ }).click();
  await expect(page.locator('.operacao-dia-item')).toHaveCount(51);
  registrar('BTN-224', page, '.operacao-dia-lista .lista-mostrar-mais button', 'mostrar mais Fonada', '51º pedido exibido');
});

test('BTN-052/054: Agenda expande mais 50 pendentes e concluídos', async ({ page }) => {
  const lembretes = Array.from({ length: 102 }, (_, n) => ({ id: n + 1, titulo: `QA LISTA ${n + 1}`, data: '2026-09-23', horario: '10:00', concluido: n >= 51 }));
  await page.route('**/api/agenda/hoje*', (rota) => responder(rota, { data: dia(), fonada: [], aoVivo: [], lembretes }));
  await entrar(page);
  await page.goto('/agenda');
  await expect(page.locator('.ag-time-group > .linha-agenda')).toHaveCount(50);
  await page.locator('.lista-agenda-compacta > .lista-mostrar-mais').getByRole('button', { name: /Mostrar mais/ }).click();
  await expect(page.locator('.ag-time-group > .linha-agenda')).toHaveCount(51);
  registrar('BTN-052', page, '.lista-agenda-compacta > .lista-mostrar-mais button', 'expandir pendentes', '51º lembrete pendente exibido');
  await page.getByRole('button', { name: /Concluídos/ }).click();
  await expect(page.locator('.agenda-concluidos .linha-agenda')).toHaveCount(50);
  await page.locator('.agenda-concluidos .lista-mostrar-mais').getByRole('button', { name: /Mostrar mais/ }).click();
  await expect(page.locator('.agenda-concluidos .linha-agenda')).toHaveCount(51);
  registrar('BTN-054', page, '.agenda-concluidos .lista-mostrar-mais button', 'expandir concluídos', '51º lembrete concluído exibido');
});

test('BTN-120/122: ficha mostra o 51º pedido em cada aba', async ({ page, request }) => {
  test.setTimeout(120000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_FICHA_LISTA_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201); const cliente = await clienteResp.json();
  let fonada, aoVivo;
  try {
    const fo = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 10, cobranca: dia(2), periodo: 'PIX' } });
    expect(fo.status()).toBe(201); fonada = await fo.json();
    const av = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 10, dia_entrega: dia(2), para: 'QA' } });
    expect(av.status()).toBe(201); aoVivo = await av.json();
    const fichaResp = await request.get(`/api/clientes/${cliente.id}`, { headers });
    expect(fichaResp.status()).toBe(200); const ficha = await fichaResp.json();
    ficha.pedidosFonada = Array.from({ length: 51 }, (_, n) => ({ ...ficha.pedidosFonada[0], id: 1000000 + n, senha_os: `QA-F-${n + 1}` }));
    ficha.pedidosAoVivo = Array.from({ length: 51 }, (_, n) => ({ ...ficha.pedidosAoVivo[0], id: 2000000 + n, numero_os: `QA-A-${n + 1}` }));
    await page.route(`**/api/clientes/${cliente.id}`, (rota) => responder(rota, ficha));
    await page.goto(`/clientes/${cliente.id}`);
    await expect(page.locator('tr[data-pedido-id^="1000"]')).toHaveCount(50);
    await page.getByRole('button', { name: /Mostrar mais/ }).click();
    await expect(page.locator('tr[data-pedido-id^="1000"]')).toHaveCount(51);
    registrar('BTN-120', page, '.lista-mostrar-mais button', 'expandir Fonada da ficha', '51º pedido exibido');
    await page.getByRole('button', { name: /Ao vivo/ }).last().click();
    await expect(page.locator('tr[data-pedido-id^="2000"]')).toHaveCount(50);
    await page.getByRole('button', { name: /Mostrar mais/ }).click();
    await expect(page.locator('tr[data-pedido-id^="2000"]')).toHaveCount(51);
    registrar('BTN-122', page, '.lista-mostrar-mais button', 'expandir Ao Vivo da ficha', '51º pedido exibido');
  } finally {
    if (aoVivo) await request.delete(`/api/ao-vivo/${aoVivo.id}`, { headers });
    if (fonada) await request.delete(`/api/fonadas/${fonada.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('BTN-175/190: cobranças Ao Vivo e Fonada expandem o 51º item', async ({ page }) => {
  const prazo = dia(3);
  const aoVivo = Array.from({ length: 51 }, (_, n) => ({ id: n + 1, cliente_id: n + 1, numero_os: n + 1, nome: `QA COB AV ${n + 1}`, valor: 10, pagou: 'NÃO', dataCobranca: prazo, dataPedido: dia(), destinatario: 'QA' }));
  const fonada = Array.from({ length: 51 }, (_, n) => ({ id: n + 1, cliente_id: n + 1, senha_os: n + 1, nome: `QA COB FO ${n + 1}`, valor: 10, pagou: 'NÃO', cobranca: prazo, formaPagamento: 'PIX' }));
  await page.route('**/api/cobranca/ao-vivo?*', (rota) => responder(rota, { pedidos: aoVivo }));
  await page.route('**/api/cobranca?*', (rota) => responder(rota, { pedidos: fonada }));
  await entrar(page);
  await page.goto('/cobranca?sistema=AOVIVO');
  await expect(page.locator('.cobranca-aovivo-card')).toHaveCount(50);
  await page.locator('.lista-cobranca-aovivo').getByRole('button', { name: /Mostrar mais/ }).click();
  await expect(page.locator('.cobranca-aovivo-card')).toHaveCount(51);
  registrar('BTN-175', page, '.lista-cobranca-aovivo .lista-mostrar-mais button', 'expandir cobrança Ao Vivo', '51º cartão exibido');
  await page.goto('/cobranca?sistema=FONADA');
  await expect(page.locator('.grupo-cobranca')).toHaveCount(50);
  await page.getByRole('button', { name: /Mostrar mais/ }).click();
  await expect(page.locator('.grupo-cobranca')).toHaveCount(51);
  registrar('BTN-190', page, '.lista-mostrar-mais button', 'expandir cobrança Fonada', '51º grupo exibido');
});
