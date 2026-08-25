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
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(new Date());

  const dia = partes.find((p) => p.type === 'day').value;
  const mes = partes.find((p) => p.type === 'month').value;
  const ano = partes.find((p) => p.type === 'year').value;

  return `${dia}/${mes}/${ano}`;
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
      SELECT valor, data_pedido, dia_entrega, pagou, data_pagou
      FROM ao_vivo WHERE excluido_em IS NULL
    `),
  ]);

  const fonadas = fonadasResultado.rows.map((l) => ({
    ...l,
    dataRef: l.data_pedido,
    dataPago: l.data_pagamento,
  }));

  const aoVivo = aoVivoResultado.rows.map((l) => ({
    ...l,
    dataRef: l.dia_entrega,
    dataPago: l.data_pagou,
  }));

  function resumirGrupo(linhas) {
    const vendidasHoje = linhas.filter((l) => paraChaveComparavel(l.dataRef) === hojeChave);
    const valorVendido = vendidasHoje.reduce((soma, l) => soma + (l.valor || 0), 0);

    const recebidasHoje = linhas.filter((l) => paraChaveComparavel(l.dataPago) === hojeChave && l.pagou === 'SIM');
    const valorRecebido = recebidasHoje.reduce((soma, l) => soma + (l.valor || 0), 0);

    const pendentesHoje = vendidasHoje.filter((l) => l.pagou !== 'SIM');
    const valorPendente = pendentesHoje.reduce((soma, l) => soma + (l.valor || 0), 0);

    return {
      quantidadeVendida: vendidasHoje.length,
      valorVendido,
      quantidadeRecebida: recebidasHoje.length,
      valorRecebido,
      quantidadePendente: pendentesHoje.length,
      valorPendente,
    };
  }

  const resumoFonada = resumirGrupo(fonadas);
  const resumoAoVivo = resumirGrupo(aoVivo);

  return {
    dia: hoje,
    fonada: resumoFonada,
    aoVivo: resumoAoVivo,
    total: {
      quantidadeVendida: resumoFonada.quantidadeVendida + resumoAoVivo.quantidadeVendida,
      valorVendido: resumoFonada.valorVendido + resumoAoVivo.valorVendido,
      quantidadeRecebida: resumoFonada.quantidadeRecebida + resumoAoVivo.quantidadeRecebida,
      valorRecebido: resumoFonada.valorRecebido + resumoAoVivo.valorRecebido,
      quantidadePendente: resumoFonada.quantidadePendente + resumoAoVivo.quantidadePendente,
      valorPendente: resumoFonada.valorPendente + resumoAoVivo.valorPendente,
    },
  };
}

async function rodarResumoDiario() {
  console.log('📊 Gerando resumo diário...');
  try {
    const resumo = await montarResumoDoDia();
    const { fonada, aoVivo, total } = resumo;

    const texto =
      `📋 Resumo do dia ${resumo.dia} — Pombo-Correio\n\n` +
      `💰 Vendido\n` +
      `Fonada: ${fonada.quantidadeVendida} pedido(s), ${formatarReais(fonada.valorVendido)}\n` +
      `Ao vivo: ${aoVivo.quantidadeVendida} pedido(s), ${formatarReais(aoVivo.valorVendido)}\n` +
      `Total: ${total.quantidadeVendida} pedido(s), ${formatarReais(total.valorVendido)}\n\n` +
      `✅ Recebido\n` +
      `Fonada: ${fonada.quantidadeRecebida} pagamento(s), ${formatarReais(fonada.valorRecebido)}\n` +
      `Ao vivo: ${aoVivo.quantidadeRecebida} pagamento(s), ${formatarReais(aoVivo.valorRecebido)}\n` +
      `Total: ${total.quantidadeRecebida} pagamento(s), ${formatarReais(total.valorRecebido)}\n\n` +
      `⏳ Pendente de hoje\n` +
      `Fonada: ${fonada.quantidadePendente} pedido(s), ${formatarReais(fonada.valorPendente)}\n` +
      `Ao vivo: ${aoVivo.quantidadePendente} pedido(s), ${formatarReais(aoVivo.valorPendente)}\n` +
      `Total: ${total.quantidadePendente} pedido(s), ${formatarReais(total.valorPendente)}`;

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