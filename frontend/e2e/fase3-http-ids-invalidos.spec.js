import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { usuario, senha, isolado } from './apoio.js';

test('todas as rotas com ID rejeitam texto inválido sem erro interno', async ({ request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  const login = await request.post('/api/auth/login', { data: { usuario, senha } });
  expect(login.status()).toBe(200);
  const token = (await login.json()).token;
  const pasta = path.dirname(fileURLToPath(import.meta.url));
  const matriz = fs.readFileSync(path.resolve(pasta, '../../docs/auditoria/MATRIZ_HTTP_COMPLETA.md'), 'utf8');
  const rotas = [...matriz.matchAll(/^\| (API-\d+) \| (GET|POST|PUT|PATCH|DELETE) \| `([^`]*:id[^`]*)`/gm)];
  expect(rotas).toHaveLength(31);
  for (const [, id, method, padrao] of rotas) {
    const resposta = await request.fetch(padrao.replace(':id', 'abc'), {
      method,
      headers: { Authorization: `Bearer ${token}` },
      ...(['POST', 'PUT', 'PATCH'].includes(method) ? { data: {} } : {}),
    });
    // A gestão de usuários exige senha mestra antes de revelar se o ID existe.
    const esperado = padrao.startsWith('/api/auth/usuarios/') ? 401 : 400;
    expect.soft(resposta.status(), `${id} ${method} ${padrao}`).toBe(esperado);
  }
});
