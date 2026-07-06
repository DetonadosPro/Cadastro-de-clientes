// src/routes/clientes.js
// Rotas para o cadastro de clientes — cadastro único, compartilhado
// entre mensagem fonada e mensagem ao vivo.
//
// Migrado para PostgreSQL: rotas assíncronas, placeholders $1/$2/...
// (gerados dinamicamente quando a lista de campos varia), e as
// transações (BEGIN/COMMIT/ROLLBACK) usam um client dedicado do pool
// via pool.connect() — isso é necessário porque, diferente do SQLite
// (uma conexão única), o driver "pg" usa um pool de conexões: se cada
// query pegasse uma conexão diferente, BEGIN e COMMIT poderiam acabar
// em conexões diferentes e a transação não teria efeito nenhum.

const express = require('express');
const { db, pool } = require('../db/database');

const router = express.Router();

const CAMPOS = ['nome', 'nascimento', 'fixo', 'celular', 'endereco', 'complemento', 'bairro', 'referencia'];

function normalizarNome(nome) {
  return String(nome || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nomesParecidos(nomeA, nomeB) {
  const a = normalizarNome(nomeA);
  const b = normalizarNome(nomeB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const palavrasA = new Set(a.split(' ').filter((p) => p.length > 1));
  const palavrasB = new Set(b.split(' ').filter((p) => p.length > 1));
  if (palavrasA.size === 0 || palavrasB.size === 0) return false;
  let comuns = 0;
  for (const p of palavrasA) if (palavrasB.has(p)) comuns++;
  const proporcao = comuns / Math.min(palavrasA.size, palavrasB.size);
  return proporcao >= 0.5;
}

const FILTROS_CLIENTE = {
  nome: { coluna: 'nome', tipo: 'texto' },
  nascimento: { coluna: 'nascimento', tipo: 'data' },
  celular: { coluna: 'celular', tipo: 'texto' },
  endereco: { coluna: 'endereco', tipo: 'texto' },
};

// Monta a cláusula WHERE de um filtro específico. "indiceInicial" é o
// número do próximo placeholder $N disponível — precisa ser passado
// porque essa cláusula pode vir depois de outras já montadas na mesma
// query (ex: WHERE excluido_em IS NULL AND <filtro>).
function montarFiltroCliente(campo, termo, indiceInicial) {
  const filtro = FILTROS_CLIENTE[campo];
  if (!filtro) return null;
  const padrao = filtro.tipo === 'data' ? `${termo}%` : `%${termo}%`;
  return { where: `${filtro.coluna} LIKE $${indiceInicial}`, params: [padrao] };
}

// GET /api/clientes?busca=nome&campo=nome&pagina=1
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
      const filtro = montarFiltroCliente(campo, busca, 1);
      if (filtro) {
        where += ` AND ${filtro.where}`;
        params = filtro.params;
      }
    } else if (busca) {
      where += ' AND nome LIKE $1';
      params = [`%${busca}%`];
    }

    const totalResultado = await db.query(`SELECT COUNT(*) as n FROM clientes ${where}`, params);
    const total = parseInt(totalResultado.rows[0].n, 10);

    // LIMIT/OFFSET usam os próximos dois placeholders depois dos já
    // usados no WHERE (ex: se params tem 1 item, LIMIT é $2 e OFFSET $3).
    const idxLimit = params.length + 1;
    const idxOffset = params.length + 2;
    const linhasResultado = await db.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM fonadas WHERE cliente_id = c.id AND excluido_em IS NULL) as total_fonada,
        (SELECT COUNT(*) FROM ao_vivo WHERE cliente_id = c.id AND excluido_em IS NULL) as total_aovivo
      FROM clientes c
      ${where}
      ORDER BY c.nome ASC
      LIMIT $${idxLimit} OFFSET $${idxOffset}
    `, [...params, porPagina, offset]);

    res.json({ total, pagina, porPagina, clientes: linhasResultado.rows });
  } catch (erro) {
    console.error('Erro ao listar clientes:', erro);
    res.status(500).json({ erro: 'Erro ao listar clientes.' });
  }
});

// GET /api/clientes/lixeira?busca=nome&pagina=1
router.get('/lixeira', async (req, res) => {
  try {
    const busca = (req.query.busca || '').trim();
    const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
    const porPagina = Math.min(parseInt(req.query.porPagina) || 30, 200);
    const offset = (pagina - 1) * porPagina;

    let where = 'WHERE c.excluido_em IS NOT NULL';
    let params = [];
    if (busca) {
      where += ' AND c.nome LIKE $1';
      params = [`%${busca}%`];
    }

    const totalResultado = await db.query(`SELECT COUNT(*) as n FROM clientes c ${where}`, params);
    const total = parseInt(totalResultado.rows[0].n, 10);

    const idxLimit = params.length + 1;
    const idxOffset = params.length + 2;
    const linhasResultado = await db.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM fonadas WHERE cliente_id = c.id AND excluido_em IS NOT NULL) as total_fonada,
        (SELECT COUNT(*) FROM ao_vivo WHERE cliente_id = c.id AND excluido_em IS NOT NULL) as total_aovivo
      FROM clientes c ${where}
      ORDER BY excluido_em DESC
      LIMIT $${idxLimit} OFFSET $${idxOffset}
    `, [...params, porPagina, offset]);

    res.json({ total, pagina, porPagina, clientes: linhasResultado.rows });
  } catch (erro) {
    console.error('Erro ao listar lixeira:', erro);
    res.status(500).json({ erro: 'Erro ao listar lixeira.' });
  }
});

