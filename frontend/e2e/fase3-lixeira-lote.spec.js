import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('seleção em lote, cancelamento e exclusão definitiva pela interface com e sem pedidos', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const prefixo = `TESTE_QA_LOTE_F3_${Date.now()}`;
  const clientes = [];
  try {
    for (const sufixo of ['SEM_PEDIDO', 'COM_PEDIDO']) {
      const resposta = await request.post('/api/clientes', { headers, data: { nome: `${prefixo}_${sufixo}` } });
      expect(resposta.status()).toBe(201);
      clientes.push(await resposta.json());
    }
    const pedido = await request.post('/api/fonadas', { headers, data: { cliente_id: clientes[1].id, valor: 25, cobranca: '01/12/26', periodo: 'MANHÃ' } });
    expect(pedido.status()).toBe(201);
    const pedidoId = (await pedido.json()).id;
    await page.goto(`/clientes?busca=${encodeURIComponent(prefixo)}`);

    await page.getByRole('row').filter({ hasText: clientes[0].nome }).getByRole('checkbox').check();
    await expect(page.locator('.selecao-toolbar')).toContainText('1cliente selecionado');
    await page.getByRole('button', { name: 'Enviar para lixeira' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    for (const cliente of clientes) {
      const lido = await request.get(`/api/clientes/${cliente.id}`, { headers });
      expect((await lido.json()).cliente.excluido_em).toBeNull();
    }

    await page.getByRole('checkbox', { name: 'Selecionar todos os clientes desta página' }).check();
    await expect(page.locator('.selecao-toolbar')).toContainText('2clientes selecionados');
    await page.getByRole('button', { name: 'Enviar para lixeira' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByText('Nenhum cliente encontrado')).toBeVisible();
    await page.goto('/clientes/lixeira');
    await page.getByLabel('Localizar cadastro removido').fill(prefixo);
    await page.getByRole('button', { name: 'Buscar' }).click();
    for (const cliente of clientes) await expect(page.getByText(cliente.nome).first()).toBeVisible();

    const linhaSem = page.getByRole('row').filter({ hasText: clientes[0].nome });
    page.once('dialog', (dialog) => dialog.dismiss());
    await linhaSem.getByRole('button', { name: 'Apagar de vez' }).click();
    expect((await request.get(`/api/clientes/${clientes[0].id}`, { headers })).status()).toBe(200);
    page.once('dialog', (dialog) => dialog.accept());
    await linhaSem.getByRole('button', { name: 'Apagar de vez' }).click();
    await expect(page.getByText(clientes[0].nome)).toHaveCount(0);
    expect((await request.get(`/api/clientes/${clientes[0].id}`, { headers })).status()).toBe(404);

    const linhaCom = page.getByRole('row').filter({ hasText: clientes[1].nome });
    await linhaCom.getByRole('button', { name: `Mostrar pedidos de ${clientes[1].nome}` }).click();
    await expect(page.getByText('FONADA (1)')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await linhaCom.getByRole('button', { name: 'Apagar de vez' }).click();
    await expect(page.getByText(clientes[1].nome)).toHaveCount(0);
    expect((await request.get(`/api/fonadas/${pedidoId}`, { headers })).status()).toBe(404);
    await page.reload();
    await expect(page.getByText(clientes[1].nome)).toHaveCount(0);
  } finally {
    for (const cliente of clientes) {
      const lido = await request.get(`/api/clientes/${cliente.id}`, { headers });
      if (lido.status() === 200) {
        await request.delete(`/api/clientes/${cliente.id}`, { headers });
        await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
      }
    }
  }
});
