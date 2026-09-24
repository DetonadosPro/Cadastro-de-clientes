import { registrarAuditoriaControles } from './instrumentar-controles.js';
registrarAuditoriaControles();
import { test, expect } from '@playwright/test';
import { usuario, senha, isolado, entrar, criarOperadorDeTeste } from './apoio.js';

test('edição simultânea em duas sessões preserva a primeira alteração do cliente', async ({ page, request, browser }) => {
  test.skip(!isolado || !process.env.QA_E2E_MASTER_PASSWORD, 'Exige banco isolado e senha mestra de teste.');
  await entrar(page);
  const segundoOperador = await criarOperadorDeTeste(request);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const nome = `TESTE_QA_CONCORRENCIA_${Date.now()}`;
  const resposta = await request.post('/api/clientes', { headers, data: { nome, whatsapp: '11999999999' } });
  expect(resposta.status()).toBe(201);
  const cliente = await resposta.json();
  const outraSessao = await browser.newContext();
  const outraAba = await outraSessao.newPage();
  try {
    await entrar(outraAba, segundoOperador.credenciais);
    await page.goto(`/clientes/${cliente.id}`);
    await outraAba.goto(`/clientes/${cliente.id}`);
    await page.getByRole('heading', { name: nome }).waitFor();
    await outraAba.getByRole('heading', { name: nome }).waitFor();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await outraAba.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.locator('#editar-whatsapp').fill('34999999999');
    const primeiroSalvamento = page.waitForResponse((r) => r.url().endsWith(`/api/clientes/${cliente.id}`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    expect((await primeiroSalvamento).status()).toBe(200);
    await expect(page.locator('#editar-whatsapp')).toHaveCount(0);
    await outraAba.locator('#editar-nome').fill(`${nome}_ABA_2`);
    const segundoSalvamento = outraAba.waitForResponse((r) => r.url().endsWith(`/api/clientes/${cliente.id}`) && r.request().method() === 'PUT');
    await outraAba.getByRole('button', { name: 'Salvar', exact: true }).click();
    expect((await segundoSalvamento).status()).toBe(409);
    await expect(outraAba.locator('#editar-nome')).toBeVisible();
    const lido = await request.get(`/api/clientes/${cliente.id}`, { headers });
    const atual = (await lido.json()).cliente;
    expect(atual.nome).toBe(nome);
    expect(atual.whatsapp.replace(/\D/g, '')).toBe('34999999999');
    expect(atual.versao).toBe(cliente.versao + 1);
  } finally {
    await outraSessao.close();
    await segundoOperador.excluir();
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('duas sessões editando o mesmo pedido Fonada e Ao Vivo recebem conflito', async ({ page, request, browser }) => {
  test.skip(!isolado || !process.env.QA_E2E_MASTER_PASSWORD, 'Exige banco isolado e senha mestra de teste.');
  await entrar(page);
  const segundoOperador = await criarOperadorDeTeste(request);
  const outraSessao = await browser.newContext();
  const outraPagina = await outraSessao.newPage();
  await entrar(outraPagina, segundoOperador.credenciais);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_2_OPERADORES_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const futura = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 7); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`; });
  const pedidos = [];
  try {
    for (const caso of [
      { recurso: 'fonadas', rota: 'fonada', data: { valor: 100, cobranca: futura, periodo: 'MANHÃ' }, seletor: '.input-valor-destaque' },
      { recurso: 'ao-vivo', rota: 'ao-vivo', data: { valor: 100, dia_entrega: futura }, seletor: '.campo-valor-aovivo' },
    ]) {
      const criadoResposta = await request.post(`/api/${caso.recurso}`, { headers, data: { cliente_id: cliente.id, ...caso.data } });
      expect(criadoResposta.status(), caso.recurso).toBe(201);
      const criado = await criadoResposta.json();
      pedidos.push({ recurso: caso.recurso, id: criado.id });
      await page.goto(`/${caso.rota}/${criado.id}`);
      await outraPagina.goto(`/${caso.rota}/${criado.id}`);
      await page.getByRole('heading', { name: 'Editar pedido' }).waitFor();
      await outraPagina.getByRole('heading', { name: 'Editar pedido' }).waitFor();
      await page.locator(caso.seletor).fill('20000');
      const primeiro = page.waitForResponse((r) => r.url().endsWith(`/api/${caso.recurso}/${criado.id}`) && r.request().method() === 'PUT');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      expect((await primeiro).status(), `${caso.recurso}: primeiro operador`).toBe(200);
      await outraPagina.locator(caso.seletor).fill('30000');
      const segundo = outraPagina.waitForResponse((r) => r.url().endsWith(`/api/${caso.recurso}/${criado.id}`) && r.request().method() === 'PUT');
      await outraPagina.getByRole('button', { name: 'Salvar', exact: true }).click();
      expect((await segundo).status(), `${caso.recurso}: segundo operador`).toBe(409);
      await expect(outraPagina.getByText('Pedido alterado por outra pessoa.')).toBeVisible();
      const lido = await request.get(`/api/${caso.recurso}/${criado.id}`, { headers });
      const pedido = await lido.json();
      expect(Number(pedido.valor)).toBe(200);
      expect(pedido.versao).toBe(criado.versao + 1);
    }
  } finally {
    await outraSessao.close();
    await segundoOperador.excluir();
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('dois operadores criam pedidos ao mesmo tempo com O.S. distintas', async ({ page, request, browser }) => {
  test.skip(!isolado || !process.env.QA_E2E_MASTER_PASSWORD, 'Exige banco isolado e senha mestra de teste.');
  await entrar(page);
  const segundoOperador = await criarOperadorDeTeste(request);
  const outraSessao = await browser.newContext();
  const outraPagina = await outraSessao.newPage();
  await entrar(outraPagina, segundoOperador.credenciais);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const clienteResposta = await request.post('/api/clientes', { headers, data: { nome: `TESTE_QA_OS_PARALELAS_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  try {
    for (const caso of [
      { rota: 'fonada', recurso: 'fonadas', campoOs: 'senha_os', seletorValor: '.input-valor-destaque', seletorData: '.campo-cobranca-fonada input' },
      { rota: 'ao-vivo', recurso: 'ao-vivo', campoOs: 'numero_os', seletorValor: '.campo-valor-aovivo', seletorData: '.campo-dia-aovivo input' },
    ]) {
      await Promise.all([page.goto(`/${caso.rota}/novo?clienteId=${cliente.id}`), outraPagina.goto(`/${caso.rota}/novo?clienteId=${cliente.id}`)]);
      const abas = [page, outraPagina];
      for (const aba of abas) {
        await aba.getByRole('heading', { name: 'Novo pedido' }).waitFor();
        await aba.locator(caso.seletorValor).fill('10000');
        const futura = await aba.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 7); return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`; });
        await aba.locator(caso.seletorData).fill(futura);
        if (caso.rota === 'fonada') await aba.locator('.form-row').filter({ hasText: 'Período:' }).locator('input').fill('MANHÃ');
      }
      await Promise.all(abas.map(async (aba) => {
        await aba.getByRole('button', { name: 'Salvar', exact: true }).click();
        await aba.waitForURL(new RegExp(`/${caso.rota}/\\d+$`));
      }));
      const criados = [];
      for (const aba of abas) {
        const id = Number(new URL(aba.url()).pathname.split('/').pop());
        pedidos.push({ recurso: caso.recurso, id });
        const resposta = await request.get(`/api/${caso.recurso}/${id}`, { headers });
        expect(resposta.status()).toBe(200);
        criados.push(await resposta.json());
      }
      expect(criados[0].id).not.toBe(criados[1].id);
      expect(criados[0][caso.campoOs]).toBeTruthy();
      expect(criados[0][caso.campoOs]).not.toBe(criados[1][caso.campoOs]);
    }
  } finally {
    await outraSessao.close();
    await segundoOperador.excluir();
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}`, { headers });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
  }
});

test('duas gravações HTTP realmente simultâneas aceitam apenas uma versão', async ({ request }) => {
  test.skip(!isolado || !process.env.QA_E2E_MASTER_PASSWORD, 'Exige banco isolado e senha mestra de teste.');
  const segundoOperador = await criarOperadorDeTeste(request);
  const primeiroLogin = await request.post('/api/auth/login', { data: { usuario, senha } });
  const segundoLogin = await request.post('/api/auth/login', { data: segundoOperador.credenciais });
  expect(primeiroLogin.status()).toBe(200);
  expect(segundoLogin.status()).toBe(200);
  const primeiro = { Authorization: `Bearer ${(await primeiroLogin.json()).token}` };
  const segundo = { Authorization: `Bearer ${(await segundoLogin.json()).token}` };
  const clienteResposta = await request.post('/api/clientes', { headers: primeiro, data: { nome: `TESTE_QA_RACE_${Date.now()}` } });
  expect(clienteResposta.status()).toBe(201);
  const cliente = await clienteResposta.json();
  const pedidos = [];
  const dataFutura = new Date();
  dataFutura.setDate(dataFutura.getDate() + 7);
  const dia = `${String(dataFutura.getDate()).padStart(2, '0')}/${String(dataFutura.getMonth() + 1).padStart(2, '0')}/${String(dataFutura.getFullYear()).slice(-2)}`;
  try {
    for (const caso of [
      { recurso: 'clientes', inicial: cliente, campo: 'whatsapp', valores: ['11999999999', '34999999999'] },
      { recurso: 'fonadas', dados: { cliente_id: cliente.id, valor: 100, cobranca: dia, periodo: 'MANHÃ' }, campo: 'valor', valores: [200, 300] },
      { recurso: 'ao-vivo', dados: { cliente_id: cliente.id, valor: 100, dia_entrega: dia }, campo: 'valor', valores: [200, 300] },
    ]) {
      let inicial = caso.inicial;
      if (!inicial) {
        const criado = await request.post(`/api/${caso.recurso}`, { headers: primeiro, data: caso.dados });
        expect(criado.status()).toBe(201);
        inicial = await criado.json();
        pedidos.push({ recurso: caso.recurso, id: inicial.id });
      }
      const url = `/api/${caso.recurso}/${inicial.id}`;
      const respostas = await Promise.all([
        request.put(url, { headers: primeiro, data: { [caso.campo]: caso.valores[0], versao: inicial.versao } }),
        request.put(url, { headers: segundo, data: { [caso.campo]: caso.valores[1], versao: inicial.versao } }),
      ]);
      expect(respostas.map((r) => r.status()).sort(), caso.recurso).toEqual([200, 409]);
      const lido = await request.get(url, { headers: primeiro });
      const registro = caso.recurso === 'clientes' ? (await lido.json()).cliente : await lido.json();
      expect(registro.versao).toBe(inicial.versao + 1);
      expect(caso.valores).toContain(caso.campo === 'valor' ? Number(registro[caso.campo]) : registro[caso.campo]);
    }
  } finally {
    for (const pedido of pedidos) await request.delete(`/api/${pedido.recurso}/${pedido.id}`, { headers: primeiro });
    await request.delete(`/api/clientes/${cliente.id}`, { headers: primeiro });
    await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers: primeiro });
    await segundoOperador.excluir();
  }
});
