import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const venda = {
  id: 101, senha_os: '37001', cliente_id: 1, nome_comprador: 'MARIA APARECIDA DA SILVA DE OLIVEIRA',
  comprador_celular: '(34) 9 9999-8888', data_pedido: '07/10/26', horario_pedido: '16:30',
  p1_para: 'ANA CLARA', p1_dia: '10/10/26', p1_horario: '09:30', p1_tema: 'ANIVERSÁRIO ESPECIAL', p1_mensagem: '123',
  vendedor_usuario: 'ana', vendedor_nome: 'Ana Paula', valor: 12.10, pagou: 'SIM', data_pagamento: '07/10/26',
  cobranca: '08/10/26', periodo: 'PIX', recall: 'SIM', recall_codigo: '0010', versao: 1,
};
const vendas = [
  venda,
  { ...venda, id: 102, senha_os: '37002', cliente_id: 2, nome_comprador: 'JOÃO CARLOS', valor: 20.20, pagou: 'NÃO', recall: 'NÃO', horario_pedido: '15:20', vendedor_usuario: 'bruno', vendedor_nome: 'Bruno', p1_para: 'FERNANDA', periodo: 'TARDE' },
  { ...venda, id: 103, senha_os: '37003', cliente_id: 3, nome_comprador: 'LÚCIA', valor: 9.70, pagou: 'NÃO', recall: 'NÃO', horario_pedido: '14:00', p2_para: 'PEDRO', p2_dia: '11/10/26', periodo: 'MANHÃ' },
];

