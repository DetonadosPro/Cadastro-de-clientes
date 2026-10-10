import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const cliente = { id: 1, nome: 'MARIA APARECIDA DE OLIVEIRA', nascimento: '27/08/90', whatsapp: '(34) 9 9999-1111', celular: '(34) 9 9999-1111', fixo: '(34) 3333-2222', endereco: 'RUA DAS FLORES, 120', bairro: 'CENTRO', complemento: 'CASA 2', referencia: 'PORTÃO AZUL', criado_em: '2026-08-20T14:10:20Z', versao: 2 };
const fonada = [
  { id: 11, senha_os: '110', data_pedido: '10/07/26', p1_para: 'JOSÉ', p1_dia: '10/07/26', p1_resultado: 'OK', pagou: 'SIM', periodo: 'PIX', valor: 12, mensagemEmHaver: { disponivel: true, concedida: true, status: 'DISPONIVEL', dataExpiracao: '10/10/2026' } },
  { id: 12, senha_os: '120', data_pedido: '09/10/26', p1_para: 'ANA', p1_dia: '11/10/26', p1_horario: '10:30', pagou: '', valor: 20 },
  { id: 13, senha_os: '130', data_pedido: '08/10/26', p1_para: 'PAULO', p1_dia: '08/10/26', p1_resultado: 'OK', pagou: 'SIM', cobranca: '11/10/26', valor: 40 },
  { id: 14, senha_os: '140', data_pedido: '10/08/26', p1_para: 'JOSÉ', p1_dia: '10/08/26', p1_resultado: 'OK', p2_para: 'CLARA', p2_dia: '11/10/26', p2_horario: '12:00', cobranca: '09/10/26', pagou: '', valor: 12, mensagemEmHaver: { disponivel: true, concedida: true, status: 'DISPONIVEL', dataExpiracao: '10/11/2026' } },
  { id: 15, senha_os: '150', data_pedido: '09/09/26', p1_para: 'NELSON', p1_dia: '09/09/26', p1_resultado: 'OK', pagou: 'SIM', valor: 12, mensagemEmHaver: { disponivel: true, concedida: true, status: 'DISPONIVEL', dataExpiracao: '09/12/2026' } },
];
const aoVivo = [{ id: 21, numero_os: '210', data_pedido: '10/10/26', dia_entrega: '10/10/26', horario_entrega: '10:00', resultado_entrega: 'ENTREGUE por operador', para: 'MARCOS', valor: 80, pagamento: 'PRAZO - DIA 12/10/26 - MP - PIX', pagou: '' }];

async function preparar(page, opcoes = {}) {
  const estado = { cliente: { ...cliente, ...opcoes.cliente }, escritas: [], erro: Boolean(opcoes.erro) };
  await page.clock.install({ time: new Date('2026-10-10T03:30:00Z') });
  await page.addInitScript(() => { localStorage.setItem('pombo_token', 'simulado'); localStorage.setItem('pombo_usuario', 'QA'); localStorage.setItem('pombo_nome', 'Operador de exemplo'); });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/api/clientes/1' && req.method() === 'GET') {
      if (estado.erro) return route.fulfill({ status: 500, json: { erro: 'Consulta indisponível.' } });
      return route.fulfill({ json: { cliente: estado.cliente, pedidosFonada: opcoes.vazio ? [] : fonada, pedidosAoVivo: opcoes.vazio ? [] : aoVivo } });
    }
    if (url.pathname === '/api/clientes/1' && req.method() === 'PUT') {
      estado.escritas.push(req.postDataJSON()); estado.cliente = { ...estado.cliente, ...req.postDataJSON(), versao: 3 };
      return route.fulfill({ json: estado.cliente });
    }
    if (url.pathname === '/api/clientes/1/bloquear') {
      estado.escritas.push(req.postDataJSON()); estado.cliente = { ...estado.cliente, bloqueado: req.postDataJSON().bloqueado, bloqueio_motivo: req.postDataJSON().motivo };
      return route.fulfill({ json: estado.cliente });
    }
    if (/^\/api\/fonadas\/\d+$/.test(url.pathname)) return route.fulfill({ json: { ...fonada.find(p => String(p.id) === url.pathname.split('/').pop()), cliente_id: 1, versao: 1 } });
    if (/^\/api\/clientes\/1\?/.test(req.url())) return route.fulfill({ json: { cliente: estado.cliente } });
    if (url.pathname === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
    return route.fulfill({ json: { cliente: estado.cliente, fonada: [], aoVivo: [], tentativas: [], lembretes: [], contagens: [], total: 0, clientes: [] } });
  });
  await page.goto(opcoes.url || '/clientes/1');
  return estado;
}

