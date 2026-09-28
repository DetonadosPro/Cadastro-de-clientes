const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { origensPermitidas, criarCorsRestrito } = require('../src/middleware/corsRestrito');

test('produção exige origens exatas, sem wildcard', () => {
  assert.throws(() => origensPermitidas('production', ''), /CORS_ALLOWED_ORIGINS/);
  assert.throws(() => origensPermitidas('production', '*'), /origem inválida|origens HTTP/);
  assert.throws(() => origensPermitidas('production', 'https://www.pombocorreio.shop/caminho'), /origens HTTP/);
  assert.deepEqual([...origensPermitidas('production', 'https://www.pombocorreio.shop')], ['https://www.pombocorreio.shop']);
});

test('CORS permite a origem configurada e preflight Bearer/SSE, bloqueia outra e preserva requisição sem Origin', async () => {
  const app = express();
  app.use(criarCorsRestrito(origensPermitidas('production', 'https://www.pombocorreio.shop')));
  app.get('/api/status', (req, res) => res.json({ ok: true }));
  app.get('/api/eventos', (req, res) => res.type('text/event-stream').send('event: conectado\ndata: {}\n\n'));
  const servidor = await new Promise((resolve) => {
    const iniciado = app.listen(0, '127.0.0.1', () => resolve(iniciado));
  });
  try {
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const permitida = await fetch(`${base}/api/status`, { headers: { Origin: 'https://www.pombocorreio.shop', Authorization: 'Bearer teste' } });
    assert.equal(permitida.status, 200);
    assert.equal(permitida.headers.get('access-control-allow-origin'), 'https://www.pombocorreio.shop');
    assert.equal(permitida.headers.get('access-control-allow-credentials'), null);
    const preflight = await fetch(`${base}/api/eventos`, { method: 'OPTIONS', headers: { Origin: 'https://www.pombocorreio.shop', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-pombo-tela' } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
    const sse = await fetch(`${base}/api/eventos`, { headers: { Origin: 'https://www.pombocorreio.shop', Authorization: 'Bearer teste' } });
    assert.equal(sse.status, 200);
    assert.equal(sse.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const externa = await fetch(`${base}/api/status`, { headers: { Origin: 'https://externa.invalid' } });
    assert.equal(externa.status, 403);
    assert.equal(externa.headers.get('access-control-allow-origin'), null);
    const semOrigem = await fetch(`${base}/api/status`);
    assert.equal(semOrigem.status, 200);
    assert.equal(semOrigem.headers.get('access-control-allow-origin'), null);
  } finally {
    servidor.close();
  }
});
