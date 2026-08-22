// scripts/diagnostico-cobranca-pendente.js
//
// Só investiga — não altera nada. Serve para entender por que o
// script de baixa por valor=0/cobranca inválida encontrou poucos
// elegíveis, quando a tela de Cobrança mostra muito mais pendentes
// com cobranca zerada.
//
// Como usar: node scripts/diagnostico-cobranca-pendente.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

async function main() {
  // 1) Quantos pedidos a tela de Cobrança considera "pendente" (mesmo
  // critério da rota /api/cobranca): pagou IS NULL OR pagou != 'SIM'.
  const totalPendenteTela = await pool.query(`
    SELECT COUNT(*) FROM fonadas
    WHERE excluido_em IS NULL AND (pagou IS NULL OR pagou != 'SIM')
  `);
  console.log(`Total "pendente" pelo critério da tela de Cobrança: ${totalPendenteTela.rows[0].count}`);

  // 2) Desses, quantos têm cobranca zerada tipo "00/00/00" (comparação
  // de texto direta, sem passar pela função dataValida do script).
  const comCobrancaZerada = await pool.query(`
    SELECT COUNT(*) FROM fonadas
    WHERE excluido_em IS NULL AND (pagou IS NULL OR pagou != 'SIM')
      AND cobranca ~ '^0+/0+/0+$'
  `);
  console.log(`Desses, com cobranca no padrão "00/00/00" (zeros): ${comCobrancaZerada.rows[0].count}`);

  // 3) Verifica se esses pedidos têm cobranca_pedido pertencente a um
  // pedido EXCLUÍDO (não deveria, já filtramos, mas confirma) ou se
  // existe algum outro campo interferindo. Mostra 15 exemplos crus.
  const exemplos = await pool.query(`
    SELECT id, senha_os, nome_comprador, cobranca, valor, pagou, data_pedido
    FROM fonadas
    WHERE excluido_em IS NULL AND (pagou IS NULL OR pagou != 'SIM')
      AND cobranca ~ '^0+/0+/0+$'
    ORDER BY id
    LIMIT 15
  `);
  console.log('\nExemplos crus (pedidos com cobranca zerada, ainda pendentes):');
  for (const l of exemplos.rows) {
    console.log(`  #${l.id} OS ${l.senha_os} — ${l.nome_comprador} — cobranca="${l.cobranca}" valor=${l.valor} pagou="${l.pagou}" data_pedido="${l.data_pedido}"`);
  }

  await pool.end();
}

main().catch((erro) => {
  console.error('Erro:', erro);
  process.exit(1);
});
