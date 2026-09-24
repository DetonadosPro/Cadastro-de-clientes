import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { entrar, isolado, criarOperadorDeTeste } from './apoio.js';

test('dois operadores veem novo cliente na mesma lista e aviso na ficha alterada', async ({ page, browser, request }) => {
  test.skip(!isolado || !process.env.QA_E2E_MASTER_PASSWORD, 'Exige banco isolado e duas contas QA.');
  await entrar(page);
  const operador = await criarOperadorDeTeste(request);
  const contextoB = await browser.newContext();
  const paginaB = await contextoB.newPage();
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const nome = `TESTE_QA_TEMPO_REAL_${Date.now()}`;
  let id;
  try {
    await entrar(paginaB, operador.credenciais);
    await paginaB.goto('/clientes');
    await expect(paginaB.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
    const criacao = await request.post('/api/clientes', { headers, data: { nome, whatsapp: '11999999999' } });
    expect(criacao.status()).toBe(201);
    id = (await criacao.json()).id;
    await expect(paginaB.getByText(nome).first()).toBeVisible({ timeout: 10000 });

    await paginaB.goto(`/clientes/${id}`);
    await expect(paginaB.getByRole('heading', { name: nome })).toBeVisible();
    const leitura = await request.get(`/api/clientes/${id}`, { headers });
    const atual = (await leitura.json()).cliente;
    const edicao = await request.put(`/api/clientes/${id}`, {
      headers,
      data: { nome: `${nome}_EDITADO`, versao: atual.versao },
    });
    expect(edicao.status()).toBe(200);
    await expect(paginaB.getByText('Este registro foi alterado em outra tela. Seu formulário foi preservado.')).toBeVisible({ timeout: 10000 });
    await paginaB.reload();
    await expect(paginaB.getByRole('heading', { name: `${nome}_EDITADO` })).toBeVisible();
  } finally {
    await contextoB.close();
    await operador.excluir();
    if (id) {
      await request.delete(`/api/clientes/${id}`, { headers });
      await request.delete(`/api/clientes/${id}/definitivo`, { headers });
    }
  }
});
