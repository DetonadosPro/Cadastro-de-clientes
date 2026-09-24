import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

if (process.env.QA_E2E_ISOLATED_DB !== '1') throw new Error('Rede exige flag QA.');
const navegador = await chromium.launch({ channel: 'msedge' });
const contexto = await navegador.newContext();
const pagina = await contexto.newPage();
const resultados = [];
try {
  await pagina.goto('http://127.0.0.1:4173/login');
  await pagina.getByLabel('Usuário').fill('QA_AUDITOR');
  await pagina.getByLabel('Senha').fill('QA_TESTE_2026!');
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
  await pagina.waitForURL('**/agenda');
  const token = await pagina.evaluate(() => localStorage.getItem('pombo_token'));
  const diagnostico = await fetch('http://127.0.0.1:3001/api/diagnostico/performance', { headers: { Authorization: `Bearer ${token}` } });
  if ((await diagnostico.json()).auditoriaQa?.banco !== 'pombo_correio_qa_auditoria') throw new Error('Banco não QA.');

  for (const status of [422, 429, 500, 502, 503]) {
    const interceptar = (rota) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ erro: `Falha QA ${status}` }) });
    await pagina.route('**/api/clientes?**', interceptar);
    await pagina.goto(`http://127.0.0.1:4173/clientes?busca=TESTE_QA_REDE_${status}`);
    await pagina.getByText(`Falha QA ${status}`).waitFor();
    await pagina.unroute('**/api/clientes?**', interceptar);
    await pagina.getByRole('button', { name: 'Tentar novamente' }).click();
    await pagina.getByText(`Falha QA ${status}`).waitFor({ state: 'detached' });
    resultados.push({ caso: `HTTP ${status}`, mensagem: true, recuperou: true });
  }

  await pagina.goto('http://127.0.0.1:4173/clientes?busca=TESTE_QA_REDE_OFFLINE');
  await pagina.locator('.clientes-status').waitFor();
  await contexto.setOffline(true);
  await pagina.locator('#cliente-busca').fill('TESTE_QA_REDE_OFFLINE_B');
  await pagina.getByText('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.').waitFor();
  await contexto.setOffline(false);
  await pagina.getByRole('button', { name: 'Tentar novamente' }).click();
  await pagina.getByText('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.').waitFor({ state: 'detached' });
  resultados.push({ caso: 'offline', mensagem: true, recuperou: true });

  const atrasar = async (rota) => { await new Promise((resolver) => setTimeout(resolver, 1200)); await rota.continue(); };
  await pagina.route('**/api/clientes?**', atrasar);
  await pagina.locator('#cliente-busca').fill('TESTE_QA_REDE_LENTA');
  await pagina.getByText('Atualizando clientes…').waitFor();
  await pagina.getByText('Atualizando clientes…').waitFor({ state: 'detached' });
  await pagina.unroute('**/api/clientes?**', atrasar);
  resultados.push({ caso: 'rede lenta 1,2 s', indicouCarregamento: true, concluiu: true });
  const relatorio = { banco: 'pombo_correio_qa_auditoria', build: 'http://127.0.0.1:4173', resultados };
  await fs.writeFile(path.resolve('../docs/auditoria/evidencias/rede-build-qa.json'), JSON.stringify(relatorio, null, 2));
  console.log(JSON.stringify(relatorio));
} finally {
  await contexto.close();
  await navegador.close();
}
