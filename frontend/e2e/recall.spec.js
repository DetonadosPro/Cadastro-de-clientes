import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';

test('Recall mantém comprador e aniversariante na direção correta nas duas pesquisas', async ({ page, request }) => {
  test.skip(!isolado, 'Fluxo de escrita exige banco isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const agora = new Date();
  const diaMes = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const iso = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  const diaAntigo = `${diaMes}/${String(agora.getFullYear() - 4).slice(-2)}`;
  const clienteNome = 'TESTE QA Marcos';
  const destinataria = 'TESTE QA Roberta';
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: clienteNome, nascimento: `${diaMes}/90`, whatsapp: '34999999999' } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  let pedidoId;
  try {
    const pedidoResposta = await request.post('/api/fonadas', {
      headers,
      data: { cliente_id: cliente.id, valor: 100, cobranca: `${diaMes}/${String(agora.getFullYear()).slice(-2)}`, periodo: 'MANHÃ', p1_para: destinataria, p1_celular: '11999999999', p1_tema: 'ANIV GERAL', p1_dia: diaAntigo },
    });
    expect(pedidoResposta.status()).toBe(201);
    pedidoId = (await pedidoResposta.json()).id;
    const resposta = await request.get(`/api/recall/fila?data=${iso}`, { headers });
    expect(resposta.status()).toBe(200);
    const fila = await resposta.json();
    const comprou = fila.porDiaMensagem.find((item) => item.clienteId === cliente.id);
    expect(comprou?.clienteNome).toBe(clienteNome);
    expect(comprou?.aniversariante).toBe(destinataria);
    const recebeu = fila.porAniversario.find((item) => item.aniversariante === clienteNome && item.clienteNome === destinataria);
    expect(recebeu).toBeTruthy();

    await page.goto(`/recall?data=${iso}`);
    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible();
    await expect(page.locator('.recall-relacao-titulo')).toContainText(clienteNome);
    await expect(page.locator('.recall-relacao-titulo')).toContainText(destinataria);
    await page.getByRole('tab', { name: /Pesquisa 2/ }).click();
    await expect(page.locator('.recall-relacao-titulo')).toContainText(destinataria);
    await expect(page.locator('.recall-relacao-titulo')).toContainText(clienteNome);
  } finally {
    if (pedidoId) await request.delete(`/api/fonadas/${pedidoId}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
