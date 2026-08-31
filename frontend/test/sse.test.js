import test from 'node:test';
import assert from 'node:assert/strict';
import { lerEventosSse } from '../src/utils/sse.js';

function respostaEmPartes(partes) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controlador) {
      partes.forEach((parte) => controlador.enqueue(encoder.encode(parte)));
      controlador.close();
    },
  }));
}

test('parser SSE recompõe um evento dividido em vários pacotes', async () => {
  const recebidos = [];
  const resposta = respostaEmPartes([
    'event: atua',
    'lizacao\ndata: {"topico":"agenda",',
    '"topicos":["agenda"]}\n',
    '\n',
  ]);
  await lerEventosSse(resposta, (evento) => recebidos.push(evento));
  assert.deepEqual(recebidos, [{ topico: 'agenda', topicos: ['agenda'] }]);
});

test('parser ignora heartbeat e informa o evento de conexão separadamente', async () => {
  const recebidos = [];
  const conexoes = [];
  const resposta = respostaEmPartes([
    ': pulso\n\nevent: conectado\ndata: {"ok":true}\n\n',
  ]);
  await lerEventosSse(resposta, (evento) => recebidos.push(evento), (evento) => conexoes.push(evento));
  assert.deepEqual(recebidos, []);
  assert.deepEqual(conexoes, [{ ok: true }]);
});

test('parser entrega atualizações consecutivas na ordem', async () => {
  const recebidos = [];
  const resposta = respostaEmPartes([
    'event: atualizacao\ndata: {"recurso":"/um"}\n\n',
    'event: atualizacao\ndata: {"recurso":"/dois"}\n\n',
  ]);
  await lerEventosSse(resposta, (evento) => recebidos.push(evento));
  assert.deepEqual(recebidos.map((evento) => evento.recurso), ['/um', '/dois']);
});
