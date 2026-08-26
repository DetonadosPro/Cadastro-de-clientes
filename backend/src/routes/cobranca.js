// src/routes/cobranca.js
// Rotas da aba "Cobrança" — busca de pacotes fonada pelo dia em que o
// cobrador passa para receber (campo "cobranca"), combinável com status
// de pagamento, nome e O.S. Também permite dar baixa de pagamento.
//
// Migrado para PostgreSQL: rotas assíncronas, placeholders $1/$2/...

const express = require('express');
const { db } = require('../db/database');
const { agoraBrasilia } = require('../utils/dataHora');

const router = express.Router();

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

function chaveData(dataBr) {
  const partes = String(dataBr || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!partes) return null;
  const ano = partes[3].length === 2 ? `20${partes[3]}` : partes[3];
  return `${ano}-${partes[2]}-${partes[1]}`;
}

function chaveHojeBrasilia() {
  const agora = agoraBrasilia();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

// GET /api/cobranca?cobrarDia=X&pagou=NAO|SIM|TODOS&nome=X&os=X
router.get('/', async (req, res) => {
  try {
    const cobrarDia = (req.query.cobrarDia || '').trim();
    const pagouFiltro = (req.query.pagou || 'NAO').trim().toUpperCase();
    const nome = (req.query.nome || '').trim();
    const os = (req.query.os || '').trim();

    const condicoes = ['excluido_em IS NULL'];
    const params = [];

    if (cobrarDia) {
      params.push(cobrarDia);
      condicoes.push(`(cobranca = $${params.length} OR cobranca_reagendada = $${params.length})`);
    }
    if (pagouFiltro === 'SIM') {
      condicoes.push("pagou = 'SIM'");
    } else if (pagouFiltro === 'NAO') {
      condicoes.push("(pagou IS NULL OR pagou != 'SIM')");
    }

    if (nome) {
      params.push(`%${nome}%`);
      condicoes.push(`nome_comprador ILIKE $${params.length}`);
    }
    if (os) {
      params.push(os);
      condicoes.push(`senha_os = $${params.length}`);
    }

    const where = `WHERE ${condicoes.join(' AND ')}`;

    const linhasResultado = await db.query(`
      SELECT id, senha_os, nome_comprador, data_pedido, valor, cobranca, cobranca_reagendada,
             periodo, pagou, recebi, data_pagamento, p1_dia,
             comprador_fixo, comprador_celular, comprador_endereco, comprador_complemento,
             comprador_bairro, comprador_referencia, cliente_id
      FROM fonadas
      ${where}
      ORDER BY
        CASE WHEN senha_os ~ '^\d+$' THEN senha_os::INTEGER END ASC NULLS LAST,
        senha_os ASC
    `, params);
    const linhas = linhasResultado.rows;

    const clienteIds = [...new Set(linhas.filter((l) => l.cliente_id).map((l) => l.cliente_id))];
    const clientesPorId = {};
    if (clienteIds.length > 0) {
      const placeholders = clienteIds.map((_, i) => `$${i + 1}`).join(', ');
      const clientesResultado = await db.query(
        `SELECT * FROM clientes WHERE id IN (${placeholders})`, clienteIds
      );
      for (const c of clientesResultado.rows) clientesPorId[c.id] = c;
    }

    const resultado = linhas.map((l) => {
      const cliente = l.cliente_id ? clientesPorId[l.cliente_id] : null;
      return {
        id: l.id,
        senha_os: l.senha_os,
        data_pedido: l.data_pedido,
        valor: l.valor,
        cobranca: l.cobranca,
        cobrancaReagendada: l.cobranca_reagendada,
        periodo: l.periodo,
        transmissao: l.p1_dia,
        pagou: l.pagou,
        recebi: l.recebi,
        dataPagamento: l.data_pagamento,
        formaPagamento: formaPagamento(l.periodo),
        nome: cliente ? cliente.nome : l.nome_comprador,
        fixo: cliente ? cliente.fixo : l.comprador_fixo,
        whatsapp: cliente ? cliente.whatsapp : null,
        celular: cliente ? cliente.celular : l.comprador_celular,
        endereco: cliente ? cliente.endereco : l.comprador_endereco,
        complemento: cliente ? cliente.complemento : l.comprador_complemento,
        bairro: cliente ? cliente.bairro : l.comprador_bairro,
        referencia: cliente ? cliente.referencia : l.comprador_referencia,
        cliente_id: l.cliente_id,
      };
    });

    const totalPix = resultado.filter((r) => r.formaPagamento === 'PIX').length;
    const totalDeposito = resultado.filter((r) => r.formaPagamento === 'DEPÓSITO').length;
    const totalPresencial = resultado.filter((r) => r.formaPagamento === 'PRESENCIAL').length;
    const valorTotal = resultado.reduce((soma, r) => soma + (r.valor || 0), 0);

    res.json({
      pedidos: resultado,
      resumo: {
        totalPedidos: resultado.length,
        totalPix,
        totalDeposito,
        totalPresencial,
        valorTotal,
      },
    });
  } catch (erro) {
    console.error('Erro ao buscar cobrança:', erro);
    res.status(500).json({ erro: 'Erro ao buscar cobrança.' });
  }
});

// PUT /api/cobranca/:id/baixa
router.put('/:id/baixa', async (req, res) => {
  try {
    const { pagou, recebi, dataPagamento } = req.body;

    const existenteResultado = await db.query('SELECT id, cliente_id FROM fonadas WHERE id = $1', [req.params.id]);
    if (existenteResultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    const clienteId = existenteResultado.rows[0].cliente_id;
    if (clienteId) {
      const clienteResultado = await db.query('SELECT bloqueado FROM clientes WHERE id = $1', [clienteId]);
      if (clienteResultado.rows[0]?.bloqueado) {
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível dar baixa nos pedidos dele.' });
      }
    }

    // O frontend já pré-preenche o campo com a data de hoje (editável,
    // para permitir baixa retroativa) — usa o que foi enviado, e só
    // cai para "hoje calculado aqui" se por algum motivo vier vazio.
    let dataFinal = dataPagamento;
    if (!dataFinal || !dataFinal.trim()) {
      const agora = agoraBrasilia();
      const dd = String(agora.getDate()).padStart(2, '0');
      const mm = String(agora.getMonth() + 1).padStart(2, '0');
      const aa = String(agora.getFullYear()).slice(-2);
      dataFinal = `${dd}/${mm}/${aa}`;
    }

    await db.query(`
      UPDATE fonadas SET pagou = $1, recebi = $2, data_pagamento = $3, atualizado_em = NOW() WHERE id = $4
    `, [pagou ?? null, recebi ?? null, dataFinal, req.params.id]);

    res.json({ ok: true, dataPagamento: dataFinal });
  } catch (erro) {
    console.error('Erro ao dar baixa:', erro);
    res.status(500).json({ erro: 'Erro ao dar baixa.' });
  }
});

function idsValidos(corpo) {
  if (!Array.isArray(corpo)) return [];
  return [...new Set(corpo.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

async function verificarClientesBloqueados(ids) {
  const resultado = await db.query(`
    SELECT f.id
    FROM fonadas f
    JOIN clientes c ON c.id = f.cliente_id
    WHERE f.id = ANY($1::int[]) AND c.bloqueado = TRUE
    LIMIT 1
  `, [ids]);
  return resultado.rows.length > 0;
}

// PUT /api/cobranca/baixa-lote
router.put('/acoes/baixa-lote', async (req, res) => {
  try {
    const ids = idsValidos(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ erro: 'Selecione pelo menos um pedido.' });
    if (await verificarClientesBloqueados(ids)) {
      return res.status(403).json({ erro: 'Há um cliente bloqueado entre os pedidos selecionados.' });
    }

    let dataFinal = String(req.body.dataPagamento || '').trim();
    if (!dataFinal) {
      const agora = agoraBrasilia();
      const dd = String(agora.getDate()).padStart(2, '0');
      const mm = String(agora.getMonth() + 1).padStart(2, '0');
      dataFinal = `${dd}/${mm}/${String(agora.getFullYear()).slice(-2)}`;
    }

    const resultado = await db.query(`
      UPDATE fonadas
      SET pagou = 'SIM', recebi = $1, data_pagamento = $2, atualizado_em = NOW()
      WHERE id = ANY($3::int[]) AND excluido_em IS NULL
      RETURNING id
    `, [String(req.body.recebi || '').trim() || null, dataFinal, ids]);

    res.json({ ok: true, quantidade: resultado.rows.length, dataPagamento: dataFinal });
  } catch (erro) {
    console.error('Erro ao dar baixa em lote:', erro);
    res.status(500).json({ erro: 'Erro ao dar baixa nos pedidos.' });
  }
});

// PUT /api/cobranca/acoes/reagendar-lote
router.put('/acoes/reagendar-lote', async (req, res) => {
  try {
    const ids = idsValidos(req.body.ids);
    const cobrarDia = String(req.body.cobrarDia || '').trim();
    if (ids.length === 0) return res.status(400).json({ erro: 'Selecione pelo menos um pedido.' });
    if (!/^\d{2}\/\d{2}\/\d{2}(?:\d{2})?$/.test(cobrarDia)) {
      return res.status(400).json({ erro: 'Informe uma data válida para reagendar.' });
    }
    if (chaveData(cobrarDia) < chaveHojeBrasilia()) {
      return res.status(400).json({ erro: 'A nova data de cobrança não pode estar no passado.' });
    }

    const resultado = await db.query(`
      UPDATE fonadas
      SET cobranca_reagendada = $1, atualizado_em = NOW()
      WHERE id = ANY($2::int[]) AND excluido_em IS NULL
      RETURNING id
    `, [cobrarDia, ids]);

    res.json({ ok: true, quantidade: resultado.rows.length, cobrarDia });
  } catch (erro) {
    console.error('Erro ao reagendar cobranças:', erro);
    res.status(500).json({ erro: 'Erro ao reagendar os pedidos.' });
  }
});

module.exports = router;
