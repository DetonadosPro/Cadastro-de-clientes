// src/routes/relatorios.js
// Relatórios financeiros por período:
//   - Vendas: quantidade e valor de pedidos CRIADOS no período (data_pedido),
//     nos dois sistemas (fonada + ao vivo), com quebra PIX/Recibo.
//   - Recebimentos: valor efetivamente registrado como pago no período
//     (data_pagamento, preenchida ao dar baixa na Cobrança) — só fonada,
//     já que ao vivo não tem esse fluxo de baixa.
//
// Datas são guardadas como texto "dd/mm/aa" ou "dd/mm/aaaa". Comparar
// essas strings diretamente não dá a ordem cronológica certa, então
// tudo é convertido para "aaaa-mm-dd" antes de comparar.

const express = require('express');
const { db } = require('../db/database');

const router = express.Router();

function paraChaveComparavel(dataBr) {
  if (!dataBr) return null;
  const m = String(dataBr).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let [, dd, mm, aa] = m;
  const ano = aa.length === 2 ? `20${aa}` : aa;
  return `${ano}-${mm}-${dd}`;
}

function filtrarPorIntervalo(linhas, campoData, inicioBr, fimBr) {
  const inicioChave = paraChaveComparavel(inicioBr);
  const fimChave = paraChaveComparavel(fimBr);
  return linhas.filter((linha) => {
    const chave = paraChaveComparavel(linha[campoData]);
    if (!chave) return false;
    if (inicioChave && chave < inicioChave) return false;
    if (fimChave && chave > fimChave) return false;
    return true;
  });
}

function formaPagamento(periodo) {
  return (periodo || '').trim().toUpperCase() === 'PIX' ? 'PIX' : 'RECIBO';
}

