import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const clientesExemplo = () => [
  { id: 31, nome: 'MARIA APARECIDA DE OLIVEIRA', whatsapp: '(34) 99999-1111', bairro: 'CENTRO', endereco: 'RUA DAS FLORES, 120', nascimento: '27/08', excluido_em: '2026-10-09T15:12:00Z', total_fonada: 2, total_aovivo: 1 },
  { id: 20, nome: 'JOÃO CARLOS FERREIRA', fixo: '(34) 3333-2222', excluido_em: '2026-10-08T16:15:00Z', total_fonada: 1, total_aovivo: 0 },
  { id: 10, nome: 'ANA CLÁUDIA', excluido_em: '2026-10-07T11:20:00Z', total_fonada: 0, total_aovivo: 0 },
];

async function preparar(page, caminho, opcoes = {}) {
  const estado = {
    config: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1, atualizado_por: 'Operador de exemplo', atualizado_em: '2026-10-09T12:00:00Z' },
    clientes: opcoes.clientes || clientesExemplo(), salvamentos: [], restauracoes: [], exclusoes: [], consultas: [], erroPedidos: !!opcoes.erroPedidos, erroLista: !!opcoes.erroLista,
  };
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado'); localStorage.setItem('pombo_usuario', 'QA'); localStorage.setItem('pombo_nome', 'Operador de exemplo');
  });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/api/configuracoes') {
      if (req.method() === 'PUT') {
        const dados = req.postDataJSON(); estado.salvamentos.push(dados);
        if (opcoes.conflito) { estado.config = { ...estado.config, limite_segunda_mensagem: 15, versao: 2 }; return route.fulfill({ status: 409, json: { erro: 'As configurações foram alteradas por outra pessoa.' } }); }
        estado.config = { ...estado.config, ...dados, versao: dados.versao + 1 };
      }
      return route.fulfill({ json: estado.config });
    }
    if (url.pathname === '/api/clientes/lixeira') {
      estado.consultas.push(url.searchParams.toString());
      if (estado.erroLista) return route.fulfill({ status: 500, json: { erro: 'Consulta da lixeira indisponível.' } });
      let lista = estado.clientes.filter(c => c.nome.toLowerCase().includes((url.searchParams.get('busca') || '').toLowerCase()));
      const situacao = url.searchParams.get('situacao');
      if (situacao) lista = lista.filter(c => situacao === 'com_pedidos' ? +c.total_fonada + +c.total_aovivo > 0 : +c.total_fonada + +c.total_aovivo === 0);
      if (url.searchParams.get('ordenarPor') === 'nome') lista.sort((a, b) => a.nome.localeCompare(b.nome));
      if (url.searchParams.get('ordenarPor') === 'antigos') lista.reverse();
      const pagina = +(url.searchParams.get('pagina') || 1);
      return route.fulfill({ json: { total: lista.length, clientes: lista.slice((pagina - 1) * 30, pagina * 30) } });
    }
    if (url.pathname.endsWith('/pedidos-lixeira')) {
      if (estado.erroPedidos) { estado.erroPedidos = false; return route.fulfill({ status: 500, json: { erro: 'Consulta indisponível. Tente novamente.' } }); }
      return route.fulfill({ json: { fonada: [{ id: 1, senha_os: '33645', nome_comprador: 'MARIA APARECIDA', data_pedido: '09/10/26', valor: 12 }, { id: 2, senha_os: '33001', data_pedido: '02/10/26', valor: 15 }], aoVivo: [{ id: 3, numero_os: '20501', comprador: 'MARIA APARECIDA', dia_entrega: '10/10/26', valor: 80 }] } });
    }
    if (url.pathname.endsWith('/restaurar')) {
      const id = +url.pathname.split('/').at(-2); estado.restauracoes.push(id);
      if (opcoes.falharRestauracao === id) return route.fulfill({ status: 500, json: { erro: 'Restauração indisponível.' } });
      estado.clientes = estado.clientes.filter(c => c.id !== id);
      return route.fulfill({ json: { id } });
    }
    if (url.pathname.endsWith('/definitivo')) {
      const id = +url.pathname.split('/').at(-2); estado.exclusoes.push(id); estado.clientes = estado.clientes.filter(c => c.id !== id);
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n' });
    return route.fulfill({ json: { fonada: [], aoVivo: [], lembretes: [], contagens: [] } });
  });
  await page.goto(caminho);
  await expect(page.locator('.admin-header h1')).toBeVisible();
  await expect(page.locator('.estado-carregando')).toHaveCount(0);
  return estado;
}

