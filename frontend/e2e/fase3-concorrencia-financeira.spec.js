import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado, criarOperadorDeTeste } from './apoio.js';

test('dois operadores registrando o mesmo pagamento não sobrescrevem valor nem desfazem estado antigo', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const primeiro = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const operador = await criarOperadorDeTeste(request);
  const loginB = await request.post('/api/auth/login', { data: operador.credenciais });
  expect(loginB.status()).toBe(200);
  const segundo = { Authorization: `Bearer ${(await loginB.json()).token}` };
  const clientes = [];
  const pedidos = [];
  try {
    const clienteResposta = await request.post('/api/clientes', { headers: primeiro, data: { nome: `TESTE_QA_FINANCEIRO_RACE_${Date.now()}` } });
    expect(clienteResposta.status()).toBe(201);
    const cliente = await clienteResposta.json();
    clientes.push(cliente);
    for (const caso of [
      { recurso: 'ao-vivo', dados: { valor: 100, dia_entrega: '01/12/26' }, rota: (id) => `/api/cobranca/ao-vivo/${id}/baixa`, payload: (versao, valor) => ({ versao, dataPagamento: '01/12/26', valorRecebido: valor, formaRecebimento: 'PIX' }) },
      { recurso: 'fonadas', dados: { valor: 100, cobranca: '01/12/26', periodo: 'MANHÃ' }, rota: (id) => `/api/cobranca/${id}/baixa`, payload: (versao, valor) => ({ versao, pagou: 'SIM', recebi: `QA ${valor}`, dataPagamento: '01/12/26' }) },
    ]) {
      const criadoResposta = await request.post(`/api/${caso.recurso}`, { headers: primeiro, data: { cliente_id: cliente.id, ...caso.dados } });
      expect(criadoResposta.status()).toBe(201);
      const criado = await criadoResposta.json();
      pedidos.push({ recurso: caso.recurso, id: criado.id });
      const respostas = await Promise.all([
        request.put(caso.rota(criado.id), { headers: primeiro, data: caso.payload(criado.versao, 80.01) }),
        request.put(caso.rota(criado.id), { headers: segundo, data: caso.payload(criado.versao, 90.02) }),
      ]);
      expect(respostas.map((r) => r.status()).sort(), caso.recurso).toEqual([200, 409]);
      const lido = await request.get(`/api/${caso.recurso}/${criado.id}`, { headers: primeiro });
      const atual = await lido.json();
      expect(atual.versao).toBe(criado.versao + 1);
      expect(atual.pagou).toBe('SIM');
      if (caso.recurso === 'ao-vivo') {
        expect([80.01, 90.02]).toContain(Number(atual.valor_recebido));
        const desfazerAntigo = await request.put(`/api/cobranca/ao-vivo/${criado.id}/desfazer-baixa`, { headers: segundo, data: { versao: criado.versao } });
        expect(desfazerAntigo.status()).toBe(409);
        expect((await (await request.get(`/api/${caso.recurso}/${criado.id}`, { headers: primeiro })).json()).pagou).toBe('SIM');
      } else {
        expect(['QA 80.01', 'QA 90.02']).toContain(atual.recebi);
      }
    }
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers: primeiro });
    for (const cliente of clientes) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers: primeiro });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers: primeiro });
    }
    await operador.excluir();
  }
});

test('baixa e reagendamento em lote são atômicos diante de versão antiga ou pedido excluído', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clientes = [];
  const pedidos = [];
  try {
    for (let i = 0; i < 2; i++) {
      const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_LOTE_RACE_${Date.now()}_${i}` } });
      expect(clienteResposta.status()).toBe(201);
      const cliente = await clienteResposta.json();
      clientes.push(cliente);
      const pedidoResposta = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 20 + i, cobranca: '01/12/26', periodo: 'MANHÃ' } });
      expect(pedidoResposta.status()).toBe(201);
      pedidos.push(await pedidoResposta.json());
    }
    const ids = pedidos.map((p) => p.id);
    const versoesAntigas = Object.fromEntries(pedidos.map((p) => [p.id, p.versao]));
    const alteracao = await request.put(`/api/fonadas/${pedidos[1].id}`, { headers, data: { valor: 33, versao: pedidos[1].versao } });
    expect(alteracao.status()).toBe(200);
    const novo = await alteracao.json();
    const baixaAntiga = await request.put('/api/cobranca/acoes/baixa-lote', { headers, data: { ids, versoes: versoesAntigas, dataPagamento: '01/12/26' } });
    expect(baixaAntiga.status()).toBe(409);
    for (const pedido of pedidos) expect((await (await request.get(`/api/fonadas/${pedido.id}`, { headers })).json()).pagou).not.toBe('SIM');
    const versoesAtuais = { ...versoesAntigas, [novo.id]: novo.versao };
    const baixa = await request.put('/api/cobranca/acoes/baixa-lote', { headers, data: { ids, versoes: versoesAtuais, dataPagamento: '01/12/26' } });
    expect(baixa.status()).toBe(200);
    expect((await baixa.json()).quantidade).toBe(2);
    expect((await request.delete(`/api/fonadas/${pedidos[1].id}`, { headers })).status()).toBe(200);
    const reagendar = await request.put('/api/cobranca/acoes/reagendar-lote', { headers, data: { ids, cobrarDia: '02/12/26' } });
    expect(reagendar.status()).toBe(409);
    const valido = await request.get(`/api/fonadas/${pedidos[0].id}`, { headers });
    expect((await valido.json()).cobranca_reagendada).not.toBe('02/12/26');
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    for (const cliente of clientes) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
