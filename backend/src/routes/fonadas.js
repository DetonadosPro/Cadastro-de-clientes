// src/routes/fonadas.js
// Rotas para gerenciar as mensagens fonadas (por telefone).
// Cada registro é um PACOTE com direito a 2 entregas em até 6 meses.
//
// Migrado para PostgreSQL: rotas assíncronas, placeholders $1/$2/...
// calculados dinamicamente (já que a quantidade de colunas em cada
// filtro/campo varia), LIKE trocado por ILIKE (case-insensitive nativo
// do Postgres — o SQLite já era case-insensitive por padrão em ASCII,
// então ILIKE é o equivalente correto aqui).

const express = require('express');
const { db } = require('../db/database');

const router = express.Router();

const CAMPOS = [
  'senha_os', 'cliente_id', 'nome_comprador', 'data_pedido', 'horario_pedido', 'nascimento', 'tipo', 'recall', 'recall_codigo',
  'p1_dia', 'p1_para', 'p1_tema', 'p1_mensagem', 'p1_fixo', 'p1_celular', 'p1_horario', 'p1_quem_oferece', 'p1_resultado',
  'p2_dia', 'p2_para', 'p2_tema', 'p2_mensagem', 'p2_fixo', 'p2_celular', 'p2_horario', 'p2_quem_oferece', 'p2_resultado',
  'comprador_fixo', 'comprador_celular', 'comprador_endereco', 'comprador_complemento', 'comprador_bairro', 'comprador_referencia',
  'valor', 'cobranca', 'periodo', 'pagou', 'recebi',
  'vender', 'status', 'impresso',
];

const FILTROS_FONADA = {
  nome_comprador: { colunas: ['nome_comprador'], tipo: 'texto' },
  destinatario: { colunas: ['p1_para', 'p2_para'], tipo: 'texto' },
  fixo_comprador: { colunas: ['comprador_fixo'], tipo: 'fixo' },
  celular_comprador: { colunas: ['comprador_celular'], tipo: 'celular' },
  fixo_destinatario: { colunas: ['p1_fixo', 'p2_fixo'], tipo: 'fixo' },
  celular_destinatario: { colunas: ['p1_celular', 'p2_celular'], tipo: 'celular' },
  endereco: { colunas: ['comprador_endereco'], tipo: 'texto' },
  aniversario: { colunas: ['nascimento'], tipo: 'data' },
  data_pedido: { colunas: ['data_pedido'], tipo: 'data' },
  dia_mensagem: { colunas: ['p1_dia', 'p2_dia'], tipo: 'data' },
  os: { colunas: ['senha_os'], tipo: 'exato' },
};