// GET /api/clientes/verificar-duplicidade?nome=X&nascimento=Y
router.get('/verificar-duplicidade', async (req, res) => {
  try {
    const nome = (req.query.nome || '').trim();
    const nascimento = (req.query.nascimento || '').trim();

    if (!nome || !nascimento) {
      return res.json({ possiveisDuplicados: [] });
    }

    const resultado = await db.query(
      'SELECT * FROM clientes WHERE excluido_em IS NULL AND nascimento = $1',
      [nascimento]
    );
    const possiveisDuplicados = resultado.rows.filter((c) => nomesParecidos(c.nome, nome));

    res.json({ possiveisDuplicados });
  } catch (erro) {
    console.error('Erro ao verificar duplicidade:', erro);
    res.status(500).json({ erro: 'Erro ao verificar duplicidade.' });
  }
});

// GET /api/clientes/:id
router.get('/:id', async (req, res) => {
  try {
    const clienteResultado = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    const cliente = clienteResultado.rows[0];
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    const pedidosFonadaResultado = await db.query(`
      SELECT id, senha_os, data_pedido, p1_dia, p1_para, p2_dia, p2_para, valor, pagou
      FROM fonadas WHERE cliente_id = $1 ORDER BY id DESC
    `, [req.params.id]);

    const pedidosAoVivoResultado = await db.query(`
      SELECT id, numero_os, data_pedido, dia_entrega, para, valor
      FROM ao_vivo WHERE cliente_id = $1 ORDER BY id DESC
    `, [req.params.id]);

    res.json({
      cliente,
      pedidosFonada: pedidosFonadaResultado.rows,
      pedidosAoVivo: pedidosAoVivoResultado.rows,
    });
  } catch (erro) {
    console.error('Erro ao buscar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao buscar cliente.' });
  }
});

// POST /api/clientes
router.post('/', async (req, res) => {
  try {
    const dados = req.body;
    if (!dados.nome || !dados.nome.trim()) {
      return res.status(400).json({ erro: 'O nome é obrigatório.' });
    }

    const campos = CAMPOS.filter((c) => dados[c] !== undefined);
    const placeholders = campos.map((_, i) => `$${i + 1}`).join(', ');
    const valores = campos.map((c) => dados[c]);

    const resultado = await db.query(`
      INSERT INTO clientes (${campos.join(', ')}) VALUES (${placeholders})
      RETURNING *
    `, valores);

    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error('Erro ao criar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao criar cliente.' });
  }
});

