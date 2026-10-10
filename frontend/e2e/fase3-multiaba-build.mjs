import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

if (process.env.QA_E2E_ISOLATED_DB !== '1') throw new Error('Multiaba exige flag QA.');
const origem = 'http://127.0.0.1:4173';
const api = 'http://127.0.0.1:3001/api';
const navegador = await chromium.launch({ channel: 'msedge' });
const contexto = await navegador.newContext();
const paginas = Array.from({ length: 5 }, () => contexto.newPage());
const abas = await Promise.all(paginas);
let token;
const diagnostico = async () => {
  const resposta = await fetch(`${api}/diagnostico/performance`, { headers: { Authorization: `Bearer ${token}` } });
  if (!resposta.ok) throw new Error(`Diagnóstico: ${resposta.status}`);
  const corpo = await resposta.json();
  if (corpo.auditoriaQa?.banco !== 'pombo_correio_qa_auditoria') throw new Error('Banco não QA.');
  return corpo.sse;
};
const esperarSse = async (esperado) => {
  for (let i = 0; i < 70; i++) {
    const atual = await diagnostico();
    if (atual.conectadas === esperado) return atual;
    await new Promise((resolver) => setTimeout(resolver, 150));
  }
  throw new Error(`SSE não chegou a ${esperado}; atual ${(await diagnostico()).conectadas}`);
};
try {
  await abas[0].goto(`${origem}/login`);
  await abas[0].getByLabel('Usuário', { exact: true }).fill('QA_AUDITOR');
  await abas[0].getByLabel('Senha', { exact: true }).fill('QA_TESTE_2026!');
  await abas[0].getByRole('button', { name: 'Entrar', exact: true }).click();
  await abas[0].waitForURL('**/agenda');
  token = await abas[0].evaluate(() => localStorage.getItem('pombo_token'));
  const base = (await diagnostico()).conectadas - 1;
  for (const pagina of abas.slice(1)) await pagina.goto(`${origem}/agenda`);
  const antes = await esperarSse(base + 5);
  await abas[1].goto(`${origem}/clientes/novo`);
  await abas[1].getByLabel('Nome *').fill('TESTE_QA_RASCUNHO_NAO_SALVO_MULTIABA');
  await abas[2].getByRole('button', { name: '+ Lembrete' }).click();
  await abas[2].getByRole('dialog').waitFor();
  await abas[0].getByRole('button', { name: /Sair/ }).click();
  await Promise.all(abas.map((pagina) => pagina.waitForURL('**/login')));
  const aposLogout = await esperarSse(base);
  for (const pagina of abas) {
    if (await pagina.evaluate(() => localStorage.getItem('pombo_token')) !== null) throw new Error('Token permaneceu em outra aba.');
  }
  await abas[0].getByLabel('Usuário', { exact: true }).fill('QA_AUDITOR');
  await abas[0].getByLabel('Senha', { exact: true }).fill('QA_TESTE_2026!');
  await abas[0].getByRole('button', { name: 'Entrar', exact: true }).click();
  await Promise.all(abas.map((pagina) => pagina.waitForURL('**/agenda')));
  const aposLogin = await esperarSse(base + 5);
  const resultado = { banco: 'pombo_correio_qa_auditoria', abas: 5, comFormularioNaoSalvo: true, comModalAberto: true, conectadasAntes: antes.conectadas, conectadasDepoisLogout: aposLogout.conectadas, conectadasDepoisLogin: aposLogin.conectadas };
  await fs.writeFile(path.resolve('../docs/auditoria/evidencias/multiaba-qa.json'), JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado));
} finally {
  await contexto.close();
  await navegador.close();
}
