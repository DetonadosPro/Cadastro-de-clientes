// scripts/corrigir-fonadas-antigas-pendentes.js
//
// Corrige pedidos Fonada antigos (data_pedido antes de 01/01/26) que
// ainda estão pendentes por falta de baixa manual — não é que a
// mensagem não foi passada, é só que ninguém marcou no sistema na
// época. Isso limpa a "poluição" de pendências antigas sem mexer em
// nada que já foi marcado.
//
// Regras (mensagem por mensagem — 1ª e 2ª são independentes):
//   - só mexe em pedidos com data_pedido < 01/01/26 (formato dd/mm/aa
//     ou dd/mm/aaaa);
//   - para cada mensagem (p1/p2) que ainda estiver sem resultado
//     (p1_resultado/p2_resultado vazio), marca como passada com o
//     texto "OK CORRECAO dd/mm/aa hh:mm" (data/hora atual do sistema);
//   - mensagens que já têm resultado preenchido NÃO são tocadas;
//   - separadamente, se o pedido ainda não tiver pagou = 'SIM', marca
//     pagou = 'SIM' e usa o campo `cobranca` (dia ideal de cobrança)
//     como data_pagamento — a menos que `cobranca` esteja vazio ou
//     seja uma data zerada (tipo "00/00/00"), caso em que marca
//     pagou = 'SIM' mas deixa data_pagamento em branco, já que não há
//     data válida para usar;
//   - pedidos que já têm pagou preenchido (SIM ou qualquer outro
//     valor) NÃO são tocados nessa parte.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/corrigir-fonadas-antigas-pendentes.js --simular   → só mostra o relatório, não muda nada
//   node scripts/corrigir-fonadas-antigas-pendentes.js             → aplica de verdade

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const SIMULAR = process.argv.includes('--simular');
const DATA_LIMITE = '01/01/26';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada. Confira se o arquivo backend/.env existe e tem essa variável preenchida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

function paraChaveComparavel(dataBr) {
  const m = String(dataBr || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, dd, mm, anoBruto] = m;
  const aaaa = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
  return `${aaaa}${mm}${dd}`;
}

// Uma "data zerada" é qualquer texto vazio, ou uma data válida no
// formato mas com dia/mês/ano tudo zero (ex: "00/00/00", "00/00/0000").
function ehDataZeradaOuVazia(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return true;
  return /^0+\/0+\/0+$/.test(texto);
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
  console.log(`Data limite: antes de ${DATA_LIMITE} (exclusive)`);

  const resultado = await pool.query(`
    SELECT id, senha_os, nome_comprador, data_pedido, cobranca, pagou,
           p1_tema, p1_para, p1_dia, p1_resultado,
           p2_tema, p2_para, p2_dia, p2_resultado
    FROM fonadas
    WHERE excluido_em IS NULL AND data_pedido IS NOT NULL
    ORDER BY id
  `);

  const elegiveis = resultado.rows.filter((l) => {
    const chave = paraChaveComparavel(l.data_pedido);
    return chave && chave < chaveLimite;
  });

  // Uma mensagem só é "corrigível" se ela realmente existir — tem
  // tema, destinatário (para) ou dia preenchidos. Muitos pedidos são
  // de 1 mensagem só, e a 2ª mensagem fica com tudo vazio de
  // propósito; marcar isso como "passada" seria inventar uma entrega
  // que nunca existiu.
  const mensagemExiste = (tema, para, dia) =>
    String(tema || '').trim() || String(para || '').trim() || String(dia || '').trim();

  const precisamP1 = elegiveis.filter((l) => !l.p1_resultado && mensagemExiste(l.p1_tema, l.p1_para, l.p1_dia));
  const precisamP2 = elegiveis.filter((l) => !l.p2_resultado && mensagemExiste(l.p2_tema, l.p2_para, l.p2_dia));
  const precisamBaixa = elegiveis.filter((l) => l.pagou !== 'SIM');
  const precisamBaixaComCobranca = precisamBaixa.filter((l) => !ehDataZeradaOuVazia(l.cobranca));
  const precisamBaixaSemCobranca = precisamBaixa.filter((l) => ehDataZeradaOuVazia(l.cobranca));

  console.log(`\nPedidos com data_pedido antes de ${DATA_LIMITE}: ${elegiveis.length}`);
  console.log(`  - 1ª mensagem a marcar como passada: ${precisamP1.length}`);
  console.log(`  - 2ª mensagem a marcar como passada: ${precisamP2.length}`);
  console.log(`  - A dar baixa (pagou = SIM) com data de cobrança válida: ${precisamBaixaComCobranca.length}`);
  console.log(`  - A dar baixa (pagou = SIM) SEM data de cobrança válida (fica sem data_pagamento): ${precisamBaixaSemCobranca.length}`);

  if (elegiveis.length === 0) {
    console.log('\nNada para fazer.');
    await pool.end();
    return;
  }

  console.log('\nPrimeiros 10 exemplos:');
  for (const l of elegiveis.slice(0, 10)) {
    const acoes = [];
    if (!l.p1_resultado && mensagemExiste(l.p1_tema, l.p1_para, l.p1_dia)) acoes.push('1ª msg → passada');
    if (!l.p2_resultado && mensagemExiste(l.p2_tema, l.p2_para, l.p2_dia)) acoes.push('2ª msg → passada');
    if (l.pagou !== 'SIM') {
      acoes.push(ehDataZeradaOuVazia(l.cobranca) ? 'baixa sem data' : `baixa em ${l.cobranca}`);
    }
    console.log(`  #${l.id} OS ${l.senha_os || l.id} — ${l.nome_comprador} — pedido ${l.data_pedido} — ${acoes.join(', ') || 'nada a fazer'}`);
  }

  if (SIMULAR) {
    console.log('\nSimulação concluída. Rode sem --simular para aplicar de verdade.');
    await pool.end();
    return;
  }

  const textoResultado = `OK CORRECAO ${agoraFormatadoTexto()}`;

  const idsP1 = precisamP1.map((l) => l.id);
  const idsP2 = precisamP2.map((l) => l.id);
  const idsBaixaComData = precisamBaixaComCobranca.map((l) => l.id);
  const idsBaixaSemData = precisamBaixaSemCobranca.map((l) => l.id);

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

  if (idsBaixaComData.length > 0) {
    const r3 = await pool.query(`
      UPDATE fonadas SET pagou = 'SIM', data_pagamento = cobranca, atualizado_em = NOW()
      WHERE id = ANY($1::int[]) AND pagou IS DISTINCT FROM 'SIM'
    `, [idsBaixaComData]);
    console.log(`Pedidos com baixa registrada (usando data de cobrança): ${r3.rowCount}`);
  }

  if (idsBaixaSemData.length > 0) {
    const r4 = await pool.query(`
      UPDATE fonadas SET pagou = 'SIM', atualizado_em = NOW()
      WHERE id = ANY($1::int[]) AND pagou IS DISTINCT FROM 'SIM'
    `, [idsBaixaSemData]);
    console.log(`Pedidos com baixa registrada (sem data, cobrança vazia/zerada): ${r4.rowCount}`);
  }

  await pool.end();
}

main().catch((erro) => {
  console.error('Erro ao rodar o script:', erro);
  process.exit(1);
});
