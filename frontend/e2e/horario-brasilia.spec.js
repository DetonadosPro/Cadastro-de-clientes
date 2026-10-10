import { test, expect } from '@playwright/test';

test('relógio e novos pedidos mostram Brasília mesmo com o navegador em Tóquio; edição mantém data histórica', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-10T02:55:00Z'));
  await page.addInitScript(() => { localStorage.setItem('pombo_token', 'token-simulado'); localStorage.setItem('pombo_usuario', 'QA'); });
  await page.route('**/api/**', async route => {
    const caminho = new URL(route.request().url()).pathname;
    if (caminho === '/api/clientes/1') return route.fulfill({ json: { cliente: { id: 1, nome: 'CLIENTE TESTE' } } });
    if (/proxima-os$/.test(caminho)) return route.fulfill({ json: { proximaOs: 'QA-123' } });
    if (caminho === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (caminho === '/api/fonadas/123') return route.fulfill({ json: { id: 123, cliente_id: 1, nome_comprador: 'CLIENTE TESTE', data_pedido: '10/07/26', horario_pedido: '10:25', valor: 12, versao: 1 } });
    if (caminho === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
    return route.fulfill({ json: { tentativas: [], fonada: [], aoVivo: [], lembretes: [], contagens: [] } });
  });
  for (const caminho of ['/fonada/novo?clienteId=1', '/ao-vivo/novo?clienteId=1']) {
    await page.goto(caminho);
    await expect(page.locator('.workspace-relogio')).toHaveText('23:55');
    const registro = page.locator('.section-box').filter({ has: page.getByText('Registro do pedido', { exact: true }) });
    await expect(registro).toContainText('09/10/26');
    await expect(registro).toContainText('23:55');
  }
  await page.goto('/fonada/123');
  await expect(page.locator('.pf-registro')).toContainText('10/07/26');
  await expect(page.locator('.pf-registro')).toContainText('10:25');
  await expect(page.locator('.workspace-relogio')).toHaveText('23:55');
});
