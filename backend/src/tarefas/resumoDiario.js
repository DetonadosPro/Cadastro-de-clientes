// src/tarefas/resumoDiario.js
//
// Todo fim de expediente, monta um resumo do dia (vendido, recebido,
// pendentes) e envia via Telegram — 100% automático, sem precisar
// tocar em nada (diferente do WhatsApp, que não tem forma gratuita e
// estável de enviar sem interação manual). Se o Telegram não estiver
// configurado, cai para o email como alternativa.

const { db } = require('../db/database');
const { enviarEmail } = require('../servicos/email');
const { enviarTelegram, telegramDisponivel } = require('../servicos/telegram');

function hojeBr() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(agora.getDate())}/${pad(agora.getMonth() + 1)}/${String(agora.getFullYear()).slice(-2)}`;
}

function paraChaveComparavel(dataBr) {
  if (!dataBr) return null;
  const m = String(dataBr).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let [, dd, mm, aa] = m;
  const ano = aa.length === 2 ? `20${aa}` : aa;
  return `${ano}-${mm}-${dd}`;
}

function formatarReais(valor) {
  return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function montarResumoDoDia() {
  const hoje = hojeBr();
  const hojeChave = paraChaveComparavel(hoje);

  const [fonadasResultado, aoVivoResultado] = await Promise.all([
    db.query(`
      SELECT valor, data_pedido, pagou, data_pagamento
      FROM fonadas WHERE excluido_em IS NULL
    `),
    db.query(`
      SELECT valor, data_pedido, pagou, data_pagou
      FROM ao_vivo WHERE excluido_em IS NULL
    `),
  ]);

  const todasLinhas = [
    ...fonadasResultado.rows.map((l) => ({ ...l, dataPago: l.data_pagamento })),
    ...aoVivoResultado.rows.map((l) => ({ ...l, dataPago: l.data_pagou })),
  ];

  const vendidoHoje = todasLinhas.filter((l) => paraChaveComparavel(l.data_pedido) === hojeChave);
  const valorVendido = vendidoHoje.reduce((soma, l) => soma + (l.valor || 0), 0);

  const recebidoHoje = todasLinhas.filter((l) => paraChaveComparavel(l.dataPago) === hojeChave && l.pagou === 'SIM');
  const valorRecebido = recebidoHoje.reduce((soma, l) => soma + (l.valor || 0), 0);

  const pendentes = todasLinhas.filter((l) => l.pagou !== 'SIM');

  return {
    dia: hoje,
    quantidadeVendida: vendidoHoje.length,
    valorVendido,
    quantidadeRecebida: recebidoHoje.length,
    valorRecebido,
    quantidadePendente: pendentes.length,
  };
}

async function rodarResumoDiario() {
  console.log('📊 Gerando resumo diário...');
  try {
    const resumo = await montarResumoDoDia();

    const texto =
      `📋 Resumo do dia ${resumo.dia} — Pombo-Correio\n\n` +
      `💰 Vendido: ${resumo.quantidadeVendida} pedido(s), ${formatarReais(resumo.valorVendido)}\n` +
      `✅ Recebido: ${resumo.quantidadeRecebida} pagamento(s), ${formatarReais(resumo.valorRecebido)}\n` +
      `⏳ Pendentes no total: ${resumo.quantidadePendente} pedido(s)`;

    if (telegramDisponivel()) {
      const resultado = await enviarTelegram(texto);
      if (resultado.enviado) {
        console.log('✅ Resumo diário enviado por Telegram com sucesso.');
      } else {
        console.warn(`⚠️  Resumo gerado, mas não enviado por Telegram: ${resultado.motivo}`);
      }
      return;
    }

    // Sem Telegram configurado — cai para email como alternativa.
    const resultado = await enviarEmail({
      assunto: `Resumo do dia — ${resumo.dia}`,
      texto: `${texto}\n\n(Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no Railway para receber isso automaticamente pelo Telegram, sem precisar abrir o email.)`,
    });

    if (resultado.enviado) {
      console.log('✅ Resumo diário enviado por email com sucesso.');
    } else {
      console.warn(`⚠️  Resumo gerado, mas não enviado: ${resultado.motivo}`);
    }
  } catch (erro) {
    console.error('❌ Erro ao gerar resumo diário:', erro);
  }
}

module.exports = { rodarResumoDiario, montarResumoDoDia };
