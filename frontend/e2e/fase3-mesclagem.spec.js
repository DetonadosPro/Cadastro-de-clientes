import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado, criarOperadorDeTeste } from './apoio.js';

const campos = ['nome', 'nascimento', 'whatsapp', 'celular', 'fixo', 'endereco', 'complemento', 'bairro', 'referencia'];

function dados(prefixo, lado) {
  return {
    nome: `${prefixo}_${lado}`,
    nascimento: lado === 'A' ? '01/02/1990' : '03/04/1991',
    whatsapp: lado === 'A' ? '11987654321' : '21987654321',
    celular: lado === 'A' ? '11977771111' : '21977772222',
    fixo: lado === 'A' ? '1133331111' : '2133332222',
    endereco: `Rua ${lado}, ${lado === 'A' ? 10 : 20}`,
    complemento: `Sala ${lado}`,
    bairro: `Bairro ${lado}`,
    referencia: `Referência ${lado}`,
  };
}

test('mesclagem pela interface seleciona os nove campos em ambas as direções e preserva pedidos', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const todos = [];
  try {
    for (const destinoLado of ['A', 'B']) {
      const prefixo = `TESTE_QA_MESCLA_F3_${Date.now()}_${destinoLado}`;
      const par = {};
      for (const lado of ['A', 'B']) {
        const resposta = await request.post('/api/clientes', { headers, data: dados(prefixo, lado) });
        expect(resposta.status()).toBe(201);
        par[lado] = await resposta.json();
        todos.push(par[lado]);
      }
      const destino = par[destinoLado];
      const origem = par[destinoLado === 'A' ? 'B' : 'A'];
      const fonada = await request.post('/api/fonadas', { headers, data: { cliente_id: origem.id, valor: 12, cobranca: '01/12/26', periodo: 'MANHÃ' } });
      const aoVivo = await request.post('/api/ao-vivo', { headers, data: { cliente_id: origem.id, valor: 34, dia_entrega: '01/12/26' } });
      expect(fonada.status()).toBe(201);
      expect(aoVivo.status()).toBe(201);
      const pedidos = [{ recurso: 'fonadas', id: (await fonada.json()).id }, { recurso: 'ao-vivo', id: (await aoVivo.json()).id }];

      await page.goto(`/clientes?busca=${encodeURIComponent(prefixo)}`);
      for (const lado of ['A', 'B']) {
        await page.getByRole('row').filter({ hasText: par[lado].nome }).getByRole('checkbox').check();
      }
      await page.getByRole('button', { name: 'Comparar e mesclar' }).click();
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();
      await modal.locator('input[name="destinoMescla"]').nth(destinoLado === 'A' ? 0 : 1).check();
      for (const campo of campos) await modal.locator(`#mescla-${campo}`).selectOption(String(origem.id));
      const respostaMescla = page.waitForResponse((r) => r.url().endsWith(`/api/clientes/${destino.id}/mesclar`) && r.request().method() === 'POST');
      await modal.getByRole('button', { name: 'Confirmar mesclagem' }).click();
      expect((await respostaMescla).status()).toBe(200);

      const destinoLido = await request.get(`/api/clientes/${destino.id}`, { headers });
      const atual = (await destinoLido.json()).cliente;
      for (const campo of campos) expect(atual[campo], campo).toBe(origem[campo]);
      const lixeira = await request.get(`/api/clientes/lixeira?busca=${encodeURIComponent(origem.nome)}`, { headers });
      expect((await lixeira.json()).clientes.some((c) => c.id === origem.id)).toBe(true);
      for (const pedido of pedidos) {
        const lido = await request.get(`/api/${pedido.recurso}/${pedido.id}`, { headers });
        expect(lido.status()).toBe(200);
        expect(Number((await lido.json()).cliente_id)).toBe(destino.id);
      }
    }
  } finally {
    for (const cliente of todos) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});

test('mesclagem aberta em uma sessão recusa gravação com versão antiga após edição por outro operador', async ({ page, request, browser }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const operador = await criarOperadorDeTeste(request);
  const outraSessao = await browser.newContext();
  const outraPagina = await outraSessao.newPage();
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clientes = [];
  try {
    for (const lado of ['A', 'B']) {
      const resposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_MESCLA_RACE_${Date.now()}_${lado}` } });
      expect(resposta.status()).toBe(201);
      clientes.push(await resposta.json());
    }
    await page.goto('/clientes?busca=TESTE_QA_MESCLA_RACE_');
    for (const cliente of clientes) await page.getByRole('row').filter({ hasText: cliente.nome }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Comparar e mesclar' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await entrar(outraPagina, operador.credenciais);
    await outraPagina.goto(`/clientes/${clientes[0].id}`);
    await outraPagina.getByRole('button', { name: 'Editar', exact: true }).click();
    await outraPagina.locator('#editar-nome').fill(`${clientes[0].nome}_ALTERADO`);
    await outraPagina.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(outraPagina.getByRole('heading', { name: `${clientes[0].nome}_ALTERADO` })).toBeVisible();

    const respostaMescla = page.waitForResponse((r) => r.url().endsWith(`/api/clientes/${clientes[0].id}/mesclar`));
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar mesclagem' }).click();
    expect((await respostaMescla).status()).toBe(409);
    await expect(page.getByText('Um cliente mudou em outra sessão.')).toBeVisible();
    const origem = await request.get(`/api/clientes/${clientes[1].id}`, { headers });
    expect((await origem.json()).cliente.excluido_em).toBeNull();
  } finally {
    await outraSessao.close();
    await operador.excluir();
    for (const cliente of clientes) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
