// src/routes/aoVivo.js
// Rotas para gerenciar os pedidos de mensagem ao vivo (carro de som).

const express = require('express');
const { db } = require('../db/database');

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

// Mapeamento dos filtros disponíveis na tela de ao vivo para as colunas reais.
// Telefone fixo e celular são filtros separados (formatação diferente).
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

function montarFiltro(campo, termo) {
  const filtro = FILTROS_AOVIVO[campo];
  if (!filtro) return null;

  if (filtro.tipo === 'exato') {
    const condicoes = filtro.colunas.map((col) => `${col} = ?`);
    const params = filtro.colunas.map(() => termo);
    return { where: `(${condicoes.join(' OR ')})`, params };
  }

  const padrao = filtro.tipo === 'data' ? `${termo}%` : `%${termo}%`;
  const condicoes = filtro.colunas.map((col) => `${col} LIKE ?`);
  const params = filtro.colunas.map(() => padrao);

  return { where: `(${condicoes.join(' OR ')})`, params };
}

// GET /api/ao-vivo/proxima-os
router.get('/proxima-os', (req, res) => {
  const linhas = db.prepare(`
    SELECT numero_os FROM ao_vivo WHERE numero_os IS NOT NULL AND numero_os != ''
  `).all();

  let maior = 0;
  for (const linha of linhas) {
    const n = parseInt(linha.numero_os, 10);
    if (!isNaN(n) && n > maior) maior = n;
  }

  res.json({ proximaOs: String(maior + 1) });
});

// GET /api/ao-vivo?busca=texto&campo=comprador&pagina=1
router.get('/', (req, res) => {
  const busca = (req.query.busca || '').trim();
  const campo = (req.query.campo || '').trim();
  const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
  const porPagina = Math.min(parseInt(req.query.porPagina) || 30, 200);
  const offset = (pagina - 1) * porPagina;

  let where = 'WHERE excluido_em IS NULL';
  let params = [];

  if (busca && campo) {
    const filtro = montarFiltro(campo, busca);
    if (filtro) {
      where += ` AND ${filtro.where}`;
      params = filtro.params;
    }
  } else if (busca) {
    // Busca em "todos os campos": cobre comprador, destinatário,
    // telefones do comprador e do local de entrega, endereço e O.S.
    where += ` AND (
      comprador LIKE ? OR para LIKE ? OR
      celular LIKE ? OR celular2 LIKE ? OR
      fixo_local LIKE ? OR celular_local LIKE ? OR
      endereco LIKE ? OR
      numero_os LIKE ?
    )`;
    const termo = `%${busca}%`;
    params = new Array(8).fill(termo);
  }

  const total = db.prepare(`SELECT COUNT(*) as n FROM ao_vivo ${where}`).get(...params).n;

  const linhas = db.prepare(`
    SELECT * FROM ao_vivo ${where}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, porPagina, offset);

  res.json({ total, pagina, porPagina, pedidos: linhas });
});

// GET /api/ao-vivo/hoje — carro de som marcado para hoje
router.get('/hoje', (req, res) => {
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, '0');
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const yy = String(hoje.getFullYear()).slice(-2);
  const hojeStr = `${dd}/${mm}/${yy}`;

  const linhas = db.prepare(`
    SELECT * FROM ao_vivo
    WHERE dia_entrega = ? AND excluido_em IS NULL
    ORDER BY horario_entrega ASC
  `).all(hojeStr);

  res.json({ data: hojeStr, pedidos: linhas });
});

// GET /api/ao-vivo/imprimir?ids=1,2,3
// Retorna os dados completos de um ou mais pedidos, prontos para
// impressão no modelo "HOMENAGEADO / MENSAGENS / DADOS SOLICITANTE /
// COBRANÇA". Quando o pedido tem cliente vinculado, os dados do
// comprador (nome, telefones, endereço de cobrança) vêm do cadastro do
// cliente — não das colunas antigas do pedido, que só valem para
// histórico sem cliente vinculado.
router.get('/imprimir', (req, res) => {
  const idsBrutos = (req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (idsBrutos.length === 0) return res.status(400).json({ erro: 'Informe ao menos um id.' });

  const placeholders = idsBrutos.map(() => '?').join(', ');
  const pedidos = db.prepare(`SELECT * FROM ao_vivo WHERE id IN (${placeholders})`).all(...idsBrutos);

  const clienteIds = [...new Set(pedidos.filter((p) => p.cliente_id).map((p) => p.cliente_id))];
  const clientesPorId = {};
  if (clienteIds.length > 0) {
    const ph2 = clienteIds.map(() => '?').join(', ');
    const clientes = db.prepare(`SELECT * FROM clientes WHERE id IN (${ph2})`).all(...clienteIds);
    for (const c of clientes) clientesPorId[c.id] = c;
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
});

router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM ao_vivo WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ erro: 'Registro não encontrado.' });
  res.json(item);
});

router.post('/', (req, res) => {
  const dados = { ...req.body };

  // Se o pedido está vinculado a um cliente, o contato/aniversário do
  // comprador vêm do cadastro (endereço de entrega continua sendo
  // digitado por pedido, pois é o destino, não a casa do cliente).
  if (dados.cliente_id) {
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(dados.cliente_id);
    if (!cliente) {
      return res.status(400).json({ erro: 'Cliente não encontrado.' });
    }
    dados.comprador = cliente.nome;
    dados.celular = cliente.celular;
    dados.aniversario = cliente.nascimento;
  }

  if (!dados.comprador || !dados.comprador.trim()) {
    return res.status(400).json({ erro: 'O nome do comprador é obrigatório.' });
  }

  const campos = CAMPOS.filter((c) => dados[c] !== undefined);
  const placeholders = campos.map(() => '?').join(', ');
  const valores = campos.map((c) => dados[c]);

  const resultado = db.prepare(`
    INSERT INTO ao_vivo (${campos.join(', ')}) VALUES (${placeholders})
  `).run(...valores);

  const novo = db.prepare('SELECT * FROM ao_vivo WHERE id = ?').get(resultado.lastInsertRowid);
  res.status(201).json(novo);
});

router.put('/:id', (req, res) => {
  const existe = db.prepare('SELECT id FROM ao_vivo WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Registro não encontrado.' });

  const dados = req.body;
  const campos = CAMPOS.filter((c) => dados[c] !== undefined);
  if (campos.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

  const setClause = campos.map((c) => `${c} = ?`).join(', ');
  const valores = campos.map((c) => dados[c]);

  db.prepare(`UPDATE ao_vivo SET ${setClause}, atualizado_em = datetime('now') WHERE id = ?`)
    .run(...valores, req.params.id);

  res.json(db.prepare('SELECT * FROM ao_vivo WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existe = db.prepare('SELECT id FROM ao_vivo WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Registro não encontrado.' });

  db.prepare('DELETE FROM ao_vivo WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