test('configurações: simulação inclui o limite e só grava após salvar explicitamente', async ({ page }) => {
  const estado = await preparar(page, '/configuracoes');
  const salvar = page.getByRole('button', { name: 'Salvar configurações', exact: true });
  await expect(salvar).toBeDisabled();
  await expect(page.locator('.ajustes-simulation-result')).toContainText('Segunda mensagem liberada');
  await page.getByLabel('Valor do pedido para simular').fill('12,01');
  await expect(page.locator('.ajustes-simulation-result')).toContainText('Somente a primeira mensagem');
  await page.getByLabel('Limite do pedido (R$)', { exact: true }).fill('20,00');
  await page.getByLabel('Validade da mensagem em haver (meses)').fill('6');
  await expect(page.locator('.ajustes-simulation-result')).toContainText('6 meses');
  await expect(page.locator('.admin-state')).toHaveText('Alterações não salvas');
  expect(estado.salvamentos).toEqual([]);
  await salvar.click();
  await expect(page.locator('.admin-state')).toHaveText('Regras em vigor');
  expect(estado.salvamentos).toEqual([{ limite_segunda_mensagem: 20, meses_mensagem_em_haver: 6, versao: 1 }]);
  await page.reload();
  await expect(page.getByLabel('Limite do pedido (R$)', { exact: true })).toHaveValue('R$ 20,00');
  await page.getByLabel('Limite do pedido (R$)', { exact: true }).fill('0,00');
  await page.getByLabel('Valor do pedido para simular').fill('0,00');
  await expect(page.locator('.ajustes-simulation-result')).toContainText('Segunda mensagem liberada');
  await page.getByLabel('Validade da mensagem em haver (meses)').fill('121');
  await expect(salvar).toBeDisabled();
  await expect(page.locator('.ajustes-simulation-result')).toContainText('Preencha valores válidos');
});

