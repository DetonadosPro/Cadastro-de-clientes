import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { entrar, isolado } from './apoio.js';

function hoje() {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date());
}

test('axe verifica as dez rotas funcionais restantes com pedidos QA reais', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  let cliente;
  let fonada;
  let aoVivo;
  const evidencia = [];
  try {
    const criadoCliente = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_AXE_ROTAS_${Date.now()}` } });
    expect(criadoCliente.status()).toBe(201);
    cliente = await criadoCliente.json();
    const criadoFonada = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 10, cobranca: hoje(), periodo: 'MANHÃ', data_pedido: hoje(), p1_dia: hoje(), p1_para: 'AXE QA' } });
    expect(criadoFonada.status()).toBe(201);
    fonada = await criadoFonada.json();
    const criadoAoVivo = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 20, dia_entrega: hoje(), para: 'AXE QA', pagamento: `PRAZO - DIA ${hoje()} - MP - PIX` } });
    expect(criadoAoVivo.status()).toBe(201);
    aoVivo = await criadoAoVivo.json();
    const rotas = [
      '/relatorios', `/clientes/${cliente.id}`, '/fonada', `/fonada/novo?clienteId=${cliente.id}`,
      `/fonada/${fonada.id}`, '/fonada/hoje', '/ao-vivo', `/ao-vivo/novo?clienteId=${cliente.id}`,
      `/ao-vivo/${aoVivo.id}`, '/ao-vivo/hoje',
    ];
    for (const rota of rotas) {
      await page.goto(rota);
      await page.locator('main').waitFor();
      await page.waitForTimeout(350);
      const resultado = await new AxeBuilder({ page }).analyze();
      const graves = resultado.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
      evidencia.push({ rota, graves: graves.map((v) => ({ id: v.id, impacto: v.impact, elementos: v.nodes.map((n) => ({ alvo: n.target, html: n.html, detalhes: n.any.map((a) => a.data) })) })) });
    }
    await page.goto(`/ao-vivo/${aoVivo.id}`);
    await page.getByRole('button', { name: 'Não recebeu — remarcar prazo' }).click();
    await page.waitForTimeout(300);
    const modal = await new AxeBuilder({ page }).analyze();
    const gravesModal = modal.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
    evidencia.push({ rota: `/ao-vivo/${aoVivo.id}#modal-prazo`, graves: gravesModal.map((v) => ({ id: v.id, impacto: v.impact, elementos: v.nodes.map((n) => ({ alvo: n.target, html: n.html, detalhes: n.any.map((a) => a.data) })) })) });
    expect(evidencia.filter((item) => item.graves.length > 0).map((item) => ({ rota: item.rota, regras: item.graves.map((v) => `${v.id}:${v.elementos.length}`) }))).toEqual([]);
  } finally {
    fs.writeFileSync(path.resolve('../docs/auditoria/evidencias/axe-rotas-restantes-qa.json'), JSON.stringify(evidencia, null, 2));
    if (fonada) await request.delete(`/api/fonadas/${fonada.id}`, { headers });
    if (aoVivo) await request.delete(`/api/ao-vivo/${aoVivo.id}`, { headers });
    if (cliente) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
    }
  }
});
