// src/tarefas/resumoDiario.js

const { db } = require('../db/database');
const { enviarEmail } = require('../servicos/email');
const { enviarTelegram, telegramDisponivel } = require('../servicos/telegram');
const { montarMensagensTelegram, montarTextoEmail } = require('../servicos/formatarResumoTelegram');

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

function somaValores(lista, campo = 'valor') {
  return lista.reduce((soma, item) => soma + Number(item[campo] || 0), 0);
}

function primeiroValor(...valores) {
  return valores.map((valor) => String(valor ?? '').trim()).find(Boolean) || '';
}

function agendaFonadaDoDia(fonadas, hojeChave) {
  return fonadas.flatMap((pedido) => [1, 2].flatMap((mensagem) => {
    const prefixo = `p${mensagem}`;
    const data = pedido[`${prefixo}_dia`];
    if (paraChaveComparavel(data) !== hojeChave) return [];
    return [{
      tipo: 'FONADA',
      os: pedido.senha_os || pedido.id,
      mensagem,
      data,
      horario: pedido[`${prefixo}_horario`],
      cliente: pedido.nome_comprador,
      destinatario: pedido[`${prefixo}_para`],
      tema: pedido[`${prefixo}_tema`],
      telefone: primeiroValor(pedido[`${prefixo}_celular`], pedido[`${prefixo}_fixo`], pedido.comprador_whatsapp, pedido.comprador_celular),
      responsavel: pedido[`${prefixo}_quem_oferece`],
      status: primeiroValor(pedido[`${prefixo}_resultado`], 'Agendada'),
      pagou: pedido.pagou,
      formaPagamento: primeiroValor(pedido.pagou === 'SIM' ? pedido.recebi : '', pedido.periodo),
      dataPagamento: pedido.data_pagamento,
      dataCobranca: pedido.cobranca,
    }];
  }));
}

function agendaAoVivoDoDia(pedidos, hojeChave) {
  return pedidos.filter((pedido) => paraChaveComparavel(pedido.dia_entrega) === hojeChave).map((pedido) => ({
    tipo: 'AO VIVO',
    os: pedido.numero_os || pedido.id,
    data: pedido.dia_entrega,
    horario: pedido.horario_entrega,
    cliente: pedido.comprador,
    destinatario: pedido.para,
    tema: [pedido.tema_1, pedido.tema_2, pedido.tema_3, pedido.tema_4].filter(Boolean).join(' · '),
    telefone: primeiroValor(pedido.celular, pedido.celular2, pedido.celular_local, pedido.fixo_local),
    responsavel: pedido.oferecimento,
    status: primeiroValor(pedido.resultado_entrega, 'Agendada'),
    pagou: pedido.pagou,
    formaPagamento: primeiroValor(pedido.pagou === 'SIM' ? pedido.forma_recebimento : '', pedido.pagamento),
    dataPagamento: pedido.data_pagou,
    dataCobranca: pedido.data_cobranca,
    observacoes: pedido.observacoes,
  }));
}

async function montarResumoDoDia() {
  const hoje = hojeBr(); // Troque por 'DD/MM/AA' se for fazer testes
  const hojeChave = paraChaveComparavel(hoje);

  const [fonadasResultado, aoVivoResultado] = await Promise.all([
    db.query(`
      SELECT id, senha_os, nome_comprador, data_pedido, comprador_whatsapp, comprador_celular,
             p1_dia, p1_horario, p1_para, p1_tema, p1_fixo, p1_celular, p1_quem_oferece, p1_resultado,
             p2_dia, p2_horario, p2_para, p2_tema, p2_fixo, p2_celular, p2_quem_oferece, p2_resultado,
             valor, cobranca, periodo, pagou, recebi, data_pagamento
      FROM fonadas WHERE excluido_em IS NULL
    `),
    db.query(`
      SELECT id, numero_os, comprador, para, oferecimento, data_pedido, dia_entrega, horario_entrega,
             celular, celular2, celular_local, fixo_local, tema_1, tema_2, tema_3, tema_4, observacoes,
             valor, pagamento, pagou, data_pagou, data_cobranca, valor_recebido,
             forma_recebimento, resultado_entrega, entregue_por
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
    valorVendido: somaValores(fonadasVendidasHoje),
    quantidadeRecebida: fonadasRecebidasHoje.length,
    valorRecebido: somaValores(fonadasRecebidasHoje),
    quantidadePendente: fonadasPendentesHoje.length,
    valorPendente: somaValores(fonadasPendentesHoje),
  };

  // --- AO VIVO ---
  const aoVivo = aoVivoResultado.rows;

  // Vendido: pedidos criados hoje
  const aoVivoVendidasHoje = aoVivo.filter((l) => paraChaveComparavel(l.data_pedido) === hojeChave);

  const aoVivoRecebidasHoje = aoVivo.filter((l) =>
    l.pagou === 'SIM' && paraChaveComparavel(l.data_pagou) === hojeChave
  );

  // Pendentes de hoje: pedidos criados hoje que ainda não foram recebidos
  const aoVivoPendentesHoje = aoVivoVendidasHoje.filter((l) => l.pagou !== 'SIM');

  const resumoAoVivo = {
    quantidadeVendida: aoVivoVendidasHoje.length,
    valorVendido: somaValores(aoVivoVendidasHoje),
    quantidadeRecebida: aoVivoRecebidasHoje.length,
    valorRecebido: aoVivoRecebidasHoje.reduce((soma, l) => soma + Number(l.valor_recebido ?? l.valor ?? 0), 0),
    quantidadePendente: aoVivoPendentesHoje.length,
    valorPendente: somaValores(aoVivoPendentesHoje),
  };

  return {
    dia: hoje,
    fonada: resumoFonada,
    aoVivo: resumoAoVivo,
    agenda: {
      fonadas: agendaFonadaDoDia(fonadas, hojeChave),
      aoVivo: agendaAoVivoDoDia(aoVivo, hojeChave),
    },
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

    if (telegramDisponivel()) {
      const mensagens = montarMensagensTelegram(resumo);
      let mensagensEnviadas = 0;
      for (const mensagem of mensagens) {
        const resultado = await enviarTelegram(mensagem);
        if (!resultado.enviado) {
          console.warn(`⚠️  Resumo gerado, mas não enviado por Telegram: ${resultado.motivo}`);
          return;
        }
        mensagensEnviadas += resultado.mensagens || 1;
      }
      console.log(`✅ Resumo diário enviado por Telegram com sucesso (${mensagensEnviadas} mensagem(ns)).`);
      return;
    }

    const resultado = await enviarEmail({
      assunto: `Resumo do dia — ${resumo.dia}`,
      texto: `${montarTextoEmail(resumo)}\n\nConfigure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no Railway para receber este resumo automaticamente pelo Telegram.`,
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
