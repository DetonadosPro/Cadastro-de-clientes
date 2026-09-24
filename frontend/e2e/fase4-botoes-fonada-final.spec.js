import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

function dia(dias = 0) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + dias * 86400000)); }

test('BTN-216/217/218/221: copiar dados da primeira para a segunda mensagem', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const resp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_COPIA_FONADA_${Date.now()}` } });
  expect(resp.status()).toBe(201); const cliente = await resp.json();
  try {
    await page.goto(`/fonada/novo?clienteId=${cliente.id}`);
    await page.getByRole('textbox', { name: 'Celular da 1ª mensagem' }).fill('34999999999');
    const copiarTema = page.getByRole('button', { name: 'Copiar tema/nº para a 2ª mensagem' });
    await expect(copiarTema).toBeEnabled();
    await page.getByRole('textbox', { name: 'Tema da 1ª mensagem' }).fill('TEMA QA');
    await page.getByRole('textbox', { name: 'Número da 1ª mensagem' }).fill('123');
    await copiarTema.click();
    await expect(page.getByRole('textbox', { name: 'Tema da 2ª mensagem' })).toHaveValue('TEMA QA');
    await expect(page.getByRole('textbox', { name: 'Número da 2ª mensagem' })).toHaveValue('123');
    registrar('BTN-216', page, 'button[aria-label="Copiar tema/nº para a 2ª mensagem"]', 'copiar tema e número', 'ambos os campos copiados');
    await page.getByRole('button', { name: 'Copiar telefones para a 2ª mensagem' }).click();
    await expect(page.getByRole('textbox', { name: 'Celular da 2ª mensagem' })).toHaveValue(await page.getByRole('textbox', { name: 'Celular da 1ª mensagem' }).inputValue());
    registrar('BTN-217', page, 'button[aria-label="Copiar telefones para a 2ª mensagem"]', 'copiar telefones', 'celular copiado');
    await page.getByRole('textbox', { name: 'Dia da 1ª mensagem' }).fill(dia(2));
    await page.getByRole('textbox', { name: 'Horário da 1ª mensagem' }).fill('10:30');
    await page.getByRole('button', { name: 'Copiar dia/horário para a 2ª mensagem' }).click();
    await expect(page.getByRole('textbox', { name: 'Dia da 2ª mensagem' })).toHaveValue(dia(2));
    await expect(page.getByRole('textbox', { name: 'Horário da 2ª mensagem' })).toHaveValue('10:30');
    registrar('BTN-218', page, 'button[aria-label="Copiar dia/horário para a 2ª mensagem"]', 'copiar dia e horário', 'ambos os campos copiados');
    await page.getByRole('textbox', { name: 'Para da 1ª mensagem' }).fill('DESTINATARIO QA');
    await page.locator('.campo-para-fonada .botao-p-copiar').click();
    await expect(page.getByRole('textbox', { name: 'Para da 2ª mensagem' })).toHaveValue('DESTINATARIO QA');
    registrar('BTN-221', page, '.campo-para-fonada .botao-p-copiar', 'copiar campo Para', 'destinatário copiado');
  } finally {
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('BTN-208/209: anterior e próximo pedido da busca', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const resp = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_NAV_FONADA_${Date.now()}` } });
  expect(resp.status()).toBe(201); const cliente = await resp.json();
  const pedidos = [];
  try {
    for (let n = 0; n < 2; n += 1) {
      const criado = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 10, cobranca: dia(2), periodo: 'MANHÃ', p1_tema: `QA NAV ${n}` } });
      expect(criado.status()).toBe(201); pedidos.push(await criado.json());
    }
    await page.evaluate((ids) => sessionStorage.setItem('fonadaListaNavegacao', JSON.stringify(ids)), pedidos.map((item) => item.id));
    await page.goto(`/fonada/${pedidos[0].id}`);
    await page.getByTitle('Próximo pedido na busca').click();
    await expect(page).toHaveURL(new RegExp(`/fonada/${pedidos[1].id}$`));
    registrar('BTN-209', page, 'button[title="Próximo pedido na busca"]', 'avançar', 'segundo pedido aberto');
    await page.getByTitle('Pedido anterior na busca').click();
    await expect(page).toHaveURL(new RegExp(`/fonada/${pedidos[0].id}$`));
    registrar('BTN-208', page, 'button[title="Pedido anterior na busca"]', 'voltar', 'primeiro pedido aberto');
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});
