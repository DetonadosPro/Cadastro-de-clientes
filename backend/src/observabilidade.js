const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');

const contextoRequests = new AsyncLocalStorage();
const inicioProcesso = Date.now();
const LIMITE_HISTORICO = 30;
const LIMITE_ROTAS = 100;
const REQUEST_LENTA_MS = Number(process.env.PERF_REQUEST_LENTA_MS || 1000);
const QUERY_LENTA_MS = Number(process.env.PERF_QUERY_LENTA_MS || 750);

const requestsRecentes = [];
const queriesRecentes = [];
const operacoesRecentes = [];
const estatisticasRotas = new Map();
const atrasoEventLoop = { atualMs: 0, maximoMs: 0, somaMs: 0, amostras: 0 };

function guardar(lista, item) {
  lista.push(item);
  if (lista.length > LIMITE_HISTORICO) lista.splice(0, lista.length - LIMITE_HISTORICO);
}

function rotaNormalizada(req) {
  return String(req.originalUrl || req.url || '/')
    .split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

function resumirSql(sql) {
  const texto = String(sql || '').replace(/\s+/g, ' ').trim();
  const operacao = texto.match(/^(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER)/i)?.[1]?.toUpperCase() || 'SQL';
  const tabela = texto.match(/\b(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+([a-z_][a-z0-9_]*)/i)?.[1] || 'desconhecida';
  return `${operacao} ${tabela}`;
}

function contextoAtual() {
  return contextoRequests.getStore();
}

function registrarQuery(duracaoMs, sql, ok = true) {
  const contexto = contextoAtual();
  if (contexto) {
    contexto.dbMs += duracaoMs;
    contexto.dbQueries += 1;
  }
  if (duracaoMs >= QUERY_LENTA_MS || !ok) {
    const item = {
      em: new Date().toISOString(),
      query: resumirSql(sql),
      duracaoMs: Number(duracaoMs.toFixed(1)),
      ok,
    };
    guardar(queriesRecentes, item);
    console.warn(`[perf][db] ${item.query} ${item.duracaoMs}ms ok=${ok}`);
  }
}

function registrarOperacao(nome, duracaoMs, ok = true, detalhes = {}) {
  const item = {
    em: new Date().toISOString(),
    nome,
    duracaoMs: Number(duracaoMs.toFixed(1)),
    ok,
    ...detalhes,
  };
  guardar(operacoesRecentes, item);
  if (duracaoMs >= REQUEST_LENTA_MS || !ok) {
    console.warn(`[perf][operacao] ${nome} ${item.duracaoMs}ms ok=${ok}`);
  }
}

function instrumentarRequests(req, res, next) {
  const inicio = performance.now();
  const contexto = { dbMs: 0, dbQueries: 0 };
  const rota = rotaNormalizada(req);
  const metodo = req.method.toUpperCase();
  const ehSse = rota === '/api/eventos';

  const writeHeadOriginal = res.writeHead;
  res.writeHead = function writeHeadInstrumentado(...args) {
    if (!ehSse && !res.headersSent) {
      const ateCabecalhos = performance.now() - inicio;
      res.setHeader('Server-Timing', `app;dur=${ateCabecalhos.toFixed(1)}`);
    }
    return writeHeadOriginal.apply(this, args);
  };

  res.once('finish', () => {
    if (ehSse) return;
    const duracaoMs = performance.now() - inicio;
    const chave = `${metodo} ${rota}`;
    const atual = estatisticasRotas.get(chave) || { rota: chave, chamadas: 0, totalMs: 0, maximoMs: 0, lentas: 0 };
    atual.chamadas += 1;
    atual.totalMs += duracaoMs;
    atual.maximoMs = Math.max(atual.maximoMs, duracaoMs);
    if (duracaoMs >= REQUEST_LENTA_MS) atual.lentas += 1;
    estatisticasRotas.delete(chave);
    estatisticasRotas.set(chave, atual);
    if (estatisticasRotas.size > LIMITE_ROTAS) estatisticasRotas.delete(estatisticasRotas.keys().next().value);

    if (duracaoMs >= REQUEST_LENTA_MS) {
      const item = {
        em: new Date().toISOString(),
        metodo,
        rota,
        status: res.statusCode,
        totalMs: Number(duracaoMs.toFixed(1)),
        dbMs: Number(contexto.dbMs.toFixed(1)),
        dbQueries: contexto.dbQueries,
      };
      guardar(requestsRecentes, item);
      console.warn(`[perf][http] ${metodo} ${rota} status=${res.statusCode} total=${item.totalMs}ms db=${item.dbMs}ms queries=${item.dbQueries}`);
    }
  });

  contextoRequests.run(contexto, next);
}

let esperado = performance.now() + 1000;
const medidorEventLoop = setInterval(() => {
  const agora = performance.now();
  const lag = Math.max(0, agora - esperado);
  esperado = agora + 1000;
  atrasoEventLoop.atualMs = lag;
  atrasoEventLoop.maximoMs = Math.max(atrasoEventLoop.maximoMs, lag);
  atrasoEventLoop.somaMs += lag;
  atrasoEventLoop.amostras += 1;
  if (lag >= 1000) console.warn(`[perf][event-loop] atraso=${lag.toFixed(1)}ms`);
}, 1000);
medidorEventLoop.unref?.();

function diagnostico({ pool, tempoReal }) {
  const memoria = process.memoryUsage();
  return {
    coletadoEm: new Date().toISOString(),
    processo: {
      uptimeSegundos: Math.round((Date.now() - inicioProcesso) / 1000),
      memoriaMb: {
        rss: Number((memoria.rss / 1024 / 1024).toFixed(1)),
        heapUsado: Number((memoria.heapUsed / 1024 / 1024).toFixed(1)),
        heapTotal: Number((memoria.heapTotal / 1024 / 1024).toFixed(1)),
      },
      eventLoop: {
        atualMs: Number(atrasoEventLoop.atualMs.toFixed(1)),
        mediaMs: Number((atrasoEventLoop.somaMs / Math.max(1, atrasoEventLoop.amostras)).toFixed(1)),
        maximoMs: Number(atrasoEventLoop.maximoMs.toFixed(1)),
      },
    },
    postgres: {
      max: pool.options.max,
      total: pool.totalCount,
      ociosas: pool.idleCount,
      aguardando: pool.waitingCount,
    },
    sse: tempoReal.obterDiagnostico(),
    endpoints: [...estatisticasRotas.values()]
      .map((item) => ({
        rota: item.rota,
        chamadas: item.chamadas,
        mediaMs: Number((item.totalMs / item.chamadas).toFixed(1)),
        maximoMs: Number(item.maximoMs.toFixed(1)),
        lentas: item.lentas,
      }))
      .sort((a, b) => b.maximoMs - a.maximoMs)
      .slice(0, 30),
    requestsLentas: [...requestsRecentes].reverse(),
    queriesLentas: [...queriesRecentes].reverse(),
    operacoes: [...operacoesRecentes].reverse(),
  };
}

module.exports = {
  diagnostico,
  instrumentarRequests,
  registrarOperacao,
  registrarQuery,
};
