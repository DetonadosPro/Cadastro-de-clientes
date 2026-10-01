require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { Client } = require('pg');
const express = require('express');
const { once } = require('node:events');
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
async function executar() {
  await client.connect();
  let server, browser;
  try {
    await client.query(`CREATE TEMP TABLE clientes (id int PRIMARY KEY,nome text,whatsapp text,celular text,fixo text,bloqueado boolean,excluido_em timestamp);
      CREATE TEMP TABLE ao_vivo (id int PRIMARY KEY,numero_os text,cliente_id int,comprador text,para text,dia_entrega text,tema_1 text,tema_2 text,tema_3 text,tema_4 text,whatsapp text,celular text,celular2 text,resultado_entrega text,excluido_em timestamp);
      CREATE TEMP TABLE recall_registros (id serial PRIMARY KEY,data_referencia text,relacao_chave text,cliente_id int,cliente_nome text,aniversariante_nome text,status text,pedido_novo_ao_vivo_id int REFERENCES ao_vivo(id),atualizado_por text,atualizado_em timestamp DEFAULT NOW(),UNIQUE(data_referencia,relacao_chave));
      INSERT INTO clientes VALUES (1,'katia EMILLY','34999999999',NULL,NULL,FALSE,NULL);
      INSERT INTO ao_vivo (id,numero_os,cliente_id,comprador,para,dia_entrega,tema_1,tema_2) VALUES
        (1,'123',1,'katia','MÁRCIA','05/10/25','ANIV GERAL','ANIV MAE'),
        (2,'124',1,'katia','MÁRCIA','05/10/24','ANIV GERAL',NULL),
        (3,'125',1,'katia','ANA','11/05/25','D MAES GERAL',NULL),
        (4,'126',1,'katia','MÁRCIA','05/10/26','ANIV GERAL',NULL)`);
    const banco = require.resolve('../src/db/database');
    require.cache[banco] = { id: banco, filename: banco, loaded: true, exports: { db: { query: (sql, params) => client.query(sql, params) } } };
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.usuario = { usuario: 'TESTE' }; next(); }); app.use('/recall', require('../src/routes/recall'));
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const fila = async (data) => { const r = await fetch(`${base}/recall/ao-vivo/fila?data=${data}`); assert.equal(r.status, 200); return r.json(); };
    const outubro = await fila('2026-10-05'); assert.equal(outubro.itens.length, 1); assert.equal(outubro.itens[0].quantidade, 2);
    assert.equal((await fila('2026-05-10')).itens[0].ocasiao, 'MAES'); assert.equal((await fila('2026-05-11')).itens.length, 0);
    await client.query(`INSERT INTO ao_vivo (id,numero_os,comprador,para,dia_entrega,tema_1,whatsapp) VALUES (5,'127','KÁTIA EMILLY','ANA','06/10/25','ANIV GERAL','34999999999')`);
    assert.equal((await fila('2026-10-06')).itens[0].clienteId, 1);
    await client.query(`INSERT INTO clientes (id,nome,whatsapp) VALUES (2,'KÁTIA EMILLY','34999999999')`);
    assert.equal((await fila('2026-10-06')).itens[0].clienteId, null);
    await client.query('DELETE FROM clientes WHERE id=2');
    await client.query(`INSERT INTO ao_vivo (id,numero_os,cliente_id,comprador,para,dia_entrega,tema_1) VALUES (6,'128',1,'katia','ANA - 90 ANOS','07/10/25','ANIV GERAL')`);
    assert.equal((await fila('2026-10-07')).itens[0].aniversariante, 'ANA - 90 ANOS');
    if (process.argv.includes('--interface')) {
      const { chromium } = require('../../frontend/node_modules/@playwright/test');
      browser = await chromium.launch({ channel: 'msedge' });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      const erros = []; page.on('pageerror', (e) => erros.push(e.message));
      await page.addInitScript(() => { localStorage.setItem('pombo_token', 'teste'); localStorage.setItem('pombo_usuario', 'TESTE'); localStorage.setItem('pombo_nome', 'ENIMAR'); });
      let criado;
      await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/recall/') && !url.pathname.endsWith('/fila') || url.pathname === '/api/recall/ao-vivo/fila') {
          const resposta = await fetch(base + url.pathname.slice(4) + url.search, { method: route.request().method(), headers: { 'Content-Type': 'application/json' }, body: route.request().method() === 'PUT' ? route.request().postData() : undefined });
          return route.fulfill({ status: resposta.status, json: await resposta.json() });
        }
        if (url.pathname === '/api/eventos') return route.fulfill({ contentType: 'text/event-stream', body: 'event: conectado\ndata: {"ok":true}\n\n' });
        let json = {};
        if (url.pathname === '/api/recall/fila') json = { porDiaMensagem: [], porAniversario: [] };
        else if (url.pathname === '/api/configuracoes') json = { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 };
        else if (url.pathname === '/api/clientes/1') json = { cliente: { id: 1, nome: 'KATIA EMILLY', whatsapp: '34999999999' } };
        else if (url.pathname === '/api/ao-vivo/proxima-os') json = { proximaOs: '999' };
        else if (url.pathname === '/api/ao-vivo/1') json = { ...(await client.query('SELECT * FROM ao_vivo WHERE id=1')).rows[0], mensagem_codigo_1: '777' };
        else if (url.pathname === '/api/ao-vivo' && route.request().method() === 'POST') {
          criado = route.request().postDataJSON();
          await client.query('INSERT INTO ao_vivo (id,numero_os,cliente_id,comprador,para,dia_entrega,tema_1) VALUES (99,$1,1,$2,$3,$4,$5)', [criado.numero_os, criado.comprador, criado.para, criado.dia_entrega, criado.tema_1]);
          json = { ...criado, id: 99, versao: 1 };
        } else if (url.pathname === '/api/ao-vivo/99') json = { ...criado, id: 99, versao: 1 };
        return route.fulfill({ json });
      });
      await page.goto('http://127.0.0.1:5189/recall?sistema=AOVIVO&data=2026-10-05');
      await page.getByRole('button', { name: '＋ Criar novo pedido Ao Vivo', exact: true }).waitFor();
      await page.getByLabel('Buscar no Recall de Ao Vivo').fill('marcia');
      await page.getByRole('button', { name: '＋ Criar novo pedido Ao Vivo', exact: true }).waitFor();
      const mensagem = new URL(await page.getByLabel('Abrir WhatsApp com a homenagem pronta').getAttribute('href')).searchParams.get('text');
      assert.match(mensagem, /aniversário de MÁRCIA/); assert.match(mensagem, /05\/10/);
      await page.screenshot({ path: '../frontend/test-results/recall-ao-vivo-desktop.png', fullPage: true });
      await Promise.all([page.waitForResponse((r) => r.url().includes('ao-vivo/fila?data=2026-10-06')), page.getByRole('button', { name: 'Selecionar 06/10/2026', exact: true }).click()]);
      assert.equal(await page.getByRole('button', { name: 'Selecionar 06/10/2026', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByLabel('Mostrar dias anteriores').click();
      assert.equal(await page.getByLabel('Mostrar dias seguintes').isEnabled(), true);
      await page.getByLabel('Mostrar dias seguintes').click();
      await page.goto('http://127.0.0.1:5189/recall?sistema=AOVIVO&data=2026-05-10');
      await page.getByRole('button', { name: '＋ Criar novo pedido Ao Vivo', exact: true }).waitFor();
      assert.match(new URL(await page.getByLabel('Abrir WhatsApp com a homenagem pronta').getAttribute('href')).searchParams.get('text'), /Dia das Mães/);
      await page.goto('http://127.0.0.1:5189/recall?sistema=AOVIVO&data=2026-10-05');
      await page.getByRole('button', { name: '＋ Criar novo pedido Ao Vivo', exact: true }).click();
      await page.getByLabel('Tema 1 do Ao Vivo').waitFor();
      assert.equal(await page.getByLabel('Destinatário do Ao Vivo').inputValue(), 'MÁRCIA');
      assert.equal(await page.getByLabel('Tema 1 do Ao Vivo').inputValue(), 'ANIV GERAL');
      assert.equal(await page.getByLabel('Código da mensagem 1 do Ao Vivo').inputValue(), '');
      await page.getByLabel('Valor do pedido Ao Vivo').fill('12000');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      await page.waitForURL('**/ao-vivo/99');
      assert.equal((await fila('2026-10-05')).itens[0].registro.pedido_novo_ao_vivo_id, 99);
      await page.goto('http://127.0.0.1:5189/recall?sistema=AOVIVO&data=2026-10-05');
      await page.getByText('Pedido criado', { exact: true }).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: '../frontend/test-results/recall-ao-vivo-mobile.png', fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('tab', { name: 'Fonada', exact: true }).click();
      await page.getByRole('tab', { name: /Por dia da mensagem/ }).waitFor();
      assert.deepEqual(erros, []);
    }
    console.log('Recall Ao Vivo: PostgreSQL/rotas/calendário/histórico/interface/WhatsApp/novo pedido/mobile/Fonada: OK');
  } finally { if (browser) await browser.close(); if (server) await new Promise((r) => server.close(r)); await client.end(); }
}
executar().catch((e) => { console.error(e); process.exitCode = 1; });