test('visão geral mostra saldo completo, haver por vencimento e contatos úteis', async ({ page }) => {
  const estado = await preparar(page);
  await expect(page.getByRole('heading', { name: cliente.nome, exact: true })).toBeVisible();
  const metricas = page.locator('.fc-metrica');
  await expect(metricas.nth(0)).toContainText('R$ 176,00');
  await expect(metricas.nth(1)).toContainText('5 fonada · 1 ao vivo');
  await expect(metricas.nth(2)).toContainText('R$ 112,00');
  await expect(metricas.nth(3)).toContainText('10/10/26');
  await expect(page.locator('.fc-cobranca')).toContainText('12/10/26');
  await expect(page.locator('.fc-haver-itens button')).toHaveCount(2);
  await expect(page.locator('.fc-haver-itens button').first()).toContainText('110');
  await expect(page.locator('.fc-agendamentos')).not.toContainText('MARCOS');
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp', exact: true })).toHaveAttribute('href', 'https://api.whatsapp.com/send?phone=5534999991111');
  await page.getByRole('button', { name: 'Abrir 2ª mensagem da O.S. 110' }).click();
  await expect(page).toHaveURL(/\/fonada\/11$/);
  expect(estado.escritas).toEqual([]);
});

test('histórico mantém busca, filtros e pedido selecionado ao voltar e recarregar', async ({ page }) => {
  await preparar(page);
  await page.getByLabel('Buscar no histórico').fill('jose');
  await page.getByLabel('Pagamento', { exact: true }).selectOption('pendentes');
  await page.getByLabel('Mês da mensagem').selectOption('11');
  await expect(page.locator('.fc-tabela tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver todos os pedidos', exact: true }).click();
  await expect(page.locator('.fc-tabela tbody tr')).toHaveCount(5);
  await page.getByLabel('Ordenar por').selectOption('valor');
  await expect(page.locator('.fc-tabela tbody tr').first()).toContainText('#130');
  await page.getByLabel('Buscar no histórico').fill('jose');
  await page.getByLabel('Pagamento', { exact: true }).selectOption('pendentes');
  await expect(page.locator('.fc-tabela tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Abrir pedido 140', exact: true }).click();
  await expect(page).toHaveURL(/\/fonada\/14$/);
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByLabel('Buscar no histórico')).toHaveValue('jose');
  await expect(page.locator('[data-pedido-id="14"]')).toHaveClass(/selecionado/);
  await page.reload();
  await expect(page.getByLabel('Pagamento', { exact: true })).toHaveValue('pendentes');
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await page.getByRole('button', { name: /Ao vivo\s*1/, exact: true }).click();
  await expect(page.locator('.fc-tabela')).toContainText('Entregue');
});

test('edição preserva campos e versão; cancelamento e consulta não escrevem', async ({ page }) => {
  const estado = await preparar(page);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: 'Editar cliente' });
  await expect(dialogo.getByLabel('Nome', { exact: true })).toHaveValue(cliente.nome);
  await expect(dialogo.getByLabel('Nº', { exact: true })).toHaveValue('120');
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(estado.escritas).toEqual([]);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await dialogo.getByLabel('Nome', { exact: true }).fill('  MARIA OLIVEIRA  ');
  await dialogo.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'MARIA OLIVEIRA', exact: true })).toBeVisible();
  expect(estado.escritas).toHaveLength(1);
  expect(estado.escritas[0]).toMatchObject({ nome: 'MARIA OLIVEIRA', versao: 2, endereco: 'RUA DAS FLORES, 120', complemento: 'CASA 2', referencia: 'PORTÃO AZUL' });
});

test('ficha vazia, bloqueio e erro de consulta oferecem ações claras', async ({ page }) => {
  const estado = await preparar(page, { vazio: true, erro: true, cliente: { whatsapp: '000000', celular: '', fixo: '', nascimento: '', endereco: '', bloqueado: 1, bloqueio_motivo: 'A pedido do cliente' } });
  await expect(page.getByRole('alert')).toContainText('Consulta indisponível');
  estado.erro = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('button', { name: 'Nova fonada', exact: true })).toBeDisabled();
  await expect(page.locator('.fc-alerta')).toContainText('A pedido do cliente');
  await expect(page.locator('.fc-estado-vazio')).toContainText('O histórico começa aqui');
  await expect(page.locator('.fc-completar')).toContainText('um telefone válido');
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp', exact: true })).toHaveCount(0);
  expect(estado.escritas).toEqual([]);
});

test('desktop e celular preservam leitura, navegação por teclado e contraste', async ({ page }, testInfo) => {
  const erros = []; page.on('pageerror', erro => erros.push(erro.message));
  await preparar(page);
  await expect(page.locator('.fc-historico')).toBeVisible();
  for (const width of [1920, 1600, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `Transbordamento em ${width}px`).toBe(false);
    await expect(page.getByRole('button', { name: 'Abrir pedido 120', exact: true })).toBeVisible();
    if ([1600, 390].includes(width)) await page.screenshot({ path: testInfo.outputPath(`ficha-${width}.png`), fullPage: true });
    if ([1600, 320].includes(width)) {
      const resultado = await new AxeBuilder({ page }).include('.ficha-renovada').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(resultado.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    }
  }
  await page.getByRole('button', { name: 'Abrir pedido 120', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/fonada\/12$/);
  expect(erros).toEqual([]);
});