test('conflito preserva o rascunho e recarga exige escolha antes de substituí-lo', async ({ page }) => {
  await preparar(page, '/configuracoes', { conflito: true });
  const limite = page.getByLabel('Limite do pedido (R$)', { exact: true });
  await limite.fill('20,00');
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
  await expect(page.getByText('As regras mudaram em outra sessão')).toBeVisible();
  await expect(limite).toHaveValue('R$ 20,00');
  await page.getByRole('button', { name: 'Recarregar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(limite).toHaveValue('R$ 20,00');
  await page.getByRole('button', { name: 'Carregar regras atuais' }).click();
  await page.getByRole('button', { name: 'Carregar regras', exact: true }).click();
  await expect(limite).toHaveValue('R$ 15,00');
  await expect(page.locator('.admin-state')).toHaveText('Regras em vigor');
});

test('lixeira: busca automática, filtros e ordenação preservam contexto na URL', async ({ page }) => {
  const estado = await preparar(page, '/clientes/lixeira');
  await expect(page.locator('.recovery-folder')).toHaveCount(3);
  await page.getByRole('button', { name: 'Com pedidos', exact: true }).click();
  await expect(page.locator('.recovery-folder')).toHaveCount(2);
  await expect(page).toHaveURL(/situacao=com_pedidos/);
  await page.getByRole('button', { name: 'Sem pedidos', exact: true }).click();
  await expect(page.locator('.recovery-folder')).toHaveCount(1);
  await expect(page.locator('.recovery-folder')).toContainText('ANA CLÁUDIA');
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.getByLabel('Ordenar lixeira').selectOption('nome');
  await expect(page.locator('.recovery-folder').first()).toContainText('ANA CLÁUDIA');
  await page.getByLabel('Encontrar cadastro removido').fill('maria');
  await expect(page.locator('.recovery-folder')).toHaveCount(1);
  expect(estado.consultas.at(-1)).toContain('busca=maria');
  await page.reload();
  await expect(page.getByLabel('Encontrar cadastro removido')).toHaveValue('maria');
  await expect(page.locator('.recovery-folder')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.recovery-folder')).toHaveCount(3);
});

test('pedidos: falha apresenta nova tentativa, seguida de histórico completo', async ({ page }) => {
  await preparar(page, '/clientes/lixeira', { erroPedidos: true });
  await page.getByRole('button', { name: 'Mostrar pedidos de MARIA APARECIDA DE OLIVEIRA' }).click();
  await expect(page.getByText('Não foi possível consultar os pedidos')).toBeVisible();
  await expect(page.getByText('Carregando pedidos…')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'FONADA (2)', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AO VIVO (1)', exact: true })).toBeVisible();
  await expect(page.locator('.recovery-folder-body')).toContainText('O.S. 20501');
  await expect(page.locator('.recovery-folder-body')).toContainText('80,00');
});

test('falha da listagem permite recuperar a consulta e vazio não esconde erro', async ({ page }) => {
  const estado = await preparar(page, '/clientes/lixeira', { erroLista: true, clientes: [] });
  await expect(page.getByText('Não foi possível carregar a lixeira')).toBeVisible();
  await expect(page.getByText('A lixeira está vazia')).toHaveCount(0);
  estado.erroLista = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('A lixeira está vazia')).toBeVisible();
  await expect(page.getByText('Não foi possível carregar a lixeira')).toHaveCount(0);
});

test('restauração em lote mantém falhas selecionadas e não reenvia clientes recuperados', async ({ page }) => {
  const estado = await preparar(page, '/clientes/lixeira', { falharRestauracao: 20 });
  await page.getByLabel('Selecionar todos os cadastros da página').check();
  await page.getByRole('button', { name: 'Restaurar selecionados', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(page.locator('.recovery-folder')).toHaveCount(1);
  await expect(page.getByLabel('Selecionar JOÃO CARLOS FERREIRA', { exact: true })).toBeChecked();
  await expect(page.getByText('2 restaurado(s); 1 não puderam ser restaurados. Tente novamente.')).toBeVisible();
  expect(estado.restauracoes.sort()).toEqual([10, 20, 31]);
});

test('restaurar último cadastro da página retorna para uma página válida', async ({ page }) => {
  const clientes = Array.from({ length: 31 }, (_, i) => ({ ...clientesExemplo()[0], id: i + 1, nome: `Cliente ${i + 1}` }));
  const estado = await preparar(page, '/clientes/lixeira?pagina=2', { clientes });
  await expect(page.locator('.recovery-folder')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(page).toHaveURL(/pagina=1/);
  await expect(page.locator('.recovery-folder')).toHaveCount(30);
  expect(estado.restauracoes).toEqual([31]);
});

test('exclusão mostra o cadastro e exige confirmação digitada; cancelar não apaga', async ({ page }) => {
  const estado = await preparar(page, '/clientes/lixeira');
  const abrir = page.getByRole('button', { name: 'Apagar definitivamente ANA CLÁUDIA' });
  await abrir.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toContainText('ANA CLÁUDIA');
  await expect(dialogo.getByRole('button', { name: 'Apagar de vez' })).toBeDisabled();
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(estado.exclusoes).toEqual([]);
  await abrir.click();
  await page.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');
  await dialogo.getByRole('button', { name: 'Apagar de vez' }).click();
  await expect(page.locator('.recovery-folder')).toHaveCount(2);
  expect(estado.exclusoes).toEqual([10]);
});

test('telas responsivas e acessíveis no computador e celular', async ({ page }, info) => {
  test.setTimeout(60000);
  for (const tela of ['configuracoes', 'clientes/lixeira']) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await preparar(page, `/${tela}`);
    if (tela.includes('lixeira')) {
      await expect(page.getByRole('button', { name: 'Clientes', exact: true })).not.toHaveClass(/ativo/);
      await page.getByRole('button', { name: 'Mostrar pedidos de MARIA APARECIDA DE OLIVEIRA' }).click();
    }
    for (const width of [1600, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if ([1600, 390].includes(width)) {
        await page.screenshot({ path: info.outputPath(`${tela.split('/').at(-1)}-${width}.png`), fullPage: true });
        const axe = await new AxeBuilder({ page }).include('.admin-workspace').analyze();
        expect(axe.violations).toEqual([]);
      }
    }
    if (tela.includes('lixeira')) {
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.getByRole('button', { name: 'Apagar definitivamente MARIA APARECIDA DE OLIVEIRA' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').evaluate(async el => {
        await Promise.all(el.closest('.dialogo-fundo').getAnimations({ subtree: true }).map(animacao => animacao.finished));
      });
      const axe = await new AxeBuilder({ page }).include('.admin-dialog').analyze();
      expect(axe.violations).toEqual([]);
      await page.screenshot({ path: info.outputPath('lixeira-confirmacao-390.png') });
      await page.keyboard.press('Escape');
    }
  }
});
