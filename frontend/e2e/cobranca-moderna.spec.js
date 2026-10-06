import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function preparar(page) {
  const gravacoes = [];
  await page.clock.setFixedTime(new Date('2026-10-06T13:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado');
    localStorage.setItem('pombo_usuario', 'QA');
    localStorage.setItem('pombo_nome', 'Operador de exemplo');
    window.print = () => { window.impressoNoTeste = true; };
  });
  const fonadas = [
    { id: 10, cliente_id: 100, nome: 'Ana Maria', senha_os: '123', cobranca: '01/10/26', valor: 50, pagou: 'NÃO', formaPagamento: 'PIX', whatsapp: '34999999999', endereco: 'Rua das Flores, 10', bairro: 'Centro', referencia: 'Próximo à praça', versao: 1 },
    { id: 11, cliente_id: 100, nome: 'Ana Maria', senha_os: '124', cobranca: '01/10/26', valor: 75, pagou: 'NÃO', formaPagamento: 'PIX', versao: 1 },
    { id: 12, cliente_id: 101, nome: 'Maria Aparecida de Oliveira', senha_os: '125', cobranca: '06/10/26', valor: 120, pagou: 'NÃO', formaPagamento: 'PRESENCIAL', versao: 1 },
    { id: 13, cliente_id: 102, nome: 'João Silva', senha_os: '126', cobranca: '15/10/26', valor: 80, pagou: 'NÃO', formaPagamento: 'PIX', versao: 1 },
    { id: 14, cliente_id: 103, nome: 'Carla Souza', senha_os: '127', cobranca: '02/10/26', valor: 60, pagou: 'SIM', formaPagamento: 'PIX', dataPagamento: '02/10/26', versao: 1 },
  ];
  fonadas[0].destinatarios = ['Fernanda', 'Carlos'];
  fonadas[0].data_pedido = '20/09/26';
  fonadas[1].destinatarios = ['Victor'];
  fonadas[1].data_pedido = '21/09/26';
  fonadas[2].destinatarios = ['Maria de Lourdes Aparecida de Oliveira'];
  const aovivo = fonadas.map(p => ({ ...p, numero_os: `AV${p.id}`, dataCobranca: p.cobranca, dataPedido: '01/10/26', dataEvento: '06/10/26', horarioEvento: '14:00', destinatario: 'Fernanda', pagamentoPrevisto: 'PIX', valorRecebido: p.valor, formaRecebimento: 'PIX' }));
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') {
      gravacoes.push({ url: url.pathname, dados: req.postDataJSON() });
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/api/cobranca') return route.fulfill({ json: { pedidos: fonadas } });
    if (url.pathname === '/api/cobranca/ao-vivo') return route.fulfill({ json: { pedidos: aovivo } });
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n' });
    return route.fulfill({ json: {} });
  });
  await page.goto('/cobranca');
  await expect(page.getByRole('region', { name: 'Resumo financeiro da consulta' })).toBeVisible();
  return gravacoes;
}

for (const largura of [320, 390, 768, 1024, 1440]) {
  test(`Fonada e Ao Vivo cabem em ${largura}px, inclusive pedidos expandidos`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: largura, height: 1000 });
    await preparar(page);
    await expect(page.getByRole('heading', { name: 'Cobrança', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Expandir pedidos' }).first().click();
    await expect(page.getByRole('button', { name: 'Abrir pedido', exact: true }).first()).toBeVisible();
    const verificar = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const fora = await page.locator('.cobranca-moderna button, .cobranca-moderna input, .cobranca-moderna select, .cobranca-moderna a').evaluateAll(elementos => elementos.filter(e => e.getClientRects().length).filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(e => e.textContent || e.getAttribute('aria-label')));
      expect(fora).toEqual([]);
    };
    await verificar();
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; window.scrollTo(0, 0); });
    await page.screenshot({ path: testInfo.outputPath(`fonada-${largura}.png`) });
    await page.getByRole('button', { name: 'Ao Vivo', exact: true }).click();
    await expect(page.locator('.cobranca-aovivo-card')).toHaveCount(4);
    await verificar();
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; window.scrollTo(0, 0); });
    await page.screenshot({ path: testInfo.outputPath(`aovivo-${largura}.png`) });
  });
}

