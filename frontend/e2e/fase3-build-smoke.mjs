import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

if (process.env.QA_E2E_ISOLATED_DB !== '1') throw new Error('Build smoke exige flag QA.');
const base = 'http://127.0.0.1:4173';
const api = 'http://127.0.0.1:3001/api';
const navegador = await chromium.launch({ channel: 'msedge' });
const pagina = await navegador.newPage();
const erros = [];
pagina.on('pageerror', (erro) => erros.push(erro.message));
let cliente;
const pedidos = [];
let token;
const resultados = [];
const chamar = async (url, method = 'GET', data) => {
  const resposta = await fetch(`${api}${url}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`${method} ${url}: ${resposta.status} ${corpo.erro || ''}`);
  return corpo;
};
try {
  await pagina.goto(`${base}/login`);
  await pagina.reload();
  if (!await pagina.getByRole('button', { name: 'Entrar', exact: true }).isVisible()) throw new Error('Login do build ausente.');
  resultados.push({ rota: '/login', direto: true, f5: true });
  await pagina.goto(`${base}/gerenciar-usuarios`);
  await pagina.reload();
  if (!await pagina.locator('body').innerText().then((texto) => /usuários|usuários/i.test(texto))) throw new Error('Administração do build ausente.');
  resultados.push({ rota: '/gerenciar-usuarios', direto: true, f5: true });
  await pagina.goto(`${base}/login`);
  await pagina.getByLabel('Usuário').fill('QA_AUDITOR');
  await pagina.getByLabel('Senha').fill('QA_TESTE_2026!');
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
  await pagina.waitForURL('**/agenda');
  token = await pagina.evaluate(() => localStorage.getItem('pombo_token'));
  const diagnostico = await chamar('/diagnostico/performance');
  if (diagnostico.auditoriaQa?.banco !== 'pombo_correio_qa_auditoria') throw new Error('Build smoke sem banco QA.');
  cliente = await chamar('/clientes', 'POST', { nome: `TESTE_QA_BUILD_${Date.now()}` });
  pedidos.push({ recurso: 'fonadas', dados: await chamar('/fonadas', 'POST', { cliente_id: cliente.id, valor: 1, cobranca: '22/09/26', periodo: 'MANHÃ' }) });
  pedidos.push({ recurso: 'ao-vivo', dados: await chamar('/ao-vivo', 'POST', { cliente_id: cliente.id, valor: 1, dia_entrega: '22/09/26' }) });
  const rotas = [
    '/agenda', '/cobranca', '/relatorios', '/recall', '/clientes', '/clientes/novo',
    '/clientes/lixeira', `/clientes/${cliente.id}`, '/fonada', '/fonada/novo',
    '/fonada/hoje', `/fonada/${pedidos[0].dados.id}`, '/ao-vivo', '/ao-vivo/novo',
    '/ao-vivo/hoje', `/ao-vivo/${pedidos[1].dados.id}`,
  ];
  for (const rota of rotas) {
    const resposta = await pagina.goto(`${base}${rota}`);
    if (resposta.status() !== 200) throw new Error(`${rota}: acesso direto HTTP ${resposta.status()}`);
    await pagina.locator('main').waitFor();
    await pagina.reload();
    await pagina.locator('main').waitFor();
    if (new URL(pagina.url()).pathname !== rota) throw new Error(`${rota}: refresh mudou rota`);
    resultados.push({ rota, direto: true, f5: true });
  }
  if (erros.length) throw new Error(`Erros JavaScript: ${erros.join(' | ')}`);
  const arquivo = path.resolve('../docs/auditoria/evidencias/build-smoke-qa.json');
  await fs.writeFile(arquivo, JSON.stringify({ banco: diagnostico.auditoriaQa.banco, build: base, api, rotas: resultados, erros }, null, 2));
  console.log(JSON.stringify({ rotas: resultados.length, f5: resultados.length, erros: erros.length }));
} finally {
  if (token) {
    for (const pedido of pedidos) await chamar(`/${pedido.recurso}/${pedido.dados.id}`, 'DELETE').catch(() => {});
    if (cliente) {
      await chamar(`/clientes/${cliente.id}`, 'DELETE').catch(() => {});
      await chamar(`/clientes/${cliente.id}/definitivo`, 'DELETE').catch(() => {});
    }
  }
  await navegador.close();
}
