import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function preparar(page, { saldo = 0, perderResposta = false, compraInicial = false, perderCorrecao = false } = {}) {
  const cliente = { id: 1, nome: 'MARIA DOS CRÉDITOS', versao: 1, whatsapp: '(34) 9 9999-1111' };
  const estado = { carteira: { saldo, comprados: saldo, usados: 0, valor_comprado: 0, compras: 0, movimentos: [] }, compras: [], pedidos: [], edicoes: [], ajustes: [], perderResposta, perderCorrecao };
  if (compraInicial) estado.carteira = { saldo: 2, comprados: 2, usados: 0, valor_comprado: 24, compras: 1, movimentos: [{ id: 1, tipo: 'COMPRA', quantidade: 2, valor: 24, forma: 'PIX', data_pedido: '13/10/26', horario_pedido: '09:30', usuario: 'QA' }], comprasCorrigiveis: [{ id: 1, quantidade: 2, valor: 24, quantidade_atual: 2, valor_atual: 24, forma: 'PIX', data_pedido: '13/10/26', horario_pedido: '09:30' }] };
  await page.addInitScript(() => { localStorage.setItem('pombo_token', 'simulado'); localStorage.setItem('pombo_usuario', 'QA'); localStorage.setItem('pombo_nome', 'Operador QA'); });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
    if (url.pathname === '/api/clientes/1') return route.fulfill({ json: { cliente, creditos: estado.carteira, pedidosFonada: estado.pedidos, pedidosAoVivo: [] } });
    if (url.pathname === '/api/clientes/1/resumo') return route.fulfill({ json: { cliente, creditos: estado.carteira, resumo: { total_pedidos: 0 }, ultimasCompras: [], mensagensEmHaver: [] } });
    if (url.pathname === '/api/clientes/1/creditos/1/corrigir') {
      const dados = req.postDataJSON(); estado.ajustes.push(dados);
      if (!estado.carteira.movimentos.some(m => m.operacao === dados.operacao)) {
        estado.carteira.saldo -= dados.quantidade; estado.carteira.comprados -= dados.quantidade; estado.carteira.valor_comprado -= dados.valor;
        estado.carteira.comprasCorrigiveis[0].quantidade_atual -= dados.quantidade; estado.carteira.comprasCorrigiveis[0].valor_atual -= dados.valor;
        estado.carteira.movimentos.unshift({ id: 2, tipo: 'AJUSTE', ...dados, quantidade: -dados.quantidade, compra_ajustada_id: 1, data_pedido: '14/10/26', horario_pedido: '10:00', usuario: 'QA' });
      }
      if (estado.perderCorrecao) { estado.perderCorrecao = false; return route.abort('failed'); }
      return route.fulfill({ json: estado.carteira });
    }
    if (url.pathname === '/api/clientes/1/creditos') {
      if (req.method() === 'POST') {
        const dados = req.postDataJSON(); estado.compras.push(dados);
        if (!estado.carteira.movimentos.some(m => m.operacao === dados.operacao)) {
          estado.carteira = { ...estado.carteira, saldo: estado.carteira.saldo + dados.quantidade, comprados: estado.carteira.comprados + dados.quantidade, valor_comprado: estado.carteira.valor_comprado + dados.valor, compras: 1, movimentos: [{ id: 1, tipo: 'COMPRA', ...dados, data_pedido: '13/10/26', horario_pedido: '09:30', usuario: 'QA' }] };
        }
        if (estado.perderResposta) { estado.perderResposta = false; return route.abort('failed'); }
      }
      return route.fulfill({ json: estado.carteira });
    }
    if (url.pathname === '/api/fonadas/proxima-os') return route.fulfill({ json: { proximaOs: '100' } });
    if (url.pathname === '/api/fonadas/hoje') return route.fulfill({ json: { data: '13/10/26', fonadas: [{ id: -1, tipo_registro: 'CREDITOS', rota: '/clientes/1', cliente_id: 1, nome_comprador: cliente.nome, senha_os: 'CRÉDITOS ×6', valor: 72, periodo: 'PIX', pagou: 'SIM', data_pedido: '13/10/26', horario_pedido: '09:30' }, { id: 11, creditos_usados: 2, valor: 0, data_pedido: '13/10/26' }] } });
    if (url.pathname === '/api/fonadas' && req.method() === 'POST') {
      const dados = req.postDataJSON();
      estado.carteira.saldo -= dados.creditos_usados; estado.carteira.usados += dados.creditos_usados;
      const pedido = { ...dados, id: 11, versao: 1, data_pedido: '13/10/26', horario_pedido: '09:35', mensagemEmHaver: { concedida: dados.creditos_usados > 0, disponivel: dados.creditos_usados > 0, status: dados.creditos_usados > 0 ? 'DISPONIVEL' : 'NAO_CONCEDIDA', semValidade: true, dataExpiracao: null } };
      estado.pedidos.push(pedido); return route.fulfill({ status: 201, json: pedido });
    }
    if (url.pathname === '/api/fonadas/11') {
      if (req.method() === 'DELETE') { estado.carteira.saldo += estado.pedidos[0].creditos_usados; estado.pedidos = []; return route.fulfill({ json: { ok: true } }); }
      if (req.method() === 'PUT') { estado.edicoes.push(req.postDataJSON()); estado.pedidos[0] = { ...estado.pedidos[0], ...req.postDataJSON(), versao: 2 }; }
      return route.fulfill({ json: estado.pedidos[0] });
    }
    if (url.pathname.endsWith('/tentativas')) return route.fulfill({ json: { tentativas: [] } });
    return route.fulfill({ json: { clientes: [cliente], total: 1, fonada: [], aoVivo: [], lembretes: [], contagens: {} } });
  });
  return estado;
}

