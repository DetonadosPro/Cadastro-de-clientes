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
const { db, pool, unaccentEstaDisponivel } = require('../db/database');
const { formatarDataBrasilia } = require('../utils/dataHora');
const { situacaoSegundaMensagem } = require('../utils/mensagemEmHaver');

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ erro: 'ID de cliente inválido.' });
  next();
});

const CAMPOS = ['nome', 'nascimento', 'fixo', 'whatsapp', 'celular', 'endereco', 'complemento', 'bairro', 'referencia'];

function normalizarNome(nome) {
  return String(nome || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrai só "dd/mm" de uma data no formato "dd/mm" ou "dd/mm/aa" — o
// cadastro aceita as duas formas (o ano de nascimento nem sempre é
// conhecido), então duas pessoas com o mesmo dia/mês de aniversário
// devem ser tratadas como o mesmo aniversário na checagem de
// duplicidade, com ou sem o ano preenchido. Retorna null se o formato
// não for reconhecível.
function diaMesDaData(data) {
  const m = String(data || '').trim().match(/^(\d{2})\/(\d{2})(?:\/\d{2,4})?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

// Data/hora de registro do pedido mais recente de um cliente, entre
// Fonada e Ao Vivo (pedidos ativos, não excluídos) — usado para
// decidir automaticamente qual cadastro é "o mais atual" quando o
// sistema sugere uma mesclagem por duplicidade.
async function pedidoMaisRecenteDoCliente(client, clienteId) {
  const resultado = await client.query(`
    SELECT criado_em FROM (
      SELECT criado_em FROM fonadas WHERE cliente_id = $1 AND excluido_em IS NULL
      UNION ALL
      SELECT criado_em FROM ao_vivo WHERE cliente_id = $1 AND excluido_em IS NULL
    ) todos
    ORDER BY criado_em DESC
    LIMIT 1
  `, [clienteId]);
  return resultado.rows[0] ? resultado.rows[0].criado_em : null;
}

// Palavras que não ajudam a identificar uma pessoa por serem comuns
// demais em nomes brasileiros — contá-las como "palavra em comum"
// gerava falsos positivos como "JACIARA CAVALCANTE DA SILVA" batendo
// com "MARINETE ELIAS DA SILVA" só por compartilharem "DA" e "SILVA".
const PALAVRAS_IGNORADAS_NOME = new Set([
  'DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'DI', 'VAN', 'VON',
  'SILVA', 'SANTOS', 'SOUZA', 'SOUSA', 'OLIVEIRA', 'PEREIRA', 'FERREIRA',
  'ALVES', 'RIBEIRO', 'COSTA', 'RODRIGUES', 'ALMEIDA', 'NASCIMENTO', 'CARVALHO',
  'GOMES', 'MARTINS', 'ARAUJO', 'MELO', 'BARBOSA', 'LIMA',
]);

function nomesParecidos(nomeA, nomeB) {
  const a = normalizarNome(nomeA);
  const b = normalizarNome(nomeB);
  if (!a || !b) return false;
  if (a === b) return true;

  const palavrasA = new Set(a.split(' ').filter((p) => p.length > 1 && !PALAVRAS_IGNORADAS_NOME.has(p)));
  const palavrasB = new Set(b.split(' ').filter((p) => p.length > 1 && !PALAVRAS_IGNORADAS_NOME.has(p)));
  // Se depois de remover conectivos/sobrenomes comuns não sobrar
  // nenhuma palavra distintiva de um dos lados, não dá para comparar
  // com confiança — mais seguro não sugerir do que sugerir à toa.
  if (palavrasA.size === 0 || palavrasB.size === 0) return false;

  let comuns = 0;
  for (const p of palavrasA) if (palavrasB.has(p)) comuns++;
  const proporcao = comuns / Math.min(palavrasA.size, palavrasB.size);
  return proporcao >= 0.7;
}

const FILTROS_CLIENTE = {
  nome: { coluna: 'nome', tipo: 'texto' },
  nascimento: { coluna: 'nascimento', tipo: 'data' },
  // Celular busca tanto no campo celular quanto no whatsapp do
  // cliente — o mesmo comportamento já usado na busca de fonada.
  celular: { colunas: ['celular', 'whatsapp'], tipo: 'texto' },
  fixo: { coluna: 'fixo', tipo: 'texto' },
  endereco: { coluna: 'endereco', tipo: 'texto' },
};

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function nascimentoValido(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return true;
  const partes = texto.match(/^(\d{2})\/(\d{2})(?:\/(\d{2}|\d{4}))?$/);
  if (!partes) return false;
  const dia = Number(partes[1]);
  const mes = Number(partes[2]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const ano = partes[3] ? Number(partes[3].length === 2 ? `20${partes[3]}` : partes[3]) : 2000;
  return dia <= new Date(ano, mes, 0).getDate();
}

// Monta a cláusula WHERE de um filtro específico. "indiceInicial" é o
// número do próximo placeholder $N disponível — precisa ser passado
// porque essa cláusula pode vir depois de outras já montadas na mesma
// query (ex: WHERE excluido_em IS NULL AND <filtro>).
// Monta a condição de comparação de texto para busca: sempre ignora
// maiúsculas/minúsculas (ILIKE); ignora acentos também quando a
// extensão "unaccent" está disponível no banco (ver iniciarBanco em
// db/database.js — alguns provedores gerenciados não permitem criar
// extensões, então isso é best-effort).
function condicaoTexto(coluna, indice) {
  if (unaccentEstaDisponivel()) {
    return `unaccent(${coluna}) ILIKE unaccent($${indice})`;
  }
  return `${coluna} ILIKE $${indice}`;
}

function montarFiltroCliente(campo, termo, indiceInicial) {
  const filtro = FILTROS_CLIENTE[campo];
  if (!filtro) return null;
  const padrao = filtro.tipo === 'data' ? `${termo}%` : `%${termo}%`;
  // Datas não têm noção de maiúsculas/minúsculas/acento — LIKE comum
  // já é suficiente e mais rápido (evita a função unaccent à toa).
  if (filtro.tipo === 'data') {
    return { where: `${filtro.coluna} LIKE $${indiceInicial}`, params: [padrao] };
  }
  // Filtros com múltiplas colunas (ex: celular também busca em
  // whatsapp) usam o mesmo termo repetido em placeholders distintos,
  // unidas por OR entre parênteses.
  const colunas = filtro.colunas || [filtro.coluna];
  const condicoes = colunas.map((coluna, i) => condicaoTexto(coluna, indiceInicial + i));
  const where = `(${condicoes.join(' OR ')})`;
  const params = colunas.map(() => padrao);
  return { where, params };
}

// Colunas permitidas para ordenação da listagem de clientes — nunca aceitar
// o valor da query string diretamente no SQL (risco de SQL injection).
const ORDENACAO_PERMITIDA = {
  nome: 'c.nome',
  total_fonada: 'total_fonada',
  total_aovivo: 'total_aovivo',
  total_pedidos: 'total_pedidos',
  ultimo_pedido: 'ultimo_pedido_em',
  valor_pendente: 'valor_pendente',
};

// GET /api/clientes?busca=nome&campo=nome&pagina=1&ordenarPor=nome&direcao=asc
router.get('/', async (req, res) => {
  try {
    const busca = (req.query.busca || '').trim();
    const campo = (req.query.campo || '').trim();
    const telefone = somenteDigitos(req.query.telefone);
    const aniversario = (req.query.aniversario || '').trim();
    const situacao = (req.query.situacao || '').trim();
    const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
    const porPagina = Math.max(1, Math.min(parseInt(req.query.porPagina) || 30, 200));
    const offset = (pagina - 1) * porPagina;

    const colunaOrdenacao = ORDENACAO_PERMITIDA[req.query.ordenarPor] || ORDENACAO_PERMITIDA.nome;
    const direcao = req.query.direcao === 'desc' ? 'DESC' : 'ASC';

    let where = 'WHERE c.excluido_em IS NULL';
    let params = [];

    if (busca && campo) {
      const filtro = montarFiltroCliente(campo, busca, 1);
      if (filtro) {
        where += ` AND ${filtro.where.replace(/\b(nome|nascimento|celular|whatsapp|fixo|endereco)\b/g, 'c.$1')}`;
        params = filtro.params;
      }
    } else if (busca) {
      where += ` AND ${condicaoTexto('c.nome', 1)}`;
      params = [`%${busca}%`];
    }

    if (telefone) {
      params.push(`%${telefone}%`);
      where += ` AND (
        regexp_replace(COALESCE(c.fixo, ''), '\\D', '', 'g') LIKE $${params.length} OR
        regexp_replace(COALESCE(c.celular, ''), '\\D', '', 'g') LIKE $${params.length} OR
        regexp_replace(COALESCE(c.whatsapp, ''), '\\D', '', 'g') LIKE $${params.length}
      )`;
    }
    if (aniversario) {
      params.push(`${aniversario}%`);
      where += ` AND c.nascimento LIKE $${params.length}`;
    }
    if (situacao === 'pendencia') {
      where += ` AND (
        EXISTS (SELECT 1 FROM fonadas f WHERE f.cliente_id = c.id AND f.excluido_em IS NULL AND COALESCE(f.pagou, '') != 'SIM' AND COALESCE(f.cobranca, '') != '') OR
        EXISTS (SELECT 1 FROM ao_vivo a WHERE a.cliente_id = c.id AND a.excluido_em IS NULL AND COALESCE(a.pagou, '') != 'SIM')
      )`;
    } else if (situacao === 'recentes') {
      where += ` AND c.criado_em >= NOW() - INTERVAL '30 days'`;
    } else if (situacao === 'sem_pedidos') {
      where += ` AND NOT EXISTS (SELECT 1 FROM fonadas f WHERE f.cliente_id = c.id AND f.excluido_em IS NULL)
                 AND NOT EXISTS (SELECT 1 FROM ao_vivo a WHERE a.cliente_id = c.id AND a.excluido_em IS NULL)`;
    } else if (situacao === 'bloqueados') {
      where += ` AND c.bloqueado = TRUE`;
    } else if (situacao === 'aniversariantes') {
      const diaMesHojeBrasilia = formatarDataBrasilia().slice(0, 5);
      params.push(diaMesHojeBrasilia);
      where += ` AND substring(TRIM(COALESCE(c.nascimento, '')) from 1 for 5) = $${params.length}`;
    }

    // Busca global precisa apenas de contatos, sem estatísticas ou histórico.
    if (req.query.modo === 'contatos') {
      const resposta = await db.query(`
        SELECT c.id, c.nome, c.nascimento, c.whatsapp, c.celular, c.fixo, c.bairro
        FROM clientes c ${where} ORDER BY c.nome ASC, c.id ASC
        LIMIT $${params.length + 1}
      `, [...params, Math.min(porPagina, 30)]);
      return res.json({ clientes: resposta.rows });
    }

    const totalResultado = await db.query(`SELECT COUNT(*) as n FROM clientes c ${where}`, params);
    const total = parseInt(totalResultado.rows[0].n, 10);

    // LIMIT/OFFSET usam os próximos dois placeholders depois dos já
    // usados no WHERE (ex: se params tem 1 item, LIMIT é $2 e OFFSET $3).
    const idxLimit = params.length + 1;
    const idxOffset = params.length + 2;
    const paginarAntes = colunaOrdenacao === 'c.nome';
    // Na ordenação por nome, apenas os clientes da página precisam ter
    // seus pedidos agregados. Ordenações por indicadores continuam globais.
    const origemClientes = paginarAntes
      ? `(SELECT c.* FROM clientes c ${where} ORDER BY c.nome ${direcao}, c.id ASC LIMIT $${idxLimit} OFFSET $${idxOffset}) c`
      : 'clientes c';
    const linhasResultado = await db.query(`
      SELECT c.*,
        COALESCE(f_stats.total, 0) as total_fonada,
        COALESCE(a_stats.total, 0) as total_aovivo,
        COALESCE(f_stats.total, 0) + COALESCE(a_stats.total, 0) as total_pedidos,
        ultimo.data_pedido as ultimo_pedido_data,
        ultimo.data_ordenacao as ultimo_pedido_em,
        COALESCE(f_stats.valor_pendente, 0) + COALESCE(a_stats.valor_pendente, 0) as valor_pendente
      FROM ${origemClientes}
      LEFT JOIN ${paginarAntes ? 'LATERAL' : ''} (
        SELECT cliente_id, COUNT(*)::INTEGER as total,
          COALESCE(SUM(valor) FILTER (WHERE COALESCE(pagou, '') != 'SIM' AND COALESCE(cobranca, '') != ''), 0) as valor_pendente
        FROM fonadas
        WHERE excluido_em IS NULL ${paginarAntes ? 'AND cliente_id = c.id' : ''}
        GROUP BY cliente_id
      ) f_stats ON f_stats.cliente_id = c.id
      LEFT JOIN ${paginarAntes ? 'LATERAL' : ''} (
        SELECT cliente_id, COUNT(*)::INTEGER as total,
          COALESCE(SUM(valor) FILTER (WHERE COALESCE(pagou, '') != 'SIM'), 0) as valor_pendente
        FROM ao_vivo
        WHERE excluido_em IS NULL ${paginarAntes ? 'AND cliente_id = c.id' : ''}
        GROUP BY cliente_id
      ) a_stats ON a_stats.cliente_id = c.id
      LEFT JOIN LATERAL (
        SELECT datas.data_pedido, datas.data_ordenacao
        FROM (
          SELECT pedidos.data_pedido,
            CASE
              WHEN length(pedidos.data_pedido) = 8 THEN
                (2000 + right(pedidos.data_pedido, 2)::INTEGER) * 10000 +
                substring(pedidos.data_pedido from 4 for 2)::INTEGER * 100 +
                left(pedidos.data_pedido, 2)::INTEGER
              ELSE
                right(pedidos.data_pedido, 4)::INTEGER * 10000 +
                substring(pedidos.data_pedido from 4 for 2)::INTEGER * 100 +
                left(pedidos.data_pedido, 2)::INTEGER
            END as data_ordenacao
          FROM (
            SELECT data_pedido FROM fonadas WHERE cliente_id = c.id AND excluido_em IS NULL
            UNION ALL
            SELECT data_pedido FROM ao_vivo WHERE cliente_id = c.id AND excluido_em IS NULL
          ) pedidos
          WHERE pedidos.data_pedido ~ '^\\d{2}/\\d{2}/(\\d{2}|\\d{4})$'
            AND substring(pedidos.data_pedido from 4 for 2)::INTEGER BETWEEN 1 AND 12
            AND left(pedidos.data_pedido, 2)::INTEGER BETWEEN 1 AND
              CASE
                WHEN substring(pedidos.data_pedido from 4 for 2)::INTEGER = 2 THEN 29
                WHEN substring(pedidos.data_pedido from 4 for 2)::INTEGER IN (4, 6, 9, 11) THEN 30
                ELSE 31
              END
        ) datas
        WHERE datas.data_ordenacao <= to_char(CURRENT_DATE, 'YYYYMMDD')::INTEGER
        ORDER BY datas.data_ordenacao DESC NULLS LAST
        LIMIT 1
      ) ultimo ON TRUE
      ${paginarAntes ? '' : where}
      ORDER BY ${colunaOrdenacao} ${direcao}, c.nome ASC, c.id ASC
      ${paginarAntes ? '' : `LIMIT $${idxLimit} OFFSET $${idxOffset}`}
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
    const porPagina = Math.max(1, Math.min(parseInt(req.query.porPagina) || 30, 200));
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

    const diaMesBuscado = diaMesDaData(nascimento);
    if (!diaMesBuscado) {
      return res.json({ possiveisDuplicados: [] });
    }

    // Busca todos os clientes ativos cujo nascimento comece com o
    // mesmo dd/mm — cobre tanto "dd/mm" puro quanto "dd/mm/aa" com
    // qualquer ano, já que o formato sempre começa com dd/mm.
    const resultado = await db.query(
      `SELECT * FROM clientes WHERE excluido_em IS NULL AND nascimento LIKE $1`,
      [`${diaMesBuscado}%`]
    );
    // Filtro extra em JS (não só no SQL) para garantir que o "%" do
    // LIKE não casou por acidente com um dia/mês diferente que só
    // compartilha o prefixo textual (ex: nunca aconteceria aqui, já
    // que dd/mm tem tamanho fixo, mas mantém a checagem exata como
    // segurança caso o formato mude no futuro).
    const possiveisDuplicados = resultado.rows.filter((c) => {
      return diaMesDaData(c.nascimento) === diaMesBuscado && nomesParecidos(c.nome, nome);
    });

    res.json({ possiveisDuplicados });
  } catch (erro) {
    console.error('Erro ao verificar duplicidade:', erro);
    res.status(500).json({ erro: 'Erro ao verificar duplicidade.' });
  }
});

// GET /api/clientes/possiveis-duplicatas
//
// Varre a base de clientes ativos procurando pares com nome parecido
// e o mesmo dia/mês de aniversário (mesma regra usada no cadastro de
// cliente novo). Usado para sugerir mesclagem na Lista de Clientes —
// diferente da mesclagem manual por arrastar, aqui a pessoa só
// confirma, e o sistema decide sozinho qual cadastro vence (o do
// pedido mais recente).
//
// Precisa vir ANTES de GET /:id no arquivo — senão o Express
// interpretaria "possiveis-duplicatas" como um valor de :id.
router.get('/possiveis-duplicatas', async (req, res) => {
  try {
    const resultado = await db.query(`
      SELECT id, nome, nascimento, fixo, whatsapp, celular, endereco, complemento, bairro, referencia
      FROM clientes
      WHERE excluido_em IS NULL AND nascimento IS NOT NULL AND nascimento != ''
      ORDER BY id
    `);

    const descartadosResultado = await db.query('SELECT cliente_menor_id, cliente_maior_id FROM duplicatas_descartadas');
    const descartados = new Set(
      descartadosResultado.rows.map((d) => `${d.cliente_menor_id}-${d.cliente_maior_id}`)
    );

    // Agrupa por dia/mês de aniversário primeiro (rápido, em memória),
    // depois só compara nomes dentro de cada grupo — evita comparar
    // todo mundo com todo mundo (custo O(n²) desnecessário) quando a
    // base tem milhares de clientes.
    const porDiaMes = new Map();
    for (const c of resultado.rows) {
      const diaMes = diaMesDaData(c.nascimento);
      if (!diaMes) continue;
      if (!porDiaMes.has(diaMes)) porDiaMes.set(diaMes, []);
      porDiaMes.get(diaMes).push(c);
    }

    const pares = [];
    for (const grupo of porDiaMes.values()) {
      if (grupo.length < 2) continue;
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) {
          if (!nomesParecidos(grupo[i].nome, grupo[j].nome)) continue;
          const menor = Math.min(grupo[i].id, grupo[j].id);
          const maior = Math.max(grupo[i].id, grupo[j].id);
          if (descartados.has(`${menor}-${maior}`)) continue;
          pares.push({ a: grupo[i], b: grupo[j] });
        }
      }
    }

    res.json({ pares });
  } catch (erro) {
    console.error('Erro ao buscar possíveis duplicatas:', erro);
    res.status(500).json({ erro: 'Erro ao buscar possíveis duplicatas.' });
  }
});

// POST /api/clientes/descartar-duplicata
//
// Registra permanentemente que um par de clientes NÃO é a mesma
// pessoa, mesmo batendo no critério de nome parecido + mesmo dia/mês
// de aniversário — a sugestão para de aparecer para esse par
// especificamente em buscas futuras.
router.post('/descartar-duplicata', async (req, res) => {
  const { clienteAId, clienteBId } = req.body;
  if (!clienteAId || !clienteBId) {
    return res.status(400).json({ erro: 'Informe clienteAId e clienteBId.' });
  }
  if ([clienteAId, clienteBId].some((id) => !/^[1-9]\d*$/.test(String(id)) || Number(id) > 2147483647) || String(clienteAId) === String(clienteBId)) {
    return res.status(400).json({ erro: 'Informe dois clientes diferentes e válidos.' });
  }
  try {
    const menor = Math.min(clienteAId, clienteBId);
    const maior = Math.max(clienteAId, clienteBId);
    const existentes = await db.query('SELECT id FROM clientes WHERE id IN ($1, $2) AND excluido_em IS NULL', [menor, maior]);
    if (existentes.rows.length !== 2) return res.status(404).json({ erro: 'Um dos clientes não foi encontrado.' });
    await db.query(
      `INSERT INTO duplicatas_descartadas (cliente_menor_id, cliente_maior_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [menor, maior]
    );
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao descartar duplicata:', erro);
    res.status(500).json({ erro: 'Erro ao descartar duplicata.' });
  }
});

// POST /api/clientes/mesclar-automatico
//
// Mescla dois clientes decidindo sozinho qual cadastro vence: o dono
// do pedido (Fonada ou Ao Vivo) mais recente entre os dois. Usado
// pela sugestão de duplicatas da Lista de Clientes — diferente de
// POST /:id/mesclar (mesclagem manual por arrastar), onde a pessoa
// escolhe ativamente qual card vence.
router.post('/mesclar-automatico', async (req, res) => {
  const { clienteAId, clienteBId } = req.body;
  if (!clienteAId || !clienteBId) {
    return res.status(400).json({ erro: 'Informe clienteAId e clienteBId.' });
  }
  if (String(clienteAId) === String(clienteBId)) {
    return res.status(400).json({ erro: 'Não é possível mesclar um cliente com ele mesmo.' });
  }

  const client = await pool.connect();
  try {
    const resultadoA = await client.query('SELECT * FROM clientes WHERE id = $1 AND excluido_em IS NULL', [clienteAId]);
    const resultadoB = await client.query('SELECT * FROM clientes WHERE id = $1 AND excluido_em IS NULL', [clienteBId]);
    const clienteA = resultadoA.rows[0];
    const clienteB = resultadoB.rows[0];
    if (!clienteA || !clienteB) {
      return res.status(404).json({ erro: 'Um dos clientes não foi encontrado.' });
    }

    const recenteA = await pedidoMaisRecenteDoCliente(client, clienteAId);
    const recenteB = await pedidoMaisRecenteDoCliente(client, clienteBId);

    // Quem tem o pedido mais recente vence e permanece como o
    // registro principal; o outro é mesclado dentro dele. Em caso de
    // nenhum dos dois ter pedidos ainda (ambos null), ou empate,
    // mantém A como vencedor por padrão — mas isso é raro na prática,
    // já que a sugestão só aparece para clientes com histórico.
    const aVence = !recenteB || (recenteA && new Date(recenteA) >= new Date(recenteB));
    const vencedor = aVence ? clienteA : clienteB;
    const perdedor = aVence ? clienteB : clienteA;

    await client.query('BEGIN');
    await client.query('UPDATE fonadas SET cliente_id = $1, versao = versao + 1 WHERE cliente_id = $2', [vencedor.id, perdedor.id]);
    await client.query('UPDATE ao_vivo SET cliente_id = $1, versao = versao + 1 WHERE cliente_id = $2', [vencedor.id, perdedor.id]);

    // Diferente da mesclagem manual: aqui os dados do VENCEDOR (dono
    // do pedido mais recente) prevalecem — mas só nos campos que ele
    // realmente tem preenchidos. Um campo vazio no vencedor ainda
    // pode ser complementado pelo perdedor, para não perder
    // informação útil (ex: vencedor sem endereço cadastrado, perdedor
    // com endereço).
    const campos = ['nome', 'nascimento', 'fixo', 'whatsapp', 'celular', 'endereco', 'complemento', 'bairro', 'referencia'];
    const valoresFinais = campos.map((c) => vencedor[c] || perdedor[c]);
    const setClause = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    await client.query(
      `UPDATE clientes SET ${setClause}, atualizado_em = NOW(), versao = versao + 1 WHERE id = $${campos.length + 1}`,
      [...valoresFinais, vencedor.id]
    );
    await client.query('UPDATE clientes SET excluido_em = NOW(), versao = versao + 1 WHERE id = $1', [perdedor.id]);

    // Sincroniza a cópia do nome em todos os pedidos que agora
    // pertencem ao vencedor (tanto os que já eram dele quanto os que
    // acabaram de ser transferidos do perdedor), para a busca de
    // pedidos continuar batendo com o nome final do cliente mesclado.
    const nomeFinal = valoresFinais[0];
    await client.query('UPDATE fonadas SET nome_comprador = $1, versao = versao + 1 WHERE cliente_id = $2 AND excluido_em IS NULL', [nomeFinal, vencedor.id]);
    await client.query('UPDATE ao_vivo SET comprador = $1, versao = versao + 1 WHERE cliente_id = $2 AND excluido_em IS NULL', [nomeFinal, vencedor.id]);

    await client.query('COMMIT');

    const atualizado = await client.query('SELECT * FROM clientes WHERE id = $1', [vencedor.id]);
    res.json({ cliente: atualizado.rows[0], vencedorId: vencedor.id, perdedorId: perdedor.id });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao mesclar automaticamente:', erro);
    res.status(500).json({ erro: 'Não foi possível mesclar os clientes.' });
  } finally {
    client.release();
  }
});

// GET /api/clientes/:id/resumo
// Consulta enxuta para o painel lateral: agrega os totais no banco e traz
// somente as cinco compras mais recentes, sem carregar o histórico inteiro.
router.get('/:id/resumo', async (req, res) => {
  try {
    const clienteResultado = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    const cliente = clienteResultado.rows[0];
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    const resumoResultado = await db.query(`
      SELECT
        COUNT(*)::integer AS total_pedidos,
        COUNT(*) FILTER (WHERE tipo = 'Fonada')::integer AS total_fonada,
        COUNT(*) FILTER (WHERE tipo = 'Ao vivo')::integer AS total_aovivo,
        COALESCE(SUM(valor) FILTER (WHERE COALESCE(pagou, '') != 'SIM'), 0) AS valor_pendente
      FROM (
        SELECT 'Fonada' AS tipo, valor, pagou FROM fonadas WHERE cliente_id = $1 AND excluido_em IS NULL
        UNION ALL
        SELECT 'Ao vivo' AS tipo, valor, pagou FROM ao_vivo WHERE cliente_id = $1 AND excluido_em IS NULL
      ) pedidos
    `, [req.params.id]);

    const recentesResultado = await db.query(`
      SELECT * FROM (
        SELECT id, 'Fonada' AS tipo, senha_os AS os, data_pedido, valor,
               '/fonada/' || id AS rota, criado_em,
               CASE WHEN data_pedido ~ '^\\d{2}/\\d{2}/(\\d{2}|\\d{4})$'
                    THEN TO_DATE(data_pedido, CASE WHEN length(data_pedido) = 8 THEN 'DD/MM/YY' ELSE 'DD/MM/YYYY' END)
                    ELSE criado_em::date END AS data_compra_ordem
        FROM fonadas WHERE cliente_id = $1 AND excluido_em IS NULL
        UNION ALL
        SELECT id, 'Ao vivo' AS tipo, numero_os AS os, data_pedido, valor,
               '/ao-vivo/' || id AS rota, criado_em,
               CASE WHEN data_pedido ~ '^\\d{2}/\\d{2}/(\\d{2}|\\d{4})$'
                    THEN TO_DATE(data_pedido, CASE WHEN length(data_pedido) = 8 THEN 'DD/MM/YY' ELSE 'DD/MM/YYYY' END)
                    ELSE criado_em::date END AS data_compra_ordem
        FROM ao_vivo WHERE cliente_id = $1 AND excluido_em IS NULL
      ) compras
      ORDER BY data_compra_ordem DESC, criado_em DESC, id DESC
      LIMIT 5
    `, [req.params.id]);

    const haverResultado = await db.query(`
      SELECT id, valor, senha_os, data_pedido, p1_fixo, p1_celular,
             p2_dia, p2_para, p2_tema, p2_mensagem, p2_fixo, p2_celular,
             p2_horario, p2_quem_oferece, p2_resultado
      FROM fonadas
      WHERE cliente_id = $1 AND excluido_em IS NULL AND COALESCE(p2_resultado, '') = ''
      ORDER BY criado_em DESC
    `, [req.params.id]);

    const mensagensEmHaver = haverResultado.rows.flatMap((pedido) => {
      const situacao = situacaoSegundaMensagem(pedido);
      return situacao.disponivel ? [{
        id: pedido.id,
        os: pedido.senha_os,
        dataCompra: pedido.data_pedido,
        tema: pedido.p2_tema || null,
        destinatario: pedido.p2_para || null,
        dataExpiracao: situacao.dataExpiracao,
        status: situacao.status,
        rota: `/fonada/${pedido.id}`,
      }] : [];
    });

    res.json({
      cliente,
      resumo: resumoResultado.rows[0],
      ultimasCompras: recentesResultado.rows,
      mensagensEmHaver,
    });
  } catch (erro) {
    console.error('Erro ao buscar resumo do cliente:', erro);
    res.status(500).json({ erro: 'Erro ao buscar resumo do cliente.' });
  }
});

// GET /api/clientes/:id
router.get('/:id', async (req, res) => {
  try {
    const clienteResultado = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    const cliente = clienteResultado.rows[0];
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    if (req.query.historico === 'nao') return res.json({ cliente });

    const pedidosFonadaResultado = await db.query(`
      SELECT id, senha_os, data_pedido, p1_dia, p1_para, p1_fixo, p1_celular, p1_resultado, p1_passada_por,
             p2_dia, p2_para, p2_tema, p2_mensagem, p2_fixo, p2_celular, p2_horario,
             p2_quem_oferece, p2_resultado, p2_passada_por,
             valor, pagou, cobranca, cobranca_reagendada, periodo, data_pagamento, status, criado_em
      FROM fonadas WHERE cliente_id = $1 AND excluido_em IS NULL ORDER BY id DESC
    `, [req.params.id]);

    const pedidosAoVivoResultado = await db.query(`
      SELECT id, numero_os, data_pedido, dia_entrega, para, valor, pagamento, pagou, data_pagou,
             criado_em
      FROM ao_vivo WHERE cliente_id = $1 AND excluido_em IS NULL ORDER BY id DESC
    `, [req.params.id]);

    res.json({
      cliente,
      pedidosFonada: pedidosFonadaResultado.rows.map((pedido) => ({
        ...pedido,
        mensagemEmHaver: situacaoSegundaMensagem(pedido),
      })),
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
    if (typeof dados.nome !== 'string' || !dados.nome.trim()) {
      return res.status(400).json({ erro: 'O nome é obrigatório.' });
    }
    dados.nome = dados.nome.trim();
    if (!nascimentoValido(dados.nascimento)) {
      return res.status(400).json({ erro: 'Informe uma data de nascimento válida.' });
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
      SET bloqueado = $1, bloqueio_motivo = $2, atualizado_em = NOW(), versao = versao + 1
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
    const existente = await db.query('SELECT id, nome FROM clientes WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    const dados = req.body;
    if (dados.nome !== undefined) {
      if (typeof dados.nome !== 'string' || !dados.nome.trim()) {
        return res.status(400).json({ erro: 'O nome é obrigatório.' });
      }
      dados.nome = dados.nome.trim();
    }
    if (dados.nascimento !== undefined && !nascimentoValido(dados.nascimento)) {
      return res.status(400).json({ erro: 'Informe uma data de nascimento válida.' });
    }
    const campos = CAMPOS.filter((c) => dados[c] !== undefined);
    if (campos.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
    if (!Number.isSafeInteger(dados.versao) || dados.versao < 1) {
      return res.status(400).json({ erro: 'A versão do cadastro é obrigatória para salvar.' });
    }

    const setClause = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => dados[c]);
    const idxId = campos.length + 1;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const resultado = await client.query(
        `UPDATE clientes SET ${setClause}, atualizado_em = NOW(), versao = versao + 1
         WHERE id = $${idxId} AND versao = $${idxId + 1} AND excluido_em IS NULL RETURNING *`,
        [...valores, req.params.id, dados.versao]
      );
      if (resultado.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Cadastro alterado em outra aba. Recarregue a página antes de salvar novamente.' });
      }

      // Mantém as cópias do nome nos pedidos sincronizadas com a ficha.
      if (dados.nome !== undefined && dados.nome !== existente.rows[0].nome) {
        await client.query(
          'UPDATE fonadas SET nome_comprador = $1, versao = versao + 1 WHERE cliente_id = $2 AND excluido_em IS NULL',
          [dados.nome, req.params.id]
        );
        await client.query(
          'UPDATE ao_vivo SET comprador = $1, versao = versao + 1 WHERE cliente_id = $2 AND excluido_em IS NULL',
          [dados.nome, req.params.id]
        );
      }
      await client.query('COMMIT');
      res.json(resultado.rows[0]);
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    } finally {
      client.release();
    }
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
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('UPDATE clientes SET excluido_em = NOW(), versao = versao + 1 WHERE id = $1', [req.params.id]);
    await client.query('UPDATE fonadas SET excluido_em = NOW(), versao = versao + 1 WHERE cliente_id = $1', [req.params.id]);
    await client.query('UPDATE ao_vivo SET excluido_em = NOW(), versao = versao + 1 WHERE cliente_id = $1', [req.params.id]);
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
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('UPDATE clientes SET excluido_em = NULL, versao = versao + 1 WHERE id = $1', [req.params.id]);
    await client.query('UPDATE fonadas SET excluido_em = NULL, versao = versao + 1 WHERE cliente_id = $1', [req.params.id]);
    await client.query('UPDATE ao_vivo SET excluido_em = NULL, versao = versao + 1 WHERE cliente_id = $1', [req.params.id]);
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
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    if (!cliente.excluido_em) {
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
  const dadosFinais = req.body.dadosFinais || {};

  if (!origemId) return res.status(400).json({ erro: 'Informe o cliente de origem (origemId).' });
  if (String(origemId) === String(destinoId)) {
    return res.status(400).json({ erro: 'Não é possível mesclar um cliente com ele mesmo.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A seleção de dados do diálogo pode ficar obsoleta enquanto outro
    // operador edita um dos cadastros. Trave ambos em ordem estável.
    const bloqueados = await client.query(
      'SELECT * FROM clientes WHERE id IN ($1, $2) AND excluido_em IS NULL ORDER BY id FOR UPDATE',
      [destinoId, origemId]
    );
    const destino = bloqueados.rows.find((item) => String(item.id) === String(destinoId));
    const origem = bloqueados.rows.find((item) => String(item.id) === String(origemId));
    if (!destino) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Cliente de destino não encontrado.' });
    }
    if (!origem) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Cliente de origem não encontrado.' });
    }
    if ((req.body.versaoDestino !== undefined && Number(req.body.versaoDestino) !== destino.versao) ||
        (req.body.versaoOrigem !== undefined && Number(req.body.versaoOrigem) !== origem.versao)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Um dos clientes foi alterado por outra pessoa. Atualize a lista antes de mesclar.' });
    }

    const camposFinais = CAMPOS.filter((campo) => dadosFinais[campo] !== undefined);
    if (camposFinais.length > 0) {
      if (dadosFinais.nome !== undefined && !String(dadosFinais.nome || '').trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'O nome final do cliente é obrigatório.' });
      }
      if (dadosFinais.nascimento !== undefined && !nascimentoValido(dadosFinais.nascimento)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'A data de nascimento escolhida não é válida.' });
      }
      const setDados = camposFinais.map((campo, indice) => `${campo} = $${indice + 1}`).join(', ');
      await client.query(
        `UPDATE clientes SET ${setDados}, atualizado_em = NOW(), versao = versao + 1 WHERE id = $${camposFinais.length + 1}`,
        [...camposFinais.map((campo) => dadosFinais[campo] || null), destinoId]
      );
    }
    await client.query('UPDATE fonadas SET cliente_id = $1, versao = versao + 1 WHERE cliente_id = $2', [destinoId, origemId]);
    await client.query('UPDATE ao_vivo SET cliente_id = $1, versao = versao + 1 WHERE cliente_id = $2', [destinoId, origemId]);

    // Mesclagem manual (arrastar-e-soltar na lista): o card de DESTINO
    // (onde o outro foi solto em cima) vence — mantém seus próprios
    // dados de cadastro (nome, telefone, endereço etc.) sem nenhuma
    // alteração. Só os pedidos da origem são migrados para o destino;
    // o registro de origem é arquivado (soft delete) sem que seus
    // dados de cadastro sejam copiados para lugar nenhum.
    await client.query('UPDATE clientes SET excluido_em = NOW(), versao = versao + 1 WHERE id = $1', [origemId]);

    // Os pedidos migrados da origem ainda carregam a cópia do nome
    // antigo (nome_comprador / comprador) — sincroniza com o nome do
    // destino, que é quem prevalece nessa mesclagem manual.
    const nomeFinal = dadosFinais.nome || destino.nome;
    await client.query('UPDATE fonadas SET nome_comprador = $1, versao = versao + 1 WHERE cliente_id = $2 AND excluido_em IS NULL', [nomeFinal, destinoId]);
    await client.query('UPDATE ao_vivo SET comprador = $1, versao = versao + 1 WHERE cliente_id = $2 AND excluido_em IS NULL', [nomeFinal, destinoId]);

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
