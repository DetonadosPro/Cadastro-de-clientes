import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado, criarOperadorDeTeste } from './apoio.js';

function diaFuturo(dias) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000));
}

test('dois operadores na mesma ficha não sobrescrevem entrega nem remarcação de prazo', async ({ page, browser, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const a = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const operador = await criarOperadorDeTeste(request);
  const outraPagina = await browser.newPage();
  let cliente;
  let pedido;
  try {
    await entrar(outraPagina, operador.credenciais);
    const b = { Authorization: `Bearer ${await outraPagina.evaluate(() => localStorage.getItem('pombo_token'))}` };
    const criadoCliente = await request.post('/api/clientes', { headers: a, data: { nome: `TESTE_QA_ENTREGA_RACE_${Date.now()}` } });
    expect(criadoCliente.status()).toBe(201);
    cliente = await criadoCliente.json();
    const criadoPedido = await request.post('/api/ao-vivo', { headers: a, data: { cliente_id: cliente.id, valor: 60, dia_entrega: diaFuturo(1), pagamento: `PRAZO - DIA ${diaFuturo(3)} - MP - PIX`, para: 'ENTREGA QA' } });
    expect(criadoPedido.status()).toBe(201);
    pedido = await criadoPedido.json();
    await Promise.all([page.goto(`/ao-vivo/${pedido.id}`), outraPagina.goto(`/ao-vivo/${pedido.id}`)]);
    await expect(page.getByRole('button', { name: 'Marcar entregue' })).toBeVisible();
    await expect(outraPagina.getByRole('button', { name: 'Marcar não entregue' })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Marcar entregue' }).click();
    await expect(page.getByText(/ENTREGUE, /).first()).toBeVisible();
    outraPagina.once('dialog', (dialog) => dialog.accept());
    await outraPagina.getByRole('button', { name: 'Marcar não entregue' }).click();
    await expect(outraPagina.getByText(/Pedido alterado por outra pessoa/).first()).toBeVisible();
    let atual = await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers: a })).json();
    expect(atual.resultado_entrega).toMatch(/^ENTREGUE,/);
    expect(atual.versao).toBe(pedido.versao + 1);
    await outraPagina.reload();
    await expect(outraPagina.getByRole('button', { name: 'Marcar não entregue' })).toBeVisible();
    outraPagina.once('dialog', (dialog) => dialog.accept());
    await outraPagina.getByRole('button', { name: 'Marcar não entregue' }).click();
    await expect(outraPagina.getByText(/NÃO ENTREGUE, /).first()).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Desfazer entrega' }).click();
    await expect(page.getByText(/Pedido alterado por outra pessoa/).first()).toBeVisible();
    atual = await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers: b })).json();
    expect(atual.resultado_entrega).toMatch(/^NÃO ENTREGUE,/);

    const versaoAntesPrazo = atual.versao;
    const respostas = await Promise.all([
      request.post(`/api/ao-vivo/${pedido.id}/nao-recebeu`, { headers: a, data: { remarcadoDia: diaFuturo(5), observacao: 'Operador A', versao: versaoAntesPrazo } }),
      request.post(`/api/ao-vivo/${pedido.id}/nao-recebeu`, { headers: b, data: { remarcadoDia: diaFuturo(6), observacao: 'Operador B', versao: versaoAntesPrazo } }),
    ]);
    expect(respostas.map((r) => r.status()).sort()).toEqual([200, 409]);
    const historico = await (await request.get(`/api/ao-vivo/${pedido.id}/tentativas-prazo`, { headers: a })).json();
    expect(historico.tentativas).toHaveLength(1);
    atual = await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers: a })).json();
    expect(atual.versao).toBe(versaoAntesPrazo + 1);
    expect(atual.pagamento).toContain(historico.tentativas[0].remarcado_dia);

    await outraPagina.reload();
    await outraPagina.getByRole('button', { name: 'Não recebeu — remarcar prazo' }).click();
    await expect(outraPagina.getByRole('heading', { name: 'Não recebeu o pagamento' })).toBeVisible();
    await expect(outraPagina.getByText('Tentativas anteriores')).toBeVisible();
    await outraPagina.locator('.campo', { hasText: 'Novo dia do prazo' }).locator('input').fill(diaFuturo(8));
    await outraPagina.locator('.campo', { hasText: 'Observação' }).locator('textarea').fill('Segunda tentativa pela interface');
    await outraPagina.getByRole('button', { name: 'Confirmar remarcação' }).click();
    await expect(outraPagina.getByRole('heading', { name: 'Não recebeu o pagamento' })).toHaveCount(0);
    const historicoFinal = await (await request.get(`/api/ao-vivo/${pedido.id}/tentativas-prazo`, { headers: a })).json();
    expect(historicoFinal.tentativas).toHaveLength(2);
    expect(historicoFinal.tentativas[0].observacao).toBe('Segunda tentativa pela interface');
    const antesDePagar = await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers: a })).json();
    const pagar = await request.post(`/api/ao-vivo/${pedido.id}/pagou`, { headers: a, data: { pagou: 'SIM', versao: antesDePagar.versao } });
    expect(pagar.status()).toBe(200);
    const tentativaAposPagamento = await request.post(`/api/ao-vivo/${pedido.id}/nao-recebeu`, { headers: b, data: { remarcadoDia: diaFuturo(9), versao: (await pagar.json()).versao } });
    expect(tentativaAposPagamento.status()).toBe(409);
    const historicoPago = await (await request.get(`/api/ao-vivo/${pedido.id}/tentativas-prazo`, { headers: a })).json();
    expect(historicoPago.tentativas).toHaveLength(2);
  } finally {
    if (pedido) await request.delete(`/api/ao-vivo/${pedido.id}`, { headers: a });
    if (cliente) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers: a });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers: a });
    }
    await outraPagina.close();
    await operador.excluir();
  }
});
