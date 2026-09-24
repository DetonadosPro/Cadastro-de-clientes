import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { exercitarFechamentos, registrar } from './fase4-modal-helper.js';

function dia(dias = 0) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000));
}
async function contexto(page, request, tipo, prefixo, dados = {}) {
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `${prefixo}_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidoResposta = await request.post(`/api/${tipo}`, { headers, data: { cliente_id: cliente.id, valor: 30,
    ...(tipo === 'fonadas' ? { cobranca: dia(3), periodo: 'MANHÃ' } : { dia_entrega: dia(1), para: 'QA' }), ...dados } });
  expect(pedidoResposta.status()).toBe(201);
  const pedido = await pedidoResposta.json();
  const ler = async () => (await (await request.get(`/api/${tipo}/${pedido.id}`, { headers })).json());
  const limpar = async () => {
    await request.delete(`/api/${tipo}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  };
  return { headers, cliente, pedido, ler, limpar };
}

test('MODAL-011: recebimento Ao Vivo cancela sem pagar e confirma valor e forma', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  const qa = await contexto(page, request, 'ao-vivo', 'TESTE_QA_MODAL_011');
  try {
    await page.goto(`/ao-vivo/${qa.pedido.id}`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Marcar não entregue' }).click();
    await expect.poll(async () => (await qa.ler()).resultado_entrega).toContain('NÃO ENTREGUE');
    registrar('BTN-086', page, 'button:has-text("Marcar não entregue")', 'confirmar não entrega', 'resultado persistido');
    const abrir = async () => {
      await page.getByRole('button', { name: 'Dar baixa no pagamento' }).click();
      const dialogo = page.getByRole('dialog', { name: new RegExp('Receber pagamento') });
      await expect(dialogo).toBeVisible();
      registrar('BTN-089', page, 'button:has-text("Dar baixa no pagamento")', 'abrir pagamento', 'diálogo de recebimento aberto');
      return dialogo;
    };
    const dialogo = await exercitarFechamentos(page, 'MODAL-011', abrir,
      `Receber pagamento — O.S. ${qa.pedido.numero_os}`, 'Confirmar pagamento', async () => {
        expect((await qa.ler()).pagou).not.toBe('SIM');
      });
    await dialogo.locator('input[type="number"]').fill('27.50');
    await dialogo.locator('select').selectOption('PIX');
    await dialogo.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await expect.poll(async () => (await qa.ler()).pagou).toBe('SIM');
    const atual = await qa.ler();
    expect(Number(atual.valor_recebido)).toBe(27.5);
    expect(atual.forma_recebimento).toBe('PIX');
    registrar('FIELD-021', page, 'role=dialog input[type=number]', 'preencher/confirmar', 'valor 27,50 persistido');
    registrar('FIELD-022', page, 'role=dialog select', 'selecionar/confirmar', 'forma PIX persistida');
    registrar('MODAL-011', page, 'role=button[name=Confirmar pagamento]', 'confirmar', 'pagamento, valor e forma persistidos');
  } finally { await qa.limpar(); }
});

test('MODAL-012: prazo Ao Vivo cancela e registra tentativa apenas ao confirmar', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  const qa = await contexto(page, request, 'ao-vivo', 'TESTE_QA_MODAL_012', { pagamento: `PRAZO - DIA ${dia(3)} - MP - PIX` });
  try {
    await page.goto(`/ao-vivo/${qa.pedido.id}`);
    const abrir = async () => {
      await page.getByRole('button', { name: 'Não recebeu — remarcar prazo' }).click();
      return page.getByRole('dialog', { name: 'Não recebeu o pagamento' });
    };
    const dialogo = await exercitarFechamentos(page, 'MODAL-012', abrir,
      'Não recebeu o pagamento', 'Confirmar remarcação', async () => {
        expect((await (await request.get(`/api/ao-vivo/${qa.pedido.id}/tentativas-prazo`, { headers: qa.headers })).json()).tentativas).toHaveLength(0);
      });
    await dialogo.locator('.campo', { hasText: 'Novo dia do prazo' }).locator('input').fill(dia(5));
    await dialogo.getByRole('textbox', { name: 'Observação da tentativa de pagamento' }).fill('QA modal 012');
    await dialogo.getByRole('button', { name: 'Confirmar remarcação' }).click();
    await expect.poll(async () => (await qa.ler()).pagamento).toContain(dia(5));
    const tentativas = (await (await request.get(`/api/ao-vivo/${qa.pedido.id}/tentativas-prazo`, { headers: qa.headers })).json()).tentativas;
    expect(tentativas).toHaveLength(1);
    expect(tentativas[0].observacao).toBe('QA modal 012');
    registrar('MODAL-012', page, 'role=button[name=Confirmar remarcação]', 'confirmar', 'prazo e tentativa persistidos');
  } finally { await qa.limpar(); }
});

