import { expect } from '@playwright/test';

export const usuario = process.env.QA_E2E_USER || 'QA_AUDITOR';
export const senha = process.env.QA_E2E_PASSWORD || 'QA_TESTE_2026!';
export const isolado = process.env.QA_E2E_ISOLATED_DB === '1';

export async function entrar(page, credenciais = { usuario, senha }) {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill(credenciais.usuario);
  await page.getByLabel('Senha').fill(credenciais.senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/agenda');
  await page.getByRole('heading', { name: 'Agenda' }).waitFor();
}

export async function criarOperadorDeTeste(request) {
  const segredo = process.env.QA_E2E_MASTER_PASSWORD;
  const headers = { 'x-senha-mestra': segredo };
  const credenciais = { usuario: `TESTE_QA_OPERADOR_${Date.now()}_${Math.floor(Math.random() * 100000)}`, senha: 'QA_OPERADOR_FORTE_2026!' };
  const criado = await request.post('/api/auth/usuarios', { headers, data: { ...credenciais, nome: 'Segundo Operador QA' } });
  expect(criado.status()).toBe(201);
  const lista = await request.get('/api/auth/usuarios', { headers });
  const id = (await lista.json()).usuarios.find((item) => item.usuario === credenciais.usuario)?.id;
  expect(id).toBeTruthy();
  return { credenciais, excluir: () => request.delete(`/api/auth/usuarios/${id}`, { headers }) };
}
