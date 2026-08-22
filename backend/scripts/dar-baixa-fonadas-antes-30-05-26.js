// scripts/dar-baixa-fonadas-antes-30-05-26.js
//
// Dá baixa de pagamento (só isso — não mexe em p1_resultado/p2_resultado)
// em todos os pedidos Fonada com data_pedido antes de 30/05/26.
//
// Regras:
//   - só mexe em pedidos com data_pedido < 30/05/26 (formato dd/mm/aa
//     ou dd/mm/aaaa);
//   - pedidos que já têm pagou = 'SIM' NÃO são tocados;
//   - para os demais: marca pagou = 'SIM' e usa o campo `cobranca`
//     (dia previsto de cobrança) como data_pagamento, quando cobranca
//     for uma data válida;
//   - quando cobranca for inválida/zerada (vazio, "00/00/00",
//     "00/00/0000", "00/00/0", dia/mês fora do intervalo válido, etc.),
//     usa data_pedido como data_pagamento no lugar.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/dar-baixa-fonadas-antes-30-05-26.js --simular   → só mostra o relatório, não muda nada
//   node scripts/dar-baixa-fonadas-antes-30-05-26.js             → aplica de verdade

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const SIMULAR = process.argv.includes('--simular');
const DATA_LIMITE = '30/05/26';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada. Confira se o arquivo backend/.env existe e tem essa variável preenchida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

// Valida dd/mm/aa(aa) de verdade — dia 1-31, mês 1-12 — não só o
// formato. "00/00/00" bate no formato mas tem dia e mês inválidos.
function dataValida(valor) {
  const texto = String(valor || '').trim();
  const m = texto.match(/^(\d{1,4})\/(\d{1,4})\/(\d{1,4})$/);
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

async function main() {
  console.log(SIMULAR ? '=== MODO SIMULAÇÃO (nada será alterado) ===' : '=== MODO APLICAÇÃO (vai alterar o banco) ===');
  console.log(`Data limite: antes de ${DATA_LIMITE} (exclusive)`);

  const resultado = await pool.query(`
    SELECT id, senha_os, nome_comprador, data_pedido, cobranca, pagou
    FROM fonadas
    WHERE excluido_em IS NULL AND pagou IS DISTINCT FROM 'SIM'
    ORDER BY id
  `);

  // Um pedido entra na baixa se:
  //  (a) data_pedido é válida e é antes do limite, OU
  //  (b) data_pedido é inválida/zerada (não dá pra saber quando foi
  //      feito, então entra de qualquer forma — não há como comparar
  //      com o limite de data).
  const elegiveis = resultado.rows.filter((l) => {
    if (!dataValida(l.data_pedido)) return true;
    const chave = paraChaveComparavel(l.data_pedido);
    return chave && chave < chaveLimite;
  });

  const comCobrancaValida = elegiveis.filter((l) => dataValida(l.cobranca));
  const semDataAlguma = elegiveis.filter((l) => !dataValida(l.cobranca) && !dataValida(l.data_pedido));
  const usandoDataPedido = elegiveis.filter((l) => !dataValida(l.cobranca) && dataValida(l.data_pedido));

  console.log(`\nPedidos elegíveis (ainda sem baixa): ${elegiveis.length}`);
  console.log(`  - Baixa usando data de cobrança: ${comCobrancaValida.length}`);
  console.log(`  - Baixa usando data_pedido (cobrança inválida, data_pedido válida): ${usandoDataPedido.length}`);
  console.log(`  - Baixa SEM nenhuma data (cobrança e data_pedido inválidas): ${semDataAlguma.length}`);

  if (elegiveis.length === 0) {
    console.log('\nNada para fazer.');
    await pool.end();
    return;
  }

  console.log('\nPrimeiros 10 exemplos:');
  for (const l of elegiveis.slice(0, 10)) {
    let dataUsada;
    if (dataValida(l.cobranca)) dataUsada = `${l.cobranca} (cobranca)`;
    else if (dataValida(l.data_pedido)) dataUsada = `${l.data_pedido} (data_pedido, cobranca "${l.cobranca}" inválida)`;
    else dataUsada = `SEM DATA (cobranca "${l.cobranca}" e data_pedido "${l.data_pedido}" inválidas)`;
    console.log(`  #${l.id} OS ${l.senha_os || l.id} — ${l.nome_comprador} — pedido "${l.data_pedido}" — baixa em ${dataUsada}`);
  }

  if (SIMULAR) {
    console.log('\nSimulação concluída. Rode sem --simular para aplicar de verdade.');
    await pool.end();
    return;
  }

  const idsComCobranca = comCobrancaValida.map((l) => l.id);
  const idsUsandoDataPedido = usandoDataPedido.map((l) => l.id);
  const idsSemData = semDataAlguma.map((l) => l.id);

  if (idsComCobranca.length > 0) {
    const r1 = await pool.query(`
      UPDATE fonadas SET pagou = 'SIM', data_pagamento = cobranca, atualizado_em = NOW()
      WHERE id = ANY($1::int[]) AND pagou IS DISTINCT FROM 'SIM'
    `, [idsComCobranca]);
    console.log(`\nBaixa registrada usando cobranca: ${r1.rowCount}`);
  }

  if (idsUsandoDataPedido.length > 0) {
    const r2 = await pool.query(`
      UPDATE fonadas SET pagou = 'SIM', data_pagamento = data_pedido, atualizado_em = NOW()
      WHERE id = ANY($1::int[]) AND pagou IS DISTINCT FROM 'SIM'
    `, [idsUsandoDataPedido]);
    console.log(`Baixa registrada usando data_pedido (cobrança inválida): ${r2.rowCount}`);
  }

  if (idsSemData.length > 0) {
    const r3 = await pool.query(`
      UPDATE fonadas SET pagou = 'SIM', atualizado_em = NOW()
      WHERE id = ANY($1::int[]) AND pagou IS DISTINCT FROM 'SIM'
    `, [idsSemData]);
    console.log(`Baixa registrada SEM data (nem cobrança nem data_pedido válidas): ${r3.rowCount}`);
  }

  await pool.end();
}

main().catch((erro) => {
  console.error('Erro ao rodar o script:', erro);
  process.exit(1);
});
