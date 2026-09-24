import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { entrar, isolado } from './apoio.js';

const id = 999999999;
const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(Date.now() + 3 * 86400000));
const casos = [
  ['API-001', 'invalid', 'post', '/api/auth/login', {}],
  ['API-001', 'missing', 'post', '/api/auth/login', { usuario: 'TESTE_QA_USUARIO_INEXISTENTE', senha: 'xxxxxxxxxxxx' }],
  ['API-002', 'invalid', 'post', '/api/auth/verificar-senha-mestra', {}],
  ['API-005', 'invalid', 'delete', '/api/auth/usuarios/abc', null, true],
  ['API-005', 'missing', 'delete', `/api/auth/usuarios/${id}`, null, true],
  ['API-010', 'invalid', 'post', '/api/clientes/descartar-duplicata', {}],
  ['API-010', 'missing', 'post', '/api/clientes/descartar-duplicata', { clienteAId: id, clienteBId: id - 1 }],
  ['API-011', 'invalid', 'post', '/api/clientes/mesclar-automatico', {}],
  ['API-011', 'missing', 'post', '/api/clientes/mesclar-automatico', { clienteAId: id, clienteBId: id - 1 }],
  ['API-017', 'missing', 'get', `/api/clientes/${id}/pedidos-lixeira`],
  ['API-021', 'missing', 'post', `/api/clientes/${id}/mesclar`, { origemId: id - 1 }],
  ['API-026', 'invalid', 'post', '/api/fonadas', { cliente_id: 'abc' }],
  ['API-026', 'missing', 'post', '/api/fonadas', { cliente_id: id }],
  ['API-032', 'missing', 'get', `/api/ao-vivo/imprimir?ids=${id}`],
  ['API-033', 'missing', 'post', `/api/ao-vivo/${id}/baixa`, { entregue: true, versao: 1 }],
  ['API-034', 'missing', 'post', `/api/ao-vivo/${id}/desfazer-baixa`, { versao: 1 }],
  ['API-035', 'missing', 'post', `/api/ao-vivo/${id}/pagou`, { pagou: 'SIM', versao: 1 }],
  ['API-037', 'invalid', 'post', '/api/ao-vivo', { cliente_id: 'abc' }],
  ['API-037', 'missing', 'post', '/api/ao-vivo', { cliente_id: id }],
  ['API-040', 'missing', 'post', `/api/ao-vivo/${id}/nao-recebeu`, { versao: 1, remarcadoDia: data }],
  ['API-041', 'missing', 'get', `/api/ao-vivo/${id}/tentativas-prazo`],
  ['API-044', 'missing', 'post', `/api/agenda/fonada/${id}/baixa`, { mensagem: 1, versao: 1 }],
  ['API-045', 'missing', 'post', `/api/agenda/fonada/${id}/desfazer-baixa`, { mensagem: 1, versao: 1 }],
  ['API-046', 'missing', 'post', `/api/agenda/fonada/${id}/nao-atendeu`, { mensagem: 1, versao: 1, remarcadoDia: data, remarcadoHorario: '10:00' }],
  ['API-047', 'missing', 'get', `/api/agenda/fonada/${id}/tentativas`],
  ['API-048', 'invalid', 'post', '/api/agenda/lembretes', {}],
  ['API-054', 'missing', 'put', `/api/cobranca/ao-vivo/${id}/reagendar`, { dataCobranca: data }],
  ['API-056', 'missing', 'put', `/api/cobranca/${id}/baixa`, { pagou: 'SIM', dataPagamento: data }],
  ['API-057', 'invalid', 'put', '/api/cobranca/acoes/marcar-impressos', { ids: [] }],
  ['API-057', 'missing', 'put', '/api/cobranca/acoes/marcar-impressos', { ids: [id] }],
  ['API-058', 'missing', 'put', '/api/cobranca/acoes/baixa-lote', { ids: [id], dataPagamento: data }],
  ['API-059', 'missing', 'put', '/api/cobranca/acoes/reagendar-lote', { ids: [id], cobrarDia: data }],
  ['API-063', 'invalid', 'put', '/api/recall/status', {}],
  ['API-064', 'invalid', 'put', '/api/recall/pedido-criado', {}],
  ['API-064', 'missing', 'put', '/api/recall/pedido-criado', { dataReferencia: '2026-09-23', relacaoChave: 'QA_INEXISTENTE', pedidoId: id }],
];

test('condições HTTP excepcionais por ID em banco QA', async ({ page, request }) => {
  test.setTimeout(120000);
  test.skip(!isolado, 'Exige banco QA isolado.');
  await entrar(page);
  const token = await page.evaluate(() => localStorage.getItem('pombo_token'));
  const evidencia = [];
  for (const [api, condicao, metodo, url, payload, master] of casos) {
    const headers = master ? { 'x-senha-mestra': process.env.QA_E2E_MASTER_PASSWORD } : { Authorization: `Bearer ${token}` };
    const resposta = await request[metodo](url, { headers, ...(payload === undefined || payload === null ? {} : { data: payload }) });
    evidencia.push({ id: api, condicao, timestamp: new Date().toISOString(), metodo: metodo.toUpperCase(), url, payload, status: resposta.status(), corpo: (await resposta.text()).slice(0, 500) });
  }
  writeFileSync('../docs/auditoria/evidencias/http-excecoes-fase4-qa.json', JSON.stringify(evidencia, null, 2));
  for (const item of evidencia) expect(item.status, `${item.id}/${item.condicao} ${item.corpo}`).toBeLessThan(500);
});
