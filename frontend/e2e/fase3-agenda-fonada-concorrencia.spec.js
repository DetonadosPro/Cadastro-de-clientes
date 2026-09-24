import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado, criarOperadorDeTeste } from './apoio.js';

function dia(dias = 0) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000));
}

test('baixa agrupada é atômica e dois operadores não sobrescrevem Fonada na Agenda', async ({ page, browser, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const a = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const operador = await criarOperadorDeTeste(request);
  const segundaPagina = await browser.newPage();
  let cliente;
  let pedido;
  let pedidoSemSegunda;
  try {
    await entrar(segundaPagina, operador.credenciais);
    const b = { Authorization: `Bearer ${await segundaPagina.evaluate(() => localStorage.getItem('pombo_token'))}` };
    const respostaCliente = await request.post('/api/clientes', { headers: a, data: { nome: `TESTE_QA_AGENDA_RACE_${Date.now()}` } });
    expect(respostaCliente.status()).toBe(201);
    cliente = await respostaCliente.json();
    const semSegundaResposta = await request.post('/api/fonadas', { headers: a, data: {
      cliente_id: cliente.id, valor: 20, cobranca: dia(3), periodo: 'MANHÃ', data_pedido: dia(), p1_dia: dia(), p1_para: 'ÚNICA QA',
    } });
    expect(semSegundaResposta.status()).toBe(201);
    pedidoSemSegunda = await semSegundaResposta.json();
    const agrupamentoInvalido = await request.post(`/api/agenda/fonada/${pedidoSemSegunda.id}/baixa`, { headers: a, data: { mensagens: [1, 2], versao: pedidoSemSegunda.versao } });
    expect(agrupamentoInvalido.status()).toBe(409);
    const inalterado = await (await request.get(`/api/fonadas/${pedidoSemSegunda.id}`, { headers: a })).json();
    expect([inalterado.p1_resultado, inalterado.p2_resultado, inalterado.versao]).toEqual([null, null, pedidoSemSegunda.versao]);
    const respostaPedido = await request.post('/api/fonadas', { headers: a, data: {
      cliente_id: cliente.id, valor: 40, cobranca: dia(3), periodo: 'MANHÃ', data_pedido: dia(), p1_dia: dia(), p2_dia: dia(),
      p1_celular: '34999999999', p1_para: 'PRIMEIRA QA', p2_para: 'SEGUNDA QA',
    } });
    expect(respostaPedido.status()).toBe(201);
    pedido = await respostaPedido.json();
    const rota = `/api/agenda/fonada/${pedido.id}`;
    const baixar = (headers, versao) => request.post(`${rota}/baixa`, { headers, data: { mensagens: [1, 2], versao } });
    const respostas = await Promise.all([baixar(a, pedido.versao), baixar(b, pedido.versao)]);
    expect(respostas.map((r) => r.status()).sort()).toEqual([200, 409]);
    let atual = await (await request.get(`/api/fonadas/${pedido.id}`, { headers: a })).json();
    expect(atual.versao).toBe(pedido.versao + 1);
    expect(atual.p1_resultado).toMatch(/^OK /);
    expect(atual.p2_resultado).toMatch(/^OK /);
    const desfazerAntigo = await request.post(`${rota}/desfazer-baixa`, { headers: b, data: { mensagens: [1, 2], versao: pedido.versao } });
    expect(desfazerAntigo.status()).toBe(409);
    const desfazer = await request.post(`${rota}/desfazer-baixa`, { headers: a, data: { mensagens: [1, 2], versao: atual.versao } });
    expect(desfazer.status()).toBe(200);
    atual = await (await request.get(`/api/fonadas/${pedido.id}`, { headers: a })).json();
    expect([atual.p1_resultado, atual.p2_resultado, atual.p1_passada_por, atual.p2_passada_por]).toEqual([null, null, null, null]);
    expect(atual.versao).toBe(pedido.versao + 2);

    await Promise.all([page.goto(`/fonada/${pedido.id}`), segundaPagina.goto(`/fonada/${pedido.id}`)]);
    await expect(page.getByTitle('Marcar passada').first()).toBeVisible();
    await expect(segundaPagina.getByTitle('Marcar passada').first()).toBeVisible();
    await page.getByTitle('Marcar passada').first().click();
    await expect(page.getByText('BAIXA DADA COM SUCESSO')).toBeVisible();
    await segundaPagina.getByTitle('Marcar passada').first().click();
    await expect(segundaPagina.getByText(/Pedido alterado por outra pessoa/).first()).toBeVisible();
    atual = await (await request.get(`/api/fonadas/${pedido.id}`, { headers: a })).json();
    expect(atual.p1_resultado).toMatch(/^OK /);
    expect(atual.p2_resultado).toBeNull();

    const semVersao = await request.post(`${rota}/nao-atendeu`, { headers: b, data: { mensagens: [1, 2], remarcadoDia: dia(5), remarcadoHorario: '10:00' } });
    expect(semVersao.status()).toBe(400);
    const remarcacoes = await Promise.all([
      request.post(`${rota}/nao-atendeu`, { headers: a, data: { mensagens: [1, 2], remarcadoDia: dia(5), remarcadoHorario: '10:00', versao: atual.versao } }),
      request.post(`${rota}/nao-atendeu`, { headers: b, data: { mensagens: [1, 2], remarcadoDia: dia(6), remarcadoHorario: '11:00', versao: atual.versao } }),
    ]);
    expect(remarcacoes.map((r) => r.status()).sort()).toEqual([200, 409]);
    const tentativas = await (await request.get(`${rota}/tentativas`, { headers: a })).json();
    expect(tentativas.tentativas).toHaveLength(2);
    expect(new Set(tentativas.tentativas.map((t) => t.remarcado_dia)).size).toBe(1);
    const final = await (await request.get(`/api/fonadas/${pedido.id}`, { headers: a })).json();
    expect(final.p1_dia).toBe(tentativas.tentativas[0].remarcado_dia);
    expect(final.p2_dia).toBe(tentativas.tentativas[0].remarcado_dia);
    expect(final.versao).toBe(atual.versao + 1);
  } finally {
    if (pedido) await request.delete(`/api/fonadas/${pedido.id}`, { headers: a });
    if (pedidoSemSegunda) await request.delete(`/api/fonadas/${pedidoSemSegunda.id}`, { headers: a });
    if (cliente) {
      await request.delete(`/api/clientes/${cliente.id}`, { headers: a });
      await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers: a });
    }
    await segundaPagina.close();
    await operador.excluir();
  }
});
