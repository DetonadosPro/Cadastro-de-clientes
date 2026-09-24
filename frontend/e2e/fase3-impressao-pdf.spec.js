import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { entrar, isolado } from './apoio.js';

const pasta = path.resolve('../docs/auditoria/evidencias/impressao-qa');

test('recibo Fonada e formulário Ao Vivo produzem PDFs reais pelo fluxo da interface', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await mkdir(pasta, { recursive: true });
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const marcador = Date.now();
  const clienteNome = `TESTE_QA_RECIBO_MARIA_${marcador}`;
  const destinatario = `TESTE_QA_HOMENAGEADO_ROBERTO_${marcador}`;
  const mensagemLonga = `MENSAGEM_QA_AO_VIVO ${'Parabéns com carinho, alegria e saúde para todos neste dia especial. '.repeat(3)}FIM_DA_MENSAGEM_QA`;
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: clienteNome, whatsapp: '34999999999', endereco: 'Rua das Acácias, 100', bairro: 'Centro' } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  try {
    const fonadaResposta = await request.post('/api/fonadas', { headers, data: {
      cliente_id: cliente.id, valor: 123.45, cobranca: '22/09/26', periodo: 'MANHÃ',
      p1_dia: '22/09/26', p1_para: destinatario, p1_tema: 'Parabéns', p1_mensagem: 'MENSAGEM_QA_DE_IMPRESSAO',
    } });
    expect(fonadaResposta.status()).toBe(201);
    const fonada = await fonadaResposta.json();
    pedidos.push({ tipo: 'fonadas', id: fonada.id });
    await page.goto(`/cobranca?nome=${encodeURIComponent(clienteNome)}`);
    await expect(page.getByText(clienteNome).first()).toBeVisible();
    await page.getByRole('button', { name: `Imprimir recibo de ${clienteNome}` }).click();
    await expect(page.locator('.recibo')).toHaveCount(1);
    await expect(page.locator('.recibo')).toContainText(clienteNome);
    await expect(page.locator('.recibo')).toContainText('123,45');
    await page.pdf({ path: path.join(pasta, 'recibo-fonada-qa.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.getByRole('button', { name: 'Não, cancelei' }).click();

    const aoVivoResposta = await request.post('/api/ao-vivo', { headers, data: {
      cliente_id: cliente.id, valor: 67.89, dia_entrega: '22/09/26', para: destinatario,
      tema_1: 'Celebração', mensagem_codigo_1: mensagemLonga,
    } });
    expect(aoVivoResposta.status()).toBe(201);
    const aoVivo = await aoVivoResposta.json();
    pedidos.push({ tipo: 'ao-vivo', id: aoVivo.id });
    await page.goto('/ao-vivo');
    await expect(page.getByRole('heading', { name: 'Ao vivo', exact: true })).toBeVisible();
    // A lista gera a mesma folha A4 utilizada na impressão individual.
    await page.getByPlaceholder('Buscar por comprador, destinatário, telefone ou endereço...').fill(clienteNome);
    await expect(page.getByText(clienteNome).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimir página (1)' })).toBeVisible();
    await page.getByRole('button', { name: 'Imprimir página (1)' }).click();
    await expect(page.locator('.folha-a4-aovivo')).toHaveCount(1);
    await expect(page.locator('.folha-a4-aovivo')).toContainText(destinatario);
    await expect(page.locator('.folha-a4-aovivo')).toContainText('MENSAGEM_QA_AO_VIVO');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.folha-a4-aovivo')).toContainText('FIM_DA_MENSAGEM_QA');
    const mensagem = page.locator('.impresso-campo-mensagem .impresso-campo');
    expect(await mensagem.evaluate((elemento) => getComputedStyle(elemento).overflow)).toBe('visible');
    await page.pdf({ path: path.join(pasta, 'formulario-ao-vivo-qa.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.tipo}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
