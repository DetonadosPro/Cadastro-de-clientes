import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

function dataBrasilia(deslocamentoDias = 0) {
  const data = new Date(Date.now() + deslocamentoDias * 86400000);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(data);
}

test('handlers operacionais de Fonada e Ao Vivo registram baixa, desfazem e mantêm tentativas', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_OPERACAO_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  try {
    const hoje = dataBrasilia();
    const futuro = dataBrasilia(7);
    const fonadaResposta = await request.post('/api/fonadas', { headers, data: {
      cliente_id: cliente.id, valor: 42, cobranca: futuro, periodo: 'MANHÃ', data_pedido: hoje,
      p1_dia: hoje, p1_celular: '34999999999', p1_para: 'DESTINATÁRIO QA',
      p2_dia: futuro, p2_para: 'SEGUNDO DESTINATÁRIO QA',
    } });
    expect(fonadaResposta.status()).toBe(201);
    const fonada = await fonadaResposta.json();
    pedidos.push({ recurso: 'fonadas', id: fonada.id });
    let versaoFonada = fonada.versao;
    for (const mensagem of [1, 2]) {
      const baixa = await request.post(`/api/agenda/fonada/${fonada.id}/baixa`, { headers, data: { mensagem, versao: versaoFonada } });
      expect(baixa.status(), `baixa mensagem ${mensagem}`).toBe(200);
      versaoFonada = (await baixa.json()).versao;
      const lido = await request.get(`/api/fonadas/${fonada.id}`, { headers });
      expect((await lido.json())[`p${mensagem}_resultado`]).toContain('OK');
      const desfazer = await request.post(`/api/agenda/fonada/${fonada.id}/desfazer-baixa`, { headers, data: { mensagem, versao: versaoFonada } });
      expect(desfazer.status()).toBe(200);
      versaoFonada = (await desfazer.json()).versao;
      expect((await (await request.get(`/api/fonadas/${fonada.id}`, { headers })).json())[`p${mensagem}_resultado`]).toBeNull();
    }
    const tentativa = await request.post(`/api/agenda/fonada/${fonada.id}/nao-atendeu`, { headers, data: { mensagens: [1, 2], observacao: 'QA tentou contato', remarcadoDia: futuro, remarcadoHorario: '10:00', versao: versaoFonada } });
    expect(tentativa.status()).toBe(200);
    const historico = await request.get(`/api/agenda/fonada/${fonada.id}/tentativas`, { headers });
    expect(historico.status()).toBe(200);
    expect((await historico.json()).tentativas).toHaveLength(2);

    const aoVivoResposta = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 99, dia_entrega: hoje, pagamento: `PRAZO - DIA ${futuro} - MP - PIX`, para: 'DESTINATÁRIO AO VIVO QA' } });
    expect(aoVivoResposta.status()).toBe(201);
    const aoVivo = await aoVivoResposta.json();
    pedidos.push({ recurso: 'ao-vivo', id: aoVivo.id });
    const imprimir = await request.get(`/api/ao-vivo/imprimir?ids=${aoVivo.id}`, { headers });
    expect(imprimir.status()).toBe(200);
    expect((await imprimir.json()).pedidos[0].numero_os).toBe(aoVivo.numero_os);
    let versao = aoVivo.versao;
    const entregue = await request.post(`/api/ao-vivo/${aoVivo.id}/baixa`, { headers, data: { entregue: true, versao } });
    expect(entregue.status()).toBe(200);
    versao = (await entregue.json()).versao;
    expect((await (await request.get(`/api/ao-vivo/${aoVivo.id}`, { headers })).json()).resultado_entrega).toContain('ENTREGUE');
    const desfazerEntrega = await request.post(`/api/ao-vivo/${aoVivo.id}/desfazer-baixa`, { headers, data: { versao } });
    expect(desfazerEntrega.status()).toBe(200);
    versao = (await desfazerEntrega.json()).versao;
    expect((await (await request.get(`/api/ao-vivo/${aoVivo.id}`, { headers })).json()).resultado_entrega).toBeNull();
    const pagou = await request.post(`/api/ao-vivo/${aoVivo.id}/pagou`, { headers, data: { pagou: 'SIM', versao } });
    expect(pagou.status()).toBe(200);
    versao = (await pagou.json()).versao;
    expect((await (await request.get(`/api/ao-vivo/${aoVivo.id}`, { headers })).json()).pagou).toBe('SIM');
    const desmarcarPagamento = await request.post(`/api/ao-vivo/${aoVivo.id}/pagou`, { headers, data: { pagou: null, versao } });
    expect(desmarcarPagamento.status()).toBe(200);
    versao = (await desmarcarPagamento.json()).versao;
    expect((await request.post(`/api/ao-vivo/${aoVivo.id}/nao-recebeu`, { headers, data: { remarcadoDia: '31/02/26', versao } })).status()).toBe(400);
    const naoRecebeu = await request.post(`/api/ao-vivo/${aoVivo.id}/nao-recebeu`, { headers, data: { observacao: 'QA sem pagamento', remarcadoDia: futuro, versao } });
    expect(naoRecebeu.status()).toBe(200);
    const tentativas = await request.get(`/api/ao-vivo/${aoVivo.id}/tentativas-prazo`, { headers });
    expect(tentativas.status()).toBe(200);
    expect((await tentativas.json()).tentativas).toHaveLength(1);
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
