import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const cliente = { id: 1, nome: 'MARIA APARECIDA DE OLIVEIRA', nascimento: '27/08/90', whatsapp: '(34) 9 9999-1111', celular: '(34) 9 8888-2222', fixo: '(34) 3333-2222', endereco: 'RUA DAS FLORES, 120', bairro: 'CENTRO', complemento: 'CASA 2', referencia: 'PORTÃO AZUL', criado_em: '2026-08-20T02:10:20Z', total_fonada: 40, total_aovivo: 10, valor_pendente: 60 };
const resumo = { total_pedidos: 50, total_fonada: 40, total_aovivo: 10, pedidos_pendentes: 3, total_comprado: '700.00', valor_pendente: '60.00' };
const compras = Array.from({ length: 5 }, (_, i) => ({ id: 20 + i, os: String(120 + i), tipo: i === 1 ? 'Ao vivo' : 'Fonada', data_pedido: `${10 - i}/10/26`.padStart(8, '0'), valor: i === 1 ? 60 : 12, pagou: i < 2 ? 'SIM' : '', rota: `${i === 1 ? '/ao-vivo' : '/fonada'}/${20 + i}` }));
const haver = [{ id: 1, os: '101', dataExpiracao: '09/12/2026' }, { id: 2, os: '102', dataExpiracao: '10/10/2026' }, { id: 3, os: '103', dataExpiracao: '11/10/2026' }, { id: 4, os: '104', dataExpiracao: '10/11/2026' }].map(p => ({ ...p, rota: `/fonada/${p.id}`, dataCompra: '10/07/26', tema: 'ANIVERSÁRIO', destinatario: 'JOSÉ' }));

async function preparar(page, opcoes = {}) {
  const estado = { erro: Boolean(opcoes.erro), escritas: [], consultas: 0 };
  const registro = { ...cliente, ...opcoes.cliente };
  await page.clock.install({ time: new Date('2026-10-10T03:30:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'simulado'); localStorage.setItem('pombo_usuario', 'QA'); localStorage.setItem('pombo_nome', 'Operador de exemplo');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async texto => { window.telefoneCopiado = texto; } } });
  });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') estado.escritas.push(url.pathname);
    if (url.pathname === '/api/clientes') return route.fulfill({ json: { clientes: [registro], total: 1 } });
    if (url.pathname === '/api/clientes/1/resumo') {
      estado.consultas++;
      if (estado.erro) return route.fulfill({ status: 500, json: { erro: 'Consulta indisponível.' } });
      return route.fulfill({ json: { cliente: registro, resumo: opcoes.vazio ? { total_pedidos: 0, total_comprado: 0 } : resumo, ultimasCompras: opcoes.vazio ? [] : compras, mensagensEmHaver: opcoes.vazio ? [] : haver } });
    }
    if (url.pathname === '/api/clientes/1') return route.fulfill({ json: { cliente: registro, pedidosFonada: [], pedidosAoVivo: [] } });
    if (/^\/api\/fonadas\/\d+$/.test(url.pathname)) return route.fulfill({ json: { id: Number(url.pathname.split('/').pop()), senha_os: '102', cliente_id: 1, versao: 1, valor: 12 } });
    if (url.pathname === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
    return route.fulfill({ json: { fonada: [], aoVivo: [], tentativas: [], lembretes: [], contagens: [], clientes: [], total: 0 } });
  });
  await page.goto('/clientes?busca=MARIA');
  await page.getByRole('button', { name: registro.nome, exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: 'Resumo do cliente' });
  await expect(dialogo).toBeVisible();
  return { estado, dialogo };
}

test('totais são do histórico completo; contatos, prazo e senha existente ficam acessíveis', async ({ page }) => {
  const { estado, dialogo } = await preparar(page);
  await expect(dialogo.getByRole('heading', { name: cliente.nome })).toBeVisible();
  const metricas = dialogo.locator('.cr-metrica');
  await expect(metricas.nth(0)).toContainText('R$ 700,00');
  await expect(metricas.nth(0)).toContainText('R$ 14,00');
  await expect(metricas.nth(1)).toContainText('40 fonada · 10 ao vivo');
  await expect(metricas.nth(2)).toContainText('R$ 60,00');
  await expect(metricas.nth(3)).toContainText('10/10/26');
  await expect(dialogo.getByText('No sistema desde 19/08/2026')).toBeVisible();
  await expect(dialogo.getByRole('link', { name: 'Abrir WhatsApp', exact: true })).toHaveAttribute('href', 'https://wa.me/5534999991111');
  await expect(dialogo.getByRole('link', { name: 'Ligar', exact: true })).toHaveAttribute('href', 'tel:+5534999991111');
  await dialogo.getByRole('button', { name: 'Copiar telefone' }).click();
  await expect(dialogo.getByText('Telefone copiado.')).toBeVisible();
  expect(await page.evaluate(() => window.telefoneCopiado)).toBe(cliente.whatsapp);
  await expect(dialogo.locator('.cr-haver-lista button')).toHaveCount(3);
  await expect(dialogo.locator('.cr-haver-lista button').first()).toContainText('O.S. 102');
  await expect(dialogo.locator('.cr-haver-lista button').first()).toContainText('Vence hoje');
  await dialogo.getByRole('button', { name: 'Ver todas as 4 mensagens' }).click();
  await expect(dialogo.locator('.cr-haver-lista button')).toHaveCount(4);
  await expect(dialogo.locator('.cr-haver-lista button').last()).toContainText('O.S. 101');
  await dialogo.getByRole('button', { name: 'Abrir 2ª mensagem da O.S. 102' }).click();
  await expect(page).toHaveURL(/\/fonada\/2$/);
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(dialogo.getByRole('heading', { name: cliente.nome })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('busca')).toBe('MARIA');
  expect(new URL(page.url()).searchParams.get('cliente')).toBe('1');
  expect(estado.escritas).toEqual([]);
});

