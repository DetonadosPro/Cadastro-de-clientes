import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function dia() { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date()); }

test('FIELD-030/031/033–038/051: edição, filtro mensal e ordenação móvel', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const resposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_FIELDS_CLIENTE_${Date.now()}` } });
  expect(resposta.status()).toBe(201);
  const cliente = await resposta.json();
  const pedidoResp = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 20, cobranca: dia(), periodo: 'MANHÃ', p1_dia: dia(), p1_para: 'QA' } });
  expect(pedidoResp.status()).toBe(201);
  const pedido = await pedidoResp.json();
  try {
    await page.goto(`/clientes/${cliente.id}`);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.locator('#editar-endereco').fill('Rua QA');
    const valores = {
      'FIELD-030': ['#editar-nascimento', '01/02/90', 'nascimento'],
      'FIELD-031': ['#editar-fixo', '1133334444', 'fixo'],
      'FIELD-033': ['#editar-celular', '11988887777', 'celular'],
      'FIELD-034': ['#editar-numero', '123', 'numero'],
      'FIELD-035': ['#editar-complemento', 'Sala QA', 'complemento'],
      'FIELD-036': ['#editar-bairro', 'Bairro QA', 'bairro'],
      'FIELD-037': ['#editar-referencia', 'Portão QA', 'referencia'],
    };
    for (const [id, [seletor, valor]] of Object.entries(valores)) {
      await page.locator(seletor).focus();
      await page.locator(seletor).fill(valor);
      await expect(page.locator(seletor)).not.toHaveValue('');
      registrar(id, page, seletor, 'foco/alteração', `valor ${valor} aplicado antes de salvar`);
    }
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Editar', exact: true })).toBeVisible();
    await page.reload();
    const atual = (await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente;
    for (const [id, [, valor, coluna]] of Object.entries(valores)) {
      const recebido = String(atual[coluna] || '');
      if (['fixo', 'celular'].includes(coluna)) expect(recebido.replace(/\D/g, '')).toBe(valor);
      else if (coluna === 'numero') expect(atual.endereco).toContain('Rua QA, 123');
      else expect(recebido).toBe(valor);
      registrar(id, page, 'GET /api/clientes/:id', 'verificar persistência', `${coluna} persistido após recarga`);
    }

    const mes = String(Number(dia().slice(3, 5)));
    await page.locator('#filtro-mes-mensagem').focus();
    await page.locator('#filtro-mes-mensagem').selectOption(mes);
    await expect(page.locator('.historico-filtro-mes-resultado')).toContainText('1');
    registrar('FIELD-038', page, '#filtro-mes-mensagem', 'selecionar', 'pedido do mês exibido');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/clientes');
    await page.locator('#ordenacao-clientes').focus();
    await page.locator('#ordenacao-clientes').selectOption('ultimo_pedido');
    await expect(page).toHaveURL(/ordenarPor=ultimo_pedido/);
    registrar('FIELD-051', page, '#ordenacao-clientes', 'selecionar', 'URL e ordenação atualizadas no viewport móvel');
  } finally {
    await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
