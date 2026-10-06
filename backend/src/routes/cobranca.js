// src/routes/cobranca.js
// Rotas da aba "Cobrança" — busca de pacotes fonada pelo dia em que o
// cobrador passa para receber (campo "cobranca"), combinável com status
// de pagamento, nome e O.S. Também permite dar baixa de pagamento.
//
// Migrado para PostgreSQL: rotas assíncronas, placeholders $1/$2/...

const express = require('express');
const { db, pool } = require('../db/database');
const { agoraBrasilia } = require('../utils/dataHora');
const { dataCurtaValida } = require('../utils/validarDataCurta');
const { formatarNome, normalizarBusca, sqlBuscaNome } = require('../utils/textoPessoa');

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ erro: 'ID de pedido inválido.' });
  next();
});

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

function chaveDataSql(campo) {
  return `CASE
    WHEN ${campo} ~ '^\\d{2}/\\d{2}/\\d{2}$'
      THEN '20' || RIGHT(${campo}, 2) || '-' || SUBSTRING(${campo}, 4, 2) || '-' || LEFT(${campo}, 2)
    WHEN ${campo} ~ '^\\d{2}/\\d{2}/\\d{4}$'
      THEN RIGHT(${campo}, 4) || '-' || SUBSTRING(${campo}, 4, 2) || '-' || LEFT(${campo}, 2)
  END`;
}

function aplicarRecorteRecebidas(condicoes, params, { pagouFiltro, campoPagou, campoData, inicio, fim }) {
  const inicioChave = chaveData(inicio);
  const fimChave = chaveData(fim);
  if (!inicioChave || !fimChave || pagouFiltro === 'NAO') return;
  params.push(inicioChave, fimChave);
  const intervalo = `${chaveDataSql(campoData)} BETWEEN $${params.length - 1} AND $${params.length}`;
  if (pagouFiltro === 'SIM') condicoes.push(intervalo);
  else condicoes.push(`(COALESCE(${campoPagou}, '') != 'SIM' OR (${campoPagou} = 'SIM' AND ${intervalo}))`);
}

function hojeFormatado() {
  const agora = agoraBrasilia();
  return `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${String(agora.getFullYear()).slice(-2)}`;
}

function dataPrazoAoVivo(texto) {
  return String(texto || '').match(/PRAZO\s*-\s*DIA\s*(\d{2}\/\d{2}\/(?:\d{2}|\d{4}))/i)?.[1] || null;
}

async function nomeUsuarioLogado(req) {
  const resultado = await db.query('SELECT nome, usuario FROM usuarios WHERE id = $1', [req.usuario.id]);
  const usuario = resultado.rows[0];
  return usuario ? (usuario.nome || usuario.usuario) : req.usuario.usuario;
}

async function clienteAoVivoBloqueado(clienteId) {
  if (!clienteId) return false;
  const resultado = await db.query('SELECT bloqueado FROM clientes WHERE id = $1', [clienteId]);
  return Boolean(resultado.rows[0]?.bloqueado);
}

