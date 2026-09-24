import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { exercitarFechamentos, registrar, verificarDialogo } from './fase4-modal-helper.js';

function dia(dias = 0) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000));
}

test('MODAL-020: Cobrança Fonada cobre reagendar, baixa, desfazer e confirmação de impressão', async ({ page, request }) => {
  test.setTimeout(150000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await page.addInitScript(() => { window.print = () => { window.__qaPrint = (window.__qaPrint || 0) + 1; }; });
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_MODAL_020_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  const pedidoResp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 30, cobranca: dia(3), periodo: 'MANHÃ', pagamento: 'PIX' } });
  expect(pedidoResp.status()).toBe(201);
  const pedido = await pedidoResp.json();
  const ler = async () => (await (await request.get(`/api/fonadas/${pedido.id}`, { headers })).json());
  try {
    await page.goto(`/cobranca?nome=${encodeURIComponent(cliente.nome)}`);
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    const abrirReagendar = async () => {
      await page.getByRole('button', { name: 'Reagendar', exact: true }).click();
      return page.getByRole('dialog', { name: `Reagendar — ${cliente.nome}` });
    };
    const reagendar = await exercitarFechamentos(page, 'MODAL-020', abrirReagendar,
      `Reagendar — ${cliente.nome}`, 'Reagendar', async () => {
        expect((await ler()).cobranca_reagendada).toBeFalsy();
      });
    await reagendar.locator('.campo', { hasText: 'Nova data' }).locator('input').fill(dia(5));
    await reagendar.getByRole('button', { name: 'Reagendar', exact: true }).click();
    await expect.poll(async () => (await ler()).cobranca_reagendada).toBe(dia(5));
    registrar('MODAL-020', page, 'role=button[name=Reagendar]', 'confirmar reagendamento', 'data de cobrança persistida');

    const abrirBaixa = async () => {
      await page.getByRole('button', { name: 'Dar baixa', exact: true }).click();
      return page.getByRole('dialog', { name: `Dar baixa — ${cliente.nome}` });
    };
    const baixa = await exercitarFechamentos(page, 'MODAL-020', abrirBaixa,
      `Dar baixa — ${cliente.nome}`, 'Confirmar baixa', async () => {
        expect((await ler()).pagou).not.toBe('SIM');
      });
    await baixa.getByPlaceholder('Observação do recebimento...').fill('QA modal 020');
    await baixa.getByRole('button', { name: 'Confirmar baixa' }).click();
    await expect.poll(async () => (await ler()).pagou).toBe('SIM');
    expect((await ler()).recebi).toBe('QA modal 020');
    registrar('MODAL-020', page, 'role=button[name=Confirmar baixa]', 'confirmar baixa', 'pagamento e observação persistidos');

    await page.getByRole('button', { name: 'Recebidas', exact: true }).click();
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    const abrirDesfazer = async () => {
      await page.getByRole('button', { name: 'Desfazer baixa', exact: true }).click();
      return page.getByRole('dialog', { name: `Desfazer baixa — O.S. ${pedido.senha_os}` });
    };
    const desfazer = await exercitarFechamentos(page, 'MODAL-020', abrirDesfazer,
      `Desfazer baixa — O.S. ${pedido.senha_os}`, 'Confirmar desfazer', async () => {
        expect((await ler()).pagou).toBe('SIM');
      });
    await desfazer.getByRole('button', { name: 'Confirmar desfazer' }).click();
    await expect.poll(async () => (await ler()).pagou).toBe('NÃO');
    registrar('MODAL-020', page, 'role=button[name=Confirmar desfazer]', 'confirmar desfazer', 'pagamento revertido no banco');

    await page.goto(`/cobranca?nome=${encodeURIComponent(cliente.nome)}`);
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    const imprimir = page.getByRole('button', { name: `Imprimir recibo de ${cliente.nome}` });
    await imprimir.click();
    let impressao = page.getByRole('dialog', { name: 'A impressão foi concluída?' });
    await verificarDialogo(page, impressao, 'A impressão foi concluída?', 'Sim, foi impresso', 'Não, cancelei');
    await impressao.getByRole('button', { name: 'Não, cancelei' }).click();
    await expect(impressao).toHaveCount(0);
    expect((await ler()).impresso).not.toBe('SIM');
    registrar('MODAL-020', page, 'role=button[name=Não, cancelei]', 'cancelar impressão', 'status impresso não gravado');
    await imprimir.click();
    impressao = page.getByRole('dialog', { name: 'A impressão foi concluída?' });
    await expect(impressao).toBeVisible();
    await impressao.getByRole('button', { name: 'Sim, foi impresso' }).click();
    await expect.poll(async () => (await ler()).impresso).toBe('SIM');
    registrar('BTN-192', page, 'role=button[name=Sim, foi impresso]', 'confirmar', 'status impresso persistido');
    registrar('MODAL-020', page, 'role=button[name=Sim, foi impresso]', 'confirmar impressão', 'status impresso persistido após cancelamentos sem efeito');
  } finally {
    await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