async function preparar(page, { muitos = false, vazio = false, erro = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-07T20:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado'); localStorage.setItem('pombo_usuario', 'QA');
  });
  const lista = vazio ? [] : muitos ? Array.from({ length: 51 }, (_, i) => ({ ...venda, id: i + 1, senha_os: String(i + 1), nome_comprador: `CLIENTE ${i + 1}`, valor: 0.10 })) : vendas;
  const estado = { erro, consultas: 0, lista };
  await page.route('**/api/**', async route => {
    const caminho = new URL(route.request().url()).pathname;
    if (caminho === '/api/fonadas/hoje') {
      estado.consultas++;
      return estado.erro ? route.fulfill({ status: 500, json: { erro: 'Falha simulada de consulta.' } })
        : route.fulfill({ json: { data: '07/10/26', fonadas: estado.lista } });
    }
    if (/^\/api\/fonadas\/\d+$/.test(caminho)) return route.fulfill({ json: lista.find((p) => p.id === Number(caminho.split('/').at(-1))) || venda });
    if (/^\/api\/clientes\/\d+$/.test(caminho)) return route.fulfill({ json: { cliente: { id: 1, nome: venda.nome_comprador }, fonada: [], aoVivo: [] } });
    if (caminho === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (caminho === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
    return route.fulfill({ json: { tentativas: [], fonada: [], aoVivo: [], lembretes: [], contagens: [] } });
  });
  await page.goto('/fonada/hoje');
  return estado;
}

test('vendas do dia mostram horário de compra, total, ticket e pagamentos, incluindo entregas futuras', async ({ page }) => {
  await preparar(page);
  await expect(page.getByRole('heading', { name: 'Vendas de hoje', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vendas de hoje', exact: true })).toHaveAttribute('aria-current', 'page');
  const cards = page.locator('.vendas-fonada-indicador');
  await expect(cards.nth(0)).toContainText('3 clientes atendidos');
  await expect(cards.nth(1)).toContainText('R$ 42,00');
  await expect(cards.nth(1)).toContainText('Ticket médio R$ 14,00');
  await expect(cards.nth(2)).toContainText('R$ 12,10');
  await expect(cards.nth(3)).toContainText('R$ 29,90');
  await expect(page.locator('.venda-fonada-item')).toHaveCount(3);
  await expect(page.locator('#venda-fonada-101 .venda-fonada-registro')).toContainText('16:30');
  await expect(page.locator('#venda-fonada-101')).toContainText('Envio 10/10/26 às 09:30');
  await expect(page.locator('.vendas-fonada-ranking')).toContainText('Ana Paula');
  await expect(page.locator('.vendas-fonada-ranking')).toContainText('R$ 21,80');
});

test('busca, situação, vendedor e ordenação combinam sem alterar os totais do dia', async ({ page }) => {
  await preparar(page);
  const resumo = page.locator('.vendas-fonada-indicador').nth(1);
  await page.getByRole('searchbox', { name: 'Buscar nas vendas de hoje' }).fill('joao');
  await expect(page.locator('.venda-fonada-item')).toHaveCount(1);
  await expect(resumo).toContainText('R$ 42,00');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByRole('button', { name: /^A receber\s*2$/ }).click();
  await expect(page.locator('.venda-fonada-item')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Filtrar por vendedor' }).selectOption('ana');
  await expect(page.locator('.venda-fonada-item')).toHaveCount(1);
  await expect(page.locator('.vendas-fonada-resultados')).toContainText('R$ 9,70 neste filtro');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByRole('combobox', { name: 'Ordenar vendas' }).selectOption('valor');
  await expect(page.locator('.venda-fonada-item').first()).toHaveAttribute('id', 'venda-fonada-102');
  await page.getByRole('button', { name: /^Recall\s*1$/ }).click();
  await expect(page.locator('.venda-fonada-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByRole('searchbox').fill('34999998888');
  await expect(page.locator('.venda-fonada-item')).toHaveCount(3);
  await page.getByRole('searchbox').fill('nome inexistente');
  await expect(page.getByText('Nenhuma venda com esses filtros')).toBeVisible();
  await expect(resumo).toContainText('R$ 42,00');
});

test('mensagens para passar hoje de vendas antigas não aparecem nem entram nos totais', async ({ page }) => {
  const estado = await preparar(page);
  estado.lista = [...vendas,
    { ...venda, id: 900, nome_comprador: 'VENDA ANTIGA PRIMEIRA', data_pedido: '06/10/26', p1_dia: '07/10/26', valor: 80 },
    { ...venda, id: 901, nome_comprador: 'VENDA ANTIGA SEGUNDA', data_pedido: '01/10/26', p2_dia: '07/10/26', valor: 90 },
    { ...venda, id: 902, nome_comprador: 'VENDA HOJE ENVIO FUTURO', data_pedido: '07/10/2026', p1_dia: '20/10/26', valor: 10 },
  ];
  await page.getByRole('button', { name: 'Atualizar vendas' }).click();
  await expect(page.locator('.venda-fonada-item')).toHaveCount(4);
  await expect(page.locator('#venda-fonada-900')).toHaveCount(0);
  await expect(page.locator('#venda-fonada-901')).toHaveCount(0);
  await expect(page.locator('#venda-fonada-902')).toContainText('Venda 07/10/2026');
  await expect(page.locator('.vendas-fonada-indicador').nth(1)).toContainText('R$ 52,00');
});

test('lista compacta funciona em telas grandes e pequenas e mantém informações legíveis', async ({ page }, testInfo) => {
  const erros = []; page.on('pageerror', (err) => erros.push(err.message));
  await preparar(page);
  await expect(page.locator('.venda-fonada-item')).toHaveCount(3);
  for (const width of [1920, 1600, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `Transbordamento em ${width}px`).toBe(false);
    const item = page.locator('#venda-fonada-101');
    await expect(item).toContainText('MARIA APARECIDA DA SILVA DE OLIVEIRA');
    await expect(item.locator('.venda-fonada-valor')).toBeVisible();
    if (width === 1600) expect((await item.boundingBox()).height).toBeLessThan(145);
    if ([1600, 390].includes(width)) await page.screenshot({ path: testInfo.outputPath(`vendas-hoje-${width}.png`), fullPage: true });
  }
  expect(erros).toEqual([]);
  const resultado = await new AxeBuilder({ page }).include('.vendas-fonada-pagina').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(resultado.violations).toEqual([]);
});

test('abre a venda por teclado e conserva filtros e seleção ao voltar', async ({ page }) => {
  await preparar(page);
  await page.getByRole('searchbox').fill('maria');
  const item = page.locator('#venda-fonada-101'); await item.focus(); await item.press('Enter');
  await expect(page).toHaveURL(/\/fonada\/101$/);
  await page.goBack();
  await expect(page.getByRole('searchbox')).toHaveValue('maria');
  await expect(page.locator('#venda-fonada-101')).toHaveClass(/selecionada/);
});

test('resumo inclui a 51ª venda antes de expandir e retorno a ela restaura a expansão', async ({ page }) => {
  await preparar(page, { muitos: true });
  await expect(page.locator('.venda-fonada-item')).toHaveCount(50);
  await expect(page.locator('.vendas-fonada-indicador').nth(1)).toContainText('R$ 5,10');
  await page.getByRole('button', { name: /Mostrar mais/ }).click();
  await expect(page.locator('.venda-fonada-item')).toHaveCount(51);
  await page.locator('#venda-fonada-1').click();
  await expect(page).toHaveURL(/\/fonada\/1$/);
  await page.goBack();
  await expect(page.locator('.venda-fonada-item')).toHaveCount(51);
  await expect(page.locator('#venda-fonada-1')).toHaveClass(/selecionada/);
});

test('dia vazio tem totais zerados e falha inicial permite tentar novamente', async ({ page }) => {
  await preparar(page, { vazio: true });
  await expect(page.getByText('Nenhuma venda de Fonada hoje')).toBeVisible();
  await expect(page.locator('.vendas-fonada-indicador').nth(1)).toContainText('R$ 0,00');
  const estado = await preparar(page, { erro: true });
  await expect(page.getByText('Falha simulada de consulta.')).toBeVisible();
  await expect(page.getByText('Nenhuma venda de Fonada hoje')).not.toBeVisible();
  estado.erro = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.venda-fonada-item')).toHaveCount(3);
});

test('atualização preserva busca e avisa quando exibe os dados da última consulta', async ({ page }) => {
  const estado = await preparar(page);
  await page.getByRole('searchbox').fill('maria');
  estado.erro = true;
  await page.getByRole('button', { name: 'Atualizar vendas' }).click();
  await expect(page.getByRole('alert')).toContainText('Os dados exibidos são da última consulta concluída.');
  await expect(page.locator('.venda-fonada-item')).toHaveCount(1);
  estado.erro = false;
  estado.lista = [...vendas, { ...venda, id: 104, valor: 10 }];
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('.venda-fonada-item')).toHaveCount(2);
  await expect(page.locator('.vendas-fonada-indicador').nth(1)).toContainText('R$ 52,00');
  await expect(page.getByRole('searchbox')).toHaveValue('maria');
});
