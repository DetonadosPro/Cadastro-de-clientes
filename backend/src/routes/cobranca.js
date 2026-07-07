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
      condicoes.push(`cobranca = $${params.length}`);
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
      SELECT id, senha_os, nome_comprador, data_pedido, valor, cobranca, periodo, pagou, recebi, p1_dia,
             comprador_fixo, comprador_celular, comprador_endereco, comprador_complemento,
             comprador_bairro, comprador_referencia, cliente_id
      FROM fonadas
      ${where}
      ORDER BY cobranca ASC, nome_comprador ASC
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
        periodo: l.periodo,
        transmissao: l.p1_dia,
        pagou: l.pagou,
        recebi: l.recebi,
        formaPagamento: (l.periodo || '').trim().toUpperCase() === 'PIX' ? 'PIX' : 'RECIBO',
        nome: cliente ? cliente.nome : l.nome_comprador,
        fixo: cliente ? cliente.fixo : l.comprador_fixo,
        celular: cliente ? cliente.celular : l.comprador_celular,
        endereco: cliente ? cliente.endereco : l.comprador_endereco,
        complemento: cliente ? cliente.complemento : l.comprador_complemento,
        bairro: cliente ? cliente.bairro : l.comprador_bairro,
        referencia: cliente ? cliente.referencia : l.comprador_referencia,
        cliente_id: l.cliente_id,
      };
    });

    const totalPix = resultado.filter((r) => r.formaPagamento === 'PIX').length;
    const totalRecibo = resultado.filter((r) => r.formaPagamento === 'RECIBO').length;
    const valorTotal = resultado.reduce((soma, r) => soma + (r.valor || 0), 0);

    res.json({
      pedidos: resultado,
      resumo: {
        totalPedidos: resultado.length,
        totalPix,
        totalRecibo,
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
    const { pagou, recebi } = req.body;

    const existenteResultado = await db.query('SELECT id, cliente_id FROM fonadas WHERE id = $1', [req.params.id]);
    if (existenteResultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    const clienteId = existenteResultado.rows[0].cliente_id;
    if (clienteId) {
      const clienteResultado = await db.query('SELECT bloqueado FROM clientes WHERE id = $1', [clienteId]);
      if (clienteResultado.rows[0]?.bloqueado) {
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível dar baixa nos pedidos dele.' });
      }
    }

    const agora = agoraBrasilia();
    const dd = String(agora.getDate()).padStart(2, '0');
    const mm = String(agora.getMonth() + 1).padStart(2, '0');
    const aa = String(agora.getFullYear()).slice(-2);
    const dataPagamento = `${dd}/${mm}/${aa}`;

    await db.query(`
      UPDATE fonadas SET pagou = $1, recebi = $2, data_pagamento = $3, atualizado_em = NOW() WHERE id = $4
    `, [pagou ?? null, recebi ?? null, dataPagamento, req.params.id]);

    res.json({ ok: true, dataPagamento });
  } catch (erro) {
    console.error('Erro ao dar baixa:', erro);
    res.status(500).json({ erro: 'Erro ao dar baixa.' });
  }
});

module.exports = router;
