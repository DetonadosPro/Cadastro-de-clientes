import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function dia(dias = 0) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000)); }

test('BTN de ficha e formulários navegam ao destino correto', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_NAV_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  let fo, av;
  try {
    const foResp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 30, cobranca: dia(3), periodo: 'PIX' } });
    expect(foResp.status()).toBe(201); fo = await foResp.json();
    const avResp = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 30, dia_entrega: dia(2), pagamento: `PRAZO - DIA ${dia(3)} - MP - PIX`, para: 'QA' } });
    expect(avResp.status()).toBe(201); av = await avResp.json();
    for (const [rota, id] of [['/fonada/novo', 'BTN-206'], ['/ao-vivo/novo', 'BTN-075']]) {
      await page.goto(rota);
      await page.getByRole('button', { name: 'Escolher cliente' }).click();
      await expect(page).toHaveURL(/\/clientes$/);
      registrar(id, page, 'button:has-text("Escolher cliente")', 'clicar', 'lista de clientes aberta');
    }
    await page.goto(`/clientes/${cliente.id}`);
    await page.getByRole('button', { name: 'Nova fonada' }).click();
    await expect(page).toHaveURL(new RegExp(`/fonada/novo\\?clienteId=${cliente.id}`));
    registrar('BTN-103', page, 'button:has-text("Nova fonada")', 'clicar', 'novo pedido Fonada vinculado');
    await page.goto(`/clientes/${cliente.id}`);
    await page.getByRole('button', { name: 'Novo ao vivo' }).click();
    await expect(page).toHaveURL(new RegExp(`/ao-vivo/novo\\?clienteId=${cliente.id}`));
    registrar('BTN-104', page, 'button:has-text("Novo ao vivo")', 'clicar', 'novo pedido Ao Vivo vinculado');
    await page.goto(`/clientes/${cliente.id}`);
    await page.getByRole('button', { name: 'Ver cobrança' }).click();
    await expect(page).toHaveURL(/\/cobranca\?nome=/);
    registrar('BTN-105', page, 'button:has-text("Ver cobrança")', 'clicar', 'cobrança filtrada por cliente');
    await page.goto(`/clientes/${cliente.id}`);
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(page).toHaveURL(/\/clientes(?:\?.*)?$/);
    registrar('BTN-106', page, 'button:has-text("Voltar")', 'clicar', 'lista de clientes aberta');
    await page.goto(`/clientes/${cliente.id}`);
    const abas = page.locator('.abas-cliente').last();
    await abas.getByRole('button', { name: /Ao vivo/ }).click();
    await expect(abas.getByRole('button', { name: /Ao vivo/ })).toHaveClass(/ativa/);
    registrar('BTN-116', page, '.abas-cliente button:has-text("Ao vivo")', 'clicar', 'aba Ao Vivo ativa');
    await abas.getByRole('button', { name: /Fonada/ }).click();
    await expect(abas.getByRole('button', { name: /Fonada/ })).toHaveClass(/ativa/);
    registrar('BTN-115', page, '.abas-cliente button:has-text("Fonada")', 'clicar', 'aba Fonada ativa');
    await page.goto(`/fonada/${fo.id}`);
    await page.getByRole('button', { name: 'Abrir ficha do cliente' }).click();
    await expect(page).toHaveURL(new RegExp(`/clientes/${cliente.id}$`));
    registrar('BTN-207', page, 'button:has-text("Abrir ficha do cliente")', 'clicar', 'ficha aberta');
    await page.goto(`/ao-vivo/${av.id}`);
    await page.getByRole('button', { name: 'Abrir ficha do cliente' }).click();
    await expect(page).toHaveURL(new RegExp(`/clientes/${cliente.id}$`));
    registrar('BTN-080', page, 'button:has-text("Abrir ficha do cliente")', 'clicar', 'ficha aberta');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/fonada/${fo.id}`);
    await page.getByRole('button', { name: 'Novo pedido' }).click();
    await expect(page).toHaveURL(new RegExp(`/fonada/novo\\?clienteId=${cliente.id}`));
    registrar('BTN-211', page, '.acoes-secundarias-mobile button:has-text("Novo pedido")', 'clicar no móvel', 'novo pedido Fonada aberto');
    await page.goto(`/ao-vivo/${av.id}`);
    await page.getByRole('button', { name: 'Novo pedido' }).click();
    await expect(page).toHaveURL(new RegExp(`/ao-vivo/novo\\?clienteId=${cliente.id}`));
    registrar('BTN-082', page, '.acoes-secundarias-mobile button:has-text("Novo pedido")', 'clicar no móvel', 'novo pedido Ao Vivo aberto');
  } finally {
    if (av) await request.delete(`/api/ao-vivo/${av.id}`, { headers });
    if (fo) await request.delete(`/api/fonadas/${fo.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('BTN-102/113/117/118/119/121: erro, edição, filtro mensal e histórico da ficha', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  await page.goto('/clientes/999999999');
  await page.getByRole('button', { name: 'Voltar aos clientes' }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  registrar('BTN-102', page, 'button:has-text("Voltar aos clientes")', 'clicar após erro 404', 'lista de clientes aberta');
  const respCliente = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_FICHA_BTN_${Date.now()}` } });
  expect(respCliente.status()).toBe(201);
  const cliente = await respCliente.json();
  let fo, av;
  try {
    const respFo = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 30, cobranca: dia(3), periodo: 'MANHÃ', p1_dia: dia(2), p1_para: 'QA' } });
    expect(respFo.status()).toBe(201); fo = await respFo.json();
    const respAv = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 30, dia_entrega: dia(2), para: 'QA' } });
    expect(respAv.status()).toBe(201); av = await respAv.json();
    await page.goto(`/clientes/${cliente.id}`);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.locator('#editar-nome').fill('NOME ALTERADO SEM SALVAR');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    expect((await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente.nome).toBe(cliente.nome);
    registrar('BTN-113', page, 'button:has-text("Cancelar")', 'cancelar edição', 'nome original preservado');
    const mes = Number(dia(2).split('/')[1]);
    await page.locator('#filtro-mes-mensagem').selectOption(String(mes));
    await expect(page.locator(`tr[data-pedido-id="${fo.id}"]`)).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtro' }).click();
    await expect(page.locator('#filtro-mes-mensagem')).toHaveValue('');
    registrar('BTN-117', page, 'button:has-text("Limpar filtro")', 'limpar mês', 'histórico total restaurado');
    await page.locator('#filtro-mes-mensagem').selectOption(String(mes === 12 ? 1 : mes + 1));
    await expect(page.getByRole('button', { name: 'Ver todos os pedidos' })).toBeVisible();
    await page.getByRole('button', { name: 'Ver todos os pedidos' }).click();
    await expect(page.locator(`tr[data-pedido-id="${fo.id}"]`)).toBeVisible();
    registrar('BTN-118', page, 'button:has-text("Ver todos os pedidos")', 'limpar filtro vazio', 'pedido reaparece');
    await page.locator(`tr[data-pedido-id="${fo.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/fonada/${fo.id}$`));
    registrar('BTN-119', page, `tr[data-pedido-id="${fo.id}"]`, 'clicar linha Fonada', 'pedido aberto');
    await page.goto(`/clientes/${cliente.id}?aba=aovivo`);
    await page.locator(`tr[data-pedido-id="${av.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/ao-vivo/${av.id}$`));
    registrar('BTN-121', page, `tr[data-pedido-id="${av.id}"]`, 'clicar linha Ao Vivo', 'pedido aberto');
  } finally {
    if (av) await request.delete(`/api/ao-vivo/${av.id}`, { headers });
    if (fo) await request.delete(`/api/fonadas/${fo.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
