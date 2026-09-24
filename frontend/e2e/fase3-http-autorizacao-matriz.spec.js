import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isolado } from './apoio.js';

test('cada handler protegido recusa ausência de autenticação e token inválido', async ({ request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  const matriz = await readFile(path.resolve('../docs/auditoria/MATRIZ_HTTP_COMPLETA.md'), 'utf8');
  const linhas = matriz.split(/\r?\n/).filter((linha) => /^\| API-\d+/.test(linha));
  expect(linhas).toHaveLength(72);
  let protegidos = 0;
  for (const linha of linhas) {
    const colunas = linha.split('|').map((valor) => valor.trim());
    const [, id, metodo, endpoint, , autenticado] = colunas;
    if (autenticado !== 'Sim') continue;
    protegidos++;
    const url = endpoint.replaceAll('`', '').replaceAll(':id', '999999999');
    const semLogin = await request.fetch(url, { method: metodo, data: ['POST', 'PUT', 'PATCH'].includes(metodo) ? {} : undefined });
    expect(semLogin.status(), `${id} sem login`).toBe(401);
    const tokenInvalido = await request.fetch(url, { method: metodo, headers: { Authorization: 'Bearer token-invalido-qa' }, data: ['POST', 'PUT', 'PATCH'].includes(metodo) ? {} : undefined });
    expect(tokenInvalido.status(), `${id} token inválido`).toBe(401);
  }
  expect(protegidos).toBeGreaterThan(60);
});