// PUT /api/clientes/:id/bloqueio — bloqueia ou desbloqueia um cliente.
// Rota separada da edição normal de dados cadastrais, por ser uma ação
// com efeito mais amplo (trava pedidos em todo o sistema).
router.put('/:id/bloqueio', async (req, res) => {
  try {
    const existente = await db.query('SELECT id FROM clientes WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    const { bloqueado, motivo } = req.body;
    if (typeof bloqueado !== 'boolean') {
      return res.status(400).json({ erro: 'Informe se o cliente deve ser bloqueado (true/false).' });
    }

    await db.query(`
      UPDATE clientes
      SET bloqueado = $1, bloqueio_motivo = $2, atualizado_em = NOW()
      WHERE id = $3
    `, [bloqueado, bloqueado ? (motivo || null) : null, req.params.id]);
    // Ao desbloquear, o motivo é limpo — evita ficar um motivo antigo
    // "fantasma" caso a pessoa seja bloqueada de novo no futuro, sem
    // reescrever o motivo.

    const atualizado = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    res.json(atualizado.rows[0]);
  } catch (erro) {
    console.error('Erro ao bloquear/desbloquear cliente:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar bloqueio do cliente.' });
  }
});

// PUT /api/clientes/:id
router.put('/:id', async (req, res) => {
  try {
    const existente = await db.query('SELECT id FROM clientes WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    const dados = req.body;
    const campos = CAMPOS.filter((c) => dados[c] !== undefined);
    if (campos.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    const setClause = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => dados[c]);
    const idxId = campos.length + 1;

    await db.query(
      `UPDATE clientes SET ${setClause}, atualizado_em = NOW() WHERE id = $${idxId}`,
      [...valores, req.params.id]
    );

    const atualizado = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    res.json(atualizado.rows[0]);
  } catch (erro) {
    console.error('Erro ao atualizar cliente:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar cliente.' });
  }
});

// GET /api/clientes/:id/pedidos-lixeira
// Lista os pedidos (fonada + ao vivo) de um cliente que está na lixeira,
// usados para exibir a "pasta" expandida na tela de Lixeira.
router.get('/:id/pedidos-lixeira', async (req, res) => {
  try {
    const fonadaResultado = await db.query(`
      SELECT id, senha_os, nome_comprador, data_pedido, valor
      FROM fonadas
      WHERE cliente_id = $1 AND excluido_em IS NOT NULL
      ORDER BY excluido_em DESC
    `, [req.params.id]);

    const aoVivoResultado = await db.query(`
      SELECT id, numero_os, comprador, dia_entrega, valor
      FROM ao_vivo
      WHERE cliente_id = $1 AND excluido_em IS NOT NULL
      ORDER BY excluido_em DESC
    `, [req.params.id]);

    res.json({
      fonada: fonadaResultado.rows,
      aoVivo: aoVivoResultado.rows,
    });
  } catch (erro) {
    console.error('Erro ao listar pedidos da lixeira:', erro);
    res.status(500).json({ erro: 'Não foi possível carregar os pedidos.' });
  }
});

// DELETE /api/clientes/:id
// Envia o cliente E os pedidos vinculados a ele para a lixeira (soft
// delete). Usa uma transação real (client dedicado) para garantir que
// as 3 atualizações aconteçam todas juntas, ou nenhuma.
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const existente = await client.query('SELECT id FROM clientes WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) {
      client.release();
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('UPDATE clientes SET excluido_em = NOW() WHERE id = $1', [req.params.id]);
    await client.query('UPDATE fonadas SET excluido_em = NOW() WHERE cliente_id = $1', [req.params.id]);
    await client.query('UPDATE ao_vivo SET excluido_em = NOW() WHERE cliente_id = $1', [req.params.id]);
    await client.query('COMMIT');

    res.json({ ok: true });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao excluir cliente:', erro);
    res.status(500).json({ erro: 'Não foi possível excluir o cliente.' });
  } finally {
    client.release();
  }
});

