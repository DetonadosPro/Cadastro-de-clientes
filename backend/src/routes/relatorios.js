// src/routes/relatorios.js
// Relatórios financeiros por período — a lógica de filtro por data
// continua em JavaScript (não em SQL), então a migração para
// PostgreSQL aqui é simples: só troca db.prepare(...).all() por
// await db.query(...), sem precisar de placeholders novos (essas
// consultas não recebem parâmetros).

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

function calcularPercentual(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

function resolverIntervalo(inicio, fim) {
  if (inicio && !fim) return { inicio, fim: inicio };
  return { inicio, fim };
}

// GET /api/relatorios/vendas?inicio=dd/mm/aa&fim=dd/mm/aa&sistema=FONADA|AOVIVO|TODOS
router.get('/vendas', async (req, res) => {
  try {
    const { inicio, fim } = resolverIntervalo(
      (req.query.inicio || '').trim(),
      (req.query.fim || '').trim()
    );
    const sistema = (req.query.sistema || 'TODOS').trim().toUpperCase();
    // A tabela detalhada por pessoa só faz sentido para um dia único —
    // num período de vários dias a lista ficaria longa demais para
    // ser útil aqui (o relatório já mostra os agregados nesse caso).
    const diaUnico = Boolean(inicio) && inicio === fim;

    let resumoFonada = null;
    let resumoAoVivo = null;
    const itensDetalhados = [];

    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const fonadasResultado = await db.query(`
        SELECT id, valor, periodo, data_pedido, recall, nome_comprador, senha_os FROM fonadas WHERE excluido_em IS NULL
      `);
      const noPeriodo = filtrarPorIntervalo(fonadasResultado.rows, 'data_pedido', inicio, fim);
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

      if (diaUnico) {
        for (const l of noPeriodo) {
          itensDetalhados.push({
            id: l.id, sistema: 'FONADA', os: l.senha_os || l.id,
            nome: l.nome_comprador || '—', valor: l.valor || 0,
            forma: formaPagamento(l.periodo),
          });
        }
      }
    }

    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const aoVivoResultado = await db.query(`
        SELECT id, valor, data_pedido, comprador, numero_os, pagamento FROM ao_vivo WHERE excluido_em IS NULL
      `);
      const noPeriodo = filtrarPorIntervalo(aoVivoResultado.rows, 'data_pedido', inicio, fim);
      resumoAoVivo = {
        quantidade: noPeriodo.length,
        valorTotal: noPeriodo.reduce((soma, l) => soma + (l.valor || 0), 0),
      };

      if (diaUnico) {
        for (const l of noPeriodo) {
          itensDetalhados.push({
            id: l.id, sistema: 'AOVIVO', os: l.numero_os || l.id,
            nome: l.comprador || '—', valor: l.valor || 0,
            forma: formaPagamento(l.pagamento),
          });
        }
      }
    }

    const quantidade = (resumoFonada?.quantidade || 0) + (resumoAoVivo?.quantidade || 0);
    const valorTotal = (resumoFonada?.valorTotal || 0) + (resumoAoVivo?.valorTotal || 0);

    res.json({
      inicio, fim, sistema,
      fonada: resumoFonada,
      aoVivo: resumoAoVivo,
      geral: { quantidade, valorTotal },
      itens: diaUnico ? itensDetalhados : null,
    });
  } catch (erro) {
    console.error('Erro ao gerar relatório de vendas:', erro);
    res.status(500).json({ erro: 'Erro ao gerar relatório de vendas.' });
  }
});

// GET /api/relatorios/recebimentos?inicio=dd/mm/aa&fim=dd/mm/aa&sistema=FONADA|AOVIVO|TODOS
router.get('/recebimentos', async (req, res) => {
  try {
    const { inicio, fim } = resolverIntervalo(
      (req.query.inicio || '').trim(),
      (req.query.fim || '').trim()
    );
    const sistema = (req.query.sistema || 'TODOS').trim().toUpperCase();
    const diaUnico = Boolean(inicio) && inicio === fim;

    let fonadaResumo = null;
    let aoVivoResumo = null;
    const itensDetalhados = [];

    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const fonadasResultado = await db.query(`
        SELECT id, valor, periodo, data_pagamento, pagou, nome_comprador, senha_os
        FROM fonadas
        WHERE excluido_em IS NULL AND pagou = 'SIM' AND data_pagamento IS NOT NULL
      `);
      const noPeriodo = filtrarPorIntervalo(fonadasResultado.rows, 'data_pagamento', inicio, fim);
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

      if (diaUnico) {
        for (const l of noPeriodo) {
          itensDetalhados.push({
            id: l.id, sistema: 'FONADA', os: l.senha_os || l.id,
            nome: l.nome_comprador || '—', valor: l.valor || 0,
            forma: formaPagamento(l.periodo),
          });
        }
      }
    }

    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const aoVivoResultado = await db.query(`
        SELECT id, valor, dia_entrega, comprador, numero_os, pagamento
        FROM ao_vivo
        WHERE excluido_em IS NULL AND dia_entrega IS NOT NULL
      `);
      const noPeriodo = filtrarPorIntervalo(aoVivoResultado.rows, 'dia_entrega', inicio, fim);
      aoVivoResumo = {
        quantidade: noPeriodo.length,
        valorTotal: noPeriodo.reduce((soma, l) => soma + (l.valor || 0), 0),
      };

      if (diaUnico) {
        for (const l of noPeriodo) {
          itensDetalhados.push({
            id: l.id, sistema: 'AOVIVO', os: l.numero_os || l.id,
            nome: l.comprador || '—', valor: l.valor || 0,
            forma: formaPagamento(l.pagamento),
          });
        }
      }
    }

    const quantidade = (fonadaResumo?.quantidade || 0) + (aoVivoResumo?.quantidade || 0);
    const valorTotal = (fonadaResumo?.valorTotal || 0) + (aoVivoResumo?.valorTotal || 0);
    const totalPix = fonadaResumo?.totalPix || 0;
    const totalRecibo = fonadaResumo?.totalRecibo || 0;

    let valorVendido = 0;
    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const fonadasVendidasResultado = await db.query(`
        SELECT valor, data_pedido FROM fonadas WHERE excluido_em IS NULL
      `);
      valorVendido += filtrarPorIntervalo(fonadasVendidasResultado.rows, 'data_pedido', inicio, fim)
        .reduce((soma, l) => soma + (l.valor || 0), 0);
    }
    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const aoVivoVendidoResultado = await db.query(`
        SELECT valor, data_pedido FROM ao_vivo WHERE excluido_em IS NULL
      `);
      valorVendido += filtrarPorIntervalo(aoVivoVendidoResultado.rows, 'data_pedido', inicio, fim)
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
      itens: diaUnico ? itensDetalhados : null,
    });
  } catch (erro) {
    console.error('Erro ao gerar relatório de recebimentos:', erro);
    res.status(500).json({ erro: 'Erro ao gerar relatório de recebimentos.' });
  }
});

module.exports = router;