test('pacote pago vira saldo, duas mensagens usam um crédito e edição não desconta novamente', async ({ page }) => {
  const estado = await preparar(page);
  await page.goto('/clientes/1');
  await page.getByRole('button', { name: 'Adicionar créditos', exact: true }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByLabel('Quantidade de créditos')).toHaveValue('6');
  await dialogo.getByLabel('Valor total pago').fill('7200');
  await expect(dialogo.locator('.credito-previa')).toContainText('R$ 12,00 por pedido');
  const acessibilidade = await new AxeBuilder({ page }).include('.dialogo-creditos').analyze();
  expect(acessibilidade.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/creditos-comprar-desktop.png' });
  await dialogo.getByRole('button', { name: 'Confirmar pacote pago' }).click();
  await expect(dialogo).not.toBeVisible();
  await expect(page.locator('.carteira-topo')).toContainText('6 pedidos disponíveis');
  await expect(page.locator('.fc-metrica').first()).toContainText('R$ 72,00');
  await page.getByRole('button', { name: 'Usar crédito →' }).click();
  const usar = page.getByRole('checkbox', { name: 'Usar créditos de Fonada' });
  await expect(usar).toBeChecked();
  await expect(page.getByLabel('Tema da 2ª mensagem')).toBeEnabled();
  await expect(page.getByLabel('Dia da cobrança Fonada')).toHaveCount(0);
  await expect(page.getByLabel('Tema da 2ª mensagem')).toBeEnabled();
  await expect(page.getByText('Crédito sem vencimento', { exact: true })).toBeVisible();
  await page.getByLabel('Para da 1ª mensagem').fill('ANA');
  await page.getByLabel('Para da 2ª mensagem').fill('JOÃO');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/fonada\/11$/);
  await expect(page.locator('.fonada-creditos')).toContainText('PAGO COM 1 CRÉDITO(S)');
  expect(estado.pedidos).toHaveLength(1); expect(estado.carteira.saldo).toBe(5);
  expect(estado.pedidos[0]).toMatchObject({ valor: 0, pagou: 'SIM', periodo: 'CRÉDITOS', creditos_usados: 1 });
  await page.getByLabel('Para da 1ª mensagem').fill('ANA MARIA');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => estado.edicoes.length).toBe(1);
  expect(estado.carteira.saldo).toBe(5);
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes\/1$/);
  await expect(page.locator('.carteira-topo')).toContainText('5 pedidos disponíveis');
  await page.getByRole('button', { name: 'Abrir pedido 100', exact: true }).click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes\/1$/);
  await expect(page.locator('.carteira-topo')).toContainText('6 pedidos disponíveis');
});