// POST /api/clientes/:id/restaurar
router.post('/:id/restaurar', async (req, res) => {
  const client = await pool.connect();
  try {
    const existente = await client.query('SELECT id FROM clientes WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) {
      client.release();
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('UPDATE clientes SET excluido_em = NULL WHERE id = $1', [req.params.id]);
    await client.query('UPDATE fonadas SET excluido_em = NULL WHERE cliente_id = $1', [req.params.id]);
    await client.query('UPDATE ao_vivo SET excluido_em = NULL WHERE cliente_id = $1', [req.params.id]);
    await client.query('COMMIT');

    const atualizado = await client.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    res.json(atualizado.rows[0]);
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao restaurar cliente:', erro);
    res.status(500).json({ erro: 'Não foi possível restaurar o cliente.' });
  } finally {
    client.release();
  }
});

// DELETE /api/clientes/:id/definitivo
router.delete('/:id/definitivo', async (req, res) => {
  const client = await pool.connect();
  try {
    const clienteResultado = await client.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    const cliente = clienteResultado.rows[0];
    if (!cliente) {
      client.release();
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    if (!cliente.excluido_em) {
      client.release();
      return res.status(400).json({ erro: 'O cliente precisa estar na lixeira antes de ser apagado definitivamente.' });
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM fonadas WHERE cliente_id = $1', [req.params.id]);
    await client.query('DELETE FROM ao_vivo WHERE cliente_id = $1', [req.params.id]);
    await client.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');

    res.json({ ok: true });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao apagar definitivamente:', erro);
    res.status(500).json({ erro: 'Não foi possível apagar definitivamente.' });
  } finally {
    client.release();
  }
});

// POST /api/clientes/:id/mesclar
router.post('/:id/mesclar', async (req, res) => {
  const destinoId = req.params.id;
  const origemId = req.body.origemId;

  if (!origemId) return res.status(400).json({ erro: 'Informe o cliente de origem (origemId).' });
  if (String(origemId) === String(destinoId)) {
    return res.status(400).json({ erro: 'Não é possível mesclar um cliente com ele mesmo.' });
  }

  const client = await pool.connect();
  try {
    const destinoResultado = await client.query(
      'SELECT * FROM clientes WHERE id = $1 AND excluido_em IS NULL', [destinoId]
    );
    const origemResultado = await client.query(
      'SELECT * FROM clientes WHERE id = $1 AND excluido_em IS NULL', [origemId]
    );
    const destino = destinoResultado.rows[0];
    const origem = origemResultado.rows[0];
    if (!destino) {
      client.release();
      return res.status(404).json({ erro: 'Cliente de destino não encontrado.' });
    }
    if (!origem) {
      client.release();
      return res.status(404).json({ erro: 'Cliente de origem não encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('UPDATE fonadas SET cliente_id = $1 WHERE cliente_id = $2', [destinoId, origemId]);
    await client.query('UPDATE ao_vivo SET cliente_id = $1 WHERE cliente_id = $2', [destinoId, origemId]);

    // Preenche campos vazios do destino com dados do cliente mesclado,
    // sem sobrescrever o que já existe.
    const campos = ['nascimento', 'fixo', 'celular', 'endereco', 'complemento', 'bairro', 'referencia'];
    const atualizacoes = {};
    for (const campo of campos) {
      if (!destino[campo] && origem[campo]) atualizacoes[campo] = origem[campo];
    }
    if (Object.keys(atualizacoes).length > 0) {
      const chaves = Object.keys(atualizacoes);
      const setClause = chaves.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const valores = Object.values(atualizacoes);
      const idxId = chaves.length + 1;
      await client.query(
        `UPDATE clientes SET ${setClause}, atualizado_em = NOW() WHERE id = $${idxId}`,
        [...valores, destinoId]
      );
    }
    await client.query('UPDATE clientes SET excluido_em = NOW() WHERE id = $1', [origemId]);
    await client.query('COMMIT');

    const atualizado = await client.query('SELECT * FROM clientes WHERE id = $1', [destinoId]);
    res.json(atualizado.rows[0]);
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao mesclar clientes:', erro);
    res.status(500).json({ erro: 'Não foi possível mesclar os clientes.' });
  } finally {
    client.release();
  }
});

module.exports = router;
