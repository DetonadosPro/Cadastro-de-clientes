import { test, expect } from '@playwright/test';
import { entrar, isolado } from './apoio.js';
import { registrar } from './fase4-modal-helper.js';

test('BTN-006/123/124/125/129/130: endereço, saída e duplicata no novo cliente', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` };
  const nome = `TESTE QA DUPLICATA ${String(Date.now()).replace(/\d/g, (digito) => 'ABCDEFGHIJ'[Number(digito)])}`;
  const resposta = await request.post('/api/clientes', { headers, data: { nome, nascimento: '01/01/90' } });
  expect(resposta.status()).toBe(201);
  const existente = await resposta.json();
  let novoId;
  try {
    await page.route('**/viacep.com.br/ws/**', (rota) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ logradouro: 'Rua QA Autocomplete', bairro: 'Centro QA', cep: '38000000', complemento: '' }]) }));
    await page.goto('/clientes/novo');
    await page.getByRole('button', { name: /Endereço e referência/ }).click();
    await page.getByLabel('Nº').fill('123');
    await page.getByLabel('Endereço', { exact: true }).fill('Rua QA');
    await page.getByRole('option', { name: /Rua QA Autocomplete/ }).click();
    await expect(page.getByLabel('Endereço', { exact: true })).toHaveValue('Rua QA Autocomplete');
    await expect(page.getByLabel('Bairro')).toHaveValue('Centro QA');
    registrar('BTN-006', page, '.endereco-autocomplete-lista button', 'selecionar sugestão', 'endereço e bairro preenchidos');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page).toHaveURL(/\/clientes$/);
    registrar('BTN-129', page, '.cadastro-acoes-sticky button:has-text("Cancelar")', 'cancelar cadastro', 'retorna à lista sem criar cliente');
    await page.goto('/clientes/novo');
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(page).toHaveURL(/\/clientes$/);
    registrar('BTN-123', page, 'button:has-text("Fechar")', 'fechar cadastro', 'retorna à lista');
    async function provocarDuplicata() {
      await page.goto('/clientes/novo');
      await page.getByLabel('Nome *').fill(nome);
      await page.getByLabel('Nascimento').fill('010190');
      await page.getByRole('button', { name: 'Salvar cliente' }).click();
      await expect(page.getByText('Já existe cliente parecido com o mesmo aniversário')).toBeVisible();
    }
    await provocarDuplicata();
    await page.locator('.cadastro-duplicados').getByRole('button', { name: 'Abrir' }).click();
    await expect(page).toHaveURL(new RegExp(`/clientes/${existente.id}$`));
    registrar('BTN-124', page, '.cadastro-duplicados button:has-text("Abrir")', 'abrir duplicata', 'ficha existente aberta');
    await provocarDuplicata();
    await page.getByRole('button', { name: 'É pessoa diferente, cadastrar assim mesmo' }).click();
    await expect(page.getByText('Cadastro pronto para confirmar')).toBeVisible();
    registrar('BTN-125', page, 'button:has-text("É pessoa diferente")', 'confirmar pessoa distinta', 'confirmação de novo cadastro exibida');
    await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
    await page.waitForURL(/\/clientes\/\d+$/);
    novoId = Number(new URL(page.url()).pathname.split('/').pop());
    expect(novoId).not.toBe(existente.id);
    registrar('BTN-130', page, 'button:has-text("Confirmar e salvar")', 'salvar pessoa distinta', 'novo cliente persistido');
  } finally {
    if (novoId) { await request.delete(`/api/clientes/${novoId}`, { headers }); await request.delete(`/api/clientes/${novoId}/definitivo`, { headers }); }
    await request.delete(`/api/clientes/${existente.id}`, { headers });
    await request.delete(`/api/clientes/${existente.id}/definitivo`, { headers });
  }
});
