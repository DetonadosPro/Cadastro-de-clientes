import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('mesclagem move pedidos para o cadastro escolhido e arquiva a origem', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const sufixo = Date.now();
  const criados = [];
  try {
    for (const nome of [`TESTE_QA_DESTINO_${sufixo}`, `TESTE_QA_ORIGEM_${sufixo}`]) {
      const resposta = await request.post('/api/clientes', { headers, data: { nome } });
      expect(resposta.status()).toBe(201);
      criados.push(await resposta.json());
    }
    const [destino, origem] = criados;
    const data = new Date();
    data.setDate(data.getDate() + 7);
    const dia = `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${String(data.getFullYear()).slice(-2)}`;
    const pedido = await request.post('/api/fonadas', { headers, data: { cliente_id: origem.id, cobranca: dia, periodo: 'MANHÃ', valor: 60 } });
    expect(pedido.status()).toBe(201);
    const pedidoId = (await pedido.json()).id;
    const mescla = await request.post(`/api/clientes/${destino.id}/mesclar`, { headers, data: { origemId: origem.id } });
    expect(mescla.status()).toBe(200);
    const lido = await request.get(`/api/fonadas/${pedidoId}`, { headers });
    expect(lido.status()).toBe(200);
    expect(Number((await lido.json()).cliente_id)).toBe(destino.id);
    await page.goto(`/clientes/${destino.id}`);
    await expect(page.getByRole('heading', { name: destino.nome })).toBeVisible();
    await expect(page.getByText('1 pedido registrado')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fonada 1' })).toBeVisible();
    const lista = await request.get(`/api/clientes?busca=${encodeURIComponent(origem.nome)}`, { headers });
    expect((await lista.json()).total).toBe(0);
    const lixeira = await request.get(`/api/clientes/lixeira?busca=${encodeURIComponent(origem.nome)}`, { headers });
    expect((await lixeira.json()).clientes.some((c) => c.id === origem.id)).toBe(true);
  } finally {
    for (const cliente of criados) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