// Central financeira dos pedidos Ao Vivo. Todos os pedidos têm estado
// financeiro próprio, independentemente de a mensagem já ter acontecido.
router.get('/ao-vivo', async (req, res) => {
  try {
    const pagouFiltro = String(req.query.pagou || 'NAO').trim().toUpperCase();
    const nome = String(req.query.nome || '').trim();
    const os = String(req.query.os || '').trim();
    const recebidasInicio = String(req.query.recebidasInicio || '').trim();
    const recebidasFim = String(req.query.recebidasFim || '').trim();
    const condicoes = ['a.excluido_em IS NULL'];
    const params = [];

    if (pagouFiltro === 'SIM') condicoes.push("a.pagou = 'SIM'");
    else if (pagouFiltro === 'NAO') condicoes.push("COALESCE(a.pagou, '') != 'SIM'");
    aplicarRecorteRecebidas(condicoes, params, {
      pagouFiltro, campoPagou: 'a.pagou', campoData: 'a.data_pagou',
      inicio: recebidasInicio, fim: recebidasFim,
    });
    if (nome) {
      params.push(`%${normalizarBusca(nome)}%`);
      condicoes.push(`(${sqlBuscaNome('c.nome', params.length)} OR ${sqlBuscaNome('a.comprador', params.length)})`);
    }
    if (os) {
      params.push(os);
      condicoes.push(`a.numero_os = $${params.length}`);
    }

    const resultado = await db.query(`
      SELECT a.id, a.numero_os, a.cliente_id, a.comprador, a.data_pedido,
             a.dia_entrega, a.horario_entrega, a.para, a.valor, a.pagamento,
             a.pagou, a.data_pagou, a.data_cobranca, a.valor_recebido,
             a.forma_recebimento, a.pagamento_recebido_por, a.versao,
             a.fixo_local, a.celular, a.whatsapp, a.endereco, a.bairro, a.referencia,
             c.nome AS cliente_nome, c.fixo AS cliente_fixo,
             c.celular AS cliente_celular, c.whatsapp AS cliente_whatsapp,
             c.endereco AS cliente_endereco, c.bairro AS cliente_bairro,
             c.referencia AS cliente_referencia
      FROM ao_vivo a
      LEFT JOIN clientes c ON c.id = a.cliente_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY
        CASE WHEN a.numero_os ~ '^\\d+$' THEN a.numero_os::INTEGER END ASC NULLS LAST,
        a.numero_os ASC
    `, params);

    const pedidos = resultado.rows.map((l) => ({
      id: l.id,
      versao: l.versao,
      tipo: 'AOVIVO',
      numero_os: l.numero_os,
      cliente_id: l.cliente_id,
      nome: formatarNome(l.cliente_nome || l.comprador),
      dataPedido: l.data_pedido,
      dataEvento: l.dia_entrega,
      horarioEvento: l.horario_entrega,
      destinatario: l.para,
      valor: l.valor,
      pagamentoPrevisto: l.pagamento,
      dataCobranca: l.data_cobranca || dataPrazoAoVivo(l.pagamento) || l.dia_entrega,
      pagou: l.pagou,
      dataPagamento: l.data_pagou,
      valorRecebido: l.valor_recebido,
      formaRecebimento: l.forma_recebimento,
      recebidoPor: l.pagamento_recebido_por,
      fixo: l.cliente_fixo || l.fixo_local,
      celular: l.cliente_celular || l.celular,
      whatsapp: l.cliente_whatsapp || l.whatsapp,
      endereco: l.cliente_endereco || l.endereco,
      bairro: l.cliente_bairro || l.bairro,
      referencia: l.cliente_referencia || l.referencia,
    }));

    res.json({
      pedidos,
      resumo: {
        totalPedidos: pedidos.length,
        valorTotal: pedidos.reduce((total, p) => total + Number(p.valor || 0), 0),
      },
    });
  } catch (erro) {
    console.error('Erro ao buscar cobranças Ao Vivo:', erro);
    res.status(500).json({ erro: 'Erro ao buscar cobranças Ao Vivo.' });
  }
});

