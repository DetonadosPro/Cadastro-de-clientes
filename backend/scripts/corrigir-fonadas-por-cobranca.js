// scripts/corrigir-fonadas-por-cobranca.js
//
// Segunda rodada de limpeza de pendências antigas na Fonada — desta
// vez o critério é o campo `cobranca` (dia ideal de cobrança), não
// data_pedido. Dois grupos entram:
//   (a) cobranca é uma data válida anterior a 02/06/26;
//   (b) cobranca é inválida ou "zerada" (vazio, "00/00/00",
//       "0000000", ou uma data com dia/mês fora do intervalo válido,
//       tipo "33/30") — nesse caso entra independente de qual seria
//       a data.
//
// Para cada pedido nesses grupos:
//   - p1_resultado / p2_resultado que ainda estiverem vazios são
//     marcados como passada, com o texto "OK CORRECAO dd/mm/aa hh:mm";
//     resultados já preenchidos NÃO são tocados;
//   - se pagou ainda não é 'SIM', marca pagou = 'SIM'. A data_pagamento
//     usa `cobranca` quando ela for válida; quando cobranca for
//     inválida/zerada, usa `data_pedido` no lugar (se essa também for
//     válida); se nem uma nem outra for válida, data_pagamento fica em
//     branco. Pedidos que já têm pagou preenchido NÃO são tocados.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/corrigir-fonadas-por-cobranca.js --simular   → só mostra o relatório, não muda nada
//   node scripts/corrigir-fonadas-por-cobranca.js             → aplica de verdade

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const SIMULAR = process.argv.includes('--simular');
const DATA_LIMITE = '02/06/26';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada. Confira se o arquivo backend/.env existe e tem essa variável preenchida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

// Valida dd/mm/aa(aa) de verdade — dia 1-31, mês 1-12 — não só o
// formato. "33/30/26" bate no formato mas é inválida de verdade.
function dataValida(valor) {
  const texto = String(valor || '').trim();
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return false;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (dia < 1 || dia > 31) return false;
  if (mes < 1 || mes > 12) return false;
  return true;
}

function paraChaveComparavel(dataBr) {
  const m = String(dataBr || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, dd, mm, anoBruto] = m;
  const aaaa = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
  return `${aaaa}${mm}${dd}`;
}

const chaveLimite = paraChaveComparavel(DATA_LIMITE);

