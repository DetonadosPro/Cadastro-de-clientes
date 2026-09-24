import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('Agenda navega dias, calendário e quatro abas, incluindo cancelamento de lembrete', async ({ page }) => {
  await entrar(page);
  const principal = page.locator('main.layout-conteudo');
  await principal.getByRole('button', { name: 'Escolher no calendário' }).click();
  const calendario = page.locator('.calendario-popover');
  await expect(calendario).toBeVisible();
  await calendario.getByRole('button', { name: 'Mês anterior' }).click();
  await calendario.getByRole('button', { name: 'Próximo mês' }).click();
  await calendario.locator('.calendario-dia:not([disabled])').first().click();
  await expect(calendario).toHaveCount(0);
  await principal.getByRole('button', { name: 'Dia anterior', exact: true }).click();
  await principal.getByRole('button', { name: 'Próximo dia', exact: true }).click();
  await principal.getByRole('button', { name: 'Hoje', exact: true }).click();
  await principal.getByRole('button', { name: 'Mostrar dia anterior' }).click();
  await principal.getByRole('button', { name: 'Mostrar próximo dia' }).click();
  const abas = principal.locator('.abas-cliente');
  for (const nome of ['Fonada', 'Ao vivo', 'Lembretes', 'Geral']) {
    const botao = abas.getByRole('button', { name: new RegExp(`^${nome}`) });
    await botao.click();
    await expect(botao).toHaveClass(/ativa/);
  }
  await abas.getByRole('button', { name: /^Lembretes/ }).click();
  // A ação de criar aparece no estado vazio. Escolha um dia futuro para
  // não depender dos lembretes criados por outros cenários da suíte.
  await principal.getByRole('button', { name: 'Escolher no calendário' }).click();
  await calendario.getByRole('button', { name: 'Próximo mês' }).click();
  await calendario.locator('.calendario-dia:not([disabled])').first().click();
  await expect(principal.getByRole('button', { name: '+ Criar lembrete' })).toBeVisible();
  await principal.getByRole('button', { name: '+ Criar lembrete' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toHaveCount(0);
});

test('menu, busca global, barra móvel e saída executam seus controles', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir menu' }).click();
  await page.getByRole('button', { name: 'Abrir busca global' }).click();
  const busca = page.getByRole('dialog', { name: 'Busca global' });
  await expect(busca).toBeVisible();
  await busca.getByRole('textbox').fill('Recall');
  await expect(busca.locator('.command-item').first()).toBeVisible();
  await busca.locator('.command-item').first().click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/recall');
  for (const [termo, rota] of [['Fonada', '/fonada'], ['Ao vivo', '/ao-vivo']]) {
    await page.getByRole('button', { name: 'Abrir busca global' }).click();
    const caixa = page.getByRole('dialog', { name: 'Busca global' });
    await caixa.getByRole('textbox').fill(termo);
    await expect(caixa.locator('.command-item').first()).toBeVisible();
    await caixa.locator('.command-item').first().click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(rota);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('button', { name: 'Fechar menu' })).toBeVisible();
  await page.locator('.layout-overlay').click({ position: { x: 380, y: 430 } });
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: /Sair/ }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('formulário Ao Vivo adiciona e remove mensagens/músicas e mantém valores digitados', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const resposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_CONTROLES_AOVIVO_${Date.now()}` } });
  expect(resposta.status()).toBe(201);
  const cliente = await resposta.json();
  try {
    await page.goto(`/ao-vivo/novo?clienteId=${cliente.id}`);
    await page.getByLabel('Destinatário do Ao Vivo').fill('DESTINATÁRIO QA');
    await page.getByLabel('Oferecimento do Ao Vivo').fill('OFERECIMENTO QA');
    await page.getByLabel('Número do endereço de entrega').fill('123');
    await page.getByLabel('Bairro da entrega').fill('BAIRRO QA');
    await page.getByLabel('Referência da entrega').fill('REFERÊNCIA QA');
    await page.getByLabel('Valor do pedido Ao Vivo').fill('15,50');
    const adicionar = page.getByRole('button', { name: 'Adicionar', exact: true });
    await adicionar.first().click();
    await expect(page.getByLabel('Tema 2 do Ao Vivo')).toBeVisible();
    await page.getByLabel('Tema 2 do Ao Vivo').fill('TEMA QA');
    await page.getByRole('button', { name: '− Remover última' }).first().click();
    await expect(page.getByLabel('Tema 2 do Ao Vivo')).toHaveCount(0);
    await adicionar.last().click();
    await expect(page.getByLabel('Música 3 do Ao Vivo')).toBeVisible();
    await page.getByLabel('Música 3 do Ao Vivo').fill('MÚSICA QA');
    await page.getByRole('button', { name: '− Remover última' }).last().click();
    await expect(page.getByLabel('Música 3 do Ao Vivo')).toHaveCount(0);
    await expect(page.getByLabel('Destinatário do Ao Vivo')).toHaveValue('DESTINATÁRIO QA');
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(page).toHaveURL(/\/ao-vivo$/);
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('lista e painel rápido do cliente abrem pedidos, ficha e novos formulários', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  test.setTimeout(120000);
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const nome = `TESTE_QA_DRAWER_${Date.now()}`;
  const respostaCliente = await request.post('/api/clientes', { headers, data: { nome } });
  expect(respostaCliente.status()).toBe(201);
  const cliente = await respostaCliente.json();
  let pedido;
  try {
    const criado = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 10, cobranca: '01/12/26', periodo: 'MANHÃ' } });
    expect(criado.status()).toBe(201);
    pedido = await criado.json();
    async function abrir() {
      await page.goto(`/clientes?busca=${encodeURIComponent(nome)}`);
      await page.getByRole('button', { name: nome, exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Resumo do cliente' });
      await expect(drawer.getByRole('heading', { name: nome })).toBeVisible();
      return drawer;
    }
    let drawer = await abrir();
    await drawer.getByRole('button', { name: 'Fechar painel' }).click();
    await expect(drawer).toHaveCount(0);
    drawer = await abrir();
    await drawer.getByRole('button', { name: '+ Fonada' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/fonada/novo');
    drawer = await abrir();
    await drawer.getByRole('button', { name: '+ Ao vivo' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/ao-vivo/novo');
    drawer = await abrir();
    await drawer.getByRole('button', { name: 'Ficha completa' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/clientes/${cliente.id}`);
    drawer = await abrir();
    await drawer.locator('.drawer-atividade').last().getByRole('button').first().click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/fonada/${pedido.id}`);

    await page.goto('/clientes');
    const tabela = page.locator('.tabela-clientes');
    for (const titulo of ['Nome', 'Último pedido', 'Pedidos', 'Pendente']) {
      const botao = tabela.getByRole('button', { name: new RegExp(`^${titulo}`) });
      await botao.click();
      await expect(botao).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Mudar para ordem/ }).click();
    await page.getByRole('button', { name: 'Revisar duplicatas' }).click();
    await expect(page.getByText(/duplicat/i).first()).toBeVisible();
  } finally {
    if (pedido) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('cadastro de cliente percorre todos os campos e cancela sem gravar', async ({ page }) => {
  await entrar(page);
  await page.goto('/clientes/novo');
  await page.getByLabel('Nome *').fill('TESTE_QA_CAMPOS_NAO_SALVAR');
  await page.getByLabel('Nascimento').fill('29/02/24');
  await page.getByLabel('Telefone fixo').fill('3433334444');
  await page.getByLabel('WhatsApp').fill('34999998888');
  await page.getByLabel('Celular').fill('34988887777');
  await page.getByRole('button', { name: /Endereço e referência/ }).click();
  await page.getByLabel('Endereço', { exact: true }).fill('R');
  await page.getByLabel('Nº').fill('123');
  await page.getByLabel('Complemento').fill('SALA QA');
  await page.getByLabel('Bairro').fill('BAIRRO QA');
  await page.getByLabel('Referência').fill('REFERÊNCIA QA');
  await expect(page.getByLabel('Nascimento')).toHaveValue('29/02/24');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/clientes');
});

test('formulário Fonada percorre campos de mensagem e cobrança sem gravar', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const resposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_CAMPOS_FONADA_${Date.now()}` } });
  expect(resposta.status()).toBe(201);
  const cliente = await resposta.json();
  try {
    await page.goto(`/fonada/novo?clienteId=${cliente.id}`);
    await page.getByLabel('Tema da 1ª mensagem').fill('ANIVERSÁRIO QA');
    await page.getByLabel('Número da 1ª mensagem').fill('123');
    await page.getByLabel('Para da 1ª mensagem').fill('DESTINATÁRIO QA');
    await page.getByLabel('Telefone fixo da 1ª mensagem').fill('3433334444');
    await page.getByLabel('Celular da 1ª mensagem').fill('34999998888');
    await page.getByLabel('Dia da 1ª mensagem').fill('01/12/26');
    await page.getByLabel('Horário da 1ª mensagem').fill('10:30');
    await page.getByLabel('Valor do pedido Fonada').fill('10,50');
    await page.getByLabel('Dia da cobrança Fonada').fill('01/12/26');
    await page.getByLabel('Período de cobrança Fonada').fill('MANHÃ');
    await page.getByLabel('Recall do pedido Fonada', { exact: true }).selectOption('NÃO');
    await page.getByLabel('Recall do pedido Fonada', { exact: true }).selectOption('SIM');
    await page.getByLabel('Código de Recall do pedido Fonada').fill('12345');
    await expect(page.getByLabel('Tema da 1ª mensagem')).toHaveValue('ANIVERSÁRIO QA');
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).not.toBe('/fonada/novo');
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