router.put('/ao-vivo/:id/baixa', async (req, res) => {
  try {
    const existente = await db.query('SELECT id, cliente_id, valor, pagamento FROM ao_vivo WHERE id = $1 AND excluido_em IS NULL', [req.params.id]);
    if (!existente.rows.length) return res.status(404).json({ erro: 'Pedido Ao Vivo não encontrado.' });
    const versao = req.body.versao;
    if (versao !== undefined && (!Number.isInteger(versao) || versao < 1)) return res.status(400).json({ erro: 'Versão do pedido inválida.' });
    if (await clienteAoVivoBloqueado(existente.rows[0].cliente_id)) {
      return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível dar baixa no pagamento.' });
    }

    const dataPagamento = String(req.body.dataPagamento || '').trim() || hojeFormatado();
    if (!dataCurtaValida(dataPagamento)) {
      return res.status(400).json({ erro: 'Informe uma data válida para o recebimento.' });
    }
    const valorRecebidoInformado = Number(req.body.valorRecebido);
    const valorRecebido = Number.isFinite(valorRecebidoInformado) ? valorRecebidoInformado : Number(existente.rows[0].valor || 0);
    let formaRecebimento = String(req.body.formaRecebimento || existente.rows[0].pagamento || 'PRESENCIAL').trim();
    if (/^(?:T[ÁA] )?PAGO(?:\s*\d.*)?$/i.test(formaRecebimento)) {
      formaRecebimento = 'NÃO INFORMADO';
    }
    if (valorRecebido < 0) return res.status(400).json({ erro: 'O valor recebido não pode ser negativo.' });
    if (!formaRecebimento) return res.status(400).json({ erro: 'Informe a forma de recebimento.' });
    const recebidoPor = await nomeUsuarioLogado(req);

    const alterado = await db.query(`
      UPDATE ao_vivo
      SET pagou = 'SIM', data_pagou = $1, valor_recebido = $2,
          forma_recebimento = $3, pagamento_recebido_por = $4, atualizado_em = NOW(), versao = versao + 1
      WHERE id = $5 AND excluido_em IS NULL AND ($6::int IS NULL OR versao = $6)
      RETURNING id, versao
    `, [dataPagamento, valorRecebido, formaRecebimento, recebidoPor, req.params.id, versao ?? null]);
    if (!alterado.rows.length) return res.status(409).json({ erro: 'Pedido alterado por outra pessoa. Atualize a cobrança.' });

    res.json({ ok: true, dataPagamento, valorRecebido, formaRecebimento, recebidoPor, versao: alterado.rows[0].versao });
  } catch (erro) {
    console.error('Erro ao dar baixa no pagamento Ao Vivo:', erro);
    res.status(500).json({ erro: 'Não foi possível dar baixa no pagamento Ao Vivo.' });
  }
});

router.put('/ao-vivo/:id/desfazer-baixa', async (req, res) => {
  try {
    const versao = req.body.versao;
    if (versao !== undefined && (!Number.isInteger(versao) || versao < 1)) return res.status(400).json({ erro: 'Versão do pedido inválida.' });
    const resultado = await db.query(`
      UPDATE ao_vivo
      SET pagou = NULL, data_pagou = NULL, valor_recebido = NULL,
          forma_recebimento = NULL, pagamento_recebido_por = NULL, atualizado_em = NOW(), versao = versao + 1
      WHERE id = $1 AND excluido_em IS NULL AND ($2::int IS NULL OR versao = $2) RETURNING id, versao
    `, [req.params.id, versao ?? null]);
    if (!resultado.rows.length) return res.status(versao === undefined ? 404 : 409).json({ erro: versao === undefined ? 'Pedido Ao Vivo não encontrado.' : 'Pedido alterado por outra pessoa. Atualize a cobrança.' });
    res.json({ ok: true, versao: resultado.rows[0].versao });
  } catch (erro) {
    console.error('Erro ao desfazer baixa Ao Vivo:', erro);
    res.status(500).json({ erro: 'Não foi possível desfazer a baixa.' });
  }
});

