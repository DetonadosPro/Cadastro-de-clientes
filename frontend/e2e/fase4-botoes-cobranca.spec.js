import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function dia(dias = 0) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000));
}

test('BTN-162-168/185-189: abas e cartões da cobrança aplicam cada filtro', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_BTN_COB_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  let av, fo;
  try {
    const avResp = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 30, dia_entrega: dia(2), pagamento: `PRAZO - DIA ${dia(3)} - MP - PIX`, para: 'QA' } });
    expect(avResp.status()).toBe(201);
    av = await avResp.json();
    const foResp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 30, cobranca: dia(3), periodo: 'PIX' } });
    expect(foResp.status()).toBe(201);
    fo = await foResp.json();
    await page.goto('/cobranca');
    await expect(page.locator('.grade-resumo-cobranca-operacional button')).toHaveCount(5);
    const fonada = [
      ['BTN-185', 0, 'Atrasadas'], ['BTN-186', 1, 'Para hoje'], ['BTN-187', 2, 'Próximas'],
      ['BTN-188', 3, 'Recebidas no mês'], ['BTN-189', 4, 'Total pendente'],
    ];
    for (const [id, indice, titulo] of fonada) {
      await page.locator('.grade-resumo-cobranca-operacional button').nth(indice).click();
      await expect(page.locator('.grade-resumo-cobranca-operacional button').nth(indice)).toContainText(titulo);
      if (indice < 4) await expect(page.locator('.cobranca-atalhos button.ativo')).toHaveText(indice === 1 ? 'Hoje' : titulo);
      else await expect(page.locator('.cobranca-atalhos button.ativo')).toHaveCount(0);
      registrar(id, page, `.grade-resumo-cobranca-operacional button:nth-child(${indice + 1})`, 'clicar cartão', `filtro ${titulo} aplicado`);
    }
    await page.getByRole('button', { name: 'Ao Vivo', exact: true }).click();
    await expect(page).toHaveURL(/sistema=AOVIVO/);
    registrar('BTN-163', page, '.cobranca-abas-sistema button:nth-child(2)', 'clicar', 'tela Ao Vivo exibida');
    await expect(page.locator('.grade-resumo-cobranca-operacional button')).toHaveCount(5);
    const aoVivo = [
      ['BTN-164', 0, 'Pendente'], ['BTN-165', 1, 'Atrasadas'], ['BTN-166', 2, 'Para hoje'],
      ['BTN-167', 3, 'Próximas'], ['BTN-168', 4, 'Recebido no mês'],
    ];
    for (const [id, indice, titulo] of aoVivo) {
      await page.locator('.grade-resumo-cobranca-operacional button').nth(indice).click();
      await expect(page.locator('.grade-resumo-cobranca-operacional button').nth(indice)).toContainText(titulo);
      await expect(page.locator('.cobranca-atalhos button.ativo')).toHaveText(indice === 2 ? 'Hoje' : indice === 0 ? 'Pendentes' : indice === 4 ? 'Recebidas no mês' : titulo);
      registrar(id, page, `.grade-resumo-cobranca-operacional button:nth-child(${indice + 1})`, 'clicar cartão', `filtro ${titulo} aplicado`);
    }
    await page.locator('.cobranca-atalhos').getByRole('button', { name: 'Pendentes' }).click();
    await expect(page.locator('.cobranca-aovivo-card').filter({ hasText: cliente.nome })).toBeVisible();
    await page.locator('.cobranca-aovivo-card').filter({ hasText: cliente.nome }).locator('.cobranca-aovivo-cliente button').click();
    await expect(page).toHaveURL(new RegExp(`/clientes/${cliente.id}$`));
    registrar('BTN-170', page, '.cobranca-aovivo-cliente button', 'abrir cliente', 'ficha correta aberta');
    await page.goto('/cobranca?sistema=AOVIVO&filtro=pendentes');
    await page.locator('.cobranca-aovivo-card').filter({ hasText: cliente.nome }).getByRole('button', { name: 'Abrir pedido' }).click();
    await expect(page).toHaveURL(new RegExp(`/ao-vivo/${av.id}$`));
    registrar('BTN-171', page, '.cobranca-aovivo-card button:has-text("Abrir pedido")', 'abrir pedido', 'Ao Vivo correto aberto');
    await page.goto('/cobranca?sistema=AOVIVO');
    await page.getByRole('button', { name: 'Fonada', exact: true }).click();
    await expect(page).toHaveURL(/sistema=FONADA/);
    registrar('BTN-162', page, '.cobranca-abas-sistema button:nth-child(1)', 'clicar', 'tela Fonada exibida');
  } finally {
    if (fo) await request.delete(`/api/fonadas/${fo.id}`, { headers });
    if (av) await request.delete(`/api/ao-vivo/${av.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('BTN-182/183/184/194/199/200/201/202: seleção e ações por pedido Fonada', async ({ page, request }) => {
  test.setTimeout(120000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await page.addInitScript(() => { window.print = () => { window.__qaPrint = (window.__qaPrint || 0) + 1; }; });
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_BTN_COB_DET_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  let pedido;
  const rota = `/cobranca?nome=${encodeURIComponent(cliente.nome)}&filtro=proximas`;
  const abrirDetalhes = async (url = rota) => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Expandir pedidos' }).click();
    await expect(page.getByLabel(`Selecionar O.S. ${pedido.senha_os} para impressão`)).toBeVisible();
  };
  try {
    const resp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 30, cobranca: dia(3), periodo: 'PIX' } });
    expect(resp.status()).toBe(201);
    pedido = await resp.json();
    await abrirDetalhes();
    const linha = page.getByLabel(`Selecionar O.S. ${pedido.senha_os} para impressão`);
    const barra = page.getByRole('region', { name: 'Ações para cobranças selecionadas' });
    await linha.check();
    await barra.getByRole('button', { name: 'Desmarcar todos' }).click();
    await expect(linha).not.toBeChecked();
    registrar('BTN-182', page, 'region[aria-label="Ações para cobranças selecionadas"] button:first-child', 'desmarcar todos', 'linha desmarcada');
    await linha.check();
    await barra.getByRole('button', { name: 'Limpar seleção' }).click();
    await expect(linha).not.toBeChecked();
    registrar('BTN-183', page, 'region[aria-label="Ações para cobranças selecionadas"] button:nth-child(2)', 'limpar', 'linha desmarcada');
    await linha.check();
    await barra.getByRole('button', { name: 'Imprimir selecionados (1)' }).click();
    await expect(page.getByRole('dialog', { name: 'A impressão foi concluída?' })).toBeVisible();
    await page.getByRole('button', { name: 'Não, cancelei' }).click();
    registrar('BTN-184', page, 'region[aria-label="Ações para cobranças selecionadas"] button:nth-child(3)', 'imprimir seleção', 'confirmação abriu e cancelou sem alterar pedido');

    await page.locator('button[title="Abrir cadastro do cliente"]').click();
    await expect(page).toHaveURL(new RegExp(`/clientes/${cliente.id}$`));
    registrar('BTN-194', page, 'button[title="Abrir cadastro do cliente"]', 'clicar', 'ficha do cliente aberta');
    await abrirDetalhes();
    await page.locator('.pedido-cobranca-individual').getByRole('button', { name: 'Abrir pedido' }).click();
    await expect(page).toHaveURL(new RegExp(`/fonada/${pedido.id}$`));
    registrar('BTN-199', page, '.pedido-cobranca-individual button:has-text("Abrir pedido")', 'clicar', 'formulário do pedido aberto');
    await abrirDetalhes();
    await page.locator('.pedido-cobranca-individual').getByRole('button', { name: 'Imprimir', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'A impressão foi concluída?' })).toBeVisible();
    await page.getByRole('button', { name: 'Não, cancelei' }).click();
    registrar('BTN-200', page, '.pedido-cobranca-individual button:has-text("Imprimir")', 'imprimir pedido', 'confirmação abriu e cancelou sem alterar pedido');
    await page.locator('.pedido-cobranca-individual').getByRole('button', { name: 'Dar baixa' }).click();
    await expect(page.getByRole('dialog', { name: new RegExp('Dar baixa') })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    registrar('BTN-201', page, '.pedido-cobranca-individual button:has-text("Dar baixa")', 'abrir/cancelar', 'modal de baixa individual aberto sem alteração');
    const baixa = await request.put(`/api/cobranca/${pedido.id}/baixa`, { headers, data: { pagou: 'SIM', recebi: 'QA', dataPagamento: dia() } });
    expect(baixa.status()).toBe(200);
    await abrirDetalhes(`/cobranca?nome=${encodeURIComponent(cliente.nome)}&filtro=pagas`);
    await page.locator('.pedido-cobranca-individual').getByRole('button', { name: 'Desfazer baixa' }).click();
    await expect(page.getByRole('dialog', { name: new RegExp('Desfazer baixa') })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    expect((await (await request.get(`/api/fonadas/${pedido.id}`, { headers })).json()).pagou).toBe('SIM');
    registrar('BTN-202', page, '.pedido-cobranca-individual button:has-text("Desfazer baixa")', 'abrir/cancelar', 'modal de desfazer aberto e pagamento preservado');
  } finally {
    if (pedido) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
