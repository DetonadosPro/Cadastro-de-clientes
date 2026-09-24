import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { entrar, isolado } from './apoio.js';

test('status, SSE e tarefas manuais geram artefatos QA verificáveis sem envio externo', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  const status = await request.get('/api/status');
  expect(status.status()).toBe(200);
  expect((await status.json()).sistema).toBe('Pombo-Correio');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_BACKUP_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  let pedidoId;
  try {
    const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date());
    const pedidoResposta = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 17.03, data_pedido: hoje, cobranca: '01/12/26', periodo: 'MANHÃ' } });
    expect(pedidoResposta.status()).toBe(201);
    pedidoId = (await pedidoResposta.json()).id;
    const controle = new AbortController();
    try {
      const eventos = await fetch('http://127.0.0.1:3001/api/eventos', { headers, signal: controle.signal });
      expect(eventos.status).toBe(200);
      const { value } = await eventos.body.getReader().read();
      expect(new TextDecoder().decode(value)).toContain('event: conectado');
    } finally { controle.abort(); }

    const backup = await request.post('/api/tarefas/backup-agora', { headers });
    expect(backup.status()).toBe(200);
    const detalhes = await backup.json();
    expect(detalhes.modo).toBe('qa');
    expect(detalhes.arquivos).toHaveLength(10);
    const pasta = path.resolve(process.cwd(), '../docs/auditoria/evidencias/backup-qa');
    const conteudo = {};
    for (const arquivo of detalhes.arquivos) {
      const bytes = await fs.readFile(path.join(pasta, arquivo));
      expect(bytes.length).toBeGreaterThan(20);
      const tabela = arquivo.split('-')[0];
      conteudo[tabela] = JSON.parse(gunzipSync(bytes).toString('utf8'));
    }
    expect(conteudo.clientes.some((item) => item.id === cliente.id)).toBe(true);
    expect(conteudo.fonadas.some((item) => item.id === pedidoId)).toBe(true);
    expect(Object.keys(conteudo).sort()).toEqual([
      'usuarios', 'clientes', 'fonadas', 'ao_vivo', 'tentativas_contato',
      'tentativas_prazo_ao_vivo', 'lembretes', 'recall_registros',
      'duplicatas_descartadas', 'contadores_os',
    ].sort());

    const primeiro = await request.post('/api/tarefas/resumo-agora', { headers });
    const segundo = await request.post('/api/tarefas/resumo-agora', { headers });
    expect([primeiro.status(), segundo.status()]).toEqual([200, 200]);
    const arquivo = (await primeiro.json()).arquivo;
    expect((await segundo.json()).arquivo).toBe(arquivo);
    const resumo = JSON.parse(await fs.readFile(path.join(pasta, arquivo), 'utf8'));
    expect(resumo.total.quantidadeVendida).toBeGreaterThanOrEqual(1);
  } finally {
    if (pedidoId) await request.delete(`/api/fonadas/${pedidoId}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