router.put('/ao-vivo/:id/reagendar', async (req, res) => {
  try {
    const versao = req.body.versao;
    if (versao !== undefined && (!Number.isInteger(versao) || versao < 1)) return res.status(400).json({ erro: 'Versão do pedido inválida.' });
    const dataCobranca = String(req.body.dataCobranca || '').trim();
    if (!dataCurtaValida(dataCobranca)) {
      return res.status(400).json({ erro: 'Informe uma data válida para a cobrança.' });
    }
    if (chaveData(dataCobranca) < chaveHojeBrasilia()) {
      return res.status(400).json({ erro: 'A cobrança não pode ser reagendada para o passado.' });
    }
    const resultado = await db.query(`
      UPDATE ao_vivo SET data_cobranca = $1, atualizado_em = NOW(), versao = versao + 1
      WHERE id = $2 AND excluido_em IS NULL AND ($3::int IS NULL OR versao = $3) RETURNING id
    `, [dataCobranca, req.params.id, versao ?? null]);
    if (!resultado.rows.length) return res.status(versao === undefined ? 404 : 409).json({ erro: versao === undefined ? 'Pedido Ao Vivo não encontrado.' : 'Pedido alterado por outra pessoa. Atualize a cobrança.' });
    res.json({ ok: true, dataCobranca });
  } catch (erro) {
    console.error('Erro ao reagendar cobrança Ao Vivo:', erro);
    res.status(500).json({ erro: 'Não foi possível reagendar a cobrança.' });
  }
});

