import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('relatórios conciliam vendas e recebimentos de Fonada e Ao Vivo', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const hoje = new Date();
  const dia = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${String(hoje.getFullYear()).slice(-2)}`;
  const filtro = `inicio=${encodeURIComponent(dia)}&fim=${encodeURIComponent(dia)}&sistema=TODOS`;
  const vendasAntes = await (await request.get(`/api/relatorios/vendas?${filtro}`, { headers })).json();
  const recebimentosAntes = await (await request.get(`/api/relatorios/recebimentos?${filtro}`, { headers })).json();
  const nome = `TESTE_QA_RELATORIO_${Date.now()}`;
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  try {
    for (const caso of [
      { recurso: 'fonadas', valor: 100, data: { data_pedido: dia, cobranca: dia, periodo: 'MANHÃ' } },
      { recurso: 'ao-vivo', valor: 150, data: { data_pedido: dia } },
    ]) {
      const resposta = await request.post(`/api/${caso.recurso}`, { headers, data: { cliente_id: cliente.id, valor: caso.valor, ...caso.data } });
      expect(resposta.status()).toBe(201);
      pedidos.push({ recurso: caso.recurso, id: (await resposta.json()).id });
    }
    const vendas = await request.get(`/api/relatorios/vendas?${filtro}`, { headers });
    expect(vendas.status()).toBe(200);
    const resumoVendas = await vendas.json();
    expect(resumoVendas.geral.quantidade - vendasAntes.geral.quantidade).toBe(2);
    expect(resumoVendas.geral.valorTotal - vendasAntes.geral.valorTotal).toBeCloseTo(250, 2);
    expect(resumoVendas.itens.map((item) => item.id)).toEqual(expect.arrayContaining(pedidos.map((pedido) => pedido.id)));

    const baixa = await request.put(`/api/cobranca/ao-vivo/${pedidos[1].id}/baixa`, {
      headers, data: { dataPagamento: dia, valorRecebido: 150, formaRecebimento: 'PIX' },
    });
    expect(baixa.status()).toBe(200);
    const recebimentos = await request.get(`/api/relatorios/recebimentos?${filtro}`, { headers });
    expect(recebimentos.status()).toBe(200);
    const resumoRecebimentos = await recebimentos.json();
    expect(resumoRecebimentos.valorTotal - recebimentosAntes.valorTotal).toBeCloseTo(150, 2);
    expect(resumoRecebimentos.quantidade - recebimentosAntes.quantidade).toBe(1);

    await page.goto(`/relatorios?aba=vendas&${filtro}`);
    await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
    await expect(page.getByText(nome).first()).toBeVisible();
    await page.getByRole('button', { name: 'Recebimentos', exact: true }).click();
    await expect(page).toHaveURL(/aba=recebimentos/);
    await page.getByRole('button', { name: 'Desempenho', exact: true }).click();
    await expect(page).toHaveURL(/aba=desempenho/);
    await page.reload();
    await expect(page).toHaveURL(/aba=desempenho/);
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
