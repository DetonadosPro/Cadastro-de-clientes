// src/routes/clientes.js
// Rotas para o cadastro de clientes — cadastro único, compartilhado
// entre mensagem fonada e mensagem ao vivo.

const express = require('express');
const { db } = require('../db/database');

const router = express.Router();

const CAMPOS = ['nome', 'nascimento', 'fixo', 'celular', 'endereco', 'complemento', 'bairro', 'referencia'];

// Normaliza um nome para comparação "parecida": maiúsculas, sem
// acentos, sem espaços duplicados/extras nas bordas.
function normalizarNome(nome) {
  return String(nome || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s+/g, ' ')
    .trim();
}

// Considera "nome parecido" se um nome contém o outro (ex: "MARCO TULIO"
// dentro de "MARCO TULIO SILVA"), ou se têm boa parte das palavras em
// comum. Mantém a checagem propositalmente simples e previsível — quem
// decide de fato é a pessoa, isso é só uma sugestão.
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

// Mapeamento dos filtros disponíveis na busca de clientes. Aniversário
// (data) usa "começa com" (busca exata seria pouco útil digitando aos
// poucos); celular e endereço usam busca parcial.
const FILTROS_CLIENTE = {
  nome: { coluna: 'nome', tipo: 'texto' },
  nascimento: { coluna: 'nascimento', tipo: 'data' },
  celular: { coluna: 'celular', tipo: 'texto' },
  endereco: { coluna: 'endereco', tipo: 'texto' },
};

function montarFiltroCliente(campo, termo) {
  const filtro = FILTROS_CLIENTE[campo];
  if (!filtro) return null;
  const padrao = filtro.tipo === 'data' ? `${termo}%` : `%${termo}%`;
  return { where: `${filtro.coluna} LIKE ?`, params: [padrao] };
}

