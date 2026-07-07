// src/routes/aoVivo.js
// Rotas para gerenciar os pedidos de mensagem ao vivo (carro de som).
//
// Migrado para PostgreSQL: rotas assíncronas, placeholders $1/$2/...
// calculados dinamicamente, LIKE trocado por ILIKE.

const express = require('express');
const { db } = require('../db/database');
const { agoraBrasilia } = require('../utils/dataHora');

const router = express.Router();

const CAMPOS = [
  'numero_os', 'cliente_id', 'data_pedido', 'horario_pedido', 'dia_entrega', 'horario_entrega',
  'comprador', 'para', 'oferecimento',
  'endereco', 'bairro', 'referencia',
  'fixo_local', 'celular_local', 'celular', 'celular2',
  'tema_1', 'mensagem_codigo_1', 'tema_2', 'mensagem_codigo_2', 'tema_3', 'mensagem_codigo_3', 'tema_4', 'mensagem_codigo_4',
  'musica_1', 'musica_2', 'musica_3', 'musica_4', 'musica_5', 'musica_6',
  'aniversario', 'valor', 'pagamento', 'brinde', 'observacoes',
];

const FILTROS_AOVIVO = {
  comprador: { colunas: ['comprador'], tipo: 'texto' },
  destinatario: { colunas: ['para'], tipo: 'texto' },
  celular_comprador: { colunas: ['celular', 'celular2'], tipo: 'celular' },
  fixo_local: { colunas: ['fixo_local'], tipo: 'fixo' },
  celular_local: { colunas: ['celular_local'], tipo: 'celular' },
  endereco: { colunas: ['endereco'], tipo: 'texto' },
  aniversario: { colunas: ['aniversario'], tipo: 'data' },
  data_pedido: { colunas: ['data_pedido'], tipo: 'data' },
  dia_mensagem: { colunas: ['dia_entrega'], tipo: 'data' },
  os: { colunas: ['numero_os'], tipo: 'exato' },
};

function montarFiltro(campo, termo, indiceInicial) {
  const filtro = FILTROS_AOVIVO[campo];
  if (!filtro) return null;

  if (filtro.tipo === 'exato') {
    const condicoes = filtro.colunas.map((col, i) => `${col} = $${indiceInicial + i}`);
    const params = filtro.colunas.map(() => termo);
    return { where: `(${condicoes.join(' OR ')})`, params };
  }

  const padrao = filtro.tipo === 'data' ? `${termo}%` : `%${termo}%`;
  const condicoes = filtro.colunas.map((col, i) => `${col} ILIKE $${indiceInicial + i}`);
  const params = filtro.colunas.map(() => padrao);

  return { where: `(${condicoes.join(' OR ')})`, params };
}

// GET /api/ao-vivo/proxima-os
router.get('/proxima-os', async (req, res) => {
  try {
    const resultado = await db.query(`
      SELECT numero_os FROM ao_vivo WHERE numero_os IS NOT NULL AND numero_os != ''
    `);

    let maior = 0;
    for (const linha of resultado.rows) {
      const n = parseInt(linha.numero_os, 10);
      if (!isNaN(n) && n > maior) maior = n;
    }

    res.json({ proximaOs: String(maior + 1) });
  } catch (erro) {
    console.error('Erro ao calcular próxima O.S.:', erro);
    res.status(500).json({ erro: 'Erro ao calcular próxima O.S.' });
  }
});

// GET /api/ao-vivo?busca=texto&campo=comprador&pagina=1
router.get('/', async (req, res) => {
  try {
    const busca = (req.query.busca || '').trim();
    const campo = (req.query.campo || '').trim();
    const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
    const porPagina = Math.min(parseInt(req.query.porPagina) || 30, 200);
    const offset = (pagina - 1) * porPagina;

    let where = 'WHERE excluido_em IS NULL';
    let params = [];

    if (busca && campo) {
      const filtro = montarFiltro(campo, busca, 1);
      if (filtro) {
        where += ` AND ${filtro.where}`;
        params = filtro.params;
      }
    } else if (busca) {
      where += ` AND (
        comprador ILIKE $1 OR para ILIKE $2 OR
        celular ILIKE $3 OR celular2 ILIKE $4 OR
        fixo_local ILIKE $5 OR celular_local ILIKE $6 OR
        endereco ILIKE $7 OR
        numero_os ILIKE $8
      )`;
      const termo = `%${busca}%`;
      params = new Array(8).fill(termo);
    }

    const totalResultado = await db.query(`SELECT COUNT(*) as n FROM ao_vivo ${where}`, params);
    const total = parseInt(totalResultado.rows[0].n, 10);

    const idxLimit = params.length + 1;
    const idxOffset = params.length + 2;
    const linhasResultado = await db.query(`
      SELECT * FROM ao_vivo ${where}
      ORDER BY id DESC
      LIMIT $${idxLimit} OFFSET $${idxOffset}
    `, [...params, porPagina, offset]);

    res.json({ total, pagina, porPagina, pedidos: linhasResultado.rows });
  } catch (erro) {
    console.error('Erro ao listar ao vivo:', erro);
    res.status(500).json({ erro: 'Erro ao listar pedidos.' });
  }
});

