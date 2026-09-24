import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const pasta = resolve('../docs/auditoria/evidencias');
await mkdir(pasta, { recursive: true });
const navegador = await chromium.launch({ channel: 'msedge' });
const baseURL = process.env.QA_E2E_BASE_URL || 'http://127.0.0.1:5173';
const usuario = process.env.QA_E2E_USER;
const senha = process.env.QA_E2E_PASSWORD;
if (!usuario || !senha) throw new Error('Informe QA_E2E_USER e QA_E2E_PASSWORD no ambiente.');

try {
  for (const [nome, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const contexto = await navegador.newContext({ viewport, deviceScaleFactor: 1 });
    const pagina = await contexto.newPage();
    await pagina.goto(`${baseURL}/login`);
    await pagina.waitForTimeout(800);
    await pagina.screenshot({ path: resolve(pasta, `${nome}-login.png`), fullPage: true });
    await pagina.getByLabel('Usuário').fill(usuario);
    await pagina.getByLabel('Senha').fill(senha);
    await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
    await pagina.waitForURL('**/agenda');
    await pagina.getByRole('heading', { name: 'Agenda' }).waitFor();
    await pagina.waitForTimeout(800);
    await pagina.screenshot({ path: resolve(pasta, `${nome}-agenda.png`), fullPage: true });
    await pagina.goto(`${baseURL}/clientes/novo`);
    await pagina.getByRole('heading', { name: 'Novo cliente' }).waitFor();
    await pagina.waitForTimeout(800);
    await pagina.screenshot({ path: resolve(pasta, `${nome}-novo-cliente.png`), fullPage: true });
    await contexto.close();
  }
} finally {
  await navegador.close();
}
