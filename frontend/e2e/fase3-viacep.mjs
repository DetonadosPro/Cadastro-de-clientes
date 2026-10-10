import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

if (process.env.QA_E2E_ISOLATED_DB !== '1') throw new Error('ViaCEP exige flag QA.');
const navegador = await chromium.launch({ channel: 'msedge' });
const pagina = await navegador.newPage();
const ids = [];
let token;
const api = async (url, method = 'GET') => {
  const resposta = await fetch(`http://127.0.0.1:3001/api${url}`, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!resposta.ok) throw new Error(`${method} ${url}: ${resposta.status}`);
  return resposta.json();
};
try {
  await pagina.goto('http://127.0.0.1:4173/login');
  await pagina.getByLabel('Usuário', { exact: true }).fill('QA_AUDITOR');
  await pagina.getByLabel('Senha', { exact: true }).fill('QA_TESTE_2026!');
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
  await pagina.waitForURL('**/agenda');
  token = await pagina.evaluate(() => localStorage.getItem('pombo_token'));
  if ((await api('/diagnostico/performance')).auditoriaQa?.banco !== 'pombo_correio_qa_auditoria') throw new Error('Banco não QA.');

  const nomeReal = `TESTE_QA_VIACEP_REAL_${Date.now()}`;
  await pagina.goto('http://127.0.0.1:4173/clientes/novo');
  await pagina.getByLabel('Nome *').fill(nomeReal);
  await pagina.getByRole('button', { name: /Endereço e referência/ }).click();
  const requisicaoReal = pagina.waitForResponse((r) => r.url().startsWith('https://viacep.com.br/ws/') && r.status() === 200);
  await pagina.getByLabel('Endereço', { exact: true }).fill('Leopoldino de Oliveira');
  const respostaReal = await requisicaoReal;
  const sugestoes = await respostaReal.json();
  if (!Array.isArray(sugestoes) || !sugestoes.length) throw new Error('ViaCEP real sem sugestões.');
  await pagina.getByRole('option').first().click();
  const enderecoReal = await pagina.getByLabel('Endereço', { exact: true }).inputValue();
  const bairroReal = await pagina.getByLabel('Bairro').inputValue();
  if (!enderecoReal.includes('Leopoldino de Oliveira') || !bairroReal) throw new Error('Sugestão real não preencheu endereço e bairro.');
  await pagina.getByLabel('Nº').fill('123');
  await pagina.getByRole('button', { name: 'Salvar cliente' }).click();
  await pagina.waitForURL(/\/clientes\/\d+$/);
  const idReal = Number(new URL(pagina.url()).pathname.split('/').pop());
  ids.push(idReal);
  const salvoReal = (await api(`/clientes/${idReal}`)).cliente;
  if (salvoReal.endereco !== `${enderecoReal}, 123` || salvoReal.bairro !== bairroReal) throw new Error('Endereço ViaCEP real não persistiu.');

  const nomeFalha = `TESTE_QA_VIACEP_FALHA_${Date.now()}`;
  await pagina.route('**/viacep.com.br/ws/**', (rota) => rota.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await pagina.goto('http://127.0.0.1:4173/clientes/novo');
  await pagina.getByLabel('Nome *').fill(nomeFalha);
  await pagina.getByRole('button', { name: /Endereço e referência/ }).click();
  await pagina.getByLabel('Endereço', { exact: true }).fill('Rua Manual de Teste');
  await pagina.waitForTimeout(700);
  if (await pagina.getByLabel('Endereço', { exact: true }).inputValue() !== 'Rua Manual de Teste') throw new Error('Falha ViaCEP apagou endereço manual.');
  await pagina.getByLabel('Bairro').fill('Centro QA');
  await pagina.getByRole('button', { name: 'Salvar cliente' }).click();
  await pagina.waitForURL(/\/clientes\/\d+$/);
  const idFalha = Number(new URL(pagina.url()).pathname.split('/').pop());
  ids.push(idFalha);
  const salvoManual = (await api(`/clientes/${idFalha}`)).cliente;
  if (salvoManual.endereco !== 'Rua Manual de Teste' || salvoManual.bairro !== 'Centro QA') throw new Error('Fallback manual não persistiu.');
  const relatorio = { banco: 'pombo_correio_qa_auditoria', viaCepReal: { status: respostaReal.status(), sugestoes: sugestoes.length, endereco: enderecoReal, bairro: bairroReal, persistiu: true }, falhaControlada: { status: 503, entradaManualPreservada: true, persistiu: true } };
  await fs.writeFile(path.resolve('../docs/auditoria/evidencias/viacep-qa.json'), JSON.stringify(relatorio, null, 2));
  console.log(JSON.stringify(relatorio));
} finally {
  if (token) for (const id of ids) {
    await api(`/clientes/${id}`, 'DELETE').catch(() => {});
    await api(`/clientes/${id}/definitivo`, 'DELETE').catch(() => {});
  }
  await navegador.close();
}
