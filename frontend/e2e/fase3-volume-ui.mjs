import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

if (process.env.QA_E2E_ISOLATED_DB !== '1') throw new Error('Volume UI exige flag QA.');
const navegador = await chromium.launch({ channel: 'msedge' });
const pagina = await navegador.newPage();
const erros = [];
pagina.on('pageerror', (erro) => erros.push(erro.message));
try {
  await pagina.goto('http://127.0.0.1:4173/login');
  await pagina.getByLabel('Usuário').fill('QA_AUDITOR');
  await pagina.getByLabel('Senha').fill('QA_TESTE_2026!');
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
  await pagina.waitForURL('**/agenda');
  const token = await pagina.evaluate(() => localStorage.getItem('pombo_token'));
  const diagnostico = await fetch('http://127.0.0.1:3001/api/diagnostico/performance', { headers: { Authorization: `Bearer ${token}` } });
  const dadosQa = await diagnostico.json();
  if (dadosQa.auditoriaQa?.banco !== 'pombo_correio_qa_auditoria') throw new Error('Banco não é QA.');
  const casos = [
    { nome: 'clientes', rota: '/clientes?busca=TESTE_QA_PERF_FASE3_', api: '/api/clientes?', campo: 'clientes', esperado: 1000 },
    { nome: 'fonadas', rota: '/fonada?busca=TESTE_QA_PERF_FASE3_', api: '/api/fonadas?', campo: 'pedidos', esperado: 5000 },
    { nome: 'aoVivo', rota: '/ao-vivo?busca=TESTE_QA_PERF_FASE3_', api: '/api/ao-vivo?', campo: 'pedidos', esperado: 5000 },
    { nome: 'cobranca', rota: '/cobranca?nome=TESTE_QA_PERF_FASE3_', api: '/api/cobranca?', campo: 'pedidos', esperado: 5000 },
  ];
  const resultados = {};
  for (const caso of casos) {
    const inicio = performance.now();
    const respostaPrometida = pagina.waitForResponse((resposta) => resposta.url().includes(caso.api) && resposta.url().includes('TESTE_QA_PERF_FASE3_') && resposta.status() === 200);
    await pagina.goto(`http://127.0.0.1:4173${caso.rota}`);
    const resposta = await respostaPrometida;
    const corpo = await resposta.json();
    const total = Number(corpo.total ?? corpo[caso.campo]?.length ?? 0);
    if (total !== caso.esperado) throw new Error(`${caso.nome}: ${total} em vez de ${caso.esperado}`);
    await pagina.getByText('TESTE_QA_PERF_FASE3_', { exact: false }).first().waitFor({ state: 'visible' });
    resultados[caso.nome] = { totalApi: total, tempoAteListaVisivelMs: Number((performance.now() - inicio).toFixed(1)), linhasDom: await pagina.locator('main tr').count() };
  }
  if (erros.length) throw new Error(`Erros JavaScript: ${erros.join(' | ')}`);
  const resultado = { banco: dadosQa.auditoriaQa.banco, build: 'http://127.0.0.1:4173', resultados, erros };
  await fs.writeFile(path.resolve('../docs/auditoria/evidencias/volume-ui-qa.json'), JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado));
} finally {
  await navegador.close();
}
