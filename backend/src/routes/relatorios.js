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

function normalizarFormaRecebimento(forma, pagamento) {
  const informado = String(forma || '').trim().toUpperCase();
  const origem = String(pagamento || '').trim().toUpperCase();
  const texto = informado || origem;
  if (/PIX/.test(texto)) return 'PIX';
  if (/D[ÉE]BITO|DEBITO/.test(texto)) return 'DÉBITO';
  if (/CR[ÉE]DITO|CREDITO/.test(texto)) return 'CRÉDITO';
  if (/CART/.test(texto)) return 'CARTÃO';
  if (/DINHEIRO|GRANA|PRESENCIAL/.test(texto)) return 'DINHEIRO';
  // “PAGO” é status, não forma. Registros antigos receberam esse texto
  // durante a migração do financeiro; quando não há uma forma recuperável,
  // o relatório assume explicitamente que ela não foi informada.
  if (/^(?:T[ÁA] )?PAGO(?:\s*\d.*)?$/.test(texto) || /^[\d.,?]+$/.test(texto)) return 'NÃO INFORMADO';
  return texto || 'NÃO INFORMADO';
}

function statusPagamento(valor) {
  return String(valor || '').trim().toUpperCase() === 'SIM' ? 'SIM' : 'NAO';
}

function prepararItens(itens, limiteSolicitado, paginaSolicitada) {
  const limitesPermitidos = [50, 100, 200, 500];
  const limite = limitesPermitidos.includes(Number(limiteSolicitado)) ? Number(limiteSolicitado) : 100;
  const pagina = Math.max(1, Number.parseInt(paginaSolicitada, 10) || 1);
  const ordenados = [...itens].sort((a, b) => {
    const porData = String(paraChaveComparavel(b.data) || '').localeCompare(
      String(paraChaveComparavel(a.data) || '')
    );
    return porData || valorNumero(b.id) - valorNumero(a.id);
  });
  const total = ordenados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * limite;
  return { itens: ordenados.slice(inicio, inicio + limite), itensTotal: total,
    limite, pagina: paginaAtual, totalPaginas, itensLimitados: total > limite };
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

// As datas antigas foram armazenadas como texto em formatos com ano de
// dois ou quatro dígitos. Esta expressão produz uma chave YYYY-MM-DD sem
// converter para DATE (há registros históricos com dias inexistentes,
// que a regra atual ainda compara como texto). Assim o PostgreSQL pode
// descartar o histórico fora do período antes de enviá-lo ao Node.
function chaveDataSql(campo) {
  return `CASE
    WHEN ${campo} ~ '^\\d{2}/\\d{2}/\\d{2}$'
      THEN '20' || RIGHT(${campo}, 2) || '-' || SUBSTRING(${campo}, 4, 2) || '-' || LEFT(${campo}, 2)
    WHEN ${campo} ~ '^\\d{2}/\\d{2}/\\d{4}$'
      THEN RIGHT(${campo}, 4) || '-' || SUBSTRING(${campo}, 4, 2) || '-' || LEFT(${campo}, 2)
  END`;
}

function limitesConsulta(inicio, fim, periodoAnterior = null) {
  const chaves = [
    paraChaveComparavel(inicio),
    paraChaveComparavel(fim || inicio),
    paraChaveComparavel(periodoAnterior?.inicio),
    paraChaveComparavel(periodoAnterior?.fim),
  ].filter(Boolean).sort();
  return [chaves[0], chaves[chaves.length - 1]];
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

function montarComparacaoCompleta(atual, anterior, periodoB) {
  const base = montarComparacao(atual.valor, anterior.valor, periodoB);
  const diferencaQuantidade = atual.quantidade - anterior.quantidade;
  const diferencaTicket = atual.ticket - anterior.ticket;
  return {
    ...base,
    periodoA: atual,
    periodoB: anterior,
    diferencaQuantidade,
    percentualQuantidade: anterior.quantidade ? Math.round((diferencaQuantidade / anterior.quantidade) * 1000) / 10 : null,
    diferencaTicket,
    percentualTicket: anterior.ticket ? Math.round((diferencaTicket / anterior.ticket) * 1000) / 10 : null,
  };
}

function seriePorData(itens, campos) {
  const porData = new Map();
  for (const item of itens) {
    const chave = paraChaveComparavel(item.data);
    if (!chave) continue;
    if (!porData.has(chave)) porData.set(chave, { data: item.data });
    const ponto = porData.get(chave);
    for (const [campo, obterValor] of Object.entries(campos)) {
      ponto[campo] = valorNumero(ponto[campo]) + valorNumero(obterValor(item));
    }
  }
  return [...porData.entries()]
    .sort(([dataA], [dataB]) => dataA.localeCompare(dataB))
    .map(([, ponto]) => ponto);
}

function totaisPorCategoria(itens, obterCategoria) {
  const totais = new Map();
  for (const item of itens) {
    const categoria = String(obterCategoria(item) || 'NÃO INFORMADO').trim().toUpperCase();
    const atual = totais.get(categoria) || { categoria, valor: 0, quantidade: 0 };
    atual.valor += valorNumero(item.valor);
    atual.quantidade += 1;
    totais.set(categoria, atual);
  }
  return [...totais.values()].sort((a, b) => b.valor - a.valor);
}

// GET /api/relatorios/vendas?inicio=dd/mm/aa&fim=dd/mm/aa&sistema=FONADA|AOVIVO|TODOS
router.get('/vendas', async (req, res) => {
  try {
    const { inicio, fim } = resolverIntervalo(
      (req.query.inicio || '').trim(),
      (req.query.fim || '').trim()
    );
    const sistema = (req.query.sistema || 'TODOS').trim().toUpperCase();
    const periodoAnterior = paraChaveComparavel(req.query.inicioB)
      ? resolverIntervalo(String(req.query.inicioB).trim(), paraChaveComparavel(req.query.fimB) ? String(req.query.fimB).trim() : '')
      : null;
    let valorAnterior = 0;
    let resumoFonada = null;
    let resumoAoVivo = null;
    const itensDetalhados = [];
    const itensPeriodoAnterior = [];

    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const limites = limitesConsulta(inicio, fim, periodoAnterior);
      const fonadasResultado = await db.query(`
        SELECT id, valor, periodo, data_pedido, recall, pagou, nome_comprador, senha_os
        FROM fonadas
        WHERE excluido_em IS NULL
          AND ${chaveDataSql('data_pedido')} BETWEEN $1 AND $2
      `, limites);
      const noPeriodo = filtrarPorIntervalo(fonadasResultado.rows, 'data_pedido', inicio, fim);
      if (periodoAnterior) {
        const anteriores = filtrarPorIntervalo(
          fonadasResultado.rows, 'data_pedido', periodoAnterior.inicio, periodoAnterior.fim
        );
        valorAnterior += anteriores.reduce((soma, l) => soma + valorNumero(l.valor), 0);
        anteriores.forEach((l) => itensPeriodoAnterior.push({ data: l.data_pedido, valor: l.valor, sistema: 'FONADA' }));
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
      const limites = limitesConsulta(inicio, fim, periodoAnterior);
      const aoVivoResultado = await db.query(`
        SELECT id, valor, data_pedido, comprador, numero_os, pagamento, pagou
        FROM ao_vivo
        WHERE excluido_em IS NULL
          AND ${chaveDataSql('data_pedido')} BETWEEN $1 AND $2
      `, limites);
      const noPeriodo = filtrarPorIntervalo(aoVivoResultado.rows, 'data_pedido', inicio, fim);
      if (periodoAnterior) {
        const anteriores = filtrarPorIntervalo(
          aoVivoResultado.rows, 'data_pedido', periodoAnterior.inicio, periodoAnterior.fim
        );
        valorAnterior += anteriores.reduce((soma, l) => soma + valorNumero(l.valor), 0);
        anteriores.forEach((l) => itensPeriodoAnterior.push({ data: l.data_pedido, valor: l.valor, sistema: 'AOVIVO' }));
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

    const detalhes = prepararItens(itensDetalhados, req.query.limite, req.query.pagina);
    const quantidadeAnterior = itensPeriodoAnterior.length;
    const ticketAnterior = calcularTicketMedio(valorAnterior, quantidadeAnterior);
    res.json({
      inicio, fim, sistema,
      fonada: resumoFonada,
      aoVivo: resumoAoVivo,
      geral: { quantidade, valorTotal, ticketMedio: calcularTicketMedio(valorTotal, quantidade) },
      comparacao: periodoAnterior ? montarComparacaoCompleta(
        { inicio, fim, valor: valorTotal, quantidade, ticket: calcularTicketMedio(valorTotal, quantidade) },
        { ...periodoAnterior, valor: valorAnterior, quantidade: quantidadeAnterior, ticket: ticketAnterior },
        periodoAnterior
      ) : null,
      graficos: {
        vendasPorDia: seriePorData(itensDetalhados, {
          valor: (item) => item.valor,
          quantidade: () => 1,
          fonada: (item) => item.sistema === 'FONADA' ? item.valor : 0,
          aoVivo: (item) => item.sistema === 'AOVIVO' ? item.valor : 0,
          quantidadeFonada: (item) => item.sistema === 'FONADA' ? 1 : 0,
          quantidadeAoVivo: (item) => item.sistema === 'AOVIVO' ? 1 : 0,
        }),
        periodoAnterior: seriePorData(itensPeriodoAnterior, {
          valor: (item) => item.valor,
          quantidade: () => 1,
          fonada: (item) => item.sistema === 'FONADA' ? item.valor : 0,
          aoVivo: (item) => item.sistema === 'AOVIVO' ? item.valor : 0,
          quantidadeFonada: (item) => item.sistema === 'FONADA' ? 1 : 0,
          quantidadeAoVivo: (item) => item.sistema === 'AOVIVO' ? 1 : 0,
        }),
        origemFonada: resumoFonada ? [
          { categoria: 'RECALL', quantidade: resumoFonada.totalRecall, valor: resumoFonada.totalRecall },
          { categoria: 'CLIENTES', quantidade: resumoFonada.totalOutros, valor: resumoFonada.totalOutros },
        ] : [],
      },
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
    const periodoAnterior = paraChaveComparavel(req.query.inicioB)
      ? resolverIntervalo(String(req.query.inicioB).trim(), paraChaveComparavel(req.query.fimB) ? String(req.query.fimB).trim() : '')
      : null;
    let valorRecebidoAnterior = 0;
    let fonadaResumo = null;
    let aoVivoResumo = null;
    const itensDetalhados = [];
    const itensPeriodoAnterior = [];
    const vendasDetalhadas = [];

    if (sistema === 'FONADA' || sistema === 'TODOS') {
      const limites = limitesConsulta(inicio, fim, periodoAnterior);
      const fonadasResultado = await db.query(`
        SELECT id, valor, periodo, data_pagamento, pagou, nome_comprador, senha_os
        FROM fonadas
        WHERE excluido_em IS NULL AND pagou = 'SIM' AND data_pagamento IS NOT NULL
          AND ${chaveDataSql('data_pagamento')} BETWEEN $1 AND $2
      `, limites);
      const noPeriodo = filtrarPorIntervalo(fonadasResultado.rows, 'data_pagamento', inicio, fim);
      if (periodoAnterior) {
        const anteriores = filtrarPorIntervalo(
          fonadasResultado.rows, 'data_pagamento', periodoAnterior.inicio, periodoAnterior.fim
        );
        valorRecebidoAnterior += anteriores.reduce((soma, l) => soma + valorNumero(l.valor), 0);
        anteriores.forEach((l) => itensPeriodoAnterior.push({ data: l.data_pagamento, valor: l.valor, sistema: 'FONADA' }));
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
      const limites = limitesConsulta(inicio, fim, periodoAnterior);
      const aoVivoResultado = await db.query(`
        SELECT id, valor, comprador, numero_os, pagamento, pagou, data_pagou,
               valor_recebido, forma_recebimento
        FROM ao_vivo
        WHERE excluido_em IS NULL
          AND pagou = 'SIM' AND data_pagou IS NOT NULL
          AND ${chaveDataSql('data_pagou')} BETWEEN $1 AND $2
      `, limites);

      // Todo recebimento Ao Vivo usa a baixa financeira. A data do evento
      // e o antigo resultado de entrega não movimentam mais o caixa.
      const linhasRecebidas = aoVivoResultado.rows.filter((l) =>
        String(l.pagou || '').toUpperCase() === 'SIM' && l.data_pagou
      );
      const noPeriodo = filtrarPorIntervalo(linhasRecebidas, 'data_pagou', inicio, fim);
      const noPeriodoAVista = noPeriodo.filter((l) => !ehPrazoAoVivo(l.pagamento));
      const noPeriodoPrazo = noPeriodo.filter((l) => ehPrazoAoVivo(l.pagamento));
      if (periodoAnterior) {
        const anteriores = filtrarPorIntervalo(
          linhasRecebidas, 'data_pagou', periodoAnterior.inicio, periodoAnterior.fim
        );
        valorRecebidoAnterior += anteriores.reduce((soma, l) => soma + valorNumero(l.valor_recebido ?? l.valor), 0);
        anteriores.forEach((l) => itensPeriodoAnterior.push({ data: l.data_pagou, valor: l.valor_recebido ?? l.valor, sistema: 'AOVIVO' }));
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
          forma: normalizarFormaRecebimento(l.forma_recebimento, l.pagamento), data: l.data_pagou,
          statusPagamento: statusPagamento(l.pagou),
        });
      }
      for (const l of noPeriodoPrazo) {
        itensDetalhados.push({
          id: l.id, sistema: 'AOVIVO', os: l.numero_os || l.id,
          nome: l.comprador || '—', valor: valorNumero(l.valor_recebido ?? l.valor),
          forma: normalizarFormaRecebimento(l.forma_recebimento, l.pagamento), data: l.data_pagou,
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
      const limites = limitesConsulta(inicio, fim);
      const fonadasVendidasResultado = await db.query(`
        SELECT valor, data_pedido, pagou FROM fonadas
        WHERE excluido_em IS NULL
          AND ${chaveDataSql('data_pedido')} BETWEEN $1 AND $2
      `, limites);
      const vendidas = filtrarPorIntervalo(fonadasVendidasResultado.rows, 'data_pedido', inicio, fim);
      vendidas.forEach((l) => vendasDetalhadas.push({ data: l.data_pedido, valor: l.valor, sistema: 'FONADA' }));
      valorVendido += vendidas.reduce((soma, l) => soma + valorNumero(l.valor), 0);
      valorRecebidoVendasPeriodo += vendidas
        .filter((l) => String(l.pagou || '').toUpperCase() === 'SIM')
        .reduce((soma, l) => soma + valorNumero(l.valor), 0);
      valorAReceberVendasPeriodo += vendidas
        .filter((l) => String(l.pagou || '').toUpperCase() !== 'SIM')
        .reduce((soma, l) => soma + valorNumero(l.valor), 0);
    }
    if (sistema === 'AOVIVO' || sistema === 'TODOS') {
      const limites = limitesConsulta(inicio, fim);
      const aoVivoVendidoResultado = await db.query(`
        SELECT valor, valor_recebido, data_pedido, pagou FROM ao_vivo
        WHERE excluido_em IS NULL
          AND ${chaveDataSql('data_pedido')} BETWEEN $1 AND $2
      `, limites);
      const vendidos = filtrarPorIntervalo(aoVivoVendidoResultado.rows, 'data_pedido', inicio, fim);
      vendidos.forEach((l) => vendasDetalhadas.push({ data: l.data_pedido, valor: l.valor, sistema: 'AOVIVO' }));
      valorVendido += vendidos.reduce((soma, l) => soma + valorNumero(l.valor), 0);
      valorRecebidoVendasPeriodo += vendidos
        .filter((l) => String(l.pagou || '').toUpperCase() === 'SIM')
        .reduce((soma, l) => soma + valorNumero(l.valor_recebido ?? l.valor), 0);
      valorAReceberVendasPeriodo += vendidos
        .filter((l) => String(l.pagou || '').toUpperCase() !== 'SIM')
        .reduce((soma, l) => soma + valorNumero(l.valor), 0);
    }
    const detalhes = prepararItens(itensDetalhados, req.query.limite, req.query.pagina);

    res.json({
      inicio, fim, sistema,
      quantidade, valorTotal, totalPix, totalRecibo,
      valorVendido,
      valorRecebidoVendasPeriodo,
      valorAReceberVendasPeriodo,
      comparacao: periodoAnterior ? montarComparacaoCompleta(
        { inicio, fim, valor: valorTotal, quantidade, ticket: calcularTicketMedio(valorTotal, quantidade) },
        { ...periodoAnterior, valor: valorRecebidoAnterior, quantidade: itensPeriodoAnterior.length,
          ticket: calcularTicketMedio(valorRecebidoAnterior, itensPeriodoAnterior.length) },
        periodoAnterior
      ) : null,
      fonada: fonadaResumo,
      aoVivo: aoVivoResumo,
      graficos: {
        vendidoPorDia: seriePorData(vendasDetalhadas, { valor: (item) => item.valor }),
        recebidoPorDia: seriePorData(itensDetalhados, {
          valor: (item) => item.valor, quantidade: () => 1,
          fonada: (item) => item.sistema === 'FONADA' ? item.valor : 0,
          aoVivo: (item) => item.sistema === 'AOVIVO' ? item.valor : 0,
          quantidadeFonada: (item) => item.sistema === 'FONADA' ? 1 : 0,
          quantidadeAoVivo: (item) => item.sistema === 'AOVIVO' ? 1 : 0,
        }),
        periodoAnterior: seriePorData(itensPeriodoAnterior, { valor: (item) => item.valor, quantidade: () => 1 }),
        recebimentosPorForma: totaisPorCategoria(itensDetalhados, (item) => item.forma),
      },
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
    const periodoAnterior = paraChaveComparavel(req.query.inicioB)
      ? resolverIntervalo(String(req.query.inicioB).trim(), paraChaveComparavel(req.query.fimB) ? String(req.query.fimB).trim() : '')
      : null;
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
      const limites = limitesConsulta(inicio, fim, periodoAnterior);
      const fonadasResultado = await db.query(`
        SELECT valor, data_pedido, vendedor_usuario
        FROM fonadas WHERE excluido_em IS NULL
          AND ${chaveDataSql('data_pedido')} BETWEEN $1 AND $2
      `, limites);

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
      const limites = limitesConsulta(inicio, fim, periodoAnterior);
      const aoVivoResultado = await db.query(`
        SELECT valor, data_pedido, vendedor_usuario
        FROM ao_vivo WHERE excluido_em IS NULL
          AND ${chaveDataSql('data_pedido')} BETWEEN $1 AND $2
      `, limites);

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
