import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { usuario, senha, isolado, entrar, criarOperadorDeTeste } from './apoio.js';

test('senha incorreta não concede administração', async ({ request }) => {
  const incorreta = await request.post('/api/auth/verificar-senha-mestra', { data: { senha: 'SENHA_QA_INCORRETA' } });
  expect(incorreta.status()).toBe(401);
  const segredoTeste = process.env.QA_E2E_MASTER_PASSWORD;
  if (segredoTeste) {
    const correta = await request.post('/api/auth/verificar-senha-mestra', { data: { senha: segredoTeste } });
    expect(correta.status()).toBe(200);
  }
});

test('administração: criar e remover usuário de teste pela interface', async ({ page, request }) => {
  const segredoTeste = process.env.QA_E2E_MASTER_PASSWORD;
  test.skip(!isolado || !segredoTeste, 'Exige banco isolado e QA_E2E_MASTER_PASSWORD.');
  const loginNovo = `TESTE_QA_USUARIO_${Date.now()}`;
  await page.goto('/gerenciar-usuarios');
  await page.getByLabel('Senha mestra', { exact: true }).fill(segredoTeste);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuários do sistema' })).toBeVisible();
  await page.getByRole('button', { name: '+ Novo usuário' }).click();
  await page.getByLabel('Nome completo').fill('Usuário de Teste QA');
  await page.getByLabel('Usuário (login) *').fill(loginNovo);
  await page.getByLabel('Senha *', { exact: true }).fill('QA_SENHA_FORTE_2026!');
  await page.getByLabel('Confirmar senha *').fill('QA_SENHA_FORTE_2026!');
  await page.getByRole('button', { name: 'Criar usuário' }).click();
  const linha = page.getByRole('article').filter({ hasText: loginNovo });
  await expect(linha).toBeVisible();
  await linha.getByRole('button', { name: /^Remover/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover conta', exact: true }).click();
  await expect(linha).toHaveCount(0);
  const curta = await request.post('/api/auth/usuarios', {
    headers: { 'x-senha-mestra': segredoTeste },
    data: { usuario: `${loginNovo}_CURTA`, senha: '123' },
  });
  expect(curta.status()).toBe(400);
});
