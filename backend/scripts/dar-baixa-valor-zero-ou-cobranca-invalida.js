// scripts/dar-baixa-valor-zero-ou-cobranca-invalida.js
//
// Dá baixa de pagamento (só isso — não mexe em p1_resultado/p2_resultado)
// em todo pedido Fonada que tenha valor = 0 OU cobranca inválida/zerada
// (vazio, "00/00/00", "00/00/0000", "0", "—", dia/mês fora do
// intervalo válido, etc.) — sem olhar data_pedido.
//
// Regras:
//   - pedidos que já têm pagou = 'SIM' NÃO são tocados;
//   - entra na baixa se valor = 0 OU cobranca for inválida;
//   - data_pagamento: usa cobranca se ela for válida; senão usa
//     data_pedido se essa for válida; se nenhuma das duas for válida,
//     fica sem data_pagamento (em branco).
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/dar-baixa-valor-zero-ou-cobranca-invalida.js --simular   → só mostra o relatório, não muda nada
//   node scripts/dar-baixa-valor-zero-ou-cobranca-invalida.js             → aplica de verdade

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

// Valida dd/mm/aa(aa) de verdade — dia 1-31, mês 1-12 — não só o
// formato. "00/00/00" bate no formato mas tem dia e mês zerados.
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

async function main() {
  console.log(SIMULAR ? '=== MODO SIMULAÇÃO (nada será alterado) ===' : '=== MODO APLICAÇÃO (vai alterar o banco) ===');
  console.log('Critério: valor = 0 OU cobranca inválida/zerada');

  const resultado = await pool.query(`
    SELECT id, senha_os, nome_comprador, data_pedido, cobranca, valor, pagou
    FROM fonadas
    WHERE excluido_em IS NULL AND pagou IS DISTINCT FROM 'SIM'
  `);

  const elegiveis = resultado.rows.filter((l) => {
    const valorZero = !l.valor || Number(l.valor) === 0;
    return valorZero || !dataValida(l.cobranca);
  });

  const comCobrancaValida = elegiveis.filter((l) => dataValida(l.cobranca));
  const usandoDataPedido = elegiveis.filter((l) => !dataValida(l.cobranca) && dataValida(l.data_pedido));
  const semDataAlguma = elegiveis.filter((l) => !dataValida(l.cobranca) && !dataValida(l.data_pedido));

  console.log(`\nPedidos elegíveis (ainda sem baixa): ${elegiveis.length}`);
  console.log(`  - Baixa usando data de cobrança: ${comCobrancaValida.length}`);
  console.log(`  - Baixa usando data_pedido (cobrança inválida, data_pedido válida): ${usandoDataPedido.length}`);
  console.log(`  - Baixa SEM nenhuma data (cobrança e data_pedido inválidas): ${semDataAlguma.length}`);

  if (elegiveis.length === 0) {
    console.log('\nNada para fazer.');
    await pool.end();
    return;
  }

  console.log('\nPrimeiros 15 exemplos:');
  for (const l of elegiveis.slice(0, 15)) {
    const motivo = [];
    if (!l.valor || Number(l.valor) === 0) motivo.push('valor=0');
    if (!dataValida(l.cobranca)) motivo.push(`cobranca "${l.cobranca}" inválida`);
    let dataUsada;
    if (dataValida(l.cobranca)) dataUsada = `${l.cobranca} (cobranca)`;
    else if (dataValida(l.data_pedido)) dataUsada = `${l.data_pedido} (data_pedido)`;
    else dataUsada = 'SEM DATA';
    console.log(`  #${l.id} OS ${l.senha_os || l.id} — ${l.nome_comprador} — [${motivo.join(', ')}] — baixa em ${dataUsada}`);
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
