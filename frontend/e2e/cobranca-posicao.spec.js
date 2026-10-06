import { test, expect } from '@playwright/test';

async function preparar(page, modalidade) {
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado');
    localStorage.setItem('pombo_usuario', 'QA');
    localStorage.setItem('pombo_nome', 'Operador de exemplo');
  });
  const pedidos = Array.from({ length: 110 }, (_, i) => ({
    id: i + 1, cliente_id: i + 1, nome: `Cliente ${String(i + 1).padStart(3, '0')}`,
    senha_os: String(i + 1), numero_os: `AV${i + 1}`, cobranca: '15/10/26', dataCobranca: '15/10/26',
    valor: 50, pagou: 'NÃO', formaPagamento: 'PIX', destinatarios: ['Fernanda'], destinatario: 'Fernanda',
  }));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/cobranca' || url.pathname === '/api/cobranca/ao-vivo') {
      // A resposta chega depois das antigas tentativas de restaurar a rolagem.
      await new Promise(resolve => setTimeout(resolve, 800));
      return route.fulfill({ json: { pedidos } });
    }
    if (/^\/api\/clientes\/\d+$/.test(url.pathname)) return route.fulfill({ json: { cliente: { id: 75, nome: 'Cliente 075', criado_em: '2025-01-01' }, pedidosFonada: [], pedidosAoVivo: [] } });
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n' });
    return route.fulfill({ json: {} });
  });
  await page.goto(modalidade === 'Fonada' ? '/cobranca' : '/cobranca?sistema=AOVIVO');
  await page.getByRole('button', { name: /Mostrar mais/ }).click();
}

for (const modalidade of ['Fonada', 'Ao Vivo']) {
  for (const [voltar, largura] of [['botão', 1280], ['navegador', 1280], ['botão', 390]]) {
    test(`${modalidade}: retorno por ${voltar} em ${largura}px restaura posição, paginação e marca apenas o cliente consultado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await preparar(page, modalidade);
      const seletor = modalidade === 'Fonada' ? '.grupo-cobranca' : '.cobranca-aovivo-card';
      const card = page.locator(seletor).filter({ has: page.getByRole('button', { name: 'Cliente 075', exact: true }) });
      if (modalidade === 'Fonada') await card.getByRole('button', { name: 'Expandir pedidos' }).click();
      await card.getByRole('button', { name: 'Cliente 075', exact: true }).scrollIntoViewIfNeeded();
      const topo = await page.locator('main').evaluate(e => e.scrollTop + window.scrollY);
      expect(topo).toBeGreaterThan(1000);
      const armazenamentoAntes = await page.evaluate(() => Object.keys(sessionStorage));
      await card.getByRole('button', { name: 'Cliente 075', exact: true }).click();
      await expect(page).toHaveURL(/\/clientes\/75$/);
      if (voltar === 'botão') await page.getByRole('button', { name: 'Voltar', exact: true }).click();
      else await page.goBack();
      await expect(page.locator(`${seletor}.cb-retorno-marcado`)).toHaveCount(1);
      await expect(card).toHaveClass(/cb-retorno-marcado/);
      await expect(page.locator(seletor)).toHaveCount(100);
      await expect.poll(() => page.locator('main').evaluate(e => e.scrollTop + window.scrollY)).toBeCloseTo(topo, 0);
      if (modalidade === 'Fonada') await expect(card.getByRole('button', { name: 'Recolher pedidos' })).toBeVisible();
      // A cobrança não cria entradas de rolagem por URL nem armazena listas.
      const novasChaves = await page.evaluate(antes => Object.keys(sessionStorage).filter(k => !antes.includes(k)), armazenamentoAntes);
      expect(novasChaves.filter(k => !k.startsWith('pombo-scroll:'))).toEqual([]);
      expect(novasChaves.filter(k => k.startsWith('pombo-scroll:')).length).toBeLessThanOrEqual(1);
      await page.clock.fastForward(8100);
      await expect(page.locator('.cb-retorno-marcado')).toHaveCount(0);
      await page.reload();
      await expect(page.locator(seletor)).toHaveCount(50);
      await expect(page.locator('.cb-retorno-marcado')).toHaveCount(0);
    });
  }
}
