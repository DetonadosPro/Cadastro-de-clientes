// src/routes/auth.js
// Rotas de login. Usamos senha com hash (bcrypt) em vez de texto puro,
// que é como estava na planilha original (aba "usuario") — isso é bem
// mais seguro.
//
// Migrado para PostgreSQL: cada rota agora é assíncrona (async/await),
// db.query(sql, params) usa placeholders $1, $2... em vez de "?", e o
// resultado vem em "resultado.rows" (array), não direto como no SQLite.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'pombo-correio-chave-local-troque-isso';

// Senha mestra que protege a tela de gerenciamento de usuários — não é
// senha de login de ninguém, é um segredo à parte que só quem administra
// o sistema conhece. Fica fora do fluxo normal de autenticação (JWT).
const SENHA_MESTRA = '96374558Aa';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ erro: 'Informe usuário e senha.' });
    }

    const resultado = await db.query('SELECT * FROM usuarios WHERE usuario ILIKE $1', [usuario]);
    const linha = resultado.rows[0];

    if (!linha) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }

    const senhaOk = bcrypt.compareSync(senha, linha.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }

    const token = jwt.sign({ id: linha.id, usuario: linha.usuario }, JWT_SECRET, {
      expiresIn: '12h',
    });

    res.json({ token, usuario: linha.usuario, nome: linha.nome || linha.usuario });
  } catch (erro) {
    console.error('Erro no login:', erro);
    res.status(500).json({ erro: 'Erro ao processar login.' });
  }
});

// Middleware simples: exige a senha mestra no corpo ou header de cada
// requisição de gerenciamento de usuários. Não gera sessão nem token —
// a senha precisa ser enviada em toda chamada, de propósito (conforme
// definido: nunca "lembrar" entre visitas).
function exigirSenhaMestra(req, res, next) {
  const senha = req.headers['x-senha-mestra'];
  if (senha !== SENHA_MESTRA) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  next();
}

// POST /api/auth/verificar-senha-mestra
router.post('/verificar-senha-mestra', (req, res) => {
  const { senha } = req.body;
  if (senha !== SENHA_MESTRA) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  res.json({ ok: true });
});

// GET /api/auth/usuarios — lista todos os usuários (sem o hash de senha)
router.get('/usuarios', exigirSenhaMestra, async (req, res) => {
  try {
    const resultado = await db.query(
      'SELECT id, usuario, nome, data_nascimento, criado_em FROM usuarios ORDER BY nome, usuario'
    );
    res.json({ usuarios: resultado.rows });
  } catch (erro) {
    console.error('Erro ao listar usuários:', erro);
    res.status(500).json({ erro: 'Erro ao listar usuários.' });
  }
});

// POST /api/auth/usuarios — cria um novo usuário de login
router.post('/usuarios', exigirSenhaMestra, async (req, res) => {
  try {
    const { usuario, senha, nome, data_nascimento } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ erro: 'Informe usuário e senha.' });
    }
    if (senha.length < 3) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 3 caracteres.' });
    }

    const existente = await db.query('SELECT id FROM usuarios WHERE usuario ILIKE $1', [usuario]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ erro: 'Esse usuário já existe.' });
    }

    const senha_hash = bcrypt.hashSync(senha, 10);
    await db.query(
      'INSERT INTO usuarios (usuario, senha_hash, nome, data_nascimento) VALUES ($1, $2, $3, $4)',
      [usuario, senha_hash, nome || null, data_nascimento || null]
    );

    res.status(201).json({ ok: true });
  } catch (erro) {
    console.error('Erro ao criar usuário:', erro);
    res.status(500).json({ erro: 'Erro ao criar usuário.' });
  }
});

// DELETE /api/auth/usuarios/:id — remove um usuário de login
router.delete('/usuarios/:id', exigirSenhaMestra, async (req, res) => {
  try {
    const existente = await db.query('SELECT id FROM usuarios WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    await db.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao remover usuário:', erro);
    res.status(500).json({ erro: 'Erro ao remover usuário.' });
  }
});

module.exports = { router, JWT_SECRET };
