const test = require('node:test');
const assert = require('node:assert/strict');
const { ehTemaAniversario, normalizarTexto, nomePessoaValido, formatarNome, normalizarBusca, chavePessoa } = require('../src/utils/recall');

test('nomes antigos recebem caixa uniforme sem perder acentos ou mudar a identidade', () => {
  assert.equal(formatarNome('  katia   EMILLY '), 'KATIA EMILLY');
  assert.equal(formatarNome('márcia da Conceição'), 'MÁRCIA DA CONCEIÇÃO');
  assert.equal(formatarNome('Ma\u0301rcia'), 'MÁRCIA');
  assert.equal(chavePessoa('katia EMILLY'), chavePessoa(formatarNome('katia EMILLY')));
});

test('busca por nome aceita acentos em qualquer lado e caixa misturada', () => {
  for (const termo of ['Márcia', 'MARCIA', 'marcia', 'Ma\u0301rcia']) assert.equal(normalizarBusca(termo), 'MARCIA');
  assert.equal(normalizarBusca('Conceição'), normalizarBusca('conceicao'));
  assert.equal(normalizarBusca('João'), normalizarBusca('joao'));
});

test('Pesquisa 1 aceita qualquer tipo de aniversário', () => {
  const temas = [
    'Aniversário',
    'Aniversário de namoro',
    'Aniversário de casamento',
    'Aniversário da empresa',
    'Feliz aniversário para Maria',
    'Niver de namoro',
  ];
  for (const tema of temas) assert.equal(ehTemaAniversario(tema), true, tema);
});

test('Pesquisa 1 não confunde temas sem referência a aniversário', () => {
  for (const tema of ['Casamento', 'Namoro', 'Homenagem', 'Aninha']) {
    assert.equal(ehTemaAniversario(tema), false, tema);
  }
});

test('normalização de tema ignora acentos e caixa', () => {
  assert.equal(normalizarTexto('  Aniversário de Casamento '), 'ANIVERSARIO DE CASAMENTO');
});

test('Pesquisa 2 ignora nomes inutilizados com zeros', () => {
  for (const valor of ['', '0', '00000', '0 0 0', '---', 'Maria 0', 'Cliente 2']) assert.equal(nomePessoaValido(valor), false, valor);
  for (const valor of ['Érica', 'ANTONIO (LUGAR)', 'Maria da Silva']) assert.equal(nomePessoaValido(valor), true, valor);
});
