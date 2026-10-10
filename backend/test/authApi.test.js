const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { once } = require('node:events');

// Banco inteiramente simulado; nenhuma conexão ou credencial externa.
process.env.JWT_SECRET = 'jwt-exclusivo-do-teste-de-acesso';
process.env.SENHA_MESTRA = 'mestra-exclusiva-do-teste';
let contas = [], consultas = [];
const consultar = async (sql, valores = []) => {
  consultas.push(sql);
  if (sql.includes('LOWER(usuario) = LOWER($1)')) return { rows: contas.filter(u => u.usuario.toLowerCase() === valores[0].toLowerCase()) };
  if (sql.startsWith('SELECT id, usuario')) return { rows: contas.map(({ senha_hash, ...u }) => u) };
  if (sql.startsWith('INSERT')) { contas.push({ id: 2, usuario: valores[0], senha_hash: valores[1], nome: valores[2], data_nascimento: valores[3] }); return { rows: [] }; }
  if (sql.startsWith('UPDATE')) { const conta = contas.find(u => u.id === Number(valores[1])); if (conta) conta.senha_hash = valores[0]; return { rows: conta ? [{ id: conta.id }] : [] }; }
  throw new Error('Consulta inesperada no teste de acesso');
};
const caminhoBanco = require.resolve('../src/db/database');
require.cache[caminhoBanco] = { id: caminhoBanco, filename: caminhoBanco, loaded: true, exports: { db: { query: consultar } } };
const { router } = require('../src/routes/auth');

test('login e redefinição preservam conta, exigem senha mestra e não expõem hashes', async () => {
  const antiga = 'SenhaAntigaTeste2026!', nova = 'SenhaNovaTeste2026!';
  contas = [{ id: 1, usuario: 'operador_qa', nome: 'Operador de exemplo', senha_hash: await bcrypt.hash(antiga, 10), data_nascimento: '27/08/90' }];
  const app = express(); app.use(express.json()); app.use('/auth', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  const requisitar = (caminho, method, dados, mestra) => fetch(`${base}${caminho}`, { method, headers: { 'Content-Type': 'application/json', ...(mestra ? { 'x-senha-mestra': mestra } : {}) }, ...(dados ? { body: JSON.stringify(dados) } : {}) });
  const login = (usuario, senha) => requisitar('/login', 'POST', { usuario, senha });
  try {
    assert.equal((await login({}, antiga)).status, 400);
    assert.equal((await login('%', antiga)).status, 401);
    assert.equal((await login('operador%', antiga)).status, 401);
    const acesso = await login('  OPERADOR_QA  ', antiga);
    assert.equal(acesso.status, 200);
    const dados = await acesso.json();
    assert.equal(jwt.verify(dados.token, process.env.JWT_SECRET).id, 1);
    assert.equal(dados.nome, 'Operador de exemplo');
    assert.equal(dados.senha_hash, undefined);
    const total = consultas.length;
    assert.equal((await requisitar('/usuarios/1/senha', 'PUT', { senha: nova })).status, 401);
    assert.equal((await requisitar('/usuarios/1/senha', 'PUT', { senha: nova }, 'incorreta')).status, 401);
    assert.equal(consultas.length, total);
    const mestra = process.env.SENHA_MESTRA;
    for (const id of ['0', '-1', 'abc', '2147483648']) assert.equal((await requisitar(`/usuarios/${id}/senha`, 'PUT', { senha: nova }, mestra)).status, 400);
    for (const senha of ['curta', '            ', {}]) assert.equal((await requisitar('/usuarios/1/senha', 'PUT', { senha }, mestra)).status, 400);
    assert.equal((await requisitar('/usuarios/999/senha', 'PUT', { senha: nova }, mestra)).status, 404);
    assert.equal((await requisitar('/usuarios/1/senha', 'PUT', { senha: nova }, mestra)).status, 200);
    assert.equal(contas[0].nome, 'Operador de exemplo');
    assert.equal(contas[0].usuario, 'operador_qa');
    assert.equal(contas[0].data_nascimento, '27/08/90');
    assert.notEqual(contas[0].senha_hash, nova);
    assert.equal((await login('operador_qa', antiga)).status, 401);
    assert.equal((await login('operador_qa', nova)).status, 200);
    const lista = await (await requisitar('/usuarios', 'GET', null, mestra)).json();
    assert.equal(lista.usuarios[0].senha_hash, undefined);
    assert.equal((await requisitar('/usuarios', 'POST', { usuario: ' OPERADOR_QA ', senha: nova }, mestra)).status, 409);
    assert.equal((await requisitar('/usuarios', 'POST', { usuario: ' novo_qa ', senha: nova, nome: 'Nova pessoa' }, mestra)).status, 201);
    assert.equal(contas[1].usuario, 'novo_qa');
    assert.equal((await login('NOVO_QA', nova)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
