// Executa as rotas reais sobre tabelas temporárias na conexão atual.
// Não lê nem altera pedidos/clientes persistidos.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const express = require('express');
const { Client } = require('pg');
const { once } = require('node:events');
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
async function executar() {
  await client.connect();
  let server;
  try {
    await client.query(`CREATE TEMP TABLE clientes (id int, nome text, fixo text, celular text, whatsapp text, endereco text, complemento text, bairro text, referencia text);
      CREATE TEMP TABLE fonadas (id int, senha_os text, cliente_id int, nome_comprador text, data_pedido text, valor numeric, cobranca text, cobranca_reagendada text,
        periodo text, pagou text, recebi text, data_pagamento text, p1_dia text, impresso text, versao int, comprador_fixo text, comprador_celular text,
        comprador_endereco text, comprador_complemento text, comprador_bairro text, comprador_referencia text, excluido_em timestamp);
      CREATE TEMP TABLE ao_vivo (id int, numero_os text, cliente_id int, comprador text, data_pedido text, dia_entrega text, horario_entrega text, para text,
        valor numeric, pagamento text, pagou text, data_pagou text, data_cobranca text, valor_recebido numeric, forma_recebimento text, pagamento_recebido_por text,
        versao int, fixo_local text, celular text, whatsapp text, endereco text, bairro text, referencia text, excluido_em timestamp)`);
    await client.query(`INSERT INTO clientes (id,nome) VALUES (1,'kátia EMILLY alves de souza'),(2,'elaine maria de oliveira');
      INSERT INTO fonadas (id,senha_os,cliente_id,nome_comprador,valor,pagou,data_pagamento) VALUES
        (1,'36947',1,'Nome antigo',12,'SIM','01/10/26'),(2,'36514',2,'elaine maria de oliveira',12,'SIM','01/10/26'),
        (3,'100',NULL,'Márcia',12,'SIM','01/10/26');
      INSERT INTO ao_vivo (id,numero_os,cliente_id,comprador,valor,pagou,data_pagou) VALUES (1,'200',1,'Nome antigo',12,'SIM','01/10/26')`);
    const banco = require.resolve('../src/db/database');
    require.cache[banco] = { id: banco, filename: banco, loaded: true, exports: { db: { query: (sql, params) => client.query(sql, params) } } };
    const app = express(); app.use('/cobranca', require('../src/routes/cobranca'));
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/cobranca`;
    const buscar = async (caminho, nome, extras = {}) => {
      const resposta = await fetch(`${base}${caminho}?${new URLSearchParams({ pagou: 'SIM', nome, recebidasInicio: '01/10/26', recebidasFim: '31/10/26', ...extras })}`);
      assert.equal(resposta.status, 200);
      return (await resposta.json()).pedidos;
    };
    for (const caminho of ['', '/ao-vivo']) {
      for (const nome of ['katia', 'KÁTIA', 'káTia', 'ka\u0301tia', 'Nome antigo']) {
        const pedidos = await buscar(caminho, nome);
        assert.equal(pedidos.length, 1, `${caminho} ${nome}`);
        assert.equal(pedidos[0].nome, 'KÁTIA EMILLY ALVES DE SOUZA');
      }
      assert.equal((await buscar(caminho, 'não existe')).length, 0);
    }
    assert.equal((await buscar('', 'elaine'))[0].nome, 'ELAINE MARIA DE OLIVEIRA');
    assert.equal((await buscar('', 'marcia'))[0].nome, 'MÁRCIA');
    assert.equal((await buscar('', 'katia', { os: '36947' })).length, 1);
    assert.equal((await buscar('', 'katia', { os: '36514' })).length, 0);
    assert.equal((await buscar('', 'katia', { recebidasInicio: '01/09/26', recebidasFim: '30/09/26' })).length, 0);
    if (process.argv.includes('--interface')) {
      const { chromium } = require('../../frontend/node_modules/@playwright/test');
      const browser = await chromium.launch({ channel: 'msedge' });
      try {
        const page = await browser.newPage();
        await page.addInitScript(() => {
          localStorage.setItem('pombo_token', 'teste'); localStorage.setItem('pombo_usuario', 'TESTE');
        });
        await page.route('**/api/**', async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname.startsWith('/api/cobranca')) {
            const resposta = await fetch(base + url.pathname.slice('/api/cobranca'.length) + url.search);
            return route.fulfill({ status: resposta.status, json: await resposta.json() });
          }
          if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
          return route.fulfill({ json: url.pathname === '/api/configuracoes' ? { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 } : {} });
        });
        await page.goto('http://127.0.0.1:5189/cobranca');
        await page.getByRole('button', { name: 'Recebidas no mês', exact: true }).click();
        await page.getByText('ELAINE MARIA DE OLIVEIRA', { exact: true }).waitFor();
        for (const termo of ['KÁTIA', 'katia']) {
          await page.getByPlaceholder('Nome do comprador', { exact: true }).fill(termo);
          await page.getByText('KÁTIA EMILLY ALVES DE SOUZA', { exact: true }).waitFor();
          await page.waitForResponse((r) => r.url().includes('/api/cobranca?') && new URL(r.url()).searchParams.get('nome') === termo);
          assert.equal(await page.getByText('KÁTIA EMILLY ALVES DE SOUZA', { exact: true }).count(), 1);
        }
        await page.screenshot({ path: '../frontend/test-results/cobranca-katia.png', fullPage: true });
        console.log('Tela Recebidas no mês: ELAINE em maiúsculas e KÁTIA/KATIA com o mesmo resultado: OK');
      } finally { await browser.close(); }
    }
    console.log('PostgreSQL + rotas reais: Fonada/Ao Vivo, nome da ficha/pedido, caixa, acentos Unicode, mês e O.S.: OK');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await client.end();
  }
}
executar().catch((erro) => { console.error(erro); process.exitCode = 1; });
