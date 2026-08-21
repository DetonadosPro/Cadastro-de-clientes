// scripts/corrigir-aovivo-antigos-pendentes.js
//
// Corrige pedidos Ao Vivo antigos (dia_entrega até 20/08/26, inclusive)
// que ainda estão pendentes por falta de baixa manual — não é que a
// entrega não aconteceu, é só que ninguém marcou no sistema na época.
// Isso limpa a "poluição" de pendências antigas sem mexer em nada que
// já foi marcado.
//
// Regras:
//   - só mexe em pedidos com dia_entrega <= 20/08/25 (formato dd/mm/aa
//     ou dd/mm/aaaa) E resultado_entrega ainda vazio (NULL);
//   - marca resultado_entrega como entregue, com um texto que deixa
//     claro que foi uma correção retroativa em massa (não uma baixa
//     manual de verdade), igual ao formato usado pela baixa normal;
//   - entre os elegíveis, os que têm pagamento a PRAZO também são
//     marcados como pagou = 'SIM' — mas SEM preencher data_pagou, de
//     propósito, para não aparecerem retroativamente no relatório de
//     Recebimentos (são só uma limpeza visual da Agenda, não entradas
//     financeiras reais que devam contar em nenhum relatório);
//   - pedidos já com resultado_entrega preenchido não são tocados,
//     mesmo que sejam antigos.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/corrigir-aovivo-antigos-pendentes.js --simular   → só mostra o relatório, não muda nada
//   node scripts/corrigir-aovivo-antigos-pendentes.js             → aplica de verdade

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const SIMULAR = process.argv.includes('--simular');
const DATA_LIMITE = '20/08/26';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada. Confira se o arquivo backend/.env existe e tem essa variável preenchida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

// Converte dd/mm/aa (ou dd/mm/aaaa) para uma chave comparável AAAAMMDD,
// mesmo esquema usado no resto do sistema para comparar datas em texto.
function paraChaveComparavel(dataBr) {
  const m = String(dataBr || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, dd, mm, anoBruto] = m;
  const aaaa = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
  return `${aaaa}${mm}${dd}`;
}

const chaveLimite = paraChaveComparavel(DATA_LIMITE);

function ehPrazo(pagamento) {
  return String(pagamento || '').startsWith('PRAZO');
}

async function main() {
  console.log(SIMULAR ? '=== MODO SIMULAÇÃO (nada será alterado) ===' : '=== MODO APLICAÇÃO (vai alterar o banco) ===');
  console.log(`Data limite: ${DATA_LIMITE} (inclusive)`);

  const resultado = await pool.query(`
    SELECT id, numero_os, comprador, dia_entrega, pagamento, pagou
    FROM ao_vivo
    WHERE excluido_em IS NULL
      AND resultado_entrega IS NULL
      AND dia_entrega IS NOT NULL
    ORDER BY id
  `);

  const elegiveis = resultado.rows.filter((l) => {
    const chave = paraChaveComparavel(l.dia_entrega);
    return chave && chave <= chaveLimite;
  });

  const elegiveisPrazo = elegiveis.filter((l) => ehPrazo(l.pagamento));

  console.log(`\nPedidos elegíveis (dia_entrega <= ${DATA_LIMITE}, ainda sem resultado_entrega): ${elegiveis.length}`);
  console.log(`  - Serão marcados como ENTREGUE: ${elegiveis.length}`);
  console.log(`  - Desses, com pagamento PRAZO (também marcados como pagou = SIM, sem data): ${elegiveisPrazo.length}`);

  if (elegiveis.length === 0) {
    console.log('\nNada para fazer.');
    await pool.end();
    return;
  }

  console.log('\nPrimeiros 10 exemplos:');
  for (const l of elegiveis.slice(0, 10)) {
    const marcaPrazo = ehPrazo(l.pagamento) ? ' + marca pagou=SIM (PRAZO)' : '';
    console.log(`  #${l.id} OS ${l.numero_os || l.id} — ${l.comprador} — entrega ${l.dia_entrega}${marcaPrazo}`);
  }

  if (SIMULAR) {
    console.log('\nSimulação concluída. Rode sem --simular para aplicar de verdade.');
    await pool.end();
    return;
  }

  const textoResultado = 'ENTREGUE — correção retroativa em massa (pendência antiga limpa)';

  const updateEntrega = await pool.query(`
    UPDATE ao_vivo
    SET resultado_entrega = $1, atualizado_em = NOW()
    WHERE excluido_em IS NULL
      AND resultado_entrega IS NULL
      AND dia_entrega IS NOT NULL
      AND id = ANY($2::int[])
  `, [textoResultado, elegiveis.map((l) => l.id)]);

  console.log(`\nPedidos marcados como entregue: ${updateEntrega.rowCount}`);

  if (elegiveisPrazo.length > 0) {
    const updatePagou = await pool.query(`
      UPDATE ao_vivo
      SET pagou = 'SIM', atualizado_em = NOW()
      WHERE id = ANY($1::int[])
    `, [elegiveisPrazo.map((l) => l.id)]);

    console.log(`Pedidos a prazo marcados como pagou = SIM (sem data_pagou): ${updatePagou.rowCount}`);
  }

  await pool.end();
}

main().catch((erro) => {
  console.error('Erro ao rodar o script:', erro);
  process.exit(1);
});
