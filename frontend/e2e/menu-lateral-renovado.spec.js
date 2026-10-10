import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function preparar(page, { compacto = false, url = '/clientes', agenda = false } = {}) {
  const estado = { escritas: [] };
  await page.clock.install({ time: new Date('2026-10-10T15:00:00Z') });
  await page.addInitScript(({ compacto }) => {
    localStorage.setItem('pombo_token', 'simulado'); localStorage.setItem('pombo_usuario', 'QA'); localStorage.setItem('pombo_nome', 'Operador de exemplo');
    if (localStorage.getItem('pombo_sidebar_compacta') === null) localStorage.setItem('pombo_sidebar_compacta', compacto ? '1' : '0');
  }, { compacto });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') estado.escritas.push(url.pathname);
    if (url.pathname === '/api/clientes') return route.fulfill({ json: { clientes: [], total: 0 } });
    if (url.pathname === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (url.pathname === '/api/clientes/possiveis-duplicatas') return route.fulfill({ json: { pares: [] } });
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
    if (url.pathname === '/api/agenda/hoje' && agenda) return route.fulfill({ json: { fonada: [{ pedidoId: 1, mensagem: 1, horario: '11:30', passada: false, dataPedido: '10/10/26', valor: 12 }], aoVivo: [], lembretes: [] } });
    if (url.pathname.includes('/relatorios')) return route.fulfill({ json: { resumo: {}, vendasPorDia: [], recebimentosPorDia: [], porDia: [], itens: [], pedidos: [], formasPagamento: [], desempenho: [], clientes: [], total: 0 } });
    if (url.pathname === '/api/fonadas') return route.fulfill({ json: { fonadas: [], total: 0 } });
    if (url.pathname === '/api/ao-vivo') return route.fulfill({ json: { aoVivo: [], total: 0 } });
    return route.fulfill({ json: { fonada: [], aoVivo: [], lembretes: [], contagens: [], clientes: [], pedidos: [], pares: [], itens: [], total: 0 } });
  });
  await page.goto(url);
  await expect(page.locator('.sidebar-renovada')).toBeAttached();
  return estado;
}

