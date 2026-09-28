const cors = require('cors');

function origensPermitidas(ambiente = process.env.NODE_ENV, configuradas = process.env.CORS_ALLOWED_ORIGINS) {
  const texto = configuradas || (ambiente === 'production' ? '' : 'http://127.0.0.1:5173,http://localhost:5173');
  const origens = texto.split(',').map((origem) => origem.trim()).filter(Boolean);
  if (origens.length === 0) throw new Error('CORS_ALLOWED_ORIGINS precisa ser configurada em produção.');
  for (const origem of origens) {
    let url;
    try { url = new URL(origem); } catch { throw new Error('CORS_ALLOWED_ORIGINS contém uma origem inválida.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origem || url.username || url.password) {
      throw new Error('CORS_ALLOWED_ORIGINS deve conter apenas origens HTTP(S) exatas.');
    }
  }
  return new Set(origens);
}

function criarCorsRestrito(origens = origensPermitidas()) {
  const aplicarCors = cors({
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-pombo-tela', 'x-senha-mestra'],
    optionsSuccessStatus: 204,
  });
  return (req, res, next) => {
    const origem = req.get('Origin');
    if (!origem) return next();
    if (!origens.has(origem)) return res.status(403).json({ erro: 'Origem não permitida.' });
    return aplicarCors(req, res, next);
  };
}

module.exports = { origensPermitidas, criarCorsRestrito };
