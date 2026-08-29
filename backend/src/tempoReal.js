const clientes = new Set();
const TODOS_TOPICOS = ['clientes', 'fonadas', 'ao-vivo', 'agenda', 'cobranca', 'relatorios', 'recall'];

const RELACIONADOS = {
  'ao-vivo': ['ao-vivo', 'agenda', 'cobranca', 'clientes', 'relatorios', 'recall'],
  fonadas: ['fonadas', 'agenda', 'cobranca', 'clientes', 'relatorios', 'recall'],
  clientes: ['clientes', 'fonadas', 'ao-vivo', 'agenda', 'cobranca', 'relatorios', 'recall'],
  agenda: ['agenda', 'fonadas'],
  cobranca: ['cobranca', 'ao-vivo', 'fonadas', 'clientes', 'relatorios'],
  recall: ['recall'],
};

function topicoDaRota(caminho = '') {
  return String(caminho).replace(/^\/api\//, '').split(/[/?]/)[0] || 'sistema';
}

function publicar(evento) {
  const topico = evento.topico || topicoDaRota(evento.recurso);
  const dados = JSON.stringify({
    ...evento,
    topico,
    topicos: RELACIONADOS[topico] || [topico],
    ocorridoEm: new Date().toISOString(),
  });
  for (const resposta of clientes) {
    if (resposta.destroyed || resposta.writableEnded) {
      clientes.delete(resposta);
      continue;
    }
    try {
      resposta.write(`event: atualizacao\ndata: ${dados}\n\n`);
    } catch {
      clientes.delete(resposta);
    }
  }
}

function conectar(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`event: conectado\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  // Toda conexão nova (inclusive após o limite de 15 minutos do Railway)
  // invalida a tela atual. Assim nenhuma edição se perde no breve intervalo
  // entre a queda do fluxo anterior e a reconexão.
  res.write(`event: atualizacao\ndata: ${JSON.stringify({
    topico: 'sistema',
    topicos: TODOS_TOPICOS,
    recurso: '/conexao',
    metodo: 'SINCRONIZAR',
    origem: null,
    ocorridoEm: new Date().toISOString(),
  })}\n\n`);
  clientes.add(res);

  const fechar = () => {
    clearInterval(pulso);
    clientes.delete(res);
  };
  const pulso = setInterval(() => {
    if (res.destroyed || res.writableEnded) return fechar();
    try { res.write(': pulso\n\n'); } catch { fechar(); }
  }, 25000);
  req.on('close', fechar);
  res.on('error', fechar);
}

function observarAlteracoes(req, res, next) {
  const metodo = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) return next();

  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      publicar({
        recurso: req.originalUrl.split('?')[0],
        metodo,
        origem: req.get('x-pombo-tela') || null,
        usuario: req.usuario?.usuario || null,
      });
    }
  });
  next();
}

module.exports = { conectar, observarAlteracoes, publicar };
