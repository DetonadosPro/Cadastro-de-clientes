// scripts/investigar-correcao-indevida.js
//
// Investiga o estrago causado pelo bug dos scripts de correção
// retroativa (corrigir-fonadas-antigas-pendentes.js e
// corrigir-fonadas-por-cobranca.js): eles marcaram p1_resultado /
// p2_resultado como "OK CORRECAO ..." em mensagens que na verdade
// nunca existiram de verdade (tema, para e dia todos vazios) — só
// porque o campo resultado estava vazio, sem checar se a mensagem em
// si tinha conteúdo.
//
// Este script NÃO altera nada — só lista os pedidos afetados, para
// que a correção seja decidida com o relatório completo em mãos.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/investigar-correcao-indevida.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada. Confira se o arquivo backend/.env existe e tem essa variável preenchida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

// Uma mensagem "vazia de verdade" é aquela sem tema, sem destinatário
// (para) e sem dia — ou seja, nunca foi preenchida, é só um slot em
// branco que sobrou na estrutura de 2 mensagens por pedido.
function mensagemVazia(tema, para, dia) {
  return !String(tema || '').trim() && !String(para || '').trim() && !String(dia || '').trim();
}

async function main() {
  console.log('=== INVESTIGAÇÃO — mensagens marcadas como passada indevidamente ===\n');

  const resultado = await pool.query(`
    SELECT id, senha_os, nome_comprador,
           p1_tema, p1_para, p1_dia, p1_resultado,
           p2_tema, p2_para, p2_dia, p2_resultado
    FROM fonadas
    WHERE excluido_em IS NULL
      AND (p1_resultado LIKE 'OK CORRECAO%' OR p2_resultado LIKE 'OK CORRECAO%')
  `);

  const afetadosP1 = [];
  const afetadosP2 = [];

  for (const l of resultado.rows) {
    if (String(l.p1_resultado || '').startsWith('OK CORRECAO') && mensagemVazia(l.p1_tema, l.p1_para, l.p1_dia)) {
      afetadosP1.push(l);
    }
    if (String(l.p2_resultado || '').startsWith('OK CORRECAO') && mensagemVazia(l.p2_tema, l.p2_para, l.p2_dia)) {
      afetadosP2.push(l);
    }
  }

  console.log(`Total de pedidos com alguma mensagem "OK CORRECAO": ${resultado.rows.length}`);
  console.log(`  - 1ª mensagem marcada indevidamente (vazia de verdade): ${afetadosP1.length}`);
  console.log(`  - 2ª mensagem marcada indevidamente (vazia de verdade): ${afetadosP2.length}`);

  const idsUnicos = new Set([...afetadosP1.map((l) => l.id), ...afetadosP2.map((l) => l.id)]);
  console.log(`  - Pedidos únicos afetados (1ª e/ou 2ª): ${idsUnicos.size}`);

  if (afetadosP1.length > 0) {
    console.log('\n--- 1ª mensagem afetada (primeiros 15) ---');
    for (const l of afetadosP1.slice(0, 15)) {
      console.log(`  #${l.id} OS ${l.senha_os || l.id} — ${l.nome_comprador}`);
    }
  }

  if (afetadosP2.length > 0) {
    console.log('\n--- 2ª mensagem afetada (primeiros 15) ---');
    for (const l of afetadosP2.slice(0, 15)) {
      console.log(`  #${l.id} OS ${l.senha_os || l.id} — ${l.nome_comprador}`);
    }
  }

  console.log('\nNenhuma alteração foi feita — este script só lê os dados.');
  await pool.end();
}

main().catch((erro) => {
  console.error('Erro ao investigar:', erro);
  process.exit(1);
});