function agoraFormatadoTexto() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const hh = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${aa} ${hh}:${min}`;
}

async function main() {
  console.log(SIMULAR ? '=== MODO SIMULAÇÃO (nada será alterado) ===' : '=== MODO APLICAÇÃO (vai alterar o banco) ===');
  console.log(`Critério: cobranca inválida/zerada OU cobranca válida antes de ${DATA_LIMITE}`);

  const resultado = await pool.query(`
    SELECT id, senha_os, nome_comprador, data_pedido, cobranca, pagou,
           p1_tema, p1_para, p1_dia, p1_resultado,
           p2_tema, p2_para, p2_dia, p2_resultado
    FROM fonadas
    WHERE excluido_em IS NULL
  `);

  const elegiveis = resultado.rows.filter((l) => {
    if (!dataValida(l.cobranca)) return true;
    const chave = paraChaveComparavel(l.cobranca);
    return chave && chave < chaveLimite;
  });

  // Mesma checagem do script de data_pedido: só marca como passada uma
  // mensagem que realmente existe (tem tema, para ou dia preenchidos).
  // Muitos pedidos são de 1 mensagem só, com a 2ª sempre vazia.
  const mensagemExiste = (tema, para, dia) =>
    String(tema || '').trim() || String(para || '').trim() || String(dia || '').trim();

  const precisamP1 = elegiveis.filter((l) => (!l.p1_resultado || !String(l.p1_resultado).trim()) && mensagemExiste(l.p1_tema, l.p1_para, l.p1_dia));
  const precisamP2 = elegiveis.filter((l) => (!l.p2_resultado || !String(l.p2_resultado).trim()) && mensagemExiste(l.p2_tema, l.p2_para, l.p2_dia));
  const precisamBaixa = elegiveis.filter((l) => l.pagou !== 'SIM');

  console.log(`\nPedidos elegíveis: ${elegiveis.length}`);
  console.log(`  - 1ª mensagem a marcar como passada: ${precisamP1.length}`);
  console.log(`  - 2ª mensagem a marcar como passada: ${precisamP2.length}`);
  console.log(`  - A dar baixa (pagou = SIM): ${precisamBaixa.length}`);

  if (elegiveis.length === 0) {
    console.log('\nNada para fazer.');
    await pool.end();
    return;
  }

  console.log('\nPrimeiros 10 exemplos:');
  for (const l of elegiveis.slice(0, 10)) {
    const acoes = [];
    if ((!l.p1_resultado || !String(l.p1_resultado).trim()) && mensagemExiste(l.p1_tema, l.p1_para, l.p1_dia)) acoes.push('1ª msg → passada');
    if ((!l.p2_resultado || !String(l.p2_resultado).trim()) && mensagemExiste(l.p2_tema, l.p2_para, l.p2_dia)) acoes.push('2ª msg → passada');
    if (l.pagou !== 'SIM') {
      if (dataValida(l.cobranca)) acoes.push(`baixa em ${l.cobranca} (cobranca)`);
      else if (dataValida(l.data_pedido)) acoes.push(`baixa em ${l.data_pedido} (data_pedido, cobranca inválida)`);
      else acoes.push('baixa sem data (nem cobranca nem data_pedido válidas)');
    }
    console.log(`  #${l.id} OS ${l.senha_os || l.id} — ${l.nome_comprador} — cobranca "${l.cobranca}" — ${acoes.join(', ') || 'nada a fazer'}`);
  }

  if (SIMULAR) {
    console.log('\nSimulação concluída. Rode sem --simular para aplicar de verdade.');
    await pool.end();
    return;
  }

  const textoResultado = `OK CORRECAO ${agoraFormatadoTexto()}`;

  const idsP1 = precisamP1.map((l) => l.id);
  const idsP2 = precisamP2.map((l) => l.id);

  if (idsP1.length > 0) {
    const r1 = await pool.query(`
      UPDATE fonadas SET p1_resultado = $1, atualizado_em = NOW()
      WHERE id = ANY($2::int[]) AND (p1_resultado IS NULL OR TRIM(p1_resultado) = '')
    `, [textoResultado, idsP1]);
    console.log(`\n1ª mensagem marcada como passada: ${r1.rowCount}`);
  }

  if (idsP2.length > 0) {
    const r2 = await pool.query(`
      UPDATE fonadas SET p2_resultado = $1, atualizado_em = NOW()
      WHERE id = ANY($2::int[]) AND (p2_resultado IS NULL OR TRIM(p2_resultado) = '')
    `, [textoResultado, idsP2]);
    console.log(`2ª mensagem marcada como passada: ${r2.rowCount}`);
  }

  // A data de pagamento depende de qual campo é válido por linha, então
  // não dá para fazer um UPDATE só com ANY(ids) — separa em 3 grupos.
  const idsComCobrancaValida = precisamBaixa.filter((l) => dataValida(l.cobranca)).map((l) => l.id);
  const idsComDataPedidoValida = precisamBaixa.filter((l) => !dataValida(l.cobranca) && dataValida(l.data_pedido)).map((l) => l.id);
  const idsSemDataValida = precisamBaixa.filter((l) => !dataValida(l.cobranca) && !dataValida(l.data_pedido)).map((l) => l.id);

  if (idsComCobrancaValida.length > 0) {
    const r3 = await pool.query(`
      UPDATE fonadas SET pagou = 'SIM', data_pagamento = cobranca, atualizado_em = NOW()
      WHERE id = ANY($1::int[]) AND pagou IS DISTINCT FROM 'SIM'
    `, [idsComCobrancaValida]);
    console.log(`Baixa registrada usando cobranca: ${r3.rowCount}`);
  }

  if (idsComDataPedidoValida.length > 0) {
    const r4 = await pool.query(`
      UPDATE fonadas SET pagou = 'SIM', data_pagamento = data_pedido, atualizado_em = NOW()
      WHERE id = ANY($1::int[]) AND pagou IS DISTINCT FROM 'SIM'
    `, [idsComDataPedidoValida]);
    console.log(`Baixa registrada usando data_pedido (cobranca inválida): ${r4.rowCount}`);
  }

  if (idsSemDataValida.length > 0) {
    const r5 = await pool.query(`
      UPDATE fonadas SET pagou = 'SIM', atualizado_em = NOW()
      WHERE id = ANY($1::int[]) AND pagou IS DISTINCT FROM 'SIM'
    `, [idsSemDataValida]);
    console.log(`Baixa registrada sem data (nem cobranca nem data_pedido válidas): ${r5.rowCount}`);
  }

  await pool.end();
}

main().catch((erro) => {
  console.error('Erro ao rodar o script:', erro);
  process.exit(1);
});
