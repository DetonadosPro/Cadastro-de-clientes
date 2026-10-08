import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

function dia(dias = 0) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000));
}

test('Fonada de hoje abre pedido, registra baixa e remarca tentativa pela interface', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clientes = [];
  const pedidos = [];
  try {
    for (const sufixo of ['BAIXA', 'TENTATIVA']) {
      const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_HOJE_FONADA_${sufixo}_${Date.now()}` } });
      expect(clienteResp.status()).toBe(201);
      const cliente = await clienteResp.json();
      clientes.push(cliente);
      const pedidoResp = await request.post('/api/fonadas', { headers, data: {
        cliente_id: cliente.id, valor: 20, cobranca: dia(3), periodo: 'MANHÃ', data_pedido: dia(), p1_dia: dia(), p1_para: `DESTINATÁRIO ${sufixo}`,
      } });
      expect(pedidoResp.status()).toBe(201);
      pedidos.push(await pedidoResp.json());
    }
    await page.goto('/fonada/hoje');
    await expect(page.getByRole('heading', { name: 'Vendas de hoje', exact: true })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(clientes[0].nome) }).click();
    await expect(page).toHaveURL(new RegExp(`/fonada/${pedidos[0].id}$`));
    await page.getByTitle('Marcar passada').click();
    await expect(page.getByText('BAIXA DADA COM SUCESSO')).toBeVisible();
    const baixado = await (await request.get(`/api/fonadas/${pedidos[0].id}`, { headers })).json();
    expect(baixado.p1_resultado).toMatch(/^OK /);

    await page.goto('/fonada/hoje');
    await page.getByRole('link', { name: new RegExp(clientes[1].nome) }).click();
    await page.getByTitle('Não atendeu').click();
    await expect(page.getByRole('heading', { name: 'Não atendeu — 1ª mensagem' })).toBeVisible();
    await page.locator('.campo', { hasText: 'Novo dia *' }).locator('input').fill(dia(5));
    await page.getByRole('dialog', { name: 'Não atendeu — 1ª mensagem' }).getByPlaceholder('hh:mm').fill('10:30');
    await page.getByRole('dialog', { name: 'Não atendeu — 1ª mensagem' }).getByPlaceholder('Ex: caixa postal, número errado...').fill('Teste QA pela página Hoje');
    await page.getByRole('button', { name: 'Registrar e remarcar' }).click();
    await expect(page.getByText('Tentativa registrada e mensagem remarcada.')).toBeVisible();
    const remarcado = await (await request.get(`/api/fonadas/${pedidos[1].id}`, { headers })).json();
    expect(remarcado.p1_dia).toBe(dia(5));
    const historico = await (await request.get(`/api/agenda/fonada/${pedidos[1].id}/tentativas`, { headers })).json();
    expect(historico.tentativas).toHaveLength(1);
    expect(historico.tentativas[0].observacao).toBe('Teste QA pela página Hoje');
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    for (const cliente of clientes) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});

test('Ao Vivo de hoje abre pedido, registra e desfaz entrega e remarca pagamento', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  let cliente;
  let pedido;
  try {
    const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_HOJE_AOVIVO_${Date.now()}` } });
    expect(clienteResp.status()).toBe(201);
    cliente = await clienteResp.json();
    const pedidoResp = await request.post('/api/ao-vivo', { headers, data: {
      cliente_id: cliente.id, valor: 45, dia_entrega: dia(), para: 'DESTINATÁRIO HOJE QA', pagamento: `PRAZO - DIA ${dia(3)} - MP - PIX`,
    } });
    expect(pedidoResp.status()).toBe(201);
    pedido = await pedidoResp.json();
    await page.goto('/ao-vivo/hoje');
    await expect(page.getByRole('heading', { name: 'Ao vivo de hoje' })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(cliente.nome) }).click();
    await expect(page).toHaveURL(new RegExp(`/ao-vivo/${pedido.id}$`));
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Marcar entregue' }).click();
    await expect(page.getByText(/ENTREGUE, /).first()).toBeVisible();
    expect((await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers })).json()).resultado_entrega).toMatch(/^ENTREGUE,/);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Desfazer entrega' }).click();
    await expect(page.getByText('Pendente', { exact: true }).first()).toBeVisible();
    expect((await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers })).json()).resultado_entrega).toBeNull();
    await page.getByRole('button', { name: 'Não recebeu — remarcar prazo' }).click();
    await page.locator('.campo', { hasText: 'Novo dia do prazo' }).locator('input').fill(dia(6));
    await page.locator('.campo', { hasText: 'Observação' }).locator('textarea').fill('QA sem pagamento pela página Hoje');
    await page.getByRole('button', { name: 'Confirmar remarcação' }).click();
    await expect(page.getByRole('dialog', { name: 'Não recebeu o pagamento' })).toHaveCount(0);
    const atual = await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers })).json();
    expect(atual.pagamento).toContain(dia(6));
    const historico = await (await request.get(`/api/ao-vivo/${pedido.id}/tentativas-prazo`, { headers })).json();
    expect(historico.tentativas).toHaveLength(1);
  } finally {
    if (pedido) await request.delete(`/api/ao-vivo/${pedido.id}`, { headers });
    if (cliente) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
