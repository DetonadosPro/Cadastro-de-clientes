// src/routes/cobranca.js
// Rotas da aba "Cobrança" — busca de pacotes fonada pelo dia em que o
// cobrador passa para receber (campo "cobranca"), combinável com status
// de pagamento, nome e O.S. Também permite dar baixa de pagamento
// (equivalente a preencher "Pagou" e "Lançamento" na aba de pedidos).

const express = require('express');
const { db } = require('../db/database');

const router = express.Router();

// GET /api/cobranca?cobrarDia=X&pagou=NAO|SIM|TODOS&nome=X&os=X
// Combina os filtros informados. Se "pagou" não for enviado, assume
// "NAO" como padrão (mostra quem ainda não pagou), conforme definido.
router.get('/', (req, res) => {
  const cobrarDia = (req.query.cobrarDia || '').trim();
  const pagouFiltro = (req.query.pagou || 'NAO').trim().toUpperCase();
  const nome = (req.query.nome || '').trim();
  const os = (req.query.os || '').trim();

  const condicoes = ['excluido_em IS NULL'];
  const params = [];

  if (cobrarDia) {
    condicoes.push('cobranca = ?');
    params.push(cobrarDia);
  }
  if (pagouFiltro === 'SIM') {
    condicoes.push("pagou = 'SIM'");
  } else if (pagouFiltro === 'NAO') {
    condicoes.push("(pagou IS NULL OR pagou != 'SIM')");
  }

  if (nome) {
    condicoes.push('nome_comprador LIKE ?');
    params.push(`%${nome}%`);
  }
  if (os) {
    condicoes.push('senha_os = ?');
    params.push(os);
  }

  const where = `WHERE ${condicoes.join(' AND ')}`;

  const linhas = db.prepare(`
    SELECT id, senha_os, nome_comprador, data_pedido, valor, cobranca, periodo, pagou, recebi, p1_dia,
           comprador_fixo, comprador_celular, comprador_endereco, comprador_complemento,
           comprador_bairro, comprador_referencia, cliente_id
    FROM fonadas
    ${where}
    ORDER BY cobranca ASC, nome_comprador ASC
  `).all(...params);

  const clienteIds = [...new Set(linhas.filter((l) => l.cliente_id).map((l) => l.cliente_id))];
  const clientesPorId = {};
  if (clienteIds.length > 0) {
    const placeholders = clienteIds.map(() => '?').join(', ');
    const clientes = db.prepare(`SELECT * FROM clientes WHERE id IN (${placeholders})`).all(...clienteIds);
    for (const c of clientes) clientesPorId[c.id] = c;
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
});

// PUT /api/cobranca/:id/baixa
// Atualiza "pagou" e "recebi" (status/observação de lançamento) de um
// pedido fonada — o que a tela de Cobrança chama de "dar baixa de
// pagamento". Também grava a data atual do sistema em "data_pagamento",
// usada depois no relatório de Recebimentos por período. A data nunca
// vem do cliente — é sempre gerada aqui, no momento da baixa.
router.put('/:id/baixa', (req, res) => {
  const { pagou, recebi } = req.body;

  const existe = db.prepare('SELECT id FROM fonadas WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Pedido não encontrado.' });

  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const dataPagamento = `${dd}/${mm}/${aa}`;

  db.prepare(`
    UPDATE fonadas SET pagou = ?, recebi = ?, data_pagamento = ?, atualizado_em = datetime('now') WHERE id = ?
  `).run(pagou ?? null, recebi ?? null, dataPagamento, req.params.id);

  res.json({ ok: true, dataPagamento });
});

module.exports = router;
