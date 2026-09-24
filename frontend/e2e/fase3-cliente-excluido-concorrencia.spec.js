import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado, criarOperadorDeTeste } from './apoio.js';

test('cliente enviado à lixeira por um operador não aceita novos pedidos do outro', async ({ page, request }) => {
  test.skip(!isolado || !process.env.QA_E2E_MASTER_PASSWORD, 'Exige banco QA e dois operadores.');
  await entrar(page);
  const primeiroToken = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const primeiro = { Authorization: `Bearer ${primeiroToken}` };
  const outroOperador = await criarOperadorDeTeste(request);
  let cliente;
  try {
    const login = await request.post('/api/auth/login', { data: outroOperador.credenciais });
    expect(login.status()).toBe(200);
    const segundo = { Authorization: `Bearer ${(await login.json()).token}` };
    const cadastro = await request.post('/api/clientes', { headers: primeiro, data: { nome: `TESTE_QA_LIXEIRA_CORRIDA_${Date.now()}` } });
    expect(cadastro.status()).toBe(201);
    cliente = await cadastro.json();
    const exclusao = await request.delete(`/api/clientes/${cliente.id}`, { headers: primeiro });
    expect(exclusao.status()).toBe(200);
    for (const caso of [
      { rota: '/api/fonadas', dados: { valor: 10, cobranca: '01/12/26', periodo: 'MANHÃ' } },
      { rota: '/api/ao-vivo', dados: { valor: 10, dia_entrega: '01/12/26' } },
    ]) {
      const resposta = await request.post(caso.rota, { headers: segundo, data: { cliente_id: cliente.id, ...caso.dados } });
      expect(resposta.status(), caso.rota).toBe(409);
    }
    const lixeira = await request.get(`/api/clientes/${cliente.id}`, { headers: primeiro });
    expect((await lixeira.json()).cliente.excluido_em).toBeTruthy();
  } finally {
    if (cliente) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers: primeiro });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers: primeiro });
    }
    await outroOperador.excluir();
  }
});