// GET /api/ao-vivo/hoje
router.get('/hoje', async (req, res) => {
  try {
    const hoje = agoraBrasilia();
    const dd = String(hoje.getDate()).padStart(2, '0');
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const yy = String(hoje.getFullYear()).slice(-2);
    const hojeStr = `${dd}/${mm}/${yy}`;

    const resultado = await db.query(`
      SELECT * FROM ao_vivo
      WHERE dia_entrega = $1 AND excluido_em IS NULL
      ORDER BY horario_entrega ASC
    `, [hojeStr]);

    res.json({ data: hojeStr, pedidos: resultado.rows });
  } catch (erro) {
    console.error('Erro ao buscar ao vivo de hoje:', erro);
    res.status(500).json({ erro: 'Erro ao buscar pedidos de hoje.' });
  }
});

// GET /api/ao-vivo/imprimir?ids=1,2,3
router.get('/imprimir', async (req, res) => {
  try {
    const idsBrutos = (req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (idsBrutos.length === 0) return res.status(400).json({ erro: 'Informe ao menos um id.' });

    const placeholders = idsBrutos.map((_, i) => `$${i + 1}`).join(', ');
    const pedidosResultado = await db.query(
      `SELECT * FROM ao_vivo WHERE id IN (${placeholders})`, idsBrutos
    );
    const pedidos = pedidosResultado.rows;

    const clienteIds = [...new Set(pedidos.filter((p) => p.cliente_id).map((p) => p.cliente_id))];
    const clientesPorId = {};
    if (clienteIds.length > 0) {
      const ph2 = clienteIds.map((_, i) => `$${i + 1}`).join(', ');
      const clientesResultado = await db.query(
        `SELECT * FROM clientes WHERE id IN (${ph2})`, clienteIds
      );
      for (const c of clientesResultado.rows) clientesPorId[c.id] = c;
    }

    const porId = {};
    for (const p of pedidos) porId[p.id] = p;

    const resultado = idsBrutos.map((idStr) => {
      const p = porId[Number(idStr)];
      if (!p) return null;
      const cliente = p.cliente_id ? clientesPorId[p.cliente_id] : null;

      return {
        id: p.id,
        numero_os: p.numero_os,
        data_pedido: p.data_pedido,
        dia_entrega: p.dia_entrega,
        horario_entrega: p.horario_entrega,
        brinde: p.brinde,
        para: p.para,
        oferecimento: p.oferecimento,
        endereco: p.endereco,
        bairro: p.bairro,
        referencia: p.referencia,
        fixoLocal: p.fixo_local,
        celularLocal: p.celular_local,
        tema1: p.tema_1, msg1: p.mensagem_codigo_1,
        tema2: p.tema_2, msg2: p.mensagem_codigo_2,
        tema3: p.tema_3, msg3: p.mensagem_codigo_3,
        tema4: p.tema_4, msg4: p.mensagem_codigo_4,
        musicas: [p.musica_1, p.musica_2, p.musica_3, p.musica_4, p.musica_5, p.musica_6].filter(Boolean),
        nomeComprador: cliente ? cliente.nome : p.comprador,
        telefoneComprador: cliente ? (cliente.celular || cliente.fixo) : (p.celular || p.celular2),
        enderecoCobranca: cliente ? cliente.endereco : null,
        bairroCobranca: cliente ? cliente.bairro : null,
        valor: p.valor,
        pagamento: p.pagamento,
        cliente_id: p.cliente_id,
      };
    }).filter(Boolean);

    res.json({ pedidos: resultado });
  } catch (erro) {
    console.error('Erro ao preparar impressão:', erro);
    res.status(500).json({ erro: 'Erro ao preparar impressão.' });
  }
});

// POST /api/ao-vivo/:id/baixa  { entregue: true|false }
router.post('/:id/baixa', async (req, res) => {
  try {
    const { entregue } = req.body;
    if (typeof entregue !== 'boolean') {
      return res.status(400).json({ erro: 'Informe se foi entregue (true ou false).' });
    }

    const existenteResultado = await db.query('SELECT id, cliente_id FROM ao_vivo WHERE id = $1', [req.params.id]);
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
    const hh = String(agora.getHours()).padStart(2, '0');
    const min = String(agora.getMinutes()).padStart(2, '0');

    const usuarioResultado = await db.query('SELECT nome, usuario FROM usuarios WHERE id = $1', [req.usuario.id]);
    const usuarioLogado = usuarioResultado.rows[0];
    const nomeExibicao = usuarioLogado ? (usuarioLogado.nome || usuarioLogado.usuario) : req.usuario.usuario;

    const resultado = `${entregue ? 'ENTREGUE' : 'NÃO ENTREGUE'}, ${dd}/${mm}/${aa} às ${hh}:${min} por ${nomeExibicao}`;

    await db.query(
      'UPDATE ao_vivo SET resultado_entrega = $1, atualizado_em = NOW() WHERE id = $2',
      [resultado, req.params.id]
    );

    res.json({ ok: true, resultado });
  } catch (erro) {
    console.error('Erro ao dar baixa no ao vivo:', erro);
    res.status(500).json({ erro: 'Erro ao dar baixa.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const resultado = await db.query('SELECT * FROM ao_vivo WHERE id = $1', [req.params.id]);
    const item = resultado.rows[0];
    if (!item) return res.status(404).json({ erro: 'Registro não encontrado.' });
    res.json(item);
  } catch (erro) {
    console.error('Erro ao buscar ao vivo:', erro);
    res.status(500).json({ erro: 'Erro ao buscar registro.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const dados = { ...req.body };

    if (dados.cliente_id) {
      const clienteResultado = await db.query('SELECT * FROM clientes WHERE id = $1', [dados.cliente_id]);
      const cliente = clienteResultado.rows[0];
      if (!cliente) {
        return res.status(400).json({ erro: 'Cliente não encontrado.' });
      }
      if (cliente.bloqueado) {
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível criar novos pedidos para ele.' });
      }
      dados.comprador = cliente.nome;
      dados.celular = cliente.celular;
      dados.aniversario = cliente.nascimento;
    }

    if (!dados.comprador || !dados.comprador.trim()) {
      return res.status(400).json({ erro: 'O nome do comprador é obrigatório.' });
    }

    const campos = CAMPOS.filter((c) => dados[c] !== undefined);
    const placeholders = campos.map((_, i) => `$${i + 1}`).join(', ');
    const valores = campos.map((c) => dados[c]);

    const resultado = await db.query(`
      INSERT INTO ao_vivo (${campos.join(', ')}) VALUES (${placeholders})
      RETURNING *
    `, valores);

    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error('Erro ao criar ao vivo:', erro);
    res.status(500).json({ erro: 'Erro ao criar registro.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existenteResultado = await db.query('SELECT id, cliente_id FROM ao_vivo WHERE id = $1', [req.params.id]);
    if (existenteResultado.rows.length === 0) return res.status(404).json({ erro: 'Registro não encontrado.' });

    const clienteId = existenteResultado.rows[0].cliente_id;
    if (clienteId) {
      const clienteResultado = await db.query('SELECT bloqueado FROM clientes WHERE id = $1', [clienteId]);
      if (clienteResultado.rows[0]?.bloqueado) {
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível editar os pedidos dele.' });
      }
    }

    const dados = req.body;
    const campos = CAMPOS.filter((c) => dados[c] !== undefined);
    if (campos.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    const setClause = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => dados[c]);
    const idxId = campos.length + 1;

    await db.query(
      `UPDATE ao_vivo SET ${setClause}, atualizado_em = NOW() WHERE id = $${idxId}`,
      [...valores, req.params.id]
    );

    const atualizado = await db.query('SELECT * FROM ao_vivo WHERE id = $1', [req.params.id]);
    res.json(atualizado.rows[0]);
  } catch (erro) {
    console.error('Erro ao atualizar ao vivo:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar registro.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existente = await db.query('SELECT id FROM ao_vivo WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) return res.status(404).json({ erro: 'Registro não encontrado.' });

    await db.query('DELETE FROM ao_vivo WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao apagar ao vivo:', erro);
    res.status(500).json({ erro: 'Erro ao apagar registro.' });
  }
});

module.exports = router;
