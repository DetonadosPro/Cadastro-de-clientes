import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { entrar, isolado } from './apoio.js';

const casos = [
  ['API-006', '/api/clientes?pagina=abc&porPagina=abc'],
  ['API-007', '/api/clientes/lixeira?pagina=abc&porPagina=abc'],
  ['API-007', '/api/clientes/lixeira?porPagina=-1'],
  ['API-008', '/api/clientes/verificar-duplicidade?nome=&nascimento=abc'],
  ['API-009', '/api/clientes/possiveis-duplicatas?limite=abc'],
  ['API-023', '/api/fonadas?pagina=abc&porPagina=abc'],
  ['API-023', '/api/fonadas?porPagina=-1'],
  ['API-024', '/api/fonadas/hoje?data=abc'],
  ['API-030', '/api/ao-vivo?pagina=abc&porPagina=abc'],
  ['API-030', '/api/ao-vivo?porPagina=-1'],
  ['API-031', '/api/ao-vivo/hoje?data=abc'],
  ['API-032', '/api/ao-vivo/imprimir?ids=abc'],
  ['API-042', '/api/agenda/contagens?data=abc'],
  ['API-043', '/api/agenda/hoje?data=abc'],
  ['API-051', '/api/cobranca/ao-vivo?filtro=abc'],
  ['API-055', '/api/cobranca?filtro=abc'],
  ['API-060', '/api/recall/fila?data=abc'],
  ['API-061', '/api/recall/buscar?termo='],
  ['API-065', '/api/relatorios/vendas?inicio=abc&fim=abc'],
  ['API-066', '/api/relatorios/recebimentos?inicio=abc&fim=abc'],
  ['API-067', '/api/relatorios/desempenho?inicio=abc&fim=abc'],
];

test('consultas HTTP com query malformada são exercitadas individualmente', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const evidencia = [];
  for (const [id, url] of casos) {
    const resposta = await request.get(url, { headers });
    const corpo = await resposta.text();
    evidencia.push({ id, timestamp: new Date().toISOString(), url, status: resposta.status(), corpo: corpo.slice(0, 500) });
  }
  writeFileSync('../docs/auditoria/evidencias/http-consultas-invalidas-fase4-qa.json', JSON.stringify(evidencia, null, 2));
  for (const item of evidencia) expect(item.status, `${item.id} ${item.url} ${item.corpo}`).toBeLessThan(500);
});
