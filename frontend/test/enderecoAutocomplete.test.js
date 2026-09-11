import test from 'node:test';
import assert from 'node:assert/strict';
import { enderecoComNumero, faixaCompativelComNumero, filtrarSugestoesPorNumero, numeroDoEnderecoDigitado, termoDeBuscaEndereco } from '../src/enderecoAutocomplete.js';

test('consulta o ViaCEP somente com o logradouro', () => {
  assert.equal(termoDeBuscaEndereco('Rua Artur Machado, 321'), 'Rua Artur Machado');
});

test('normaliza abreviações de avenida antes da consulta', () => {
  assert.equal(termoDeBuscaEndereco('av. Niza Marquez Guaritá'), 'Avenida Niza Marquez Guaritá');
  assert.equal(termoDeBuscaEndereco('AV Niza Marquez Guaritá'), 'Avenida Niza Marquez Guaritá');
  assert.equal(termoDeBuscaEndereco('Avenida Niza Marquez Guaritá'), 'Avenida Niza Marquez Guaritá');
});

test('recupera o número já digitado no endereço da edição', () => {
  assert.equal(numeroDoEnderecoDigitado('Rua Artur Machado, 321 A'), '321 A');
});

test('mostra e preserva o número ao completar o logradouro', () => {
  assert.equal(enderecoComNumero('Rua Artur Machado', '321'), 'Rua Artur Machado, 321');
  assert.equal(enderecoComNumero('Rua Artur Machado', ''), 'Rua Artur Machado');
});

test('interpreta faixas e lados informados pelo ViaCEP', () => {
  assert.equal(faixaCompativelComNumero('até 1529/1530', '780'), true);
  assert.equal(faixaCompativelComNumero('de 1532 a 2100 - lado par', '780'), false);
  assert.equal(faixaCompativelComNumero('de 1905 a 2099 - lado ímpar', '1906'), false);
  assert.equal(faixaCompativelComNumero('de 2101 ao fim - lado ímpar', '2201'), true);
});

test('mantém apenas o bairro correspondente ao número quando há faixa conhecida', () => {
  const sugestoes = [
    { bairro: 'Conjunto Manoel Mendes', complemento: 'até 1529/1530' },
    { bairro: 'Residencial Filinha Mendes', complemento: 'de 1532 a 2100 - lado par' },
    { bairro: 'Loteamento Reserva Ushuaia', complemento: 'de 1531 a 1903 - lado ímpar' },
  ];
  assert.deepEqual(filtrarSugestoesPorNumero(sugestoes, '780'), [sugestoes[0]]);
});
