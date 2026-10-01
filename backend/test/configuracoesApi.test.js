const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { carregarConfiguracoes, comConfiguracoes } = require('../src/utils/configuracoes');
const { temDireitoSegundaMensagem } = require('../src/utils/mensagemEmHaver');
let registro = { id: 1, limite_segunda_mensagem: '12.00', versao: 1 };
const consultar = async (sql, valores) => {
  if (sql.startsWith('SELECT')) return { rows: [{ ...registro }] };
  if (registro.versao !== valores[2]) return { rows: [] };
  registro = { ...registro, limite_segunda_mensagem: String(valores[0]), atualizado_por: valores[1], versao: registro.versao + 1 };
  return { rows: [{ ...registro }] };
};
const caminhoBanco = require.resolve('../src/db/database');
require.cache[caminhoBanco] = { id: caminhoBanco, filename: caminhoBanco, loaded: true, exports: { db: { query: consultar } } };
const router = require('../src/routes/configuracoes');

test('API salva limite, rejeita alteração concorrente e aplica o valor persistido à próxima consulta', async () => {
  const app = express(); app.use(express.json());
  app.use(async (req, _res, next) => { req.usuario = { usuario: 'QA' }; comConfiguracoes(await carregarConfiguracoes(consultar), next); });
  app.use('/configuracoes', router);
  app.get('/elegibilidade', (_req, res) => res.json({ liberada: temDireitoSegundaMensagem({ valor: 15 }) }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await (await fetch(`${base}/elegibilidade`)).json()).liberada, false);
    const salvar = (dados) => fetch(`${base}/configuracoes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
    assert.equal((await salvar({ limite_segunda_mensagem: 20, versao: 1 })).status, 200);
    assert.equal((await (await fetch(`${base}/configuracoes`)).json()).limite_segunda_mensagem, 20);
    assert.equal((await (await fetch(`${base}/elegibilidade`)).json()).liberada, true);
    assert.equal((await salvar({ limite_segunda_mensagem: 8, versao: 1 })).status, 409);
    assert.equal((await salvar({ limite_segunda_mensagem: -1, versao: 2 })).status, 400);
    assert.equal(registro.limite_segunda_mensagem, '20');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