test('organização, rota ativa e atalho de vendas preservam a navegação', async ({ page }) => {
  const estado = await preparar(page);
  const menu = page.getByRole('complementary', { name: 'Menu principal' });
  await expect(menu).toContainText('Atendimento');
  await expect(menu).toContainText('Pedidos');
  await expect(menu).toContainText('Gestão');
  await expect(menu.getByRole('button', { name: 'Clientes', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const [titulo, rota] of [['Agenda', '/agenda'], ['Recall', '/recall'], ['Fonada', '/fonada'], ['Ao vivo', '/ao-vivo'], ['Cobrança', '/cobranca'], ['Relatórios', '/relatorios'], ['Configurações', '/configuracoes'], ['Lixeira', '/clientes/lixeira']]) {
    await expect(menu.getByRole('link', { name: titulo, exact: true })).toHaveAttribute('href', rota);
  }
  await menu.getByRole('link', { name: 'Vendas de hoje', exact: true }).click();
  await expect(page).toHaveURL(/\/fonada\/hoje$/);
  await expect(menu.getByRole('link', { name: 'Vendas de hoje', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: 'Fonada', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await menu.getByRole('link', { name: 'Lixeira', exact: true }).click();
  await expect(menu.getByRole('link', { name: 'Lixeira', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('button', { name: 'Clientes', exact: true })).not.toHaveAttribute('aria-current', 'page');
  expect(estado.escritas).toEqual([]);
});

test('menu recolhido persiste e mantém busca, identidade e todos os destinos acessíveis', async ({ page }) => {
  await preparar(page);
  const menu = page.locator('.sidebar-renovada');
  await menu.getByRole('button', { name: 'Recolher menu', exact: true }).click();
  await expect(menu).toHaveClass(/compacta/);
  expect(await page.evaluate(() => localStorage.getItem('pombo_sidebar_compacta'))).toBe('1');
  await page.reload();
  await expect(menu).toHaveClass(/compacta/);
  expect((await menu.boundingBox()).width).toBeLessThan(90);
  await expect(menu.getByRole('link', { name: 'Recall', exact: true })).toBeVisible();
  await expect(menu.locator('.ml-avatar')).toHaveAttribute('title', 'Operador de exemplo');
  await menu.getByRole('button', { name: 'Buscar no sistema', exact: true }).click();
  const busca = page.getByRole('dialog', { name: 'Busca global' });
  await expect(busca).toBeVisible();
  await page.keyboard.press('Escape');
  await menu.getByRole('button', { name: 'Expandir menu', exact: true }).click();
  await expect(menu).not.toHaveClass(/compacta/);
  await expect(menu.getByText('Operador de exemplo', { exact: true })).toBeVisible();
});

test('em andamento retoma e descarta rascunhos após confirmação, sem escrever cadastros', async ({ page }) => {
  const estado = await preparar(page);
  const menu = page.locator('.sidebar-renovada');
  await menu.getByRole('button', { name: 'Cadastrar novo cliente', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes\/novo\?rascunho=/);
  await page.getByLabel('Nome *', { exact: true }).fill('CLIENTE EM EDIÇÃO');
  await menu.getByRole('button', { name: 'Clientes', exact: true }).click();
  await menu.getByRole('button', { name: 'Em andamento, 1 rascunho(s)', exact: true }).click();
  const continuar = menu.getByRole('link', { name: /Cadastro CLIENTE EM EDIÇÃO/ });
  await continuar.click();
  await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('CLIENTE EM EDIÇÃO');
  await menu.getByRole('button', { name: /^Fechar rascunho Cadastro:/ }).click();
  const confirmar = page.getByRole('dialog', { name: 'Fechar rascunho' });
  await confirmar.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(menu.getByRole('button', { name: 'Em andamento, 1 rascunho(s)', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: /^Fechar rascunho Cadastro:/ }).click();
  await confirmar.getByRole('button', { name: 'Descartar rascunho', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Em andamento, 0 rascunho(s)', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/clientes$/);
  expect(estado.escritas).toEqual([]);
});

test('mobile contém foco, fecha por Escape e ao navegar, e respeita a preferência do desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page, { compacto: true });
  const abrir = page.getByRole('button', { name: 'Abrir menu', exact: true });
  await abrir.click();
  const menu = page.getByRole('dialog', { name: 'Menu principal' });
  await expect(menu.getByText('Gestão e atendimento', { exact: true })).toBeVisible();
  const fechar = menu.getByRole('button', { name: 'Fechar menu', exact: true });
  await expect(fechar).toBeFocused();
  expect(await page.locator('.layout-conteudo').evaluate(el => el.inert)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(menu.getByRole('button', { name: 'Sair da conta', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(fechar).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(abrir).toBeFocused();
  expect(await page.locator('.layout-conteudo').evaluate(el => el.inert)).toBe(false);
  await abrir.click();
  await menu.getByRole('button', { name: 'Clientes', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await abrir.click();
  await menu.getByRole('link', { name: 'Fonada', exact: true }).click();
  await expect(page).toHaveURL(/\/fonada$/);
  await expect(menu).toHaveCount(0);
  await abrir.click();
  await page.locator('.ml-overlay').click({ position: { x: 382, y: 200 } });
  await expect(menu).toHaveCount(0);
  await abrir.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('dialog', { name: 'Menu principal' })).toHaveCount(0);
  await expect(page.locator('.sidebar-renovada')).toHaveClass(/compacta/);
  expect(await page.locator('.layout-conteudo').evaluate(el => el.inert)).toBe(false);
});

test('contraste, teclado, impressão e tamanhos de tela preservam o menu e o conteúdo', async ({ page }, testInfo) => {
  const erros = []; page.on('pageerror', erro => erros.push(erro.message));
  await preparar(page);
  for (const [width, height] of [[1600, 1000], [1280, 720], [1024, 600], [900, 844], [768, 700], [390, 844], [320, 480]]) {
    await page.setViewportSize({ width, height });
    if (width <= 900) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    const menu = page.locator('.sidebar-renovada');
    const caixa = await menu.boundingBox();
    expect(caixa.x + caixa.width, `Largura em ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(caixa.y + caixa.height, `Altura em ${width}px`).toBeLessThanOrEqual(height + 1);
    expect(await menu.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await expect(menu.getByRole('button', { name: 'Sair da conta', exact: true })).toBeInViewport();
    await menu.getByRole('button', { name: 'Buscar no sistema', exact: true }).focus();
    await menu.getByRole('link', { name: 'Relatórios', exact: true }).focus();
    await expect(menu.getByRole('link', { name: 'Relatórios', exact: true })).toBeInViewport();
    if ([1600, 390, 320].includes(width)) {
      await page.screenshot({ path: testInfo.outputPath(`menu-${width}.png`) });
      const resultado = await new AxeBuilder({ page }).include('.sidebar-renovada').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(resultado.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    }
    if (width <= 900) await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar-renovada')).not.toBeVisible();
  expect(erros).toEqual([]);
});