test('resumo filtra as cobranças e limpar filtros recupera a lista', async ({ page }) => {
  await preparar(page);
  const resumo = page.getByRole('region', { name: 'Resumo financeiro da consulta' });
  await expect(resumo.getByRole('button', { name: /Total pendente/ })).toContainText('325,00');
  await resumo.getByRole('button', { name: /Atrasadas/ }).click();
  await expect(page.getByRole('heading', { name: 'Cobranças atrasadas' })).toBeVisible();
  await expect(page.locator('.grupo-cobranca')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.locator('.grupo-cobranca')).toHaveCount(3);
  await page.getByRole('button', { name: 'Ao Vivo', exact: true }).click();
  await page.getByRole('region', { name: 'Resumo financeiro da consulta' }).getByRole('button', { name: /Recebidas no mês/ }).click();
  await expect(page.locator('.cobranca-aovivo-card')).toHaveCount(1);
  await expect(page.locator('.cobranca-aovivo-card')).toContainText('Carla Souza');
});

test('destinatários da Fonada aparecem no card e no pedido correto junto das datas', async ({ page }) => {
  await preparar(page);
  const grupo = page.locator('.grupo-cobranca').first();
  await expect(grupo.locator('.cb-fonada-destinatarios')).toHaveText('Para: Fernanda · Carlos · Victor');
  await grupo.getByRole('button', { name: 'Expandir pedidos' }).click();
  const pedidos = grupo.locator('.pedido-cobranca-individual');
  await expect(pedidos.nth(0).locator('.pedido-cobranca-datas')).toHaveText('Para: Fernanda · CarlosCompra: 20/09/26Cobrança: 01/10/26');
  await expect(pedidos.nth(1).locator('.pedido-cobranca-datas')).toHaveText('Para: VictorCompra: 21/09/26Cobrança: 01/10/26');
  const semNome = page.locator('.grupo-cobranca').last();
  await expect(semNome.locator('.cb-fonada-destinatarios')).toHaveText('Para: Não informado');
  await semNome.getByRole('button', { name: 'Expandir pedidos' }).click();
  await expect(semNome.locator('.pedido-cobranca-destinatarios')).toHaveText('Para: Não informado');
  await expect(page).toHaveURL(/\/cobranca/);
});

test('seleção, impressão, baixa e reagendamento conservam suas ações', async ({ page }) => {
  const gravacoes = await preparar(page);
  await page.getByLabel('Selecionar 2 pedido(s) deste cliente para impressão').check();
  await expect(page.getByRole('region', { name: 'Ações para cobranças selecionadas' })).toBeVisible();
  await page.getByRole('button', { name: 'Imprimir selecionados (2)', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'A impressão foi concluída?' })).toBeVisible();
  expect(await page.evaluate(() => window.impressoNoTeste)).toBe(true);
  await page.getByRole('button', { name: 'Não, cancelei' }).click();
  expect(gravacoes).toHaveLength(0);
  await page.getByRole('button', { name: 'Dar baixa em todos' }).click();
  await expect(page.getByRole('dialog', { name: /Dar baixa/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Reagendar', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: /Reagendar/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Ao Vivo', exact: true }).click();
  await page.getByRole('button', { name: 'Dar baixa', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: /Dar baixa/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar pagamento' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(gravacoes).toHaveLength(0);
});

test('controles das duas modalidades são acessíveis', async ({ page }) => {
  await preparar(page);
  for (const modalidade of ['Fonada', 'Ao Vivo']) {
    await page.getByRole('button', { name: modalidade, exact: true }).click();
    await expect(page.getByRole('region', { name: 'Resumo financeiro da consulta' })).toBeVisible();
    const resultado = await new AxeBuilder({ page }).include('.cobranca-moderna').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(resultado.violations).toEqual([]);
  }
});