// Calcula a porcentagem de "parte" em relação a "total", arredondada em
// 1 casa decimal. Retorna 0 quando o total é zero (evita divisão por
// zero, que geraria NaN e quebraria a exibição no frontend).
function calcularPercentual(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

// Se só a data inicial for informada (sem data final), entende-se que a
// pessoa quer ver apenas aquele dia específico — a data final vira igual
// à inicial.
function resolverIntervalo(inicio, fim) {
  if (inicio && !fim) return { inicio, fim: inicio };
  return { inicio, fim };
}

// GET /api/relatorios/vendas?inicio=dd/mm/aa&fim=dd/mm/aa&sistema=FONADA|AOVIVO|TODOS
router.get('/vendas', (req, res) => {
  const { inicio, fim } = resolverIntervalo(
    (req.query.inicio || '').trim(),
    (req.query.fim || '').trim()
  );
  const sistema = (req.query.sistema || 'TODOS').trim().toUpperCase();

  let resumoFonada = null;
  let resumoAoVivo = null;

  if (sistema === 'FONADA' || sistema === 'TODOS') {
    const fonadas = db.prepare(`
      SELECT id, valor, periodo, data_pedido, recall FROM fonadas WHERE excluido_em IS NULL
    `).all();
    const noPeriodo = filtrarPorIntervalo(fonadas, 'data_pedido', inicio, fim);
    // Fonada tem quebra PIX/Recibo (via campo "período"); Ao Vivo não tem
    // essa distinção — entra só com quantidade e valor total.
    const totalPix = noPeriodo.filter((l) => formaPagamento(l.periodo) === 'PIX').length;
    const totalRecibo = noPeriodo.length - totalPix;
    const totalRecall = noPeriodo.filter((l) => (l.recall || '').trim().toUpperCase() === 'SIM').length;
    const totalOutros = noPeriodo.length - totalRecall;

    resumoFonada = {
      quantidade: noPeriodo.length,
      totalPix,
      totalRecibo,
      percentualPix: calcularPercentual(totalPix, noPeriodo.length),
      percentualRecibo: calcularPercentual(totalRecibo, noPeriodo.length),
      totalRecall,
      totalOutros,
      percentualRecall: calcularPercentual(totalRecall, noPeriodo.length),
      percentualOutros: calcularPercentual(totalOutros, noPeriodo.length),
      valorTotal: noPeriodo.reduce((soma, l) => soma + (l.valor || 0), 0),
    };
  }

  if (sistema === 'AOVIVO' || sistema === 'TODOS') {
    const aoVivo = db.prepare(`
      SELECT id, valor, data_pedido FROM ao_vivo WHERE excluido_em IS NULL
    `).all();
    const noPeriodo = filtrarPorIntervalo(aoVivo, 'data_pedido', inicio, fim);
    resumoAoVivo = {
      quantidade: noPeriodo.length,
      valorTotal: noPeriodo.reduce((soma, l) => soma + (l.valor || 0), 0),
    };
  }

  const quantidade = (resumoFonada?.quantidade || 0) + (resumoAoVivo?.quantidade || 0);
  const valorTotal = (resumoFonada?.valorTotal || 0) + (resumoAoVivo?.valorTotal || 0);

  res.json({
    inicio, fim, sistema,
    fonada: resumoFonada,
    aoVivo: resumoAoVivo,
    geral: { quantidade, valorTotal },
  });
});

// GET /api/relatorios/recebimentos?inicio=dd/mm/aa&fim=dd/mm/aa&sistema=FONADA|AOVIVO|TODOS
// Fonada usa a data em que o pagamento foi registrado na Cobrança
// (data_pagamento). Ao Vivo não tem esse fluxo de baixa — usa a data de
// entrega (dia_entrega, quando o carro de som efetivamente tocou) como
// referência de recebimento. Cada sistema usa sua própria data dentro do
// mesmo intervalo escolhido.
router.get('/recebimentos', (req, res) => {
  const { inicio, fim } = resolverIntervalo(
    (req.query.inicio || '').trim(),
    (req.query.fim || '').trim()
  );
  const sistema = (req.query.sistema || 'TODOS').trim().toUpperCase();

  let fonadaResumo = null;
  let aoVivoResumo = null;

  if (sistema === 'FONADA' || sistema === 'TODOS') {
    const fonadas = db.prepare(`
      SELECT id, valor, periodo, data_pagamento, pagou
      FROM fonadas
      WHERE excluido_em IS NULL AND pagou = 'SIM' AND data_pagamento IS NOT NULL
    `).all();
    const noPeriodo = filtrarPorIntervalo(fonadas, 'data_pagamento', inicio, fim);
    const totalPix = noPeriodo.filter((l) => formaPagamento(l.periodo) === 'PIX').length;
    const totalRecibo = noPeriodo.length - totalPix;
    fonadaResumo = {
      quantidade: noPeriodo.length,
      totalPix,
      totalRecibo,
      percentualPix: calcularPercentual(totalPix, noPeriodo.length),
      percentualRecibo: calcularPercentual(totalRecibo, noPeriodo.length),
      valorTotal: noPeriodo.reduce((soma, l) => soma + (l.valor || 0), 0),
    };
  }

  if (sistema === 'AOVIVO' || sistema === 'TODOS') {
    const aoVivo = db.prepare(`
      SELECT id, valor, dia_entrega
      FROM ao_vivo
      WHERE excluido_em IS NULL AND dia_entrega IS NOT NULL
    `).all();
    const noPeriodo = filtrarPorIntervalo(aoVivo, 'dia_entrega', inicio, fim);
    aoVivoResumo = {
      quantidade: noPeriodo.length,
      valorTotal: noPeriodo.reduce((soma, l) => soma + (l.valor || 0), 0),
    };
  }

  const quantidade = (fonadaResumo?.quantidade || 0) + (aoVivoResumo?.quantidade || 0);
  const valorTotal = (fonadaResumo?.valorTotal || 0) + (aoVivoResumo?.valorTotal || 0);
  const totalPix = fonadaResumo?.totalPix || 0;
  const totalRecibo = fonadaResumo?.totalRecibo || 0;

  // "Vendido no mesmo período": usa a data do PEDIDO (não a de pagamento/
  // entrega), respeitando o mesmo filtro de sistema, para calcular a
  // diferença vendido - recebido — uma referência de quanto ainda falta
  // "bater" com o que entrou de fato, mesmo sendo datas conceitualmente
  // diferentes.
  let valorVendido = 0;
  if (sistema === 'FONADA' || sistema === 'TODOS') {
    const fonadasVendidas = db.prepare(`
      SELECT valor, data_pedido FROM fonadas WHERE excluido_em IS NULL
    `).all();
    valorVendido += filtrarPorIntervalo(fonadasVendidas, 'data_pedido', inicio, fim)
      .reduce((soma, l) => soma + (l.valor || 0), 0);
  }
  if (sistema === 'AOVIVO' || sistema === 'TODOS') {
    const aoVivoVendido = db.prepare(`
      SELECT valor, data_pedido FROM ao_vivo WHERE excluido_em IS NULL
    `).all();
    valorVendido += filtrarPorIntervalo(aoVivoVendido, 'data_pedido', inicio, fim)
      .reduce((soma, l) => soma + (l.valor || 0), 0);
  }
  const diferencaVendidoRecebido = valorVendido - valorTotal;

  res.json({
    inicio, fim, sistema,
    quantidade, valorTotal, totalPix, totalRecibo,
    valorVendido,
    diferencaVendidoRecebido,
    fonada: fonadaResumo,
    aoVivo: aoVivoResumo,
  });
});

module.exports = router;
