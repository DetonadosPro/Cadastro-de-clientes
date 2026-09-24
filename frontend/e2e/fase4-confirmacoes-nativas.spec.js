import { test, expect } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entrar, isolado } from './apoio.js';

const destino = resolve('../docs/auditoria/evidencias/interacoes-fase4-qa.ndjson');
const hoje = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date());

function registrar(id, page, evento, efeito) {
  appendFileSync(destino, `${JSON.stringify({ id, timestamp: new Date().toISOString(), rota: new URL(page.url()).pathname,
    locator: 'window.confirm', texto: id, evento, efeitoObservado: efeito, teste: test.info().title })}\n`);
}

async function decidir(page, botao, trecho, aceitar) {
  let visto = false;
  const concluido = new Promise((resolver, rejeitar) => page.once('dialog', async (dialogo) => {
    try {
      expect(dialogo.type()).toBe('confirm');
      expect(dialogo.message()).toContain(trecho);
      visto = true;
      if (aceitar) await dialogo.accept(); else await dialogo.dismiss();
      resolver();
    } catch (erro) { await dialogo.dismiss().catch(() => {}); rejeitar(erro); }
  }));
  await botao.click();
  await concluido;
  expect(visto).toBe(true);
}

async function token(page) { return { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('pombo_token'))}` }; }
async function clienteQa(request, headers, nome) {
  const resposta = await request.post('/api/clientes', { headers, data: { nome: `${nome}_${Date.now()}` } });
  expect(resposta.status()).toBe(201);
  return resposta.json();
}
async function apagarClienteQa(request, headers, cliente) {
  const resposta = await request.get(`/api/clientes/${cliente.id}`, { headers });
  if (resposta.status() !== 200) return;
  if (!(await resposta.json()).cliente.excluido_em) await request.delete(`/api/clientes/${cliente.id}`, { headers });
  await request.delete(`/api/clientes/${cliente.id}/definitivo`, { headers });
}

test('MODAL-007/008/009/010: confirmações nativas do pedido Ao Vivo', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = await token(page);
  const cliente = await clienteQa(request, headers, 'TESTE_QA_NATIVO_AOVIVO');
  const resposta = await request.post('/api/ao-vivo', { headers, data: { cliente_id: cliente.id, valor: 50, dia_entrega: hoje(), para: 'QA' } });
  expect(resposta.status()).toBe(201);
  const pedido = await resposta.json();
  const ler = async () => (await (await request.get(`/api/ao-vivo/${pedido.id}`, { headers })).json());
  try {
    await page.goto(`/ao-vivo/${pedido.id}`);
    const entrega = page.getByRole('button', { name: 'Marcar entregue' });
    await decidir(page, entrega, 'Confirmar que o pedido foi entregue?', false);
    expect((await ler()).resultado_entrega).toBeFalsy();
    registrar('MODAL-009', page, 'abrir/cancelar', 'entrega permaneceu pendente');
    await decidir(page, entrega, 'Confirmar que o pedido foi entregue?', true);
    await expect.poll(async () => (await ler()).resultado_entrega).toMatch(/^ENTREGUE,/);
    registrar('MODAL-009', page, 'abrir/aceitar', 'entrega persistida');

    const desfazerEntrega = page.getByRole('button', { name: 'Desfazer entrega' });
    await decidir(page, desfazerEntrega, 'Deseja desfazer o registro da entrega?', false);
    expect((await ler()).resultado_entrega).toMatch(/^ENTREGUE,/);
    registrar('MODAL-010', page, 'abrir/cancelar', 'entrega persistiu');
    await decidir(page, desfazerEntrega, 'Deseja desfazer o registro da entrega?', true);
    await expect.poll(async () => (await ler()).resultado_entrega).toBeFalsy();
    registrar('MODAL-010', page, 'abrir/aceitar', 'entrega desfeita no banco');

    const pago = await request.put(`/api/cobranca/ao-vivo/${pedido.id}/baixa`, { headers, data: { dataPagamento: hoje(), valorRecebido: 50, formaRecebimento: 'PIX' } });
    expect(pago.status()).toBe(200);
    await page.reload();
    const desfazerPagamento = page.getByRole('button', { name: 'Desfazer baixa' });
    await decidir(page, desfazerPagamento, 'Deseja desfazer a baixa financeira deste pedido?', false);
    expect((await ler()).pagou).toBe('SIM');
    registrar('MODAL-008', page, 'abrir/cancelar', 'pagamento permaneceu registrado');
    await decidir(page, desfazerPagamento, 'Deseja desfazer a baixa financeira deste pedido?', true);
    await expect.poll(async () => (await ler()).pagou).not.toBe('SIM');
    registrar('MODAL-008', page, 'abrir/aceitar', 'pagamento desfeito no banco');

    const excluir = page.getByRole('button', { name: 'Excluir', exact: true });
    await decidir(page, excluir, 'Tem certeza que deseja excluir este pedido?', false);
    expect((await request.get(`/api/ao-vivo/${pedido.id}`, { headers })).status()).toBe(200);
    registrar('MODAL-007', page, 'abrir/cancelar', 'pedido permaneceu ativo');
    await decidir(page, excluir, 'Tem certeza que deseja excluir este pedido?', true);
    await expect.poll(async () => (await request.get(`/api/ao-vivo/${pedido.id}`, { headers })).status()).toBe(404);
    registrar('MODAL-007', page, 'abrir/aceitar', 'pedido removido');
  } finally {
    await request.delete(`/api/ao-vivo/${pedido.id}`, { headers });
    await apagarClienteQa(request, headers, cliente);
  }
});

test('MODAL-013/014/018: confirmações de desbloqueio, lixeira e exclusão definitiva', async ({ page, request }) => {
  test.setTimeout(90000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = await token(page);
  const cliente = await clienteQa(request, headers, 'TESTE_QA_NATIVO_CLIENTE');
  try {
    const bloqueio = await request.put(`/api/clientes/${cliente.id}/bloqueio`, { headers, data: { bloqueado: true, motivo: 'QA' } });
    expect(bloqueio.status()).toBe(200);
    await page.goto(`/clientes/${cliente.id}`);
    const desbloquear = page.getByRole('button', { name: 'Desbloquear' });
    await decidir(page, desbloquear, 'Desbloquear', false);
    expect((await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente.bloqueado).toBe(true);
    registrar('MODAL-013', page, 'abrir/cancelar', 'bloqueio mantido');
    await decidir(page, desbloquear, 'Desbloquear', true);
    await expect.poll(async () => (await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente.bloqueado).toBe(false);
    registrar('MODAL-013', page, 'abrir/aceitar', 'cliente desbloqueado');

    const excluir = page.getByRole('button', { name: 'Excluir', exact: true });
    await decidir(page, excluir, 'Vai para a lixeira', false);
    expect((await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente.excluido_em).toBeNull();
    registrar('MODAL-014', page, 'abrir/cancelar', 'cliente permaneceu ativo');
    await decidir(page, excluir, 'Vai para a lixeira', true);
    await expect.poll(async () => (await (await request.get(`/api/clientes/${cliente.id}`, { headers })).json()).cliente.excluido_em).toBeTruthy();
    registrar('MODAL-014', page, 'abrir/aceitar', 'cliente enviado à lixeira');

    await page.goto(`/clientes/lixeira?busca=${encodeURIComponent(cliente.nome)}`);
    await expect(page.getByText(cliente.nome).first()).toBeVisible();
    const apagar = page.getByRole('row').filter({ hasText: cliente.nome }).getByRole('button', { name: 'Apagar de vez' });
    await decidir(page, apagar, 'DEFINITIVAMENTE', false);
    expect((await request.get(`/api/clientes/${cliente.id}`, { headers })).status()).toBe(200);
    registrar('MODAL-018', page, 'abrir/cancelar', 'cliente permaneceu na lixeira');
    await decidir(page, apagar, 'DEFINITIVAMENTE', true);
    await expect.poll(async () => (await request.get(`/api/clientes/${cliente.id}`, { headers })).status()).toBe(404);
    registrar('MODAL-018', page, 'abrir/aceitar', 'cliente excluído definitivamente');
  } finally { await apagarClienteQa(request, headers, cliente); }
});

test('MODAL-021: confirmação nativa de exclusão Fonada', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = await token(page);
  const cliente = await clienteQa(request, headers, 'TESTE_QA_NATIVO_FONADA');
  const resposta = await request.post('/api/fonadas', { headers, data: { cliente_id: cliente.id, valor: 20, cobranca: hoje(), periodo: 'MANHÃ' } });
  expect(resposta.status()).toBe(201);
  const pedido = await resposta.json();
  try {
    await page.goto(`/fonada/${pedido.id}`);
    const excluir = page.getByRole('button', { name: 'Excluir', exact: true });
    await decidir(page, excluir, 'Tem certeza que deseja excluir este pacote?', false);
    expect((await request.get(`/api/fonadas/${pedido.id}`, { headers })).status()).toBe(200);
    registrar('MODAL-021', page, 'abrir/cancelar', 'pedido permaneceu ativo');
    await decidir(page, excluir, 'Tem certeza que deseja excluir este pacote?', true);
    await expect.poll(async () => (await request.get(`/api/fonadas/${pedido.id}`, { headers })).status()).toBe(404);
    registrar('MODAL-021', page, 'abrir/aceitar', 'pedido removido');
  } finally {
    await request.delete(`/api/fonadas/${pedido.id}`, { headers });
    await apagarClienteQa(request, headers, cliente);
  }
});

test('MODAL-004: confirmação nativa de exclusão de lembrete', async ({ page, request }) => {
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const headers = await token(page);
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const titulo = `TESTE_QA_NATIVO_LEMBRETE_${Date.now()}`;
  const resposta = await request.post('/api/agenda/lembretes', { headers, data: { titulo, data } });
  expect(resposta.status()).toBe(201);
  const { id } = await resposta.json();
  try {
    await page.goto('/agenda');
    await page.getByText(titulo).first().click();
    const excluir = page.getByRole('button', { name: 'Excluir', exact: true });
    await decidir(page, excluir, 'Excluir o lembrete', false);
    await expect(page.getByText(titulo).first()).toBeVisible();
    registrar('MODAL-004', page, 'abrir/cancelar', 'lembrete permaneceu visível');
    await decidir(page, excluir, 'Excluir o lembrete', true);
    await expect(page.getByText(titulo)).toHaveCount(0);
    const consulta = await request.get('/api/agenda/hoje', { headers });
    expect(JSON.stringify(await consulta.json())).not.toContain(titulo);
    registrar('MODAL-004', page, 'abrir/aceitar', 'lembrete removido da interface e da API');
  } finally { await request.delete(`/api/agenda/lembretes/${id}`, { headers }); }
});

test('MODAL-023: confirmação nativa de remoção de usuário', async ({ page, request }) => {
  test.skip(!isolado || !process.env.QA_E2E_MASTER_PASSWORD, 'Exige banco QA e senha mestra QA.');
  const segredo = process.env.QA_E2E_MASTER_PASSWORD;
  const headers = { 'x-senha-mestra': segredo };
  const usuario = `TESTE_QA_NATIVO_USUARIO_${Date.now()}`;
  const resposta = await request.post('/api/auth/usuarios', { headers, data: { usuario, nome: 'Usuário QA Nativo', senha: 'QA_SENHA_FORTE_2026!' } });
  expect(resposta.status()).toBe(201);
  const usuarios = await (await request.get('/api/auth/usuarios', { headers })).json();
  const id = usuarios.usuarios.find((item) => item.usuario === usuario)?.id;
  expect(id).toBeTruthy();
  try {
    await page.goto('/gerenciar-usuarios');
    await page.getByLabel('Senha mestra').fill(segredo);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const linha = page.getByRole('row').filter({ hasText: usuario });
    await expect(linha).toBeVisible();
    const remover = linha.getByRole('button', { name: 'Remover' });
    await decidir(page, remover, 'Remover o usuário', false);
    await expect(linha).toBeVisible();
    registrar('MODAL-023', page, 'abrir/cancelar', 'usuário permaneceu na tabela');
    await decidir(page, remover, 'Remover o usuário', true);
    await expect(linha).toHaveCount(0);
    const restantes = await (await request.get('/api/auth/usuarios', { headers })).json();
    expect(restantes.usuarios.some((item) => item.id === id)).toBe(false);
    registrar('MODAL-023', page, 'abrir/aceitar', 'usuário removido da tabela e da API');
  } finally { await request.delete(`/api/auth/usuarios/${id}`, { headers }); }
});