test('histórico compacto preserva pagamento, detalhes e acesso à ficha', async ({ page }) => {
  const { estado, dialogo } = await preparar(page);
  await expect(dialogo.locator('.cr-compras button')).toHaveCount(5);
  await expect(dialogo.locator('.cr-compras button').first()).toContainText('Recebido');
  await expect(dialogo.locator('.cr-compras button').last()).toContainText('Pendente');
  await dialogo.getByText('Todos os contatos', { exact: true }).click();
  await expect(dialogo.locator('.cr-contatos-detalhes')).toContainText(cliente.fixo);
  await dialogo.locator('.cr-cadastro summary').click();
  await expect(dialogo.getByText(cliente.referencia, { exact: true })).toBeVisible();
  await expect(dialogo.getByText(cliente.complemento, { exact: true })).toBeVisible();
  await dialogo.locator('.cr-metrica').nth(2).click();
  await expect(page).toHaveURL(/\/cobranca\?/);
  expect(new URL(page.url()).searchParams.get('nome')).toBe(cliente.nome);
  expect(new URL(page.url()).searchParams.get('avNome')).toBe(cliente.nome);
  await page.goBack();
  await expect(dialogo.getByRole('heading', { name: cliente.nome })).toBeVisible();
  await dialogo.getByRole('button', { name: 'Ficha completa', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes\/1$/);
  expect(estado.escritas).toEqual([]);
});

test('erro pode ser repetido; cadastro bloqueado e sem contatos tem ações seguras', async ({ page }) => {
  const { estado, dialogo } = await preparar(page, { erro: true, vazio: true, cliente: { whatsapp: '000000', celular: '', fixo: '-', nascimento: '00/00/0000', criado_em: 'inválida', bloqueado: true, bloqueio_motivo: 'A pedido do cliente' } });
  await expect(dialogo.getByRole('alert')).toContainText('Consulta indisponível');
  estado.erro = false;
  await dialogo.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(dialogo.getByRole('button', { name: 'Nova fonada', exact: true })).toBeDisabled();
  await expect(dialogo.getByRole('button', { name: 'Novo ao vivo', exact: true })).toBeDisabled();
  await expect(dialogo).toContainText('A pedido do cliente');
  await expect(dialogo).toContainText('Nenhum telefone válido');
  await expect(dialogo).toContainText('O histórico começa com o primeiro pedido');
  await expect(dialogo.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveCount(0);
  await expect(dialogo.locator('.cr-metricas')).toContainText('R$ 0,00');
  await expect(dialogo).not.toContainText('Invalid Date');
  await expect(dialogo.getByRole('button', { name: 'Completar contato', exact: true })).toBeEnabled();
  expect(estado.consultas).toBe(2);
  expect(estado.escritas).toEqual([]);
});

test('teclado e fechamento preservam foco e filtros da lista', async ({ page }) => {
  const { dialogo, estado } = await preparar(page);
  const fechar = dialogo.getByRole('button', { name: 'Fechar painel' });
  await expect(fechar).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialogo.getByRole('button', { name: 'Novo ao vivo', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(fechar).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByRole('button', { name: cliente.nome, exact: true })).toBeFocused();
  expect(new URL(page.url()).searchParams.get('busca')).toBe('MARIA');
  expect(new URL(page.url()).searchParams.has('cliente')).toBe(false);
  await page.getByRole('button', { name: cliente.nome, exact: true }).click();
  await expect(dialogo).toBeVisible();
  await page.locator('.cliente-rapido-overlay').click({ position: { x: 10, y: 200 } });
  await expect(dialogo).toHaveCount(0);
  expect(estado.escritas).toEqual([]);
});

test('desktop e celular mantêm ações fixas, leitura, contraste e largura adequada', async ({ page }, testInfo) => {
  const erros = []; page.on('pageerror', erro => erros.push(erro.message));
  const { dialogo } = await preparar(page);
  await expect(dialogo.locator('.cr-metricas')).toContainText('R$ 700,00');
  for (const width of [1920, 1600, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 600 ? 780 : 1000 });
    expect(await dialogo.evaluate(el => el.scrollWidth > el.clientWidth + 1), `Transbordamento em ${width}px`).toBe(false);
    const botao = await dialogo.getByRole('button', { name: 'Ficha completa', exact: true }).boundingBox();
    expect(botao.x + botao.width).toBeLessThanOrEqual(width);
    expect(botao.y + botao.height).toBeLessThanOrEqual(width < 600 ? 780 : 1000);
    await dialogo.locator('.cr-corpo').evaluate(el => { el.scrollTop = 0; });
    if ([1600, 390].includes(width)) await page.screenshot({ path: testInfo.outputPath(`visao-rapida-${width}.png`) });
    if ([1600, 320].includes(width)) {
      const resultado = await new AxeBuilder({ page }).include('.cliente-rapido').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(resultado.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    }
    await dialogo.locator('.cr-corpo').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(dialogo.locator('.cr-cadastro summary')).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Nova fonada', exact: true })).toBeInViewport();
  }
  expect(erros).toEqual([]);
});
