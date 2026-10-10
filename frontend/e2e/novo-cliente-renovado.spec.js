import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function preparar(page, opcoes = {}) {
  const estado = { escritas: [], verificacoes: [], erroVerificacao: false, erroSalvar: false, duplicados: opcoes.duplicados || [] };
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado');
    localStorage.setItem('pombo_usuario', 'QA');
    localStorage.setItem('pombo_nome', 'Operador de exemplo');
  });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/api/clientes/verificar-duplicidade') {
      estado.verificacoes.push(url.searchParams.toString());
      if (estado.erroVerificacao) return route.fulfill({ status: 500, json: { erro: 'Consulta indisponível.' } });
      return route.fulfill({ json: { possiveisDuplicados: estado.duplicados } });
    }
    if (url.pathname === '/api/clientes' && req.method() === 'POST') {
      const dados = req.postDataJSON(); estado.escritas.push(dados);
      if (estado.erroSalvar) return route.fulfill({ status: 500, json: { erro: 'Não foi possível cadastrar agora.' } });
      await new Promise(resolve => setTimeout(resolve, 150));
      return route.fulfill({ status: 201, json: { id: 100, ...dados } });
    }
    if (url.pathname === '/api/clientes') return route.fulfill({ json: { clientes: [], total: 0 } });
    if (/^\/api\/clientes\/\d+$/.test(url.pathname)) return route.fulfill({ json: { cliente: { id: 100, nome: 'CLIENTE DE EXEMPLO', ...estado.escritas.at(-1) }, pedidosFonada: [], pedidosAoVivo: [] } });
    if (url.pathname === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n' });
    return route.fulfill({ json: { fonada: [], aoVivo: [], lembretes: [], contagens: [], itens: [], total: 0 } });
  });
  await page.route('**/viacep.com.br/ws/**', route => route.fulfill({ json: [{ logradouro: 'Rua das Flores', bairro: 'Centro', cep: '38000000', complemento: '' }] }));
  await page.goto('/clientes/novo');
  await expect(page.getByRole('heading', { name: 'Novo cliente', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/rascunho=/);
  return estado;
}

async function preencher(page) {
  await page.getByLabel('Nome *', { exact: true }).fill('MARIA APARECIDA DE OLIVEIRA');
  await page.getByLabel('Nascimento', { exact: true }).fill('270890');
  await page.getByLabel('WhatsApp', { exact: true }).fill('34999991111');
  await page.getByRole('button', { name: 'Usar WhatsApp no celular', exact: true }).click();
  await page.getByLabel('Telefone fixo', { exact: true }).fill('3433332222');
  await page.getByRole('button', { name: /Endereço e referência/ }).click();
  await page.getByLabel('Nº', { exact: true }).fill('120');
  await page.getByLabel('Endereço', { exact: true }).fill('Rua das');
  await page.getByRole('option', { name: /Rua das Flores/ }).click();
  await expect(page.getByLabel('Bairro', { exact: true })).toHaveValue('Centro');
  await page.getByLabel('Complemento', { exact: true }).fill('CASA 2');
  await page.getByLabel('Referência', { exact: true }).fill('PORTÃO AZUL\nAO LADO DA PRAÇA');
}

test('cadastro completo mantém campos, prévia, autocomplete e cria apenas uma ficha', async ({ page }) => {
  const estado = await preparar(page);
  await preencher(page);
  await expect(page.locator('.novo-cliente-preview')).toContainText('MARIA APARECIDA DE OLIVEIRA');
  await expect(page.locator('.novo-cliente-preview')).toContainText('Rua das Flores, 120');
  await expect(page.locator('.novo-cliente-preview')).toContainText('PORTÃO AZUL');
  await expect(page.getByLabel('Celular', { exact: true })).toHaveValue('(34) 9 9999-1111');
  await page.getByRole('button', { name: /Endereço e referência/ }).click();
  await page.getByRole('button', { name: /Endereço e referência/ }).click();
  await expect(page.getByLabel('Complemento', { exact: true })).toHaveValue('CASA 2');
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).evaluate(botao => { botao.click(); botao.click(); });
  await expect(page).toHaveURL(/\/clientes\/100$/);
  expect(estado.escritas).toHaveLength(1);
  expect(estado.verificacoes).toHaveLength(1);
  expect(estado.escritas[0]).toMatchObject({ nome: 'MARIA APARECIDA DE OLIVEIRA', nascimento: '27/08/90', whatsapp: '(34) 9 9999-1111', celular: '(34) 9 9999-1111', fixo: '(34) 3333-2222', endereco: 'Rua das Flores, 120', bairro: 'Centro', complemento: 'CASA 2', referencia: 'PORTÃO AZUL\nAO LADO DA PRAÇA' });
  expect(estado.escritas[0]).not.toHaveProperty('numero');
  await expect(page.getByRole('button', { name: /^Fechar rascunho Cadastro:/ })).toHaveCount(0);
});