// GET /api/cobranca?cobrarDia=X&pagou=NAO|SIM|TODOS&nome=X&os=X
router.get('/', async (req, res) => {
  try {
    const cobrarDia = (req.query.cobrarDia || '').trim();
    const pagouFiltro = (req.query.pagou || 'NAO').trim().toUpperCase();
    const nome = (req.query.nome || '').trim();
    const os = (req.query.os || '').trim();
    const recebidasInicio = String(req.query.recebidasInicio || '').trim();
    const recebidasFim = String(req.query.recebidasFim || '').trim();

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
    aplicarRecorteRecebidas(condicoes, params, {
      pagouFiltro, campoPagou: 'pagou', campoData: 'data_pagamento',
      inicio: recebidasInicio, fim: recebidasFim,
    });

    if (nome) {
      params.push(`%${normalizarBusca(nome)}%`);
      condicoes.push(`(${sqlBuscaNome('nome_comprador', params.length)} OR EXISTS (
        SELECT 1 FROM clientes c WHERE c.id=fonadas.cliente_id AND ${sqlBuscaNome('c.nome', params.length)}
      ))`);
    }
    if (os) {
      params.push(os);
      condicoes.push(`senha_os = $${params.length}`);
    }

    const where = `WHERE ${condicoes.join(' AND ')}`;

    const linhasResultado = await db.query(`
      SELECT id, senha_os, nome_comprador, data_pedido, valor, cobranca, cobranca_reagendada,
             periodo, pagou, recebi, data_pagamento, p1_dia, p1_para, p2_para, impresso, versao,
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
        versao: l.versao,
        senha_os: l.senha_os,
        data_pedido: l.data_pedido,
        valor: l.valor,
        cobranca: l.cobranca,
        cobrancaReagendada: l.cobranca_reagendada,
        periodo: l.periodo,
        transmissao: l.p1_dia,
        destinatarios: [...new Set([l.p1_para, l.p2_para].map((nome) => String(nome || '').trim()).filter(Boolean))],
        pagou: l.pagou,
        recebi: l.recebi,
        dataPagamento: l.data_pagamento,
        impresso: l.impresso,
        formaPagamento: formaPagamento(l.periodo),
        nome: formatarNome(cliente?.nome || l.nome_comprador),
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
    if (!['SIM', 'NÃO'].includes(pagou)) return res.status(400).json({ erro: 'Situação de pagamento inválida.' });
    const desfazer = pagou === 'NÃO';
    const versao = req.body.versao;
    if (versao !== undefined && (!Number.isInteger(versao) || versao < 1)) return res.status(400).json({ erro: 'Versão do pedido inválida.' });

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
    let dataFinal = desfazer ? null : dataPagamento;
    if (!desfazer && (!dataFinal || !dataFinal.trim())) {
      const agora = agoraBrasilia();
      const dd = String(agora.getDate()).padStart(2, '0');
      const mm = String(agora.getMonth() + 1).padStart(2, '0');
      const aa = String(agora.getFullYear()).slice(-2);
      dataFinal = `${dd}/${mm}/${aa}`;
    }
    if (!desfazer && !dataCurtaValida(dataFinal)) {
      return res.status(400).json({ erro: 'Informe uma data válida para o pagamento.' });
    }

    const alterado = await db.query(`
      UPDATE fonadas SET pagou = $1, recebi = $2, data_pagamento = $3, atualizado_em = NOW(), versao = versao + 1
      WHERE id = $4 AND excluido_em IS NULL AND ($5::int IS NULL OR versao = $5) RETURNING id
    `, [pagou, desfazer ? null : (recebi ?? null), dataFinal, req.params.id, versao ?? null]);
    if (!alterado.rows.length) return res.status(409).json({ erro: 'Pedido alterado por outra pessoa. Atualize a cobrança.' });

    res.json({ ok: true, dataPagamento: dataFinal });
  } catch (erro) {
    console.error('Erro ao dar baixa:', erro);
    res.status(500).json({ erro: 'Erro ao dar baixa.' });
  }
});

// Reverte apenas uma baixa existente; preserva os dados do pedido e da cobrança.
router.put('/:id/desfazer-baixa', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
      return res.status(400).json({ erro: 'Pedido inválido.' });
    }
    const versao = req.body?.versao;
    if (!Number.isInteger(versao) || versao < 1) return res.status(400).json({ erro: 'Versão do pedido inválida.' });
    const resultado = await db.query(`
      UPDATE fonadas
      SET pagou = 'NÃO', recebi = NULL, data_pagamento = NULL, atualizado_em = NOW(), versao = versao + 1
      WHERE id = $1 AND excluido_em IS NULL AND pagou = 'SIM' AND versao = $2
      RETURNING id, versao
    `, [req.params.id, versao]);
    if (resultado.rows.length) return res.json({ ok: true, versao: resultado.rows[0].versao });

    const pedido = await db.query('SELECT pagou, versao FROM fonadas WHERE id = $1 AND excluido_em IS NULL', [req.params.id]);
    if (!pedido.rows.length) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (pedido.rows[0].versao !== versao) return res.status(409).json({ erro: 'Pedido alterado por outra pessoa. Atualize a cobrança.' });
    return res.status(409).json({ erro: 'Este pedido já não está marcado como recebido.' });
  } catch (erro) {
    console.error('Erro ao desfazer baixa Fonada:', erro);
    return res.status(500).json({ erro: 'Não foi possível desfazer a baixa.' });
  }
});

function idsValidos(corpo) {
  if (!Array.isArray(corpo)) return [];
  return [...new Set(corpo.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

// PUT /api/cobranca/acoes/marcar-impressos
// Registra que o recibo foi preparado para impressão. A coluna já faz
// parte dos pedidos Fonada e aceita os registros antigos normalmente.
router.put('/acoes/marcar-impressos', async (req, res) => {
  try {
    const ids = idsValidos(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ erro: 'Selecione pelo menos um pedido.' });

    const resultado = await db.query(`
      UPDATE fonadas
      SET impresso = 'SIM', atualizado_em = NOW(), versao = versao + 1
      WHERE id = ANY($1::int[]) AND excluido_em IS NULL
      RETURNING id
    `, [ids]);

    res.json({ ok: true, quantidade: resultado.rows.length });
  } catch (erro) {
    console.error('Erro ao registrar impressão dos recibos:', erro);
    res.status(500).json({ erro: 'Não foi possível registrar a impressão dos recibos.' });
  }
});

async function bloquearLote(client, ids, versoes) {
  const bloqueados = await client.query(`
    SELECT f.id, f.versao, f.excluido_em, c.bloqueado
    FROM fonadas f LEFT JOIN clientes c ON c.id = f.cliente_id
    WHERE f.id = ANY($1::int[]) ORDER BY f.id FOR UPDATE OF f
  `, [ids]);
  if (bloqueados.rows.length !== ids.length || bloqueados.rows.some((item) => item.excluido_em)) {
    return { status: 409, erro: 'A seleção mudou. Atualize a cobrança antes de continuar.' };
  }
  if (bloqueados.rows.some((item) => item.bloqueado)) {
    return { status: 403, erro: 'Há um cliente bloqueado entre os pedidos selecionados.' };
  }
  if (versoes !== undefined) {
    if (!versoes || typeof versoes !== 'object' || Array.isArray(versoes) ||
        bloqueados.rows.some((item) => !Number.isInteger(versoes[item.id]) || versoes[item.id] !== item.versao)) {
      return { status: 409, erro: 'Um pedido foi alterado por outra pessoa. Atualize a cobrança.' };
    }
  }
  return null;
}

// PUT /api/cobranca/baixa-lote
router.put('/acoes/baixa-lote', async (req, res) => {
  let client;
  try {
    const ids = idsValidos(req.body.ids);
    if (ids.length === 0) return res.status(400).json({ erro: 'Selecione pelo menos um pedido.' });

    let dataFinal = String(req.body.dataPagamento || '').trim();
    if (!dataFinal) {
      const agora = agoraBrasilia();
      const dd = String(agora.getDate()).padStart(2, '0');
      const mm = String(agora.getMonth() + 1).padStart(2, '0');
      dataFinal = `${dd}/${mm}/${String(agora.getFullYear()).slice(-2)}`;
    }
    if (!dataCurtaValida(dataFinal)) {
      return res.status(400).json({ erro: 'Informe uma data válida para o pagamento.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const conflito = await bloquearLote(client, ids, req.body.versoes);
    if (conflito) {
      await client.query('ROLLBACK');
      return res.status(conflito.status).json({ erro: conflito.erro });
    }
    const resultado = await client.query(`
      UPDATE fonadas
      SET pagou = 'SIM', recebi = $1, data_pagamento = $2, atualizado_em = NOW(), versao = versao + 1
      WHERE id = ANY($3::int[]) AND excluido_em IS NULL
      RETURNING id
    `, [String(req.body.recebi || '').trim() || null, dataFinal, ids]);
    await client.query('COMMIT');

    res.json({ ok: true, quantidade: resultado.rows.length, dataPagamento: dataFinal });
  } catch (erro) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao dar baixa em lote:', erro);
    res.status(500).json({ erro: 'Erro ao dar baixa nos pedidos.' });
  } finally {
    client?.release();
  }
});

// PUT /api/cobranca/acoes/reagendar-lote
router.put('/acoes/reagendar-lote', async (req, res) => {
  let client;
  try {
    const ids = idsValidos(req.body.ids);
    const cobrarDia = String(req.body.cobrarDia || '').trim();
    if (ids.length === 0) return res.status(400).json({ erro: 'Selecione pelo menos um pedido.' });
    if (!dataCurtaValida(cobrarDia)) {
      return res.status(400).json({ erro: 'Informe uma data válida para reagendar.' });
    }
    if (chaveData(cobrarDia) < chaveHojeBrasilia()) {
      return res.status(400).json({ erro: 'A nova data de cobrança não pode estar no passado.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const conflito = await bloquearLote(client, ids, req.body.versoes);
    if (conflito) {
      await client.query('ROLLBACK');
      return res.status(conflito.status).json({ erro: conflito.erro });
    }
    const resultado = await client.query(`
      UPDATE fonadas
      SET cobranca_reagendada = $1, atualizado_em = NOW(), versao = versao + 1
      WHERE id = ANY($2::int[]) AND excluido_em IS NULL
      RETURNING id
    `, [cobrarDia, ids]);
    await client.query('COMMIT');

    res.json({ ok: true, quantidade: resultado.rows.length, cobrarDia });
  } catch (erro) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro ao reagendar cobranças:', erro);
    res.status(500).json({ erro: 'Erro ao reagendar os pedidos.' });
  } finally {
    client?.release();
  }
});

module.exports = router;
