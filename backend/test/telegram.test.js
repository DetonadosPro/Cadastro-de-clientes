const test = require('node:test');
const assert = require('node:assert/strict');
const { escaparHtml, dividirMensagem } = require('../src/servicos/telegram');
const { montarMensagensTelegram, montarTextoEmail, formatarPedido } = require('../src/servicos/formatarResumoTelegram');

function resumoExemplo() {
  return {
    dia: '30/08/26',
    fonada: { quantidadeVendida: 2, valorVendido: 170, quantidadeRecebida: 1, valorRecebido: 85, quantidadePendente: 1, valorPendente: 85 },
    aoVivo: { quantidadeVendida: 1, valorVendido: 220, quantidadeRecebida: 1, valorRecebido: 220, quantidadePendente: 0, valorPendente: 0 },
    total: { quantidadeVendida: 3, valorVendido: 390, quantidadeRecebida: 2, valorRecebido: 305, quantidadePendente: 1, valorPendente: 85 },
    agenda: {
      fonadas: [{
        tipo: 'FONADA', os: '1041', mensagem: 1, data: '30/08/26', horario: '09:20',
        cliente: 'Maria & Filhos', destinatario: 'Ana <Clara>', tema: 'Aniversário',
        telefone: '(34) 99999-9999', responsavel: 'Família', status: 'Realizada',
        pagou: 'NÃO', formaPagamento: 'PIX', dataCobranca: '31/08/26',
      }],
      aoVivo: [{
        tipo: 'AO VIVO', os: '2047', data: '30/08/26', horario: '18:30', cliente: 'João',
        destinatario: 'Beatriz', tema: 'Homenagem', telefone: '(34) 98888-7777',
        responsavel: 'Amigos', status: 'Entregue por Carlos', pagou: 'SIM',
        formaPagamento: 'PIX', dataPagamento: '30/08/26', observacoes: 'Portão azul',
      }],
    },
  };
}

test('escapa dados dinâmicos antes de usar formatação HTML do Telegram', () => {
  assert.equal(escaparHtml('Maria & <Filhos>'), 'Maria &amp; &lt;Filhos&gt;');
});

test('resumo do Telegram separa visão financeira e operação detalhada', () => {
  const mensagens = montarMensagensTelegram(resumoExemplo());
  assert.equal(mensagens.length, 2);
  assert.match(mensagens[0], /FECHAMENTO DO DIA/);
  assert.match(mensagens[0], /R\$\s*390,00/);
  assert.match(mensagens[1], /FONADA · O\.S\. 1041/);
  assert.match(mensagens[1], /Maria &amp; Filhos/);
  assert.match(mensagens[1], /Ana &lt;Clara&gt;/);
  assert.match(mensagens[1], /Entregue por Carlos/);
});

test('campos vazios não viram ruído na notificação', () => {
  const pedido = formatarPedido({ tipo: 'FONADA', os: '10', cliente: 'Maria', pagou: 'NÃO' });
  assert.doesNotMatch(pedido, /Observação:/);
  assert.doesNotMatch(pedido, /Telefone:/);
  assert.match(pedido, /Pagamento:<\/b> Pendente/);
});

test('mensagens longas são divididas em blocos seguros para a API', () => {
  const texto = Array.from({ length: 12 }, (_, indice) => `Bloco ${indice}\n${'x'.repeat(40)}`).join('\n\n');
  const partes = dividirMensagem(texto, 130);
  assert.ok(partes.length > 1);
  assert.ok(partes.every((parte) => parte.length <= 130));
  assert.equal(partes.join('\n\n'), texto);
});

test('uma linha isolada maior que o limite também é dividida', () => {
  const partes = dividirMensagem('x'.repeat(301), 100);
  assert.deepEqual(partes.map((parte) => parte.length), [100, 100, 100, 1]);
  assert.equal(partes.join(''), 'x'.repeat(301));
});

test('fallback por email mantém o mesmo contexto operacional sem HTML', () => {
  const email = montarTextoEmail(resumoExemplo());
  assert.match(email, /FECHAMENTO DO DIA · 30\/08\/26/);
  assert.match(email, /AO VIVO · O\.S\. 2047/);
  assert.doesNotMatch(email, /<b>|<i>/);
});

test('status de entrega ao vivo preserva o texto operacional recebido do banco', () => {
  const mensagem = formatarPedido({
    tipo: 'AO VIVO', os: '2047', cliente: 'João', pagou: 'SIM',
    status: 'ENTREGUE, 30/08/26 ÀS 18:40 POR CARLOS',
  });
  assert.match(mensagem, /Status:<\/b> ENTREGUE, 30\/08\/26 ÀS 18:40 POR CARLOS/);
});
