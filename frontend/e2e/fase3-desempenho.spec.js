import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado, criarOperadorDeTeste, usuario } from './apoio.js';

test('desempenho separa dois operadores, sistemas, valores e período vazio com conciliação independente', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const operador = await criarOperadorDeTeste(request);
  const loginB = await request.post('/api/auth/login', { data: operador.credenciais });
  expect(loginB.status()).toBe(200);
  const a = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const b = { Authorization: `Bearer ${(await loginB.json()).token}` };
  const clientes = [];
  const pedidos = [];
  const dia = '15/08/27';
  try {
    const clienteResposta = await request.post('/api/clientes', { headers: a, data: { nome: `TESTE_QA_DESEMPENHO_${Date.now()}` } });
    expect(clienteResposta.status()).toBe(201);
    const cliente = await clienteResposta.json();
    clientes.push(cliente);
    for (const caso of [
      { recurso: 'fonadas', headers: a, valor: 10.01, extras: { cobranca: dia, periodo: 'MANHÃ' } },
      { recurso: 'ao-vivo', headers: a, valor: 20.02, extras: { dia_entrega: dia } },
      { recurso: 'fonadas', headers: b, valor: 30.03, extras: { cobranca: dia, periodo: 'TARDE' } },
    ]) {
      const resposta = await request.post(`/api/${caso.recurso}`, { headers: caso.headers, data: { cliente_id: cliente.id, data_pedido: dia, valor: caso.valor, ...caso.extras } });
      expect(resposta.status()).toBe(201);
      pedidos.push({ recurso: caso.recurso, id: (await resposta.json()).id });
    }
    const filtro = `inicio=${encodeURIComponent(dia)}&fim=${encodeURIComponent(dia)}`;
    const resposta = await request.get(`/api/relatorios/desempenho?${filtro}&sistema=TODOS`, { headers: a });
    expect(resposta.status()).toBe(200);
    const dados = await resposta.json();
    expect(dados.valorEquipe).toBeCloseTo(60.06, 2);
    const porNome = Object.fromEntries(dados.funcionarios.map((f) => [f.usuario, f]));
    expect(porNome[usuario].vendasFonada).toBe(1);
    expect(porNome[usuario].vendasAoVivo).toBe(1);
    expect(porNome[usuario].valorVendidoTotal).toBeCloseTo(30.03, 2);
    expect(porNome[operador.credenciais.usuario].vendasFonada).toBe(1);
    expect(porNome[operador.credenciais.usuario].valorVendidoTotal).toBeCloseTo(30.03, 2);
    const soFonada = await request.get(`/api/relatorios/desempenho?${filtro}&sistema=FONADA`, { headers: a });
    expect((await soFonada.json()).valorEquipe).toBeCloseTo(40.04, 2);
    const vazio = await request.get('/api/relatorios/desempenho?inicio=16%2F08%2F27&fim=16%2F08%2F27&sistema=TODOS', { headers: a });
    expect((await vazio.json()).valorEquipe).toBe(0);
    await page.goto(`/relatorios?aba=desempenho&${filtro}&sistema=TODOS`);
    await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible();
    await expect(page.getByText(operador.credenciais.usuario).first()).toBeVisible();
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers: a });
    for (const cliente of clientes) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers: a });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers: a });
    }
    await operador.excluir();
  }
});
