import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { exercitarFechamentos, registrar } from './fase4-modal-helper.js';

function dia(dias = 0) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000));
}

test('MODAL-019: Cobrança Ao Vivo cobre reagendamento e pagamento com saídas e persistência', async ({ page, request }) => {
  test.setTimeout(120000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_MODAL_019_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  const pedidoResp = await request.post('/api/ao-vivo', { headers, data: {
    cliente_id: cliente.id, valor: 30, dia_entrega: dia(1), pagamento: `PRAZO - DIA ${dia(3)} - MP - PIX`, para: 'QA',
  } });
  expect(pedidoResp.status()).toBe(201);
  const pedido = await pedidoResp.json();
  const ler = async () => (await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers })).json());
  try {
    await page.goto('/cobranca?sistema=AOVIVO');
    await page.getByPlaceholder('Nome do comprador').fill(cliente.nome);
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    const abrirReagendar = async () => {
      await page.getByRole('button', { name: 'Reagendar', exact: true }).click();
      return page.getByRole('dialog', { name: `Reagendar cobrança — O.S. ${pedido.numero_os}` });
    };
    const dialogoReagendar = await exercitarFechamentos(page, 'MODAL-019', abrirReagendar,
      `Reagendar cobrança — O.S. ${pedido.numero_os}`, 'Reagendar', async () => {
        expect((await ler()).data_cobranca).toBeFalsy();
      });
    await dialogoReagendar.locator('.campo', { hasText: 'Nova data' }).locator('input').fill(dia(5));
    await dialogoReagendar.getByRole('button', { name: 'Reagendar', exact: true }).click();
    await expect.poll(async () => (await ler()).data_cobranca).toBe(dia(5));
    registrar('MODAL-019', page, 'role=button[name=Reagendar]', 'confirmar reagendamento', 'nova data persistida no pedido');

    const abrirBaixa = async () => {
      await page.getByRole('button', { name: 'Dar baixa', exact: true }).click();
      return page.getByRole('dialog', { name: `Dar baixa — O.S. ${pedido.numero_os}` });
    };
    const dialogoBaixa = await exercitarFechamentos(page, 'MODAL-019', abrirBaixa,
      `Dar baixa — O.S. ${pedido.numero_os}`, 'Confirmar pagamento', async () => {
        expect((await ler()).pagou).not.toBe('SIM');
      });
    await dialogoBaixa.locator('input[type="number"]').fill('25.50');
    await dialogoBaixa.locator('select').selectOption('DINHEIRO');
    await dialogoBaixa.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await expect.poll(async () => (await ler()).pagou).toBe('SIM');
    const atual = await ler();
    expect(Number(atual.valor_recebido)).toBe(25.5);
    expect(atual.forma_recebimento).toBe('DINHEIRO');
    registrar('FIELD-059', page, 'role=dialog input[type=number]', 'preencher/confirmar', 'valor 25,50 persistido');
    registrar('FIELD-060', page, 'role=dialog select', 'selecionar/confirmar', 'forma DINHEIRO persistida');
    registrar('MODAL-019', page, 'role=button[name=Confirmar pagamento]', 'confirmar pagamento', 'pagamento, valor e forma persistidos');
  } finally {
    await request.delete(`/api/ao-vivo/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
