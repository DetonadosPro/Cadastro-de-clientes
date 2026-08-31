import test from 'node:test';
import assert from 'node:assert/strict';
import { linkWhatsAppCobranca, mensagemCobrancaPix } from '../src/utils/mensagemCobranca.js';

test('mensagem de cobrança normaliza o primeiro nome e formata o valor', () => {
  assert.equal(
    mensagemCobrancaPix('MARIA APARECIDA', 1234.5),
    'Oi Maria, tudo bem?\nAbaixo nossa chave PIX:\n11348702000187\n*CNPJ* - NUBANK (Enimar A dos Santos)\nValor: *R$ 1.234,50*',
  );
});

test('link de cobrança inclui telefone brasileiro e mensagem codificada', () => {
  const link = linkWhatsAppCobranca('(34) 99999-1111', 'JOÃO SILVA', 80);
  const url = new URL(link);
  assert.equal(url.searchParams.get('phone'), '5534999991111');
  assert.equal(url.searchParams.get('text'), mensagemCobrancaPix('JOÃO SILVA', 80));
});

test('link de cobrança não é criado sem telefone válido', () => {
  assert.equal(linkWhatsAppCobranca('123', 'ANA', 50), null);
});
