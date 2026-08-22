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
        SELECT id, valor, dia_entrega, comprador, numero_os, pagamento, pagou, data_pagou
        FROM ao_vivo
        WHERE excluido_em IS NULL
      `);

      // Pagamento a PRAZO só conta como recebido de verdade quando
      // pagou = 'SIM' — antes disso é só uma previsão de cobrança, não
      // um recebimento. Por isso entra no relatório pela data em que
      // foi efetivamente marcado como recebido (data_pagou), não pela
      // data de entrega da mensagem. Pagamento à vista (qualquer outra
      // forma) continua entrando pela data de entrega, como sempre foi.
      const ehPrazo = (pagamento) => String(pagamento || '').startsWith('PRAZO');
      const linhasAVista = aoVivoResultado.rows.filter((l) => !ehPrazo(l.pagamento));
      const linhasPrazoRecebidas = aoVivoResultado.rows.filter((l) => ehPrazo(l.pagamento) && l.pagou === 'SIM');

      const noPeriodoAVista = filtrarPorIntervalo(linhasAVista, 'dia_entrega', inicio, fim);
      const noPeriodoPrazo = filtrarPorIntervalo(linhasPrazoRecebidas, 'data_pagou', inicio, fim);
      const noPeriodo = [...noPeriodoAVista, ...noPeriodoPrazo];

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

// GET /api/relatorios/desempenho?inicio=dd/mm/aa&fim=dd/mm/aa&sistema=FONADA|AOVIVO|TODOS
//
// Desempenho por funcionário: quantas mensagens de Fonada cada um
// passou no período, quantos pedidos vendeu (Fonada e Ao Vivo,
// separados), e o valor vendido em cada sistema. Só considera pedidos
// criados a partir de quando os campos vendedor_usuario/passada_por
// passaram a existir — pedidos antigos não aparecem aqui.
router.get('/desempenho', async (req, res) => {
  try {
    const { inicio, fim } = resolverIntervalo(
      (req.query.inicio || '').trim(),
      (req.query.fim || '').trim()
    );
    const sistema = (req.query.sistema || 'TODOS').trim().toUpperCase();

    // Mapa por nome de usuário -> acumulador de métricas.
    const porFuncionario = {};
    function acumulador(nome) {
      if (!nome) return null;
      if (!porFuncionario[nome]) {
        porFuncionario[nome] = {
          usuario: nome,
          vendasFonada: 0, valorVendidoFonada: 0,
          vendasAoVivo: 0, valorVendidoAoVivo: 0,
          mensagensPassadasFonada: 0,
        };
      }
      return porFuncionario[nome];
    }

    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const fonadasResultado = await db.query(`
        SELECT valor, data_pedido, vendedor_usuario,
               p1_dia, p1_resultado, p1_passada_por,
               p2_dia, p2_resultado, p2_passada_por
        FROM fonadas WHERE excluido_em IS NULL
      `);

      // Vendas: conta pelo dia do PEDIDO (quando foi vendido).
      const vendidasNoPeriodo = filtrarPorIntervalo(fonadasResultado.rows, 'data_pedido', inicio, fim);
      for (const l of vendidasNoPeriodo) {
        const acc = acumulador(l.vendedor_usuario);
        if (acc) {
          acc.vendasFonada += 1;
          acc.valorVendidoFonada += l.valor || 0;
        }
      }

      // Mensagens passadas: cada mensagem (p1/p2) conta separadamente,
      // pelo dia em que ela estava marcada (p1_dia/p2_dia) — não pelo
      // dia do pedido, já que a mensagem pode ser passada bem depois
      // da venda.
      const linhasP1 = fonadasResultado.rows
        .filter((l) => l.p1_resultado && l.p1_passada_por)
        .map((l) => ({ dia: l.p1_dia, passada_por: l.p1_passada_por }));
      const linhasP2 = fonadasResultado.rows
        .filter((l) => l.p2_resultado && l.p2_passada_por)
        .map((l) => ({ dia: l.p2_dia, passada_por: l.p2_passada_por }));

      for (const l of filtrarPorIntervalo(linhasP1, 'dia', inicio, fim)) {
        const acc = acumulador(l.passada_por);
        if (acc) acc.mensagensPassadasFonada += 1;
      }
      for (const l of filtrarPorIntervalo(linhasP2, 'dia', inicio, fim)) {
        const acc = acumulador(l.passada_por);
        if (acc) acc.mensagensPassadasFonada += 1;
      }
    }

    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const aoVivoResultado = await db.query(`
        SELECT valor, data_pedido, vendedor_usuario
        FROM ao_vivo WHERE excluido_em IS NULL
      `);

      const vendidosNoPeriodo = filtrarPorIntervalo(aoVivoResultado.rows, 'data_pedido', inicio, fim);
      for (const l of vendidosNoPeriodo) {
        const acc = acumulador(l.vendedor_usuario);
        if (acc) {
          acc.vendasAoVivo += 1;
          acc.valorVendidoAoVivo += l.valor || 0;
        }
      }
    }

    const funcionarios = Object.values(porFuncionario)
      .map((f) => ({
        ...f,
        vendasTotal: f.vendasFonada + f.vendasAoVivo,
        valorVendidoTotal: f.valorVendidoFonada + f.valorVendidoAoVivo,
      }))
      .sort((a, b) => b.valorVendidoTotal - a.valorVendidoTotal);

    res.json({ inicio, fim, sistema, funcionarios });
  } catch (erro) {
    console.error('Erro ao gerar relatório de desempenho:', erro);
    res.status(500).json({ erro: 'Erro ao gerar relatório de desempenho.' });
  }
});

module.exports = router;
