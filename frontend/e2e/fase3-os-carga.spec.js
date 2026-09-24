import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('quarenta criações simultâneas mantêm O.S. preenchida e única nos dois sistemas', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  test.setTimeout(120000);
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const respostaCliente = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_OS_CARGA_${Date.now()}` } });
  expect(respostaCliente.status()).toBe(201);
  const cliente = await respostaCliente.json();
  const criados = [];
  try {
    for (const [recurso, campo, dados] of [
      ['fonadas', 'senha_os', { valor: 1, cobranca: '01/12/26', periodo: 'MANHÃ' }],
      ['ao-vivo', 'numero_os', { valor: 1, dia_entrega: '01/12/26' }],
    ]) {
      const respostas = await Promise.all(Array.from({ length: 20 }, (_, i) =>
        request.post(`/api/${recurso}`, { headers, data: { cliente_id: cliente.id, ...dados, para: `QA ${i}` } })
      ));
      expect(respostas.map((r) => r.status())).toEqual(Array(20).fill(201));
      const pedidos = await Promise.all(respostas.map((r) => r.json()));
      criados.push(...pedidos.map((p) => ({ recurso, id: p.id })));
      const numeros = pedidos.map((p) => String(p[campo] ?? '').trim());
      expect(numeros.every(Boolean)).toBe(true);
      expect(new Set(numeros).size).toBe(20);
      const relidos = await Promise.all(pedidos.map((p) => request.get(`/api/${recurso}/${p.id}`, { headers })));
      expect(relidos.map((r) => r.status())).toEqual(Array(20).fill(200));
      const persistidos = await Promise.all(relidos.map((r) => r.json()));
      expect(persistidos.map((p) => String(p[campo]).trim()).sort()).toEqual([...numeros].sort());
    }
  } finally {
    for (const pedido of criados) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
