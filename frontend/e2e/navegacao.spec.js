import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { usuario, senha, isolado, entrar, criarOperadorDeTeste } from './apoio.js';
import AxeBuilder from '@axe-core/playwright';

test('login inválido não abre o sistema', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill(usuario);
  await page.getByLabel('Senha').fill('SENHA_QA_INCORRETA');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible();
});

test('rotas principais abrem diretamente sem erro de execução', async ({ page }) => {
  await entrar(page);
  const rotas = [
    ['/agenda', 'Agenda'], ['/clientes', 'Clientes'], ['/clientes/novo', 'Novo cliente'],
    ['/clientes/lixeira', 'Lixeira'], ['/fonada', 'Fonada'],
    ['/fonada/hoje', 'Fonada de hoje'], ['/ao-vivo', 'Ao vivo'],
    ['/ao-vivo/hoje', 'Ao vivo de hoje'],
    ['/cobranca', 'Cobrança'], ['/recall', 'Recall'], ['/relatorios', 'Relatórios'],
  ];
  const erros = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  for (const [rota, titulo] of rotas) {
    await page.goto(rota);
    await expect(page.getByRole('heading', { name: titulo, exact: true }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Cannot read properties');
  }
  for (const rota of ['/fonada/novo', '/ao-vivo/novo']) {
    await page.goto(rota);
    await expect(page.getByText('O pedido precisa de um cliente')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Escolher cliente' })).toBeVisible();
  }
  expect(erros).toEqual([]);
});

test('URLs inexistentes e IDs inválidos recebem respostas compreensíveis', async ({ page, request }) => {
  await entrar(page);
  await page.goto('/pagina-que-nao-existe');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Ir para a Agenda' }).click();
  await expect(page).toHaveURL(/\/agenda(?:\?|$)/);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  for (const recurso of ['clientes', 'fonadas', 'ao-vivo']) {
    const invalido = await request.get(`/api/${recurso}/abc`, { headers: { Authorization: `Bearer ${token}` } });
    expect(invalido.status(), recurso).toBe(400);
    const inexistente = await request.get(`/api/${recurso}/999999999`, { headers: { Authorization: `Bearer ${token}` } });
    expect(inexistente.status(), recurso).toBe(404);
  }
});

test('acessibilidade automática das telas de acesso e principais áreas', async ({ page }) => {
  test.setTimeout(240000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const rota of ['/login', '/gerenciar-usuarios']) {
    await page.goto(rota);
    await page.waitForTimeout(800);
    const resultado = await new AxeBuilder({ page }).analyze();
    expect(resultado.violations.filter((v) => ['critical', 'serious'].includes(v.impact)), rota).toEqual([]);
  }
  await entrar(page);
  for (const rota of ['/agenda', '/clientes', '/clientes/novo', '/clientes/lixeira', '/cobranca', '/recall']) {
    await page.goto(rota);
    await page.waitForTimeout(800);
    const resultado = await new AxeBuilder({ page }).analyze();
    expect(resultado.violations.filter((v) => ['critical', 'serious'].includes(v.impact)), rota).toEqual([]);
  }
});

test('sem rolagem horizontal de página nas principais larguras', async ({ page }) => {
  test.setTimeout(180000);
  await entrar(page);
  const tamanhos = [320, 360, 375, 390, 412, 480, 600, 768, 820, 1024, 1280, 1366, 1440, 1536, 1920, 2560];
  for (const rota of ['/agenda', '/clientes', '/clientes/novo', '/clientes/lixeira', '/cobranca', '/recall']) {
    for (const largura of tamanhos) {
      await page.setViewportSize({ width: largura, height: largura < 700 ? 800 : 900 });
      await page.goto(rota);
      await page.locator('.layout-pagina').waitFor();
      await page.waitForTimeout(120);
      const dimensoes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, conteudo: document.documentElement.scrollWidth }));
      expect.soft(dimensoes.conteudo, `${rota} em ${largura}px`).toBeLessThanOrEqual(dimensoes.viewport + 1);
    }
  }
});

test('campo de nascimento cabe por inteiro no cadastro móvel', async ({ page }) => {
  await entrar(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/clientes/novo');
  const nascimento = await page.locator('#novo-nascimento').boundingBox();
  expect(nascimento.width).toBeGreaterThan(180);
});
