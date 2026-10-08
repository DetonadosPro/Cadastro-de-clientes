import { test, expect } from '@playwright/test';

async function preparar(page, { quantidade = 2, invertido = false, disponivel = true } = {}) {
  await page.clock.setFixedTime(new Date(2026, 9, 7, 12));
  await page.addInitScript(() => {
    localStorage.setItem('pombo_token', 'token-simulado');
    localStorage.setItem('pombo_usuario', 'QA');
  });
  const mensagens = [
    { pedidoId: 130, os: '2800', dataExpiracao: '01/01/2027' },
    { pedidoId: 131, os: '2801', dataExpiracao: '31/12/2026' },
  ].slice(0, quantidade);
  const item = {
    relacaoChave: 'relacao-teste', clienteId: 7, clienteNome: 'MARIA',
    aniversariante: 'JOÃO', telefone: '34999991111', mensagensEmHaver: mensagens,
    historico: [], quantidade: 1,
    ultimoPedido: { pedidoId: 123, os: '1000', mensagem: 2, tema: 'ANIV GERAL', data: '08/10/25' },
  };
  const original = {
    id: quantidade === 1 ? 130 : 131, senha_os: quantidade === 1 ? '2800' : '2801',
    cliente_id: 7, data_pedido: '01/10/26', nascimento: '01/01/90',
    valor: 12, cobranca: '09/10/26', periodo: 'MANHÃ', recall: 'SIM', recall_codigo: '98765',
    p1_para: 'DESTINATÁRIO ORIGINAL', p1_tema: 'NATAL', p1_dia: '09/10/26',
    p1_resultado: 'MENSAGEM PASSADA', versao: 1,
    mensagemEmHaver: { disponivel, status: disponivel ? 'DISPONIVEL' : 'UTILIZADA', dataExpiracao: '31/12/2026' },
  };
  const envios = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const caminho = new URL(request.url()).pathname;
    if (request.method() !== 'GET') envios.push({ caminho, metodo: request.method(), dados: request.postDataJSON() });
    if (caminho === '/api/configuracoes') return route.fulfill({ json: { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } });
    if (caminho === '/api/recall/fila') return route.fulfill({ json: { porDiaMensagem: [item], porAniversario: [item] } });
    if (caminho === '/api/fonadas/123') return route.fulfill({ json: {
      senha_os: '1000', cliente_id: 9,
      p2_tema: 'ANIV ESPOSA', p2_fixo: '3433332222', p2_celular: '34999992222',
    } });
    if (/^\/api\/fonadas\/13[01]$/.test(caminho)) return route.fulfill({ json: request.method() === 'PUT'
      ? { ...original, ...request.postDataJSON(), versao: 2 } : original });
    if (/^\/api\/clientes\/\d+$/.test(caminho)) return route.fulfill({ json: { cliente: {
      id: Number(caminho.split('/').at(-1)), nome: 'MARIA', fixo: '3433339999', celular: '34999999999',
    }, fonada: [], aoVivo: [] } });
    if (caminho === '/api/fonadas/proxima-os') return route.fulfill({ json: { proximaOs: '3000' } });
    if (caminho === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
    return route.fulfill({ json: { tentativas: [], fonada: [], aoVivo: [], lembretes: [], contagens: [] } });
  });
  await page.goto(`/recall?data=2026-10-08&modo=${invertido ? 'aniversario' : 'dia-mensagem'}`);
  await page.locator('.recall-criar').click();
  return { envios, original };
}

for (const quantidade of [1, 2]) test(`${quantidade} mensagens em haver: abre a senha que vence primeiro e salva a mensagem 2`, async ({ page }) => {
  const { envios, original } = await preparar(page, { quantidade });
  await expect(page).toHaveURL(new RegExp(`/fonada/${original.id}\\?`));
  await expect(page.getByLabel('Para da 2ª mensagem', { exact: true })).toHaveValue('JOÃO');
  await expect(page.getByLabel('Para da 2ª mensagem', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Tema da 2ª mensagem')).toHaveValue('ANIV ESPOSA');
  await expect(page.getByLabel('Telefone fixo da 2ª mensagem')).toHaveValue('3433332222');
  await expect(page.getByLabel('Celular da 2ª mensagem')).toHaveValue('34999992222');
  await expect(page.getByLabel('Dia da 2ª mensagem')).toHaveValue('08/10/26');
  await expect(page.getByLabel('Número da 2ª mensagem')).toHaveValue('');
  await expect(page.getByLabel('Código de Recall do pedido Fonada')).toHaveValue('98765');
  await expect(page.getByLabel('Para da 1ª mensagem', { exact: true })).toHaveValue(original.p1_para);
  expect(envios).toHaveLength(0);
  await page.getByLabel('Número da 2ª mensagem').fill('456');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => envios.length).toBe(2);
  expect(envios[0]).toMatchObject({ caminho: `/api/fonadas/${original.id}`, metodo: 'PUT', dados: {
    recall_codigo: '98765', p1_para: original.p1_para, p2_para: 'JOÃO', p2_mensagem: '456',
    valor: 12, cobranca: original.cobranca, data_pedido: original.data_pedido,
  } });
  expect(envios[1]).toMatchObject({ caminho: '/api/recall/pedido-criado', dados: { pedidoId: original.id } });
  await expect(page.getByLabel('Número da 2ª mensagem')).toHaveValue('456');
});

test('pesquisa por aniversário preenche a mensagem em haver com os telefones do comprador original', async ({ page }) => {
  await preparar(page, { invertido: true });
  await expect(page.getByLabel('Celular da 2ª mensagem')).toHaveValue('34999999999');
  await expect(page.getByLabel('Telefone fixo da 2ª mensagem')).toHaveValue('3433339999');
});

test('sem mensagem em haver continua abrindo um pedido novo', async ({ page }) => {
  await preparar(page, { quantidade: 0 });
  await expect(page).toHaveURL(/\/fonada\/novo\?/);
  await expect(page.getByLabel('Para da 1ª mensagem', { exact: true })).toHaveValue('JOÃO');
  await expect(page.getByLabel('Código de Recall do pedido Fonada')).toHaveValue('1000');
  await expect(page.getByLabel('Tema da 1ª mensagem')).toHaveValue('ANIV ESPOSA');
  await expect(page.getByLabel('Para da 2ª mensagem', { exact: true })).toHaveValue('');
});

test('mensagem que deixou de estar disponível não é preenchida', async ({ page }) => {
  const { envios } = await preparar(page, { disponivel: false });
  await expect(page.getByText('Esta mensagem em haver não está mais disponível. Confira o pedido.')).toBeVisible();
  await expect(page.getByLabel('Para da 2ª mensagem', { exact: true })).toHaveValue('');
  expect(envios).toHaveLength(0);
});

test('voltar ao Recall e abrir de novo preenche a mensagem 2 mesmo com rascunho existente', async ({ page }) => {
  await preparar(page);
  await expect(page.getByLabel('Para da 2ª mensagem', { exact: true })).toHaveValue('JOÃO');
  await page.getByLabel('Tema da 2ª mensagem').fill('TEMA NO RASCUNHO');
  await page.getByLabel('Número da 2ª mensagem').fill('456');
  await page.goBack();
  await expect(page).toHaveURL(/\/recall\?/);
  await page.locator('.recall-criar').click();
  await expect(page.getByLabel('Tema da 2ª mensagem')).toHaveValue('ANIV ESPOSA');
  await expect(page.getByLabel('Número da 2ª mensagem')).toHaveValue('456');
  await expect(page.getByLabel('Código de Recall do pedido Fonada')).toHaveValue('98765');
});
