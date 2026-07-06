// src/routes/auth.js
// Rotas de login. Usamos senha com hash (bcrypt) em vez de texto puro,
// que é como estava na planilha original (aba "usuario") — isso é bem
// mais seguro.

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
router.post('/login', (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }

  const linha = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);

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
// Só confirma se a senha está certa, sem retornar nada sensível — usado
// pela tela de login para decidir se libera o acesso à área protegida.
router.post('/verificar-senha-mestra', (req, res) => {
  const { senha } = req.body;
  if (senha !== SENHA_MESTRA) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  res.json({ ok: true });
});

// GET /api/auth/usuarios — lista todos os usuários (sem o hash de senha)
router.get('/usuarios', exigirSenhaMestra, (req, res) => {
  const usuarios = db.prepare(`
    SELECT id, usuario, nome, data_nascimento, criado_em FROM usuarios ORDER BY nome, usuario
  `).all();
  res.json({ usuarios });
});

// POST /api/auth/usuarios — cria um novo usuário de login
router.post('/usuarios', exigirSenhaMestra, (req, res) => {
  const { usuario, senha, nome, data_nascimento } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }
  if (senha.length < 3) {
    return res.status(400).json({ erro: 'A senha deve ter pelo menos 3 caracteres.' });
  }

  const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario);
  if (existe) {
    return res.status(409).json({ erro: 'Esse usuário já existe.' });
  }

  const senha_hash = bcrypt.hashSync(senha, 10);
  db.prepare(`
    INSERT INTO usuarios (usuario, senha_hash, nome, data_nascimento) VALUES (?, ?, ?, ?)
  `).run(usuario, senha_hash, nome || null, data_nascimento || null);

  res.status(201).json({ ok: true });
});

// DELETE /api/auth/usuarios/:id — remove um usuário de login
router.delete('/usuarios/:id', exigirSenhaMestra, (req, res) => {
  const existe = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Usuário não encontrado.' });

  db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = { router, JWT_SECRET };
