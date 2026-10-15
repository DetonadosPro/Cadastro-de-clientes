import { test, expect } from '@playwright/test';

async function preparar(page) {
  const consultas = [];
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado');
    localStorage.setItem('pombo_usuario', 'QA');
    localStorage.setItem('pombo_nome', 'Operador de exemplo');
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    expect(route.request().method()).toBe('GET');
    if (url.pathname === '/api/cobranca') {
      consultas.push(Object.fromEntries(url.searchParams));
      return route.fulfill({ json: { pedidos: [{ id: 10, cliente_id: 100, nome: 'Ana Maria', senha_os: '123', cobranca: '15/10/26', valor: 50, pagou: 'NÃO', formaPagamento: 'PIX' }] } });
    }
    if (url.pathname === '/api/clientes/100') return route.fulfill({ json: { cliente: { id: 100, nome: 'Ana Maria', criado_em: '2025-01-01' }, pedidosFonada: [], pedidosAoVivo: [] } });
    if (/^\/api\/fonadas\/\d+$/.test(url.pathname)) return route.fulfill({ json: { id: Number(url.pathname.split('/').at(-1)), cliente_id: 100, nome_comprador: 'Ana Maria', valor: 50, senha_os: '123', versao: 1 } });
    if (url.pathname === '/api/cobranca/ao-vivo') return route.fulfill({ json: { pedidos: [{ id: 10, cliente_id: 100, nome: 'Ana Maria', numero_os: '123', dataCobranca: '15/10/26', valor: 50, pagou: 'NÃO' }] } });
    if (url.pathname === '/api/ao-vivo/10') return route.fulfill({ json: { id: 10, cliente_id: 100, comprador: 'Ana Maria', numero_os: '123', valor: 50, versao: 1 } });
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n' });
    return route.fulfill({ json: { tentativas: [] } });
  });
  return consultas;
}

const data = page => page.getByPlaceholder('dd/mm/aa');
const cliente = page => page.getByRole('button', { name: 'Ana Maria', exact: true });

for (const retorno of ['botão Voltar', 'voltar do navegador']) {
  test(`data e filtros permanecem ao abrir cliente e usar ${retorno}`, async ({ page }) => {
    const consultas = await preparar(page);
    await page.goto('/cobranca');
    await data(page).fill('15/10/26');
    await page.getByPlaceholder('Nome do comprador').fill('Ana');
    await page.getByPlaceholder('Número exato').fill('123');
    await page.getByLabel('Forma para impressão').selectOption('pix');
    await expect(cliente(page)).toBeVisible();
    await cliente(page).click();
    await expect(page).toHaveURL(/\/clientes\/100$/);
    if (retorno === 'botão Voltar') await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    else await page.goBack();
    await expect(data(page)).toHaveValue('15/10/26');
    await expect(page.getByPlaceholder('Nome do comprador')).toHaveValue('Ana');
    await expect(page.getByPlaceholder('Número exato')).toHaveValue('123');
    await expect(page.getByLabel('Forma para impressão')).toHaveValue('pix');
    await expect(cliente(page)).toBeVisible();
    expect(consultas.at(-1)).toMatchObject({ cobrarDia: '15/10/26', nome: 'Ana', os: '123' });
    await page.reload();
    await expect(data(page)).toHaveValue('15/10/26');
    await expect(cliente(page)).toBeVisible();
    expect(consultas.at(-1).cobrarDia).toBe('15/10/26');
  });
}

test('abrir cliente logo após editar filtro mantém a pesquisa mais recente', async ({ page }) => {
  await preparar(page);
  await page.goto('/cobranca?filtro=data&cobrarDia=15%2F10%2F26');
  await expect(cliente(page)).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByPlaceholder('Nome do comprador').fill('Ana Maria');
  await cliente(page).click();
  await expect(page).toHaveURL(/\/clientes\/100$/);
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(data(page)).toHaveValue('15/10/26');
  await expect(page.getByPlaceholder('Nome do comprador')).toHaveValue('Ana Maria');
});

for (const modalidade of ['Fonada', 'Ao Vivo']) {
  for (const recarregar of [false, true]) test(`${modalidade}: Voltar do pedido restaura a cobrança filtrada${recarregar ? ' após recarregar' : ' e expandida'}`, async ({ page }) => {
    await preparar(page);
    const origem = modalidade === 'Fonada'
      ? '/cobranca?filtro=data&cobrarDia=15%2F10%2F26&nome=Ana&os=123&forma=pix'
      : '/cobranca?sistema=AOVIVO&avNome=Ana&avOs=123';
    await page.goto(origem);
    await expect(cliente(page)).toBeVisible();
    if (modalidade === 'Fonada') await page.getByRole('button', { name: 'Expandir pedidos' }).click();
    await page.getByRole('button', { name: 'Abrir pedido', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
    if (recarregar) await page.reload();
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/cobranca\\?'));
    await expect(page.getByPlaceholder('Nome do comprador')).toHaveValue('Ana');
    await expect(page.getByPlaceholder('Número exato')).toHaveValue('123');
    if (modalidade === 'Fonada') {
      await expect(data(page)).toHaveValue('15/10/26');
      await expect(page.getByLabel('Forma para impressão')).toHaveValue('pix');
      if (!recarregar) await expect(page.getByRole('button', { name: 'Recolher pedidos' })).toBeVisible();
    } else await expect(page.getByRole('button', { name: 'Ao Vivo', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(cliente(page)).toBeVisible();
  });
}

test('navegar entre pedidos mantém a origem da cobrança e os filtros mais recentes', async ({ page }) => {
  await preparar(page);
  await page.goto('/cobranca?filtro=data&cobrarDia=15%2F10%2F26&forma=pix');
  await expect(cliente(page)).toBeVisible();
  await page.getByRole('button', { name: 'Expandir pedidos' }).click();
  await page.evaluate(() => sessionStorage.setItem('fonadaListaNavegacao', '[10,11]'));
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.getByPlaceholder('Nome do comprador').fill('Ana');
  await page.getByPlaceholder('Número exato').fill('123');
  await page.getByRole('button', { name: 'Abrir pedido', exact: true }).click();
  await page.getByTitle('Próximo pedido na busca').click();
  await expect(page).toHaveURL(/\/fonada\/11$/);
  const retorno = await page.evaluate(() => window.history.state.usr?.returnTo);
  expect(new URL(retorno, 'http://teste').searchParams.get('nome')).toBe('Ana');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByPlaceholder('Nome do comprador')).toHaveValue('Ana');
  await expect(page.getByPlaceholder('Número exato')).toHaveValue('123');
  await expect(data(page)).toHaveValue('15/10/26');
  await expect(page.getByLabel('Forma para impressão')).toHaveValue('pix');
  await page.clock.resume();
  await expect(page.getByRole('button', { name: 'Recolher pedidos' })).toBeVisible();
});

test('limpar a data remove a pesquisa por dia também após recarregar', async ({ page }) => {
  const consultas = await preparar(page);
  await page.goto('/cobranca?filtro=data&cobrarDia=15%2F10%2F26');
  await expect(cliente(page)).toBeVisible();
  await data(page).fill('');
  await expect.poll(() => new URL(page.url()).searchParams.has('cobrarDia')).toBe(false);
  await expect(cliente(page)).toBeVisible();
  await page.reload();
  await expect(data(page)).toHaveValue('');
  await expect(cliente(page)).toBeVisible();
  expect(consultas.at(-1)).not.toHaveProperty('cobrarDia');
});
