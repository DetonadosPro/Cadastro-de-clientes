import test from 'node:test';
import assert from 'node:assert/strict';
import { enderecoComNumero, numeroDoEnderecoDigitado, termoDeBuscaEndereco } from '../src/enderecoAutocomplete.js';

test('consulta o ViaCEP somente com o logradouro', () => {
  assert.equal(termoDeBuscaEndereco('Rua Artur Machado, 321'), 'Rua Artur Machado');
});

test('recupera o número já digitado no endereço da edição', () => {
  assert.equal(numeroDoEnderecoDigitado('Rua Artur Machado, 321 A'), '321 A');
});

test('mostra e preserva o número ao completar o logradouro', () => {
  assert.equal(enderecoComNumero('Rua Artur Machado', '321'), 'Rua Artur Machado, 321');
  assert.equal(enderecoComNumero('Rua Artur Machado', ''), 'Rua Artur Machado');
});
