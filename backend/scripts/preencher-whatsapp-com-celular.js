// scripts/preencher-whatsapp-com-celular.js
//
// MOVE o número do campo `celular` para o campo `whatsapp`, na tabela
// clientes, para os cadastros antigos que foram feitos antes do campo
// whatsapp existir — depois de copiado, o celular fica vazio.
//
// Regra:
//   - só mexe no cliente se `celular` tiver algum valor;
//   - só copia se `whatsapp` estiver vazio (NULL ou string vazia) —
//     nunca sobrescreve um whatsapp que já foi preenchido manualmente;
//   - quando copia, o `celular` é ZERADO (fica NULL) — não é uma cópia,
//     é uma mudança de campo;
//   - clientes sem celular não são alterados (mesmo que tenham fixo);
//   - clientes que já têm whatsapp preenchido NÃO têm o celular tocado,
//     mesmo que o celular também tenha valor — nesse caso não há nada
//     para mover, então o celular permanece como está.
//   - só mexe na tabela clientes — pedidos (fonadas/ao_vivo) não são
//     alterados por este script.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/preencher-whatsapp-com-celular.js --simular   → só mostra o relatório, não muda nada
//   node scripts/preencher-whatsapp-com-celular.js             → aplica de verdade

// Carrega o backend/.env explicitamente — este script pode ser
// rodado a partir da raiz do projeto (onde não há .env), então não dá
// para confiar no dotenv achar o arquivo sozinho.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const SIMULAR = process.argv.includes('--simular');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada. Confira se o arquivo backend/.env existe e tem essa variável preenchida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

async function main() {
  console.log(SIMULAR ? '=== MODO SIMULAÇÃO (nada será alterado) ===' : '=== MODO APLICAÇÃO (vai alterar o banco) ===');

  const elegiveis = await pool.query(`
    SELECT id, nome, celular, whatsapp
    FROM clientes
    WHERE celular IS NOT NULL AND TRIM(celular) <> ''
      AND (whatsapp IS NULL OR TRIM(whatsapp) = '')
    ORDER BY id
  `);

  console.log(`\nClientes elegíveis (têm celular, whatsapp vazio): ${elegiveis.rows.length}`);

  if (elegiveis.rows.length === 0) {
    console.log('Nada para fazer.');
    await pool.end();
    return;
  }

  console.log('\nPrimeiros 10 exemplos (celular será movido para whatsapp e ficará vazio):');
  for (const c of elegiveis.rows.slice(0, 10)) {
    console.log(`  #${c.id} ${c.nome} — celular: ${c.celular}  →  whatsapp: ${c.celular} (celular ficará vazio)`);
  }

  if (SIMULAR) {
    console.log('\nSimulação concluída. Rode sem --simular para aplicar de verdade.');
    await pool.end();
    return;
  }

  const resultado = await pool.query(`
    UPDATE clientes
    SET whatsapp = celular, celular = NULL, atualizado_em = NOW()
    WHERE celular IS NOT NULL AND TRIM(celular) <> ''
      AND (whatsapp IS NULL OR TRIM(whatsapp) = '')
  `);

  console.log(`\nClientes atualizados (celular movido para whatsapp): ${resultado.rowCount}`);
  await pool.end();
}

main().catch((erro) => {
  console.error('Erro ao rodar o script:', erro);
  process.exit(1);
});
