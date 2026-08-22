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
const { db, pool, reservarProximaOs } = require('../db/database');
const { agoraBrasilia } = require('../utils/dataHora');

const router = express.Router();

const CAMPOS = [
  'senha_os', 'cliente_id', 'nome_comprador', 'data_pedido', 'horario_pedido', 'nascimento', 'tipo', 'recall', 'recall_codigo',
  'p1_dia', 'p1_para', 'p1_tema', 'p1_mensagem', 'p1_fixo', 'p1_celular', 'p1_horario', 'p1_quem_oferece', 'p1_resultado', 'p1_passada_por',
  'p2_dia', 'p2_para', 'p2_tema', 'p2_mensagem', 'p2_fixo', 'p2_celular', 'p2_horario', 'p2_quem_oferece', 'p2_resultado', 'p2_passada_por',
  'comprador_fixo', 'comprador_whatsapp', 'comprador_celular', 'comprador_endereco', 'comprador_complemento', 'comprador_bairro', 'comprador_referencia',
  'valor', 'cobranca', 'periodo', 'pagou', 'recebi',
  'vender', 'status', 'impresso', 'vendedor_usuario',
];

const FILTROS_FONADA = {
  nome_comprador: { colunas: ['nome_comprador'], tipo: 'texto' },
  destinatario: { colunas: ['p1_para', 'p2_para'], tipo: 'texto' },
  fixo_comprador: { colunas: ['comprador_fixo'], tipo: 'fixo' },
  celular_comprador: { colunas: ['comprador_celular', 'comprador_whatsapp'], tipo: 'celular' },
  fixo_destinatario: { colunas: ['p1_fixo', 'p2_fixo'], tipo: 'fixo' },
  celular_destinatario: { colunas: ['p1_celular', 'p2_celular'], tipo: 'celular' },
  endereco: { colunas: ['comprador_endereco'], tipo: 'texto' },
  aniversario: { colunas: ['nascimento'], tipo: 'data' },
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
//
// Reserva o número atomicamente (ver reservarProximaOs em
// db/database.js) — duas pessoas pedindo "próxima O.S." ao mesmo
// tempo, em máquinas diferentes, nunca recebem o mesmo número. Isso
// é diferente de só calcular MAX(senha_os)+1, que tinha uma janela de
// tempo entre "calcular" e "salvar" onde outra pessoa podia calcular
// o mesmo valor.
router.get('/proxima-os', async (req, res) => {
  try {
    const proximo = await reservarProximaOs(pool, 'fonada');
    res.json({ proximaOs: String(proximo) });
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
        senha_os ILIKE $11 OR
        comprador_whatsapp ILIKE $12
      )`;
      const termo = `%${busca}%`;
      params = new Array(12).fill(termo);
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
    const hoje = agoraBrasilia();
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
      if (cliente.bloqueado) {
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível criar novos pedidos para ele.' });
      }
      dados.nome_comprador = cliente.nome;
      dados.comprador_fixo = cliente.fixo;
      dados.comprador_whatsapp = cliente.whatsapp;
      dados.comprador_celular = cliente.celular;
      dados.comprador_endereco = cliente.endereco;
      dados.comprador_complemento = cliente.complemento;
      dados.comprador_bairro = cliente.bairro;
      dados.comprador_referencia = cliente.referencia;
    }

    if (!dados.nome_comprador || !dados.nome_comprador.trim()) {
      return res.status(400).json({ erro: 'O nome do comprador é obrigatório.' });
    }

    // Vendedor é sempre quem está logado no momento de criar o pedido —
    // não é um campo escolhido manualmente, para não depender de a
    // pessoa lembrar de preencher certo.
    dados.vendedor_usuario = req.usuario.usuario;

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
    const existenteResultado = await db.query('SELECT id, cliente_id FROM fonadas WHERE id = $1', [req.params.id]);
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
  const client = await pool.connect();
  try {
    const existente = await client.query('SELECT id FROM fonadas WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) {
      client.release();
      return res.status(404).json({ erro: 'Registro não encontrado.' });
    }

    await client.query('BEGIN');
    // O histórico de tentativas ("não atendeu") referencia o pedido
    // por chave estrangeira — sem apagar essas linhas primeiro, o
    // Postgres recusa apagar a fonada com um erro de violação de
    // integridade referencial. Apaga o histórico junto, de propósito:
    // ele não faz sentido isolado sem o pedido a que pertence.
    await client.query('DELETE FROM tentativas_contato WHERE pedido_id = $1', [req.params.id]);
    await client.query('DELETE FROM fonadas WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');

    res.json({ ok: true });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao apagar fonada:', erro);
    res.status(500).json({ erro: 'Erro ao apagar registro.' });
  } finally {
    client.release();
  }
});

module.exports = router;