test('MODAL-022: Fonada cancela e registra tentativa com data, horário e observação', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  const qa = await contexto(page, request, 'fonadas', 'TESTE_QA_MODAL_022', { data_pedido: dia(), p1_dia: dia(), p1_para: 'DESTINATÁRIO QA' });
  try {
    await page.goto(`/fonada/${qa.pedido.id}`);
    const abrir = async () => {
      await page.getByTitle('Não atendeu').first().click();
      return page.getByRole('dialog', { name: 'Não atendeu — 1ª mensagem' });
    };
    const dialogo = await exercitarFechamentos(page, 'MODAL-022', abrir,
      'Não atendeu — 1ª mensagem', 'Registrar e remarcar', async () => {
        expect((await (await request.get(`/api/agenda/fonada/${qa.pedido.id}/tentativas`, { headers: qa.headers })).json()).tentativas).toHaveLength(0);
      });
    await dialogo.locator('.campo', { hasText: 'Novo dia' }).locator('input').fill(dia(5));
    await dialogo.getByPlaceholder('hh:mm').fill('10:30');
    await dialogo.getByPlaceholder('Ex: caixa postal, número errado...').fill('QA modal 022');
    await dialogo.getByRole('button', { name: 'Registrar e remarcar' }).click();
    await expect.poll(async () => (await qa.ler()).p1_dia).toBe(dia(5));
    expect((await qa.ler()).p1_horario).toBe('10:30');
    const tentativas = (await (await request.get(`/api/agenda/fonada/${qa.pedido.id}/tentativas`, { headers: qa.headers })).json()).tentativas;
    expect(tentativas).toHaveLength(1);
    expect(tentativas[0].observacao).toBe('QA modal 022');
    registrar('MODAL-022', page, 'role=button[name=Registrar e remarcar]', 'confirmar', 'data, horário e tentativa persistidos');
    registrar('BTN-214', page, 'role=button[name=Cancelar]', 'cancelar', 'nenhuma tentativa criada');
  } finally { await qa.limpar(); }
});

test('MODAL-005: Agenda cancela e registra tentativa da Fonada do dia', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  const qa = await contexto(page, request, 'fonadas', 'TESTE_QA_MODAL_005', { data_pedido: dia(), p1_dia: dia(), p1_para: 'DESTINATÁRIO AGENDA QA' });
  try {
    await page.goto('/agenda');
    await page.getByText(qa.cliente.nome).first().click();
    const abrir = async () => {
      await page.getByRole('button', { name: 'Não atendeu', exact: true }).click();
      return page.getByRole('dialog', { name: `Não atendeu — ${qa.cliente.nome}` });
    };
    const dialogo = await exercitarFechamentos(page, 'MODAL-005', abrir,
      `Não atendeu — ${qa.cliente.nome}`, 'Registrar e remarcar', async () => {
        expect((await (await request.get(`/api/agenda/fonada/${qa.pedido.id}/tentativas`, { headers: qa.headers })).json()).tentativas).toHaveLength(0);
      });
    await dialogo.locator('.campo', { hasText: 'Novo dia' }).locator('input').fill(dia(5));
    await dialogo.getByPlaceholder('hh:mm').fill('11:45');
    await dialogo.getByPlaceholder('Ex: caixa postal, número errado...').fill('QA modal Agenda');
    await dialogo.getByRole('button', { name: 'Registrar e remarcar' }).click();
    await expect.poll(async () => (await qa.ler()).p1_dia).toBe(dia(5));
    expect((await qa.ler()).p1_horario).toBe('11:45');
    const tentativas = (await (await request.get(`/api/agenda/fonada/${qa.pedido.id}/tentativas`, { headers: qa.headers })).json()).tentativas;
    expect(tentativas).toHaveLength(1);
    expect(tentativas[0].observacao).toBe('QA modal Agenda');
    registrar('FIELD-006', page, 'role=dialog input[placeholder=hh:mm]', 'preencher/confirmar', 'horário 11:45 persistido');
    registrar('FIELD-007', page, 'role=dialog input[placeholder=Ex: caixa postal...]', 'preencher/confirmar', 'observação persistida');
    registrar('MODAL-005', page, 'role=button[name=Registrar e remarcar]', 'confirmar', 'tentativa e nova data persistidas');
    await page.goto(`/agenda?data=${encodeURIComponent(dia(5))}`);
    await page.locator('.linha-agenda').filter({ hasText: qa.cliente.nome }).click();
    await page.getByRole('button', { name: /Remarcações/ }).click();
    await expect(page.getByText('QA modal Agenda')).toBeVisible();
    registrar('BTN-071', page, '.agenda-detalhe-fonada button:has-text("Remarcações")', 'abrir histórico de tentativas', 'observação da tentativa exibida');
  } finally { await qa.limpar(); }
});
