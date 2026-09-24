import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function dia(dias = 0) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000)); }

test('FIELD-001/004/012/018: sugestões, seleção e campos Ao Vivo persistem', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const resposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_FIELDS_AOVIVO_${Date.now()}` } });
  expect(resposta.status()).toBe(201);
  const cliente = await resposta.json();
  let pedidoId;
  try {
    await page.goto(`/ao-vivo/novo?clienteId=${cliente.id}`);
    await page.getByLabel('Horário da entrega Ao Vivo').focus();
    await page.getByLabel('Horário da entrega Ao Vivo').fill('1030');
    await expect(page.getByLabel('Horário da entrega Ao Vivo')).toHaveValue('10:30');
    await page.getByLabel('Código da mensagem 1 do Ao Vivo').focus();
    await page.getByLabel('Código da mensagem 1 do Ao Vivo').fill('CODIGO-QA');
    await page.locator('.campo-brinde-aovivo input').focus();
    await page.locator('.campo-brinde-aovivo input').fill('Cha');
    await page.locator('.campo-brinde-aovivo').getByRole('button', { name: 'Bombom' }).click();
    await expect(page.locator('.campo-brinde-aovivo input')).toHaveValue('Bombom');
    await page.locator('.campo-forma-pagamento-aovivo input').click();
    await page.locator('.campo-forma-pagamento-aovivo').getByRole('option', { name: 'PIX' }).click();
    await expect(page.locator('.campo-forma-pagamento-aovivo input')).toHaveValue('PIX');
    await page.getByLabel('Destinatário do Ao Vivo').fill('QA destinatário');
    await page.locator('.campo-dia-aovivo input').fill(dia(3));
    await page.getByLabel('Valor do pedido Ao Vivo').fill('3000');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForURL(/\/ao-vivo\/\d+$/);
    pedidoId = Number(new URL(page.url()).pathname.split('/').pop());
    await page.reload();
    const atual = await (await request.get(`/api/ao-vivo/${pedidoId}`, { headers })).json();
    expect(atual.horario_entrega).toBe('10:30');
    expect(atual.mensagem_codigo_1).toBe('CODIGO-QA');
    expect(atual.brinde).toBe('Bombom');
    expect(atual.pagamento).toBe('PIX');
    for (const [id, locator, efeito] of [
      ['FIELD-001', '.campo-brinde-aovivo input', 'sugestão Bombom persistida'],
      ['FIELD-004', '.campo-forma-pagamento-aovivo input', 'PIX persistido'],
      ['FIELD-012', 'input[aria-label="Horário da entrega Ao Vivo"]', '10:30 persistido'],
      ['FIELD-018', 'input[aria-label="Código da mensagem 1 do Ao Vivo"]', 'código persistido'],
      ['BTN-001', '.campo-brinde-aovivo button', 'Bombom selecionado'],
      ['BTN-007', '.campo-forma-pagamento-aovivo button', 'PIX selecionado'],
    ]) registrar(id, page, locator, 'interação/persistência', efeito);
  } finally {
    if (pedidoId) await request.delete(`/api/ao-vivo/${pedidoId}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
