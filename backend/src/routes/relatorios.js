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
  const texto = String(periodo || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (texto.includes('PIX')) return 'PIX';
  if (texto.includes('DEPOSITO')) return 'DEPÓSITO';
  return 'PRESENCIAL';
}

function calcularPercentual(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

function valorNumero(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function calcularTicketMedio(valor, quantidade) {
  return quantidade ? valorNumero(valor) / quantidade : 0;
}

function ehPrazoAoVivo(pagamento) {
  return String(pagamento || '').trim().toUpperCase().startsWith('PRAZO');
}

function formaPagamentoAoVivo(pagamento) {
  const texto = String(pagamento || '').trim();
  return texto ? texto.split(/[\s-]+/)[0].toUpperCase() : 'NÃO INFORMADO';
}

function statusPagamento(valor) {
  return String(valor || '').trim().toUpperCase() === 'SIM' ? 'SIM' : 'NAO';
}

function prepararItens(itens) {
  const LIMITE = 200;
  const ordenados = [...itens].sort((a, b) => {
    const porData = String(paraChaveComparavel(b.data) || '').localeCompare(
      String(paraChaveComparavel(a.data) || '')
    );
    return porData || valorNumero(b.id) - valorNumero(a.id);
  });
  return {
    itens: ordenados.slice(0, LIMITE),
    itensLimitados: itens.length > LIMITE,
  };
}

function resolverIntervalo(inicio, fim) {
  if (inicio && !fim) return { inicio, fim: inicio };
  return { inicio, fim };
}

function dataBrParaUtc(dataBr) {
  const chave = paraChaveComparavel(dataBr);
  if (!chave) return null;
  const [ano, mes, dia] = chave.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function utcParaDataBr(data) {
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${String(data.getUTCFullYear()).slice(-2)}`;
}

function resolverPeriodoAnterior(inicio, fim) {
  const dataInicio = dataBrParaUtc(inicio);
  const dataFim = dataBrParaUtc(fim || inicio);
  if (!dataInicio || !dataFim || dataFim < dataInicio) return null;

  let inicioAnterior;
  let fimAnterior;
  if (dataInicio.getUTCDate() === 1) {
    inicioAnterior = new Date(Date.UTC(dataInicio.getUTCFullYear(), dataInicio.getUTCMonth() - 1, 1));
    const ultimoDiaAnterior = new Date(Date.UTC(dataInicio.getUTCFullYear(), dataInicio.getUTCMonth(), 0)).getUTCDate();
    fimAnterior = new Date(Date.UTC(
      inicioAnterior.getUTCFullYear(),
      inicioAnterior.getUTCMonth(),
      Math.min(dataFim.getUTCDate(), ultimoDiaAnterior)
    ));
  } else {
    const duracaoDias = Math.round((dataFim - dataInicio) / 86400000) + 1;
    fimAnterior = new Date(dataInicio.getTime() - 86400000);
    inicioAnterior = new Date(fimAnterior.getTime() - ((duracaoDias - 1) * 86400000));
  }

  return { inicio: utcParaDataBr(inicioAnterior), fim: utcParaDataBr(fimAnterior) };
}

function montarComparacao(valorAtual, valorAnterior, periodoAnterior) {
  const atual = valorNumero(valorAtual);
  const anterior = valorNumero(valorAnterior);
  const diferenca = atual - anterior;
  return {
    ...periodoAnterior,
    valorAtual: atual,
    valorAnterior: anterior,
    diferenca,
    percentual: anterior ? Math.round((diferenca / anterior) * 1000) / 10 : null,
    direcao: diferenca > 0 ? 'ALTA' : diferenca < 0 ? 'QUEDA' : 'ESTAVEL',
  };
}

// GET /api/relatorios/vendas?inicio=dd/mm/aa&fim=dd/mm/aa&sistema=FONADA|AOVIVO|TODOS
router.get('/vendas', async (req, res) => {
  try {
    const { inicio, fim } = resolverIntervalo(
      (req.query.inicio || '').trim(),
      (req.query.fim || '').trim()
    );
    const sistema = (req.query.sistema || 'TODOS').trim().toUpperCase();
    const periodoAnterior = resolverPeriodoAnterior(inicio, fim);
    let valorAnterior = 0;
    let resumoFonada = null;
    let resumoAoVivo = null;
    const itensDetalhados = [];

    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const fonadasResultado = await db.query(`
        SELECT id, valor, periodo, data_pedido, recall, pagou, nome_comprador, senha_os FROM fonadas WHERE excluido_em IS NULL
      `);
      const noPeriodo = filtrarPorIntervalo(fonadasResultado.rows, 'data_pedido', inicio, fim);
      if (periodoAnterior) {
        valorAnterior += filtrarPorIntervalo(
          fonadasResultado.rows, 'data_pedido', periodoAnterior.inicio, periodoAnterior.fim
        ).reduce((soma, l) => soma + valorNumero(l.valor), 0);
      }
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
        valorTotal: noPeriodo.reduce((soma, l) => soma + valorNumero(l.valor), 0),
      };
      resumoFonada.ticketMedio = calcularTicketMedio(resumoFonada.valorTotal, resumoFonada.quantidade);

      for (const l of noPeriodo) {
        itensDetalhados.push({
          id: l.id, sistema: 'FONADA', os: l.senha_os || l.id,
          nome: l.nome_comprador || '—', valor: valorNumero(l.valor),
          forma: formaPagamento(l.periodo), data: l.data_pedido,
          statusPagamento: statusPagamento(l.pagou),
        });
      }
    }

    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const aoVivoResultado = await db.query(`
        SELECT id, valor, data_pedido, comprador, numero_os, pagamento, pagou FROM ao_vivo WHERE excluido_em IS NULL
      `);
      const noPeriodo = filtrarPorIntervalo(aoVivoResultado.rows, 'data_pedido', inicio, fim);
      if (periodoAnterior) {
        valorAnterior += filtrarPorIntervalo(
          aoVivoResultado.rows, 'data_pedido', periodoAnterior.inicio, periodoAnterior.fim
        ).reduce((soma, l) => soma + valorNumero(l.valor), 0);
      }
      resumoAoVivo = {
        quantidade: noPeriodo.length,
        valorTotal: noPeriodo.reduce((soma, l) => soma + valorNumero(l.valor), 0),
      };
      resumoAoVivo.ticketMedio = calcularTicketMedio(resumoAoVivo.valorTotal, resumoAoVivo.quantidade);

      for (const l of noPeriodo) {
        itensDetalhados.push({
          id: l.id, sistema: 'AOVIVO', os: l.numero_os || l.id,
          nome: l.comprador || '—', valor: valorNumero(l.valor),
          forma: formaPagamentoAoVivo(l.pagamento), data: l.data_pedido,
          statusPagamento: statusPagamento(l.pagou),
        });
      }
    }

    const quantidade = (resumoFonada?.quantidade || 0) + (resumoAoVivo?.quantidade || 0);
    const valorTotal = (resumoFonada?.valorTotal || 0) + (resumoAoVivo?.valorTotal || 0);

    const detalhes = prepararItens(itensDetalhados);
    res.json({
      inicio, fim, sistema,
      fonada: resumoFonada,
      aoVivo: resumoAoVivo,
      geral: { quantidade, valorTotal, ticketMedio: calcularTicketMedio(valorTotal, quantidade) },
      comparacao: periodoAnterior ? montarComparacao(valorTotal, valorAnterior, periodoAnterior) : null,
      ...detalhes,
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
    const periodoAnterior = resolverPeriodoAnterior(inicio, fim);
    let valorRecebidoAnterior = 0;
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
      if (periodoAnterior) {
        valorRecebidoAnterior += filtrarPorIntervalo(
          fonadasResultado.rows, 'data_pagamento', periodoAnterior.inicio, periodoAnterior.fim
        ).reduce((soma, l) => soma + valorNumero(l.valor), 0);
      }
      const totalPix = noPeriodo.filter((l) => formaPagamento(l.periodo) === 'PIX').length;
      const totalRecibo = noPeriodo.length - totalPix;
      fonadaResumo = {
        quantidade: noPeriodo.length,
        totalPix,
        totalRecibo,
        percentualPix: calcularPercentual(totalPix, noPeriodo.length),
        percentualRecibo: calcularPercentual(totalRecibo, noPeriodo.length),
        valorTotal: noPeriodo.reduce((soma, l) => soma + valorNumero(l.valor), 0),
      };

      for (const l of noPeriodo) {
        itensDetalhados.push({
          id: l.id, sistema: 'FONADA', os: l.senha_os || l.id,
          nome: l.nome_comprador || '—', valor: valorNumero(l.valor),
          forma: formaPagamento(l.periodo), data: l.data_pagamento,
          statusPagamento: statusPagamento(l.pagou),
        });
      }
    }

    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const aoVivoResultado = await db.query(`
        SELECT id, valor, comprador, numero_os, pagamento, pagou, data_pagou,
               valor_recebido, forma_recebimento
        FROM ao_vivo
        WHERE excluido_em IS NULL
      `);

      // Todo recebimento Ao Vivo usa a baixa financeira. A data do evento
      // e o antigo resultado de entrega não movimentam mais o caixa.
      const linhasRecebidas = aoVivoResultado.rows.filter((l) =>
        String(l.pagou || '').toUpperCase() === 'SIM' && l.data_pagou
      );
      const noPeriodo = filtrarPorIntervalo(linhasRecebidas, 'data_pagou', inicio, fim);
      const noPeriodoAVista = noPeriodo.filter((l) => !ehPrazoAoVivo(l.pagamento));
      const noPeriodoPrazo = noPeriodo.filter((l) => ehPrazoAoVivo(l.pagamento));
      if (periodoAnterior) {
        valorRecebidoAnterior += filtrarPorIntervalo(
          linhasRecebidas, 'data_pagou', periodoAnterior.inicio, periodoAnterior.fim
        ).reduce((soma, l) => soma + valorNumero(l.valor_recebido ?? l.valor), 0);
      }

      aoVivoResumo = {
        quantidade: noPeriodo.length,
        valorTotal: noPeriodo.reduce((soma, l) => soma + valorNumero(l.valor_recebido ?? l.valor), 0),
        quantidadeAVista: noPeriodoAVista.length,
        valorAVista: noPeriodoAVista.reduce((soma, l) => soma + valorNumero(l.valor_recebido ?? l.valor), 0),
        quantidadePrazo: noPeriodoPrazo.length,
        valorPrazo: noPeriodoPrazo.reduce((soma, l) => soma + valorNumero(l.valor_recebido ?? l.valor), 0),
      };

      for (const l of noPeriodoAVista) {
        itensDetalhados.push({
          id: l.id, sistema: 'AOVIVO', os: l.numero_os || l.id,
          nome: l.comprador || '—', valor: valorNumero(l.valor_recebido ?? l.valor),
          forma: l.forma_recebimento || formaPagamentoAoVivo(l.pagamento), data: l.data_pagou,
          statusPagamento: statusPagamento(l.pagou),
        });
      }
      for (const l of noPeriodoPrazo) {
        itensDetalhados.push({
          id: l.id, sistema: 'AOVIVO', os: l.numero_os || l.id,
          nome: l.comprador || '—', valor: valorNumero(l.valor_recebido ?? l.valor),
          forma: l.forma_recebimento || 'PRAZO', data: l.data_pagou,
          statusPagamento: statusPagamento(l.pagou),
        });
      }
    }

    const quantidade = (fonadaResumo?.quantidade || 0) + (aoVivoResumo?.quantidade || 0);
    const valorTotal = (fonadaResumo?.valorTotal || 0) + (aoVivoResumo?.valorTotal || 0);
    const totalPix = fonadaResumo?.totalPix || 0;
    const totalRecibo = fonadaResumo?.totalRecibo || 0;

    let valorVendido = 0;
    let valorAReceberVendasPeriodo = 0;
    let valorRecebidoVendasPeriodo = 0;
    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const fonadasVendidasResultado = await db.query(`
        SELECT valor, data_pedido, pagou FROM fonadas WHERE excluido_em IS NULL
      `);
      const vendidas = filtrarPorIntervalo(fonadasVendidasResultado.rows, 'data_pedido', inicio, fim);
      valorVendido += vendidas.reduce((soma, l) => soma + valorNumero(l.valor), 0);
      valorRecebidoVendasPeriodo += vendidas
        .filter((l) => String(l.pagou || '').toUpperCase() === 'SIM')
        .reduce((soma, l) => soma + valorNumero(l.valor), 0);
      valorAReceberVendasPeriodo += vendidas
        .filter((l) => String(l.pagou || '').toUpperCase() !== 'SIM')
        .reduce((soma, l) => soma + valorNumero(l.valor), 0);
    }
    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const aoVivoVendidoResultado = await db.query(`
        SELECT valor, valor_recebido, data_pedido, pagou FROM ao_vivo WHERE excluido_em IS NULL
      `);
      const vendidos = filtrarPorIntervalo(aoVivoVendidoResultado.rows, 'data_pedido', inicio, fim);
      valorVendido += vendidos.reduce((soma, l) => soma + valorNumero(l.valor), 0);
      valorRecebidoVendasPeriodo += vendidos
        .filter((l) => String(l.pagou || '').toUpperCase() === 'SIM')
        .reduce((soma, l) => soma + valorNumero(l.valor_recebido ?? l.valor), 0);
      valorAReceberVendasPeriodo += vendidos
        .filter((l) => String(l.pagou || '').toUpperCase() !== 'SIM')
        .reduce((soma, l) => soma + valorNumero(l.valor), 0);
    }
    const detalhes = prepararItens(itensDetalhados);

    res.json({
      inicio, fim, sistema,
      quantidade, valorTotal, totalPix, totalRecibo,
      valorVendido,
      valorRecebidoVendasPeriodo,
      valorAReceberVendasPeriodo,
      comparacao: periodoAnterior
        ? montarComparacao(valorTotal, valorRecebidoAnterior, periodoAnterior)
        : null,
      fonada: fonadaResumo,
      aoVivo: aoVivoResumo,
      ...detalhes,
    });
  } catch (erro) {
    console.error('Erro ao gerar relatório de recebimentos:', erro);
    res.status(500).json({ erro: 'Erro ao gerar relatório de recebimentos.' });
  }
});

// GET /api/relatorios/desempenho?inicio=dd/mm/aa&fim=dd/mm/aa&sistema=FONADA|AOVIVO|TODOS
//
// Desempenho por funcionário: quantos pedidos cada pessoa vendeu em
// Fonada e Ao Vivo, além do valor vendido em cada sistema. Pedidos
// antigos, criados antes do registro de vendedor, não aparecem aqui.
router.get('/desempenho', async (req, res) => {
  try {
    const { inicio, fim } = resolverIntervalo(
      (req.query.inicio || '').trim(),
      (req.query.fim || '').trim()
    );
    const sistema = (req.query.sistema || 'TODOS').trim().toUpperCase();
    const periodoAnterior = resolverPeriodoAnterior(inicio, fim);
    let valorEquipeAnterior = 0;

    // Mapa por nome de usuário -> acumulador de métricas.
    const porFuncionario = {};
    function acumulador(nome) {
      if (!nome) return null;
      if (!porFuncionario[nome]) {
        porFuncionario[nome] = {
          usuario: nome,
          vendasFonada: 0, valorVendidoFonada: 0,
          vendasAoVivo: 0, valorVendidoAoVivo: 0,
        };
      }
      return porFuncionario[nome];
    }

    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const fonadasResultado = await db.query(`
        SELECT valor, data_pedido, vendedor_usuario
        FROM fonadas WHERE excluido_em IS NULL
      `);

      // Vendas: conta pelo dia do PEDIDO (quando foi vendido).
      const vendidasNoPeriodo = filtrarPorIntervalo(fonadasResultado.rows, 'data_pedido', inicio, fim);
      if (periodoAnterior) {
        valorEquipeAnterior += filtrarPorIntervalo(
          fonadasResultado.rows.filter((l) => l.vendedor_usuario),
          'data_pedido', periodoAnterior.inicio, periodoAnterior.fim
        ).reduce((soma, l) => soma + valorNumero(l.valor), 0);
      }
      for (const l of vendidasNoPeriodo) {
        const acc = acumulador(l.vendedor_usuario);
        if (acc) {
          acc.vendasFonada += 1;
          acc.valorVendidoFonada += valorNumero(l.valor);
        }
      }
    }

    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const aoVivoResultado = await db.query(`
        SELECT valor, data_pedido, vendedor_usuario
        FROM ao_vivo WHERE excluido_em IS NULL
      `);

      const vendidosNoPeriodo = filtrarPorIntervalo(aoVivoResultado.rows, 'data_pedido', inicio, fim);
      if (periodoAnterior) {
        valorEquipeAnterior += filtrarPorIntervalo(
          aoVivoResultado.rows.filter((l) => l.vendedor_usuario),
          'data_pedido', periodoAnterior.inicio, periodoAnterior.fim
        ).reduce((soma, l) => soma + valorNumero(l.valor), 0);
      }
      for (const l of vendidosNoPeriodo) {
        const acc = acumulador(l.vendedor_usuario);
        if (acc) {
          acc.vendasAoVivo += 1;
          acc.valorVendidoAoVivo += valorNumero(l.valor);
        }
      }
    }

    const valorEquipe = Object.values(porFuncionario)
      .reduce((total, f) => total + f.valorVendidoFonada + f.valorVendidoAoVivo, 0);
    const funcionarios = Object.values(porFuncionario)
      .map((f) => ({
        ...f,
        vendasTotal: f.vendasFonada + f.vendasAoVivo,
        valorVendidoTotal: f.valorVendidoFonada + f.valorVendidoAoVivo,
        ticketMedio: calcularTicketMedio(
          f.valorVendidoFonada + f.valorVendidoAoVivo,
          f.vendasFonada + f.vendasAoVivo
        ),
        participacaoPercentual: calcularPercentual(
          f.valorVendidoFonada + f.valorVendidoAoVivo,
          valorEquipe
        ),
      }))
      .sort((a, b) => b.valorVendidoTotal - a.valorVendidoTotal);

    res.json({
      inicio, fim, sistema, valorEquipe, funcionarios,
      comparacao: periodoAnterior
        ? montarComparacao(valorEquipe, valorEquipeAnterior, periodoAnterior)
        : null,
    });
  } catch (erro) {
    console.error('Erro ao gerar relatório de desempenho:', erro);
    res.status(500).json({ erro: 'Erro ao gerar relatório de desempenho.' });
  }
});

module.exports = router;