test('somente nome é obrigatório; falha de gravação mantém preenchimento e permite nova tentativa', async ({ page }) => {
  const estado = await preparar(page);
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(page.getByLabel('Nome *', { exact: true })).toBeFocused();
  expect(estado.escritas).toHaveLength(0);
  await page.getByLabel('Nome *', { exact: true }).fill('CLIENTE COM NOME');
  estado.erroSalvar = true;
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(page.getByText('Não foi possível cadastrar agora.')).toBeVisible();
  await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('CLIENTE COM NOME');
  await expect(page.getByRole('button', { name: 'Salvar cliente', exact: true })).toBeEnabled();
  estado.erroSalvar = false;
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes\/100$/);
  expect(estado.verificacoes).toHaveLength(0);
});

test('duplicidade mantém formulário visível e impede Enter de ignorar a revisão', async ({ page }) => {
  const estado = await preparar(page, { duplicados: [{ id: 20, nome: 'MARIA APARECIDA', nascimento: '27/08/90', whatsapp: '(34) 99999-1111' }] });
  await preencher(page);
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(page.getByText('Já existe cliente parecido com o mesmo aniversário')).toBeVisible();
  await expect(page.getByLabel('Nome *', { exact: true })).toBeVisible();
  await expect(page.locator('.cadastro-duplicados')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Salvar cliente', exact: true })).toBeDisabled();
  await page.locator('.novo-cliente-workspace').evaluate(form => form.requestSubmit());
  expect(estado.escritas).toHaveLength(0);
  await page.getByRole('button', { name: 'É pessoa diferente, cadastrar assim mesmo', exact: true }).click();
  await expect(page.getByText('Cadastro pronto para confirmar')).toBeVisible();
  expect(estado.escritas).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirmar e salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes\/100$/);
  expect(estado.escritas).toHaveLength(1);
});

test('falha de verificação não cria cliente; alterar identificação volta a conferir duplicidade', async ({ page }) => {
  const estado = await preparar(page, { duplicados: [{ id: 20, nome: 'MARIA APARECIDA', nascimento: '27/08' }] });
  await page.getByLabel('Nome *', { exact: true }).fill('MARIA APARECIDA');
  await page.getByLabel('Nascimento', { exact: true }).fill('2708');
  estado.erroVerificacao = true;
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(page.getByText('Não foi possível verificar duplicidades. Tente salvar novamente.')).toBeVisible();
  expect(estado.escritas).toHaveLength(0);
  estado.erroVerificacao = false;
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await page.getByRole('button', { name: 'É pessoa diferente, cadastrar assim mesmo', exact: true }).click();
  await page.getByLabel('Nome *', { exact: true }).fill('OUTRA PESSOA');
  await expect(page.getByRole('button', { name: 'Confirmar e salvar', exact: true })).toHaveCount(0);
  estado.duplicados = [];
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes\/100$/);
  expect(estado.verificacoes).toHaveLength(3);
  expect(estado.escritas).toHaveLength(1);
});

test('rascunho retorna com contatos e endereço aberto, sem gravar ao sair', async ({ page }) => {
  const estado = await preparar(page);
  await preencher(page);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await page.getByRole('link', { name: /↻ MARIA APARECIDA DE OLIVEIRA/ }).click();
  await expect(page.getByLabel('Nome *', { exact: true })).toHaveValue('MARIA APARECIDA DE OLIVEIRA');
  await expect(page.getByLabel('Referência', { exact: true })).toHaveValue('PORTÃO AZUL\nAO LADO DA PRAÇA');
  await expect(page.getByRole('button', { name: /Endereço e referência/ })).toHaveAttribute('aria-expanded', 'true');
  expect(estado.escritas).toHaveLength(0);
});

test('prévia e campos adaptam-se às telas sem cortes e com contraste legível', async ({ page }, info) => {
  test.setTimeout(60000);
  const erros = []; page.on('pageerror', erro => erros.push(erro.message));
  const estado = await preparar(page);
  await preencher(page);
  for (const width of [1600, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if ([1600, 390].includes(width)) {
      await page.locator('.novo-cliente-workspace').evaluate(form => {
        form.closest('.layout-conteudo').scrollTop = 0;
        window.scrollTo(0, 0);
      });
      await page.screenshot({ path: info.outputPath(`novo-cliente-${width}.png`), fullPage: true });
      const axe = await new AxeBuilder({ page }).include('.novo-cliente-workspace').analyze();
      expect(axe.violations).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  estado.duplicados = [{ id: 20, nome: 'MARIA APARECIDA', nascimento: '27/08/90' }];
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(page.locator('.cadastro-duplicados')).toBeFocused();
  const axe = await new AxeBuilder({ page }).include('.novo-cliente-workspace').analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('novo-cliente-duplicidade-390.png'), fullPage: true });
  expect(erros).toEqual([]);
});
