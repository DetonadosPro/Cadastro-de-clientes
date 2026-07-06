// src/middleware/autenticar.js
// Middleware que verifica se o usuário está logado (token válido)
// antes de deixar acessar as rotas de pedidos.

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../routes/auth');

function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization;
  if (!cabecalho || !cabecalho.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Não autenticado. Faça login novamente.' });
  }

  const token = cabecalho.replace('Bearer ', '');
  try {
    const dados = jwt.verify(token, JWT_SECRET);
    req.usuario = dados;
    next();
  } catch (e) {
    return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
}

module.exports = autenticar;
