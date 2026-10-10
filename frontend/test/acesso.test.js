import test from 'node:test';
import assert from 'node:assert/strict';
import { destinoSeguro, normalizarBuscaAcesso } from '../src/utils/acesso.js';

test('retorno conserva página interna, filtros e âncora sem permitir saída ou ciclo de login', () => {
  assert.equal(destinoSeguro('/clientes?busca=Maria#resultado'), '/clientes?busca=Maria#resultado');
  for (const alvo of [null, '', 'https://outro.test', '//outro.test', '/\\outro.test', '/login', '/LOGIN/', '/gerenciar-usuarios?x=1', '/%6cogin', '/a/../login', '/%']) {
    assert.equal(destinoSeguro(alvo), '/agenda');
  }
});

test('busca por conta ignora acentuação e caixa', () => {
  assert.equal(normalizarBuscaAcesso('  Ángela DE Souza '), 'angela de souza');
  assert.equal(normalizarBuscaAcesso(null), '');
});