// GET /api/clientes?busca=nome&campo=nome&pagina=1
// Lista/busca clientes ativos (não excluídos). Se "campo" for informado,
// busca especificamente nele (nome, nascimento, celular ou endereço);
// caso contrário, busca só por nome (comportamento padrão).
router.get('/', (req, res) => {
  const busca = (req.query.busca || '').trim();
  const campo = (req.query.campo || '').trim();
  const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
  const porPagina = Math.min(parseInt(req.query.porPagina) || 30, 200);
  const offset = (pagina - 1) * porPagina;

  let where = 'WHERE excluido_em IS NULL';
  let params = [];

  if (busca && campo) {
    const filtro = montarFiltroCliente(campo, busca);
    if (filtro) {
      where += ` AND ${filtro.where}`;
      params = filtro.params;
    }
  } else if (busca) {
    where += ' AND nome LIKE ?';
    params = [`%${busca}%`];
  }

  const total = db.prepare(`SELECT COUNT(*) as n FROM clientes ${where}`).get(...params).n;

  const linhas = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM fonadas WHERE cliente_id = c.id AND excluido_em IS NULL) as total_fonada,
      (SELECT COUNT(*) FROM ao_vivo WHERE cliente_id = c.id AND excluido_em IS NULL) as total_aovivo
    FROM clientes c
    ${where}
    ORDER BY c.nome ASC
    LIMIT ? OFFSET ?
  `).all(...params, porPagina, offset);

  res.json({ total, pagina, porPagina, clientes: linhas });
});

// GET /api/clientes/lixeira?busca=nome&pagina=1
// Lista clientes excluídos (na lixeira), mais recentemente excluídos primeiro.
router.get('/lixeira', (req, res) => {
  const busca = (req.query.busca || '').trim();
  const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
  const porPagina = Math.min(parseInt(req.query.porPagina) || 30, 200);
  const offset = (pagina - 1) * porPagina;

  let where = 'WHERE excluido_em IS NOT NULL';
  let params = [];
  if (busca) {
    where += ' AND nome LIKE ?';
    params = [`%${busca}%`];
  }

  const total = db.prepare(`SELECT COUNT(*) as n FROM clientes ${where}`).get(...params).n;

  const linhas = db.prepare(`
    SELECT * FROM clientes ${where}
    ORDER BY excluido_em DESC
    LIMIT ? OFFSET ?
  `).all(...params, porPagina, offset);

  res.json({ total, pagina, porPagina, clientes: linhas });
});

// GET /api/clientes/verificar-duplicidade?nome=X&nascimento=Y&celular=Z
// Verifica duas coisas independentes, antes de criar um cliente novo:
// GET /api/clientes/verificar-duplicidade?nome=X&nascimento=Y
// Verifica se já existe um cliente com nome parecido + mesmo nascimento,
// usado antes de criar um cliente novo para evitar duplicados. Só
// considera clientes ativos (não excluídos).
router.get('/verificar-duplicidade', (req, res) => {
  const nome = (req.query.nome || '').trim();
  const nascimento = (req.query.nascimento || '').trim();

  if (!nome || !nascimento) {
    return res.json({ possiveisDuplicados: [] });
  }

  const candidatos = db.prepare('SELECT * FROM clientes WHERE excluido_em IS NULL AND nascimento = ?').all(nascimento);
  const possiveisDuplicados = candidatos.filter((c) => nomesParecidos(c.nome, nome));

  res.json({ possiveisDuplicados });
});

// GET /api/clientes/:id
// Retorna a ficha do cliente com o histórico completo de pedidos
// (fonada e ao vivo), mais recentes primeiro.
router.get('/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });

  const pedidosFonada = db.prepare(`
    SELECT id, senha_os, data_pedido, p1_dia, p1_para, p2_dia, p2_para, valor, pagou
    FROM fonadas WHERE cliente_id = ? ORDER BY id DESC
  `).all(req.params.id);

  const pedidosAoVivo = db.prepare(`
    SELECT id, numero_os, data_pedido, dia_entrega, para, valor
    FROM ao_vivo WHERE cliente_id = ? ORDER BY id DESC
  `).all(req.params.id);

  res.json({ cliente, pedidosFonada, pedidosAoVivo });
});

// POST /api/clientes
router.post('/', (req, res) => {
  const dados = req.body;
  if (!dados.nome || !dados.nome.trim()) {
    return res.status(400).json({ erro: 'O nome é obrigatório.' });
  }

  const campos = CAMPOS.filter((c) => dados[c] !== undefined);
  const placeholders = campos.map(() => '?').join(', ');
  const valores = campos.map((c) => dados[c]);

  const resultado = db.prepare(`
    INSERT INTO clientes (${campos.join(', ')}) VALUES (${placeholders})
  `).run(...valores);

  const novo = db.prepare('SELECT * FROM clientes WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novo);
});

// PUT /api/clientes/:id
router.put('/:id', (req, res) => {
  const existe = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Cliente não encontrado.' });

  const dados = req.body;
  const campos = CAMPOS.filter((c) => dados[c] !== undefined);
  if (campos.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

  const setClause = campos.map((c) => `${c} = ?`).join(', ');
  const valores = campos.map((c) => dados[c]);

  db.prepare(`UPDATE clientes SET ${setClause}, atualizado_em = datetime('now') WHERE id = ?`)
    .run(...valores, req.params.id);

  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id));
});

// DELETE /api/clientes/:id
// Envia o cliente E os pedidos vinculados a ele para a lixeira (soft
// delete) — nada é apagado de verdade ainda. Os pedidos saem das
// listagens normais de Fonada/Ao Vivo enquanto o cliente estiver na lixeira.
router.delete('/:id', (req, res) => {
  const existe = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Cliente não encontrado.' });

  db.exec('BEGIN');
  try {
    db.prepare("UPDATE clientes SET excluido_em = datetime('now') WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE fonadas SET excluido_em = datetime('now') WHERE cliente_id = ?").run(req.params.id);
    db.prepare("UPDATE ao_vivo SET excluido_em = datetime('now') WHERE cliente_id = ?").run(req.params.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ erro: 'Não foi possível excluir o cliente.' });
  }

  res.json({ ok: true });
});

// POST /api/clientes/:id/restaurar
// Tira o cliente e os pedidos vinculados da lixeira, voltando tudo ao normal.
router.post('/:id/restaurar', (req, res) => {
  const existe = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Cliente não encontrado.' });

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE clientes SET excluido_em = NULL WHERE id = ?').run(req.params.id);
    db.prepare('UPDATE fonadas SET excluido_em = NULL WHERE cliente_id = ?').run(req.params.id);
    db.prepare('UPDATE ao_vivo SET excluido_em = NULL WHERE cliente_id = ?').run(req.params.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ erro: 'Não foi possível restaurar o cliente.' });
  }

  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id));
});

// DELETE /api/clientes/:id/definitivo
// Apaga o cliente e os pedidos vinculados PARA SEMPRE. Só funciona se
// o cliente já estiver na lixeira — proteção extra contra clique errado.
router.delete('/:id/definitivo', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  if (!cliente.excluido_em) {
    return res.status(400).json({ erro: 'O cliente precisa estar na lixeira antes de ser apagado definitivamente.' });
  }

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM fonadas WHERE cliente_id = ?').run(req.params.id);
    db.prepare('DELETE FROM ao_vivo WHERE cliente_id = ?').run(req.params.id);
    db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ erro: 'Não foi possível apagar definitivamente.' });
  }

  res.json({ ok: true });
});

// POST /api/clientes/:id/mesclar
// Mescla o cliente "origemId" (informado no corpo) dentro do cliente
// ":id" (destino, o alvo de onde o outro foi arrastado). Todos os
// pedidos (fonada e ao vivo) do cliente de origem passam a apontar
// para o destino, e o cliente de origem vai para a lixeira — nada é
// apagado de verdade, então dá para desfazer restaurando-o depois
// (mas os pedidos dele já terão sido movidos, então restaurar só
// volta a exibir o cadastro do cliente de origem, sem os pedidos).
router.post('/:id/mesclar', (req, res) => {
  const destinoId = req.params.id;
  const origemId = req.body.origemId;

  if (!origemId) return res.status(400).json({ erro: 'Informe o cliente de origem (origemId).' });
  if (String(origemId) === String(destinoId)) {
    return res.status(400).json({ erro: 'Não é possível mesclar um cliente com ele mesmo.' });
  }

  const destino = db.prepare('SELECT * FROM clientes WHERE id = ? AND excluido_em IS NULL').get(destinoId);
  const origem = db.prepare('SELECT * FROM clientes WHERE id = ? AND excluido_em IS NULL').get(origemId);
  if (!destino) return res.status(404).json({ erro: 'Cliente de destino não encontrado.' });
  if (!origem) return res.status(404).json({ erro: 'Cliente de origem não encontrado.' });

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE fonadas SET cliente_id = ? WHERE cliente_id = ?').run(destinoId, origemId);
    db.prepare('UPDATE ao_vivo SET cliente_id = ? WHERE cliente_id = ?').run(destinoId, origemId);
    // Preenche campos vazios do destino com dados do cliente mesclado, sem sobrescrever o que já existe.
    const campos = ['nascimento', 'fixo', 'celular', 'endereco', 'complemento', 'bairro', 'referencia'];
    const atualizacoes = {};
    for (const campo of campos) {
      if (!destino[campo] && origem[campo]) atualizacoes[campo] = origem[campo];
    }
    if (Object.keys(atualizacoes).length > 0) {
      const setClause = Object.keys(atualizacoes).map((c) => `${c} = ?`).join(', ');
      const valores = Object.values(atualizacoes);
      db.prepare(`UPDATE clientes SET ${setClause}, atualizado_em = datetime('now') WHERE id = ?`)
        .run(...valores, destinoId);
    }
    db.prepare("UPDATE clientes SET excluido_em = datetime('now') WHERE id = ?").run(origemId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ erro: 'Não foi possível mesclar os clientes.' });
  }

  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(destinoId));
});

module.exports = router;

