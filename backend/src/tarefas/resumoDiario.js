// src/tarefas/resumoDiario.js

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
  const hoje = hojeBr(); // Para testar outra data, altere para 'DD/MM/AA'
  const hojeChave = paraChaveComparavel(hoje);

  const [fonadasResultado, aoVivoResultado] = await Promise.all([
    db.query(`
      SELECT valor, data_pedido, pagou, data_pagamento
      FROM fonadas WHERE excluido_em IS NULL
    `),
    db.query(`
      SELECT valor, data_pedido, dia_entrega, pagamento, pagou, data_pagou
      FROM ao_vivo WHERE excluido_em IS NULL
    `),
  ]);

  // --- FONADA ---
  const fonadas = fonadasResultado.rows;
  const fonadasVendidasHoje = fonadas.filter((l) => paraChaveComparavel(l.data_pedido) === hojeChave);
  const fonadasRecebidasHoje = fonadas.filter((l) => paraChaveComparavel(l.data_pagamento) === hojeChave && l.pagou === 'SIM');
  const fonadasPendentesHoje = fonadasVendidasHoje.filter((l) => l.pagou !== 'SIM');

  const resumoFonada = {
    quantidadeVendida: fonadasVendidasHoje.length,
    valorVendido: fonadasVendidasHoje.reduce((soma, l) => soma + (l.valor || 0), 0),
    quantidadeRecebida: fonadasRecebidasHoje.length,
    valorRecebido: fonadasRecebidasHoje.reduce((soma, l) => soma + (l.valor || 0), 0),
    quantidadePendente: fonadasPendentesHoje.length,
    valorPendente: fonadasPendentesHoje.reduce((soma, l) => soma + (l.valor || 0), 0),
  };

  // --- AO VIVO ---
  const ehPrazo = (pagamento) => String(pagamento || '').startsWith('PRAZO');
  const aoVivo = aoVivoResultado.rows;

  // Vendido: pedidos feitos hoje
  const aoVivoVendidasHoje = aoVivo.filter((l) => paraChaveComparavel(l.data_pedido) === hojeChave);

  // Recebido:
  // - Se à vista: entra no dia da entrega (dia_entrega)
  // - Se a prazo: entra apenas quando pagou = 'SIM', pela data de pagamento (data_pagou)
  const aoVivoRecebidasHoje = aoVivo.filter((l) => {
    if (!ehPrazo(l.pagamento)) {
      return paraChaveComparavel(l.dia_entrega) === hojeChave;
    }
    return l.pagou === 'SIM' && paraChaveComparavel(l.data_pagou) === hojeChave;
  });

  // Pendentes de hoje: pedidos feitos hoje que ainda não foram recebidos
  const aoVivoPendentesHoje = aoVivoVendidasHoje.filter((l) => {
    if (!ehPrazo(l.pagamento)) {
      // À vista: se o dia de entrega ainda não foi hoje ou se não foi concluído
      return paraChaveComparavel(l.dia_entrega) !== hojeChave;
    }
    return l.pagou !== 'SIM';
  });

  const resumoAoVivo = {
    quantidadeVendida: aoVivoVendidasHoje.length,
    valorVendido: aoVivoVendidasHoje.reduce((soma, l) => soma + (l.valor || 0), 0),
    quantidadeRecebida: aoVivoRecebidasHoje.length,
    valorRecebido: aoVivoRecebidasHoje.reduce((soma, l) => soma + (l.valor || 0), 0),
    quantidadePendente: aoVivoPendentesHoje.length,
    valorPendente: aoVivoPendentesHoje.reduce((soma, l) => soma + (l.valor || 0), 0),
  };

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