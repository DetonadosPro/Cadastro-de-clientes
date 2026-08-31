const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const express = require('express');
const { conectar, observarAlteracoes, obterDiagnostico, publicar } = require('../src/tempoReal');

class RespostaFalsa extends EventEmitter {
  constructor() {
    super();
    this.cabecalhos = {};
    this.partes = [];
    this.statusCode = 200;
    this.destroyed = false;
    this.writableEnded = false;
  }
  setHeader(nome, valor) { this.cabecalhos[nome] = valor; }
  flushHeaders() {}
  write(parte) { this.partes.push(parte); return true; }
  end() { this.writableEnded = true; this.emit('finish'); }
}

function abrirCliente() {
  const req = new EventEmitter();
  req.get = (nome) => nome === 'x-pombo-tela' ? 'tela-teste' : null;
  const res = new RespostaFalsa();
  conectar(req, res);
  return { req, res, fechar: () => req.emit('close') };
}

test('conexão SSE usa os cabeçalhos corretos e envia confirmação inicial', () => {
  const cliente = abrirCliente();
  assert.equal(cliente.res.cabecalhos['Content-Type'], 'text/event-stream');
  assert.equal(cliente.res.cabecalhos['Cache-Control'], 'no-cache, no-transform');
  assert.equal(cliente.res.cabecalhos['X-Accel-Buffering'], 'no');
  assert.match(cliente.res.partes.join(''), /event: conectado/);
  assert.match(cliente.res.partes.join(''), /"versao":\d+/);
  assert.doesNotMatch(cliente.res.partes.join(''), /SINCRONIZAR/);
  cliente.fechar();
});

test('mutação concluída publica evento com origem e tópicos relacionados', () => {
  const cliente = abrirCliente();
  const req = {
    method: 'PUT',
    originalUrl: '/api/ao-vivo/42?teste=1',
    usuario: { usuario: 'operador' },
    get: (nome) => nome === 'x-pombo-tela' ? 'tela-origem' : null,
  };
  const res = new RespostaFalsa();
  let chamouProximo = false;
  observarAlteracoes(req, res, () => { chamouProximo = true; });
  res.emit('finish');

  const fluxo = cliente.res.partes.join('');
  assert.equal(chamouProximo, true);
  assert.match(fluxo, /event: atualizacao/);
  assert.match(fluxo, /"topico":"ao-vivo"/);
  assert.match(fluxo, /"topicos":\["ao-vivo","agenda","cobranca","relatorios"\]/);
  assert.match(fluxo, /"origem":"tela-origem"/);
  assert.doesNotMatch(fluxo, /\?teste=1/);
  cliente.fechar();
});

test('requisição de leitura ou resposta com erro não publica atualização', () => {
  const cliente = abrirCliente();
  const quantidadeInicial = cliente.res.partes.length;

  observarAlteracoes({ method: 'GET' }, new RespostaFalsa(), () => {});
  const req = { method: 'POST', originalUrl: '/api/clientes', get: () => null };
  const res = new RespostaFalsa();
  res.statusCode = 400;
  observarAlteracoes(req, res, () => {});
  res.emit('finish');

  assert.equal(cliente.res.partes.length, quantidadeInicial);
  cliente.fechar();
});

test('alteração de cliente invalida somente clientes e recall', () => {
  const cliente = abrirCliente();
  publicar({ topico: 'clientes', recurso: '/api/clientes/8', metodo: 'DELETE' });
  const fluxo = cliente.res.partes.join('');
  assert.match(fluxo, /"topicos":\["clientes","recall"\]/);
  cliente.fechar();
});

test('cliente desconectado deixa de receber publicações', () => {
  const cliente = abrirCliente();
  cliente.fechar();
  const quantidadeDepoisDeFechar = cliente.res.partes.length;
  publicar({ topico: 'agenda', recurso: '/teste', metodo: 'SISTEMA' });
  assert.equal(cliente.res.partes.length, quantidadeDepoisDeFechar);
});

test('abre e fecha conexões sem acumular clientes ou duplicatas', () => {
  const antes = obterDiagnostico();
  const clientes = Array.from({ length: 25 }, () => abrirCliente());
  assert.equal(obterDiagnostico().conectadas, antes.conectadas + 25);
  assert.equal(obterDiagnostico().duplicadasPorTela, 24);
  clientes.forEach((cliente) => cliente.fechar());
  assert.equal(obterDiagnostico().conectadas, antes.conectadas);
});

test('fluxo HTTP real recebe a mutação feita por outra tela', async () => {
  const app = express();
  app.use(express.json());
  app.get('/eventos', conectar);
  app.use(observarAlteracoes);
  app.put('/api/fonadas/:id', (req, res) => res.json({ ok: true }));

  const servidor = await new Promise((resolve) => {
    const instancia = app.listen(0, '127.0.0.1', () => resolve(instancia));
  });
  const porta = servidor.address().port;
  const controle = new AbortController();

  try {
    const respostaEventos = await fetch(`http://127.0.0.1:${porta}/eventos`, { signal: controle.signal });
    assert.equal(respostaEventos.status, 200);
    assert.match(respostaEventos.headers.get('content-type'), /text\/event-stream/);
    const leitor = respostaEventos.body.getReader();
    const decoder = new TextDecoder();
    await leitor.read(); // confirmação de conexão

    const mutacao = await fetch(`http://127.0.0.1:${porta}/api/fonadas/77`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-pombo-tela': 'outra-tela' },
      body: '{}',
    });
    assert.equal(mutacao.status, 200);

    const recebido = await Promise.race([
      leitor.read().then(({ value }) => decoder.decode(value)),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error('Evento SSE não chegou')), 2000)),
    ]);
    assert.match(recebido, /event: atualizacao/);
    assert.match(recebido, /"recurso":"\/api\/fonadas\/77"/);
    assert.match(recebido, /"origem":"outra-tela"/);
  } finally {
    controle.abort();
    await new Promise((resolve) => servidor.close(resolve));
  }
});