test('resposta perdida permite conferir a mesma compra sem duplicar e mantém dados bloqueados', async ({ page }) => {
  const estado = await preparar(page, { perderResposta: true });
  await page.goto('/clientes/1');
  await page.getByRole('button', { name: 'Adicionar créditos', exact: true }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Valor total pago').fill('7200');
  await dialogo.getByRole('button', { name: 'Confirmar pacote pago' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('Não foi possível conectar');
  await expect(dialogo.getByLabel('Quantidade de créditos')).toBeDisabled();
  await dialogo.getByRole('button', { name: 'Conferir e concluir compra' }).click();
  await expect(dialogo).not.toBeVisible();
  expect(estado.compras).toHaveLength(2);
  expect(estado.compras[0].operacao).toBe(estado.compras[1].operacao);
  expect(estado.carteira.saldo).toBe(6);
});

test('saldo insuficiente impede consumo e carteira permanece compacta no celular e acessível', async ({ page }) => {
  const estado = await preparar(page, { saldo: 0 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/clientes/1');
  await page.locator('.carteira-fonada').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const acessibilidade = await new AxeBuilder({ page }).include('.carteira-fonada').analyze();
  expect(acessibilidade.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/creditos-carteira-mobile.png' });
  await page.goto('/fonada/novo?clienteId=1&usarCredito=1');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Saldo de créditos insuficiente.', { exact: false })).toBeVisible();
  expect(estado.pedidos).toHaveLength(0);
});

test('vendas de hoje contam o pacote uma vez e o atalho da visão rápida usa a carteira', async ({ page }) => {
  await preparar(page, { saldo: 6 });
  await page.goto('/fonada/hoje');
  await expect(page.locator('.venda-fonada-item')).toHaveCount(1);
  await expect(page.locator('.venda-fonada-item')).toContainText('Pacote de créditos de Fonada');
  await expect(page.locator('.venda-fonada-item')).toHaveAttribute('href', '/clientes/1');
  await page.goto('/clientes?cliente=1');
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.locator('.cr-carteira')).toContainText('6 crédito(s) de Fonada');
  await dialogo.locator('.cr-carteira').click();
  await expect(page.getByRole('checkbox', { name: 'Usar créditos de Fonada' })).toBeChecked();
});

test('corrige 2 créditos e R$ 24 para 1 crédito e R$ 12, mantendo o lançamento e o motivo', async ({ page }) => {
  const estado = await preparar(page, { compraInicial: true });
  await page.goto('/clientes/1');
  await page.getByRole('button', { name: 'Corrigir compra', exact: true }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Valor a reduzir').fill('1200');
  await dialogo.getByLabel('Motivo da correção').fill('QUANTIDADE E VALOR ERRADOS');
  await expect(dialogo.locator('.credito-previa')).toContainText('Compra: 1 crédito(s) · R$ 12,00');
  const axe = await new AxeBuilder({ page }).include('.dialogo-creditos').analyze();
  expect(axe.violations).toEqual([]);
  await expect(dialogo).toHaveCSS('opacity', '1');
  await expect(dialogo.getByRole('button', { name: 'Confirmar correção' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/creditos-corrigir-desktop.png' });
  await dialogo.getByRole('button', { name: 'Confirmar correção' }).click();
  await expect(dialogo).not.toBeVisible();
  await expect(page.locator('.carteira-topo')).toContainText('1 pedido disponível');
  await expect(page.locator('.fc-metrica').first()).toContainText('R$ 12,00');
  await page.locator('.carteira-historico summary').click();
  await expect(page.locator('.carteira-historico')).toContainText('Valor original: R$ 24,00');
  await expect(page.locator('.carteira-historico')).toContainText('Redução de R$ 12,00');
  await expect(page.locator('.carteira-historico')).toContainText('QUANTIDADE E VALOR ERRADOS');
  expect(estado.ajustes).toHaveLength(1);
});

test('correção com resposta perdida conserva identificação ao fechar e reabrir; celular não corta o formulário', async ({ page }) => {
  const estado = await preparar(page, { compraInicial: true, perderCorrecao: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/clientes/1');
  await page.getByRole('button', { name: 'Corrigir compra', exact: true }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Créditos a remover').fill('0');
  await dialogo.getByLabel('Valor a reduzir').fill('700');
  await expect(dialogo.locator('.credito-previa')).toContainText('2 crédito(s) · R$ 17,00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(dialogo).toHaveCSS('opacity', '1');
  await expect(dialogo.getByRole('button', { name: 'Confirmar correção' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/creditos-corrigir-mobile.png' });
  await dialogo.getByRole('button', { name: 'Confirmar correção' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('Não foi possível conectar');
  await expect(dialogo.getByLabel('Valor a reduzir')).toBeDisabled();
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Corrigir compra', exact: true }).click();
  await expect(dialogo.getByLabel('Valor a reduzir')).toHaveValue('R$ 7,00');
  await dialogo.getByRole('button', { name: 'Conferir e concluir correção' }).click();
  await expect(dialogo).not.toBeVisible();
  expect(estado.ajustes).toHaveLength(2);
  expect(estado.ajustes[0].operacao).toBe(estado.ajustes[1].operacao);
  expect(estado.carteira.saldo).toBe(2); expect(estado.carteira.valor_comprado).toBe(17);
});
