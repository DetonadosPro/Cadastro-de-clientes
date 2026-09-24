import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function dia(dias = 0) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000));
}

test('FIELD-024/026/027/057/061/062/063/065/066/080/081: filtros e seleção nas listas', async ({ page, request }) => {
  test.setTimeout(120000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_LISTAS_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  let aoVivo, fonada;
  try {
    const avResp = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 30, dia_entrega: dia(2), pagamento: `PRAZO - DIA ${dia(3)} - MP - PIX`, para: 'QA' } });
    expect(avResp.status()).toBe(201);
    aoVivo = await avResp.json();
    const foResp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 30, cobranca: dia(3), periodo: 'PIX' } });
    expect(foResp.status()).toBe(201);
    fonada = await foResp.json();

    await page.goto('/ao-vivo');
    const filtroAv = page.getByLabel('Campo de busca de Ao Vivo');
    await filtroAv.selectOption('os');
    await expect(page).toHaveURL(/campo=os/);
    await page.locator('.lista-aovivo-busca input').fill(String(aoVivo.numero_os));
    await expect(page).toHaveURL(new RegExp(`busca=${aoVivo.numero_os}`));
    await expect(page.locator('.lista-aovivo-meta')).toContainText('pedido(s) encontrado(s)');
    await expect(page.getByLabel(`Selecionar pedido Ao Vivo O.S. ${aoVivo.numero_os}`)).toBeVisible();
    const todosAv = page.getByLabel('Selecionar todos os pedidos Ao Vivo');
    const umAv = page.getByLabel(`Selecionar pedido Ao Vivo O.S. ${aoVivo.numero_os}`);
    await umAv.check();
    await expect(umAv).toBeChecked();
    await todosAv.check();
    await expect(todosAv).toBeChecked();
    await todosAv.uncheck();
    await expect(umAv).not.toBeChecked();
    registrar('FIELD-024', page, 'select[aria-label="Campo de busca de Ao Vivo"]', 'selecionar O.S.', 'URL campo=os e resultado filtrado');
    registrar('FIELD-026', page, 'input[aria-label="Selecionar todos os pedidos Ao Vivo"]', 'desmarcar todos', 'linha desmarcada');
    registrar('FIELD-027', page, 'input[aria-label^="Selecionar pedido Ao Vivo"]', 'marcar linha', 'seleção refletida no cabeçalho');
    await page.locator(`#aovivo-${aoVivo.id} td[data-label="Selecionar"]`).click();
    await expect(page).toHaveURL(/\/ao-vivo\?/);
    registrar('BTN-101', page, 'td[data-label="Selecionar"]', 'clicar célula', 'não navega para o pedido');
    await page.locator(`#aovivo-${aoVivo.id} td[data-label="O.S."]`).click();
    await expect(page).toHaveURL(new RegExp(`/ao-vivo/${aoVivo.id}$`));
    registrar('BTN-100', page, `#aovivo-${aoVivo.id}`, 'clicar linha', 'abre pedido');
    await page.goto('/ao-vivo?campo=os&busca=NAOEXISTEQA');
    await page.getByRole('button', { name: 'Limpar busca' }).click();
    await expect(page).toHaveURL(/\/ao-vivo(?:\?pagina=1)?$/);
    registrar('BTN-099', page, 'button:has-text("Limpar busca")', 'clicar vazio', 'filtros removidos da URL');
    await page.goto(`/ao-vivo?campo=os&busca=${aoVivo.numero_os}`);
    await page.locator('.lista-aovivo-busca').getByRole('button', { name: 'Limpar' }).click();
    await expect(page).toHaveURL(/\/ao-vivo(?:\?pagina=1)?$/);
    registrar('BTN-098', page, '.lista-aovivo-busca button', 'limpar', 'filtros removidos da URL');

    await page.goto('/fonada');
    await page.getByLabel('Campo de busca de Fonada').selectOption('os');
    await expect(page).toHaveURL(/campo=os/);
    await page.locator('.lista-fonada-busca input').fill(String(fonada.senha_os));
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    registrar('FIELD-080', page, 'select[aria-label="Campo de busca de Fonada"]', 'selecionar O.S.', 'URL campo=os');
    registrar('FIELD-081', page, '.lista-fonada-busca input', 'buscar O.S.', 'pedido do cliente exibido');
    await page.locator(`#fonada-${fonada.id}`).click();
    await expect(page).toHaveURL(new RegExp(`/fonada/${fonada.id}$`));
    registrar('BTN-227', page, `#fonada-${fonada.id}`, 'clicar linha', 'abre pedido');
    await page.goto('/fonada?campo=os&busca=NAOEXISTEQA');
    await page.getByRole('button', { name: 'Limpar busca' }).click();
    await expect(page).toHaveURL(/\/fonada(?:\?pagina=1)?$/);
    registrar('BTN-226', page, 'button:has-text("Limpar busca")', 'clicar vazio', 'filtros removidos da URL');
    await page.goto(`/fonada?campo=os&busca=${fonada.senha_os}`);
    await page.locator('.lista-fonada-busca').getByRole('button', { name: 'Limpar' }).click();
    await expect(page).toHaveURL(/\/fonada(?:\?pagina=1)?$/);
    registrar('BTN-225', page, '.lista-fonada-busca button', 'limpar', 'filtros removidos da URL');

    await page.goto('/cobranca?sistema=AOVIVO');
    await page.getByPlaceholder('Número exato').fill(String(aoVivo.numero_os));
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    registrar('FIELD-057', page, 'input[placeholder="Número exato"]', 'buscar O.S.', 'cobrança Ao Vivo exibida');

    await page.goto('/cobranca');
    await page.getByPlaceholder('Número exato').fill(String(fonada.senha_os));
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    registrar('FIELD-061', page, 'input[placeholder="Número exato"]', 'buscar O.S.', 'cobrança Fonada exibida');
    await page.getByPlaceholder('Número exato').fill('');
    await page.getByPlaceholder('Nome do comprador').fill(cliente.nome);
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    registrar('FIELD-062', page, 'input[placeholder="Nome do comprador"]', 'buscar nome', 'cobrança Fonada exibida');
    await page.locator('#cobranca-forma-impressao').selectOption('pix');
    await expect(page.locator('#cobranca-forma-impressao')).toHaveValue('pix');
    registrar('FIELD-063', page, '#cobranca-forma-impressao', 'selecionar PIX', 'filtro aplicado');
    await page.goto(`/cobranca?nome=${encodeURIComponent(cliente.nome)}&forma=pix&filtro=proximas`);
    await page.getByRole('button', { name: 'Expandir pedidos' }).click();
    await expect(page.getByRole('button', { name: 'Recolher pedidos' })).toBeVisible();
    registrar('BTN-193', page, 'button[aria-label="Expandir pedidos"]', 'expandir', 'detalhes individuais exibidos');
    const individual = page.getByLabel(`Selecionar O.S. ${fonada.senha_os} para impressão`);
    await expect(individual).toBeVisible();
    await individual.check();
    const grupo = page.getByLabel('Selecionar 1 pedido(s) deste cliente para impressão');
    await expect(grupo).toBeChecked();
    await grupo.uncheck();
    await expect(individual).not.toBeChecked();
    registrar('FIELD-065', page, 'input[aria-label^="Selecionar O.S."]', 'marcar linha', 'grupo marcado');
    registrar('FIELD-066', page, 'input[aria-label^="Selecionar 1 pedido"]', 'desmarcar grupo', 'linha desmarcada');
  } finally {
    if (fonada) await request.delete(`/api/fonadas/${fonada.id}`, { headers });
    if (aoVivo) await request.delete(`/api/ao-vivo/${aoVivo.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
