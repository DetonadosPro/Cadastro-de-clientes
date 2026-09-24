import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('Recall grava cada status, histórico e pedido criado, incluindo atualização pela interface', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const sufixo = String(Date.now()).replace(/\d/g, (d) => 'ABCDEFGHIJ'[Number(d)]);
  const nomeContato = `CONTATO QA MARCOS ${sufixo}`;
  const nomeAniversariante = `ANIVERSARIANTE QA ROBERTA ${sufixo}`;
  const dataIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [ano, mes, dia] = dataIso.split('-');
  const diaBr = `${dia}/${mes}/${ano.slice(-2)}`;
  const anterior = `${dia}/${mes}/${String(Number(ano) - 1).slice(-2)}`;
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: nomeContato, whatsapp: '34999999999' } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  try {
    for (const tema of ['ANIV A', 'ANIV B']) {
      const criado = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 15, cobranca: diaBr, periodo: 'MANHÃ', p1_dia: anterior, p1_para: nomeAniversariante, p1_tema: tema, p1_celular: '34999999999' } });
      expect(criado.status()).toBe(201);
      pedidos.push(await criado.json());
    }
    const fila = await request.get(`/api/recall/fila?data=${dataIso}`, { headers });
    expect(fila.status()).toBe(200);
    const item = (await fila.json()).porDiaMensagem.find((i) => i.clienteNome === nomeContato && i.aniversariante === nomeAniversariante);
    expect(item).toBeTruthy();
    expect(item.historico.length).toBeGreaterThanOrEqual(2);
    const busca = await request.get(`/api/recall/buscar?termo=${encodeURIComponent(nomeAniversariante)}`, { headers });
    expect(busca.status()).toBe(200);
    expect((await busca.json()).recebeuDe.some((i) => i.aniversariante === nomeAniversariante)).toBe(true);

    const estados = ['PENDENTE', 'NAO_ATENDEU', 'RETORNAR', 'SEM_INTERESSE', 'INTERESSADO'];
    for (const status of estados) {
      const resposta = await request.put('/api/recall/status', { headers, data: {
        dataReferencia: dataIso, relacaoChave: item.relacaoChave, clienteId: cliente.id,
        clienteNome: nomeContato, aniversarianteNome: nomeAniversariante,
        status, observacao: `QA ${status}`, pedidoOrigemId: pedidos[0].id,
      } });
      expect(resposta.status(), status).toBe(200);
      expect((await resposta.json()).registro.status).toBe(status);
    }
    const historico = await request.get('/api/recall/historico', { headers });
    expect(historico.status()).toBe(200);
    expect((await historico.json()).registros.some((r) => r.relacao_chave === item.relacaoChave && r.status === 'INTERESSADO')).toBe(true);

    await page.goto(`/recall?data=${dataIso}`);
    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible();
    await expect(page.getByText(nomeContato).first()).toBeVisible();
    await page.locator('#recall-status').selectOption('NAO_ATENDEU');
    await page.locator('#recall-observacao').fill('QA interface não atendeu');
    await page.getByRole('button', { name: 'Salvar andamento' }).click();
    await expect.poll(async () => {
      const resposta = await request.get('/api/recall/historico', { headers });
      return (await resposta.json()).registros.find((r) => r.relacao_chave === item.relacaoChave)?.status;
    }).toBe('NAO_ATENDEU');
    await page.reload();
    await expect(page.locator('#recall-status')).toHaveValue('NAO_ATENDEU');

    const pedidoCriado = await request.put('/api/recall/pedido-criado', { headers, data: { dataReferencia: dataIso, relacaoChave: item.relacaoChave, pedidoId: pedidos[1].id } });
    expect(pedidoCriado.status()).toBe(200);
    expect((await pedidoCriado.json()).registro.status).toBe('PEDIDO_CRIADO');
    const chaveNova = `QA-NOVA-${Date.now()}`;
    const vinculoSemStatus = await request.put('/api/recall/pedido-criado', { headers, data: { dataReferencia: dataIso, relacaoChave: chaveNova, pedidoId: pedidos[1].id } });
    expect(vinculoSemStatus.status()).toBe(200);
    expect((await vinculoSemStatus.json()).registro.relacao_chave).toBe(chaveNova);
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
