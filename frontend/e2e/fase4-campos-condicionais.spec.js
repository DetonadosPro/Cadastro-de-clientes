import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function datas() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [ano, mes, dia] = iso.split('-');
  return { iso, br: `${dia}/${mes}/${ano.slice(-2)}`, anterior: `${dia}/${mes}/${String(Number(ano) - 1).slice(-2)}` };
}

test('FIELD-078: textarea Quem oferece aceita multilinha e persiste', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_FIELD_078_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  let pedido;
  try {
    const resp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 20, cobranca: datas().br, periodo: 'MANHÃ' } });
    expect(resp.status()).toBe(201);
    pedido = await resp.json();
    await page.goto(`/fonada/${pedido.id}`);
    const campo = page.getByLabel('Quem oferece da 1ª mensagem');
    await campo.focus();
    await campo.fill('Linha um\nLinha dois');
    await expect(campo).toHaveValue('Linha um\nLinha dois');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect.poll(async () => (await (await request.get(`/api/fonadas/${pedido.id}`, { headers })).json()).p1_quem_oferece).toBe('Linha um\nLinha dois');
    await page.reload();
    await expect(campo).toHaveValue('Linha um\nLinha dois');
    registrar('FIELD-078', page, 'textarea[aria-label="Quem oferece da 1ª mensagem"]', 'foco/preencher/salvar/reabrir', 'duas linhas persistidas');
  } finally {
    if (pedido) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('FIELD-088/090: Recall filtra e grava data de retorno', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const d = datas();
  const nome = `CONTATO QA CAMPO ${String(Date.now()).replace(/\d/g, (digito) => 'ABCDEFGHIJ'[Number(digito)])}`;
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome, whatsapp: '34999999999' } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  let pedido;
  try {
    const resp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 20, cobranca: d.br, periodo: 'MANHÃ', p1_dia: d.anterior, p1_para: 'QA DESTINATARIO', p1_tema: 'ANIV GERAL', p1_celular: '34999999999' } });
    expect(resp.status()).toBe(201);
    pedido = await resp.json();
    await page.goto(`/recall?data=${d.iso}`);
    const busca = page.getByLabel('Buscar nas duas pesquisas por nome ou senha');
    await expect(busca).toBeVisible();
    await busca.fill('NOME INEXISTENTE QA');
    await expect(page.getByText('Nenhum nome ou senha encontrado.')).toBeVisible();
    await busca.fill(nome);
    await expect(page.locator('.recall-relacao-titulo')).toContainText(nome);
    registrar('FIELD-088', page, 'input[aria-label="Buscar nas duas pesquisas por nome ou senha"]', 'buscar e limpar', 'lista filtra sem resultado e recupera relação');
    await page.locator('#recall-status').selectOption('RETORNAR');
    const retorno = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    await page.locator('#recall-retornar').fill(retorno);
    await page.getByRole('button', { name: 'Salvar andamento' }).click();
    await expect.poll(async () => {
      const resposta = await request.get('/api/recall/historico', { headers });
      return (await resposta.json()).registros.find((r) => r.cliente_id === cliente.id && r.status === 'RETORNAR')?.retornar_em;
    }).toBeTruthy();
    await page.reload();
    await expect(page.locator('#recall-status')).toHaveValue('RETORNAR');
    registrar('FIELD-090', page, '#recall-retornar', 'preencher/salvar/reabrir', 'retorno persistido no histórico');
  } finally {
    if (pedido) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('FIELD-092/093: relatórios filtram sistema e alteram tamanho da página', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const d = datas();
  const clienteResp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_REPORT_FIELD_${Date.now()}` } });
  expect(clienteResp.status()).toBe(201);
  const cliente = await clienteResp.json();
  let pedido;
  try {
    const resp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 20, data_pedido: d.br, cobranca: d.br, periodo: 'MANHÃ' } });
    expect(resp.status()).toBe(201);
    pedido = await resp.json();
    await page.goto(`/relatorios?aba=vendas&inicio=${encodeURIComponent(d.br)}&fim=${encodeURIComponent(d.br)}&sistema=TODOS`);
    const sistema = page.getByLabel('Modalidade do relatório');
    await sistema.selectOption('FONADA');
    await expect(page).toHaveURL(/sistema=FONADA/);
    await expect(page.locator('.rel-results')).toHaveAttribute('aria-busy', 'false');
    await page.locator('.rel-records summary').click();
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    registrar('FIELD-092', page, 'select[aria-label="Modalidade do relatório"]', 'selecionar Fonada', 'URL e tabela filtradas');
    const porPagina = page.getByLabel('Pedidos por página');
    await porPagina.selectOption('50');
    await expect(porPagina).toHaveValue('50');
    await expect.poll(async () => {
      const resposta = await request.get(`/api/relatorios/vendas?inicio=${encodeURIComponent(d.br)}&fim=${encodeURIComponent(d.br)}&sistema=FONADA&limite=50&pagina=1`, { headers });
      return (await resposta.json()).limite;
    }).toBe(50);
    registrar('FIELD-093', page, 'label:has-text("Por página") select', 'selecionar 50', 'limite 50 exibido e API consultável');
    const atalhos = page.locator('.rel-presets:visible');
    for (const [id, titulo] of [['BTN-255', 'Hoje'], ['BTN-256', 'Ontem'], ['BTN-257', 'Esta semana'], ['BTN-258', 'Este mês'], ['BTN-259', 'Mês anterior']]) {
      await atalhos.getByRole('button', { name: titulo, exact: true }).click();
      await expect(page.locator('#rel-inicio')).not.toHaveValue('');
      registrar(id, page, `.rel-presets button:has-text("${titulo}")`, 'aplicar período', 'data inicial preenchida');
    }
    await atalhos.getByRole('button', { name: 'Hoje', exact: true }).click();
    const comparar = page.getByRole('button', { name: '＋ Comparar períodos' }).first();
    await comparar.click();
    await expect(page.locator('.rel-period-block.referencia')).toBeVisible();
    registrar('BTN-260', page, 'button.rel-compare-toggle', 'abrir comparação', 'período B exibido');
    await page.getByRole('button', { name: '× Remover comparação' }).first().click();
    await page.getByRole('button', { name: 'Vendas', exact: true }).click();
    await expect(page).toHaveURL(/aba=vendas/);
    registrar('BTN-251', page, '.rel-tabs button:has-text("Vendas")', 'clicar', 'aba de vendas ativa');
    await expect(page.locator('.rel-results')).toHaveAttribute('aria-busy', 'false');
    await page.locator('.rel-records summary').click();
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    await page.locator('.rel-table-scroll tbody tr', { hasText: cliente.nome }).getByRole('button').click();
    await expect(page).toHaveURL(new RegExp(`/fonada/${pedido.id}$`));
    registrar('BTN-263', page, '.rel-table-scroll tbody tr .rel-order-link', 'clicar linha', 'pedido Fonada aberto');
  } finally {
    if (pedido) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
