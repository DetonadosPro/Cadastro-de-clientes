import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('handlers de duplicidade, descarte, resumo e mesclagem automática executam com dados QA', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const nome = `TESTE_QA_DUP_F3_${Date.now()}`;
  const clientes = [];
  try {
    for (const lado of ['A', 'B']) {
      const resposta = await request.post('/api/clientes', { headers, data: { nome, nascimento: '05/05/1990', endereco: lado === 'A' ? 'Rua A, 10' : '' } });
      expect(resposta.status()).toBe(201);
      clientes.push(await resposta.json());
    }
    const [a, b] = clientes;
    const verificar = await request.get(`/api/clientes/verificar-duplicidade?nome=${encodeURIComponent(nome)}&nascimento=05%2F05%2F1990`, { headers });
    expect(verificar.status()).toBe(200);
    expect((await verificar.json()).possiveisDuplicados.map((c) => c.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    const possiveis = await request.get('/api/clientes/possiveis-duplicatas', { headers });
    expect(possiveis.status()).toBe(200);
    expect((await possiveis.json()).pares.some((p) => [p.a.id, p.b.id].includes(a.id) && [p.a.id, p.b.id].includes(b.id))).toBe(true);
    const descartar = await request.post('/api/clientes/descartar-duplicata', { headers, data: { clienteAId: a.id, clienteBId: b.id } });
    expect(descartar.status()).toBe(200);
    const depois = await request.get('/api/clientes/possiveis-duplicatas', { headers });
    expect((await depois.json()).pares.some((p) => [p.a.id, p.b.id].includes(a.id) && [p.a.id, p.b.id].includes(b.id))).toBe(false);

    const pedido = await request.post('/api/fonadas', { headers, data: { cliente_id: b.id, valor: 42, cobranca: '01/12/26', periodo: 'MANHÃ' } });
    expect(pedido.status()).toBe(201);
    const pedidoId = (await pedido.json()).id;
    const resumo = await request.get(`/api/clientes/${b.id}/resumo`, { headers });
    expect(resumo.status()).toBe(200);
    expect((await resumo.json()).resumo.total_fonada).toBe(1);
    const mescla = await request.post('/api/clientes/mesclar-automatico', { headers, data: { clienteAId: a.id, clienteBId: b.id } });
    expect(mescla.status()).toBe(200);
    const resultado = await mescla.json();
    expect(resultado.vencedorId).toBe(b.id);
    expect(resultado.perdedorId).toBe(a.id);
    expect(resultado.cliente.endereco).toBe('Rua A, 10');
    const vinculado = await request.get(`/api/fonadas/${pedidoId}`, { headers });
    expect(Number((await vinculado.json()).cliente_id)).toBe(b.id);
  } finally {
    for (const cliente of clientes) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
