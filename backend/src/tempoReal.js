const crypto = require('node:crypto');

const clientes = new Map();
const instancia = crypto.randomUUID();
let versao = 0;
let conexoesAbertas = 0;
let conexoesFechadas = 0;
let conexoesDescartadasPorPressao = 0;

const RELACIONADOS = {
  configuracoes: ['configuracoes', 'fonadas', 'clientes', 'agenda', 'recall'],
  'ao-vivo': ['ao-vivo', 'agenda', 'cobranca', 'relatorios', 'recall'],
  fonadas: ['fonadas', 'agenda', 'cobranca', 'relatorios', 'recall'],
  clientes: ['clientes', 'recall'],
  agenda: ['agenda', 'fonadas'],
  cobranca: ['cobranca', 'ao-vivo', 'fonadas', 'relatorios'],
  recall: ['recall'],
};

function topicoDaRota(caminho = '') {
  return String(caminho).replace(/^\/api\//, '').split(/[/?]/)[0] || 'sistema';
}

function fechar(resposta, motivo = 'fechada') {
  const cliente = clientes.get(resposta);
  if (!cliente || cliente.fechado) return;
  cliente.fechado = true;
  cliente.motivo = motivo;
  clientes.delete(resposta);
  conexoesFechadas += 1;
}

function escrever(resposta, trecho) {
  const cliente = clientes.get(resposta);
  if (!cliente || cliente.fechado || resposta.destroyed || resposta.writableEnded) {
    fechar(resposta, 'socket-encerrado');
    return false;
  }
  try {
    const aceitou = resposta.write(trecho);
    cliente.ultimaEscritaEm = Date.now();
    if (!aceitou) {
      conexoesDescartadasPorPressao += 1;
      fechar(resposta, 'backpressure');
      resposta.end?.();
      return false;
    }
    return true;
  } catch {
    fechar(resposta, 'erro-escrita');
    resposta.end?.();
    return false;
  }
}

function publicar(evento) {
  versao += 1;
  const topico = evento.topico || topicoDaRota(evento.recurso);
  const dados = JSON.stringify({
    ...evento,
    topico,
    topicos: RELACIONADOS[topico] || [topico],
    versao,
    instancia,
    ocorridoEm: new Date().toISOString(),
  });
  const trecho = `event: atualizacao\ndata: ${dados}\n\n`;
  for (const resposta of clientes.keys()) escrever(resposta, trecho);
}

function conectar(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  clientes.set(res, {
    conectadoEm: Date.now(),
    ultimaEscritaEm: Date.now(),
    tela: req.get?.('x-pombo-tela') || null,
    fechado: false,
  });
  conexoesAbertas += 1;
  escrever(res, `event: conectado\ndata: ${JSON.stringify({ ok: true, versao, instancia })}\n\n`);

  const encerrar = () => fechar(res, 'cliente-desconectou');
  req.once('close', encerrar);
  res.once('close', encerrar);
  res.once('finish', encerrar);
  res.once('error', encerrar);
}

// Um único relógio atende todas as conexões, sem criar um timer por aba.
const heartbeat = setInterval(() => {
  for (const resposta of clientes.keys()) escrever(resposta, ': pulso\n\n');
}, 25000);
heartbeat.unref?.();

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

function obterDiagnostico() {
  const agora = Date.now();
  const porTela = new Map();
  let maisAntigaMs = 0;
  for (const cliente of clientes.values()) {
    const tela = cliente.tela || 'sem-id';
    porTela.set(tela, (porTela.get(tela) || 0) + 1);
    maisAntigaMs = Math.max(maisAntigaMs, agora - cliente.conectadoEm);
  }
  return {
    instancia,
    versao,
    conectadas: clientes.size,
    telasUnicas: porTela.size,
    duplicadasPorTela: [...porTela.values()].filter((total) => total > 1).reduce((soma, total) => soma + total - 1, 0),
    abertasDesdeInicio: conexoesAbertas,
    fechadasDesdeInicio: conexoesFechadas,
    descartadasPorBackpressure: conexoesDescartadasPorPressao,
    conexaoMaisAntigaSegundos: Math.round(maisAntigaMs / 1000),
  };
}

module.exports = { conectar, observarAlteracoes, obterDiagnostico, publicar };