// Monta a cláusula WHERE para um filtro de campo específico.
// "indiceInicial" é o número do próximo placeholder $N disponível.
function montarFiltro(campo, termo, indiceInicial) {
  const filtro = FILTROS_FONADA[campo];
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

// GET /api/fonadas/proxima-os
router.get('/proxima-os', async (req, res) => {
  try {
    const resultado = await db.query(`
      SELECT senha_os FROM fonadas WHERE senha_os IS NOT NULL AND senha_os != ''
    `);

    let maior = 0;
    for (const linha of resultado.rows) {
      const n = parseInt(linha.senha_os, 10);
      if (!isNaN(n) && n > maior) maior = n;
    }

    res.json({ proximaOs: String(maior + 1) });
  } catch (erro) {
    console.error('Erro ao calcular próxima O.S.:', erro);
    res.status(500).json({ erro: 'Erro ao calcular próxima O.S.' });
  }
});

// GET /api/fonadas?busca=texto&campo=nome_comprador&pagina=1
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
        nome_comprador ILIKE $1 OR
        p1_para ILIKE $2 OR p2_para ILIKE $3 OR
        comprador_fixo ILIKE $4 OR comprador_celular ILIKE $5 OR
        p1_fixo ILIKE $6 OR p2_fixo ILIKE $7 OR
        p1_celular ILIKE $8 OR p2_celular ILIKE $9 OR
        comprador_endereco ILIKE $10 OR
        senha_os ILIKE $11
      )`;
      const termo = `%${busca}%`;
      params = new Array(11).fill(termo);
    }

    const totalResultado = await db.query(`SELECT COUNT(*) as n FROM fonadas ${where}`, params);
    const total = parseInt(totalResultado.rows[0].n, 10);

    const idxLimit = params.length + 1;
    const idxOffset = params.length + 2;
    const linhasResultado = await db.query(`
      SELECT * FROM fonadas ${where}
      ORDER BY id DESC
      LIMIT $${idxLimit} OFFSET $${idxOffset}
    `, [...params, porPagina, offset]);

    res.json({ total, pagina, porPagina, fonadas: linhasResultado.rows });
  } catch (erro) {
    console.error('Erro ao listar fonadas:', erro);
    res.status(500).json({ erro: 'Erro ao listar fonadas.' });
  }
});

// GET /api/fonadas/hoje
router.get('/hoje', async (req, res) => {
  try {
    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2, '0');
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const yy = String(hoje.getFullYear()).slice(-2);
    const hojeStr = `${dd}/${mm}/${yy}`;

    const resultado = await db.query(`
      SELECT * FROM fonadas
      WHERE (p1_dia = $1 OR p2_dia = $1) AND excluido_em IS NULL
      ORDER BY p1_horario ASC
    `, [hojeStr]);

    res.json({ data: hojeStr, fonadas: resultado.rows });
  } catch (erro) {
    console.error('Erro ao buscar fonadas de hoje:', erro);
    res.status(500).json({ erro: 'Erro ao buscar fonadas de hoje.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const resultado = await db.query('SELECT * FROM fonadas WHERE id = $1', [req.params.id]);
    const item = resultado.rows[0];
    if (!item) return res.status(404).json({ erro: 'Registro não encontrado.' });
    res.json(item);
  } catch (erro) {
    console.error('Erro ao buscar fonada:', erro);
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
      dados.nome_comprador = cliente.nome;
      dados.comprador_fixo = cliente.fixo;
      dados.comprador_celular = cliente.celular;
      dados.comprador_endereco = cliente.endereco;
      dados.comprador_complemento = cliente.complemento;
      dados.comprador_bairro = cliente.bairro;
      dados.comprador_referencia = cliente.referencia;
    }

    if (!dados.nome_comprador || !dados.nome_comprador.trim()) {
      return res.status(400).json({ erro: 'O nome do comprador é obrigatório.' });
    }

    const campos = CAMPOS.filter((c) => dados[c] !== undefined);
    const placeholders = campos.map((_, i) => `$${i + 1}`).join(', ');
    const valores = campos.map((c) => dados[c]);

    const resultado = await db.query(`
      INSERT INTO fonadas (${campos.join(', ')}) VALUES (${placeholders})
      RETURNING *
    `, valores);

    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error('Erro ao criar fonada:', erro);
    res.status(500).json({ erro: 'Erro ao criar registro.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existente = await db.query('SELECT id FROM fonadas WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) return res.status(404).json({ erro: 'Registro não encontrado.' });

    const dados = req.body;
    const campos = CAMPOS.filter((c) => dados[c] !== undefined);
    if (campos.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    const setClause = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => dados[c]);
    const idxId = campos.length + 1;

    await db.query(
      `UPDATE fonadas SET ${setClause}, atualizado_em = NOW() WHERE id = $${idxId}`,
      [...valores, req.params.id]
    );

    const atualizado = await db.query('SELECT * FROM fonadas WHERE id = $1', [req.params.id]);
    res.json(atualizado.rows[0]);
  } catch (erro) {
    console.error('Erro ao atualizar fonada:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar registro.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existente = await db.query('SELECT id FROM fonadas WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) return res.status(404).json({ erro: 'Registro não encontrado.' });

    await db.query('DELETE FROM fonadas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao apagar fonada:', erro);
    res.status(500).json({ erro: 'Erro ao apagar registro.' });
  }
});

module.exports = router;
