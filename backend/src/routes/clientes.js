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

const router = express.Router();

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
};

// GET /api/clientes?busca=nome&campo=nome&pagina=1&ordenarPor=nome&direcao=asc
router.get('/', async (req, res) => {
  try {
    const busca = (req.query.busca || '').trim();
    const campo = (req.query.campo || '').trim();
    const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
    const porPagina = Math.min(parseInt(req.query.porPagina) || 30, 200);
    const offset = (pagina - 1) * porPagina;

    const colunaOrdenacao = ORDENACAO_PERMITIDA[req.query.ordenarPor] || ORDENACAO_PERMITIDA.nome;
    const direcao = req.query.direcao === 'desc' ? 'DESC' : 'ASC';

    let where = 'WHERE excluido_em IS NULL';
    let params = [];

    if (busca && campo) {
      const filtro = montarFiltroCliente(campo, busca, 1);
      if (filtro) {
        where += ` AND ${filtro.where}`;
        params = filtro.params;
      }
    } else if (busca) {
      where += ` AND ${condicaoTexto('nome', 1)}`;
      params = [`%${busca}%`];
    }

    const totalResultado = await db.query(`SELECT COUNT(*) as n FROM clientes ${where}`, params);
    const total = parseInt(totalResultado.rows[0].n, 10);

    // LIMIT/OFFSET usam os próximos dois placeholders depois dos já
    // usados no WHERE (ex: se params tem 1 item, LIMIT é $2 e OFFSET $3).
    const idxLimit = params.length + 1;
    const idxOffset = params.length + 2;
    const linhasResultado = await db.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM fonadas WHERE cliente_id = c.id AND excluido_em IS NULL) as total_fonada,
        (SELECT COUNT(*) FROM ao_vivo WHERE cliente_id = c.id AND excluido_em IS NULL) as total_aovivo
      FROM clientes c
      ${where}
      ORDER BY ${colunaOrdenacao} ${direcao}, c.nome ASC
      LIMIT $${idxLimit} OFFSET $${idxOffset}
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
    const porPagina = Math.min(parseInt(req.query.porPagina) || 30, 200);
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
      SELECT id, nome, nascimento, fixo, whatsapp, celular
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
  try {
    const menor = Math.min(clienteAId, clienteBId);
    const maior = Math.max(clienteAId, clienteBId);
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
      client.release();
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
    await client.query('UPDATE fonadas SET cliente_id = $1 WHERE cliente_id = $2', [vencedor.id, perdedor.id]);
    await client.query('UPDATE ao_vivo SET cliente_id = $1 WHERE cliente_id = $2', [vencedor.id, perdedor.id]);

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
      `UPDATE clientes SET ${setClause}, atualizado_em = NOW() WHERE id = $${campos.length + 1}`,
      [...valoresFinais, vencedor.id]
    );
    await client.query('UPDATE clientes SET excluido_em = NOW() WHERE id = $1', [perdedor.id]);

    // Sincroniza a cópia do nome em todos os pedidos que agora
    // pertencem ao vencedor (tanto os que já eram dele quanto os que
    // acabaram de ser transferidos do perdedor), para a busca de
    // pedidos continuar batendo com o nome final do cliente mesclado.
    const nomeFinal = valoresFinais[0];
    await client.query('UPDATE fonadas SET nome_comprador = $1 WHERE cliente_id = $2 AND excluido_em IS NULL', [nomeFinal, vencedor.id]);
    await client.query('UPDATE ao_vivo SET comprador = $1 WHERE cliente_id = $2 AND excluido_em IS NULL', [nomeFinal, vencedor.id]);

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

// GET /api/clientes/:id
router.get('/:id', async (req, res) => {
  try {
    const clienteResultado = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    const cliente = clienteResultado.rows[0];
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    const pedidosFonadaResultado = await db.query(`
      SELECT id, senha_os, data_pedido, p1_dia, p1_para, p2_dia, p2_para, valor, pagou
      FROM fonadas WHERE cliente_id = $1 ORDER BY id DESC
    `, [req.params.id]);

    const pedidosAoVivoResultado = await db.query(`
      SELECT id, numero_os, data_pedido, dia_entrega, para, valor
      FROM ao_vivo WHERE cliente_id = $1 ORDER BY id DESC
    `, [req.params.id]);

    res.json({
      cliente,
      pedidosFonada: pedidosFonadaResultado.rows,
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
    if (!dados.nome || !dados.nome.trim()) {
      return res.status(400).json({ erro: 'O nome é obrigatório.' });
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
      SET bloqueado = $1, bloqueio_motivo = $2, atualizado_em = NOW()
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
    const existente = await db.query('SELECT id FROM clientes WHERE id = $1', [req.params.id]);
    if (existente.rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado.' });

    const dados = req.body;
    const campos = CAMPOS.filter((c) => dados[c] !== undefined);
    if (campos.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    const setClause = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => dados[c]);
    const idxId = campos.length + 1;

    await db.query(
      `UPDATE clientes SET ${setClause}, atualizado_em = NOW() WHERE id = $${idxId}`,
      [...valores, req.params.id]
    );

    // O nome do cliente fica copiado ("congelado") em cada pedido no
    // momento da criação — nome_comprador em fonadas, comprador em
    // ao_vivo — porque o pedido precisa manter esse dado mesmo se o
    // cliente for excluído depois. Mas isso significa que editar o
    // nome aqui, sem propagar, deixa a busca de pedidos (que usa essa
    // cópia) desatualizada mesmo que a tela do pedido mostre o nome
    // certo (ela busca o cliente à parte, ao vivo). Sincroniza as
    // cópias sempre que o nome mudar, para a busca continuar batendo
    // com o nome atual do cliente.
    if (dados.nome !== undefined) {
      await db.query(
        `UPDATE fonadas SET nome_comprador = $1 WHERE cliente_id = $2 AND excluido_em IS NULL`,
        [dados.nome, req.params.id]
      );
      await db.query(
        `UPDATE ao_vivo SET comprador = $1 WHERE cliente_id = $2 AND excluido_em IS NULL`,
        [dados.nome, req.params.id]
      );
    }

    const atualizado = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    res.json(atualizado.rows[0]);
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
      client.release();
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('UPDATE clientes SET excluido_em = NOW() WHERE id = $1', [req.params.id]);
    await client.query('UPDATE fonadas SET excluido_em = NOW() WHERE cliente_id = $1', [req.params.id]);
    await client.query('UPDATE ao_vivo SET excluido_em = NOW() WHERE cliente_id = $1', [req.params.id]);
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
      client.release();
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('UPDATE clientes SET excluido_em = NULL WHERE id = $1', [req.params.id]);
    await client.query('UPDATE fonadas SET excluido_em = NULL WHERE cliente_id = $1', [req.params.id]);
    await client.query('UPDATE ao_vivo SET excluido_em = NULL WHERE cliente_id = $1', [req.params.id]);
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
      client.release();
      return res.status(404).json({ erro: 'Cliente não encontrado.' });
    }
    if (!cliente.excluido_em) {
      client.release();
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

  if (!origemId) return res.status(400).json({ erro: 'Informe o cliente de origem (origemId).' });
  if (String(origemId) === String(destinoId)) {
    return res.status(400).json({ erro: 'Não é possível mesclar um cliente com ele mesmo.' });
  }

  const client = await pool.connect();
  try {
    const destinoResultado = await client.query(
      'SELECT * FROM clientes WHERE id = $1 AND excluido_em IS NULL', [destinoId]
    );
    const origemResultado = await client.query(
      'SELECT * FROM clientes WHERE id = $1 AND excluido_em IS NULL', [origemId]
    );
    const destino = destinoResultado.rows[0];
    const origem = origemResultado.rows[0];
    if (!destino) {
      client.release();
      return res.status(404).json({ erro: 'Cliente de destino não encontrado.' });
    }
    if (!origem) {
      client.release();
      return res.status(404).json({ erro: 'Cliente de origem não encontrado.' });
    }

    await client.query('BEGIN');
    await client.query('UPDATE fonadas SET cliente_id = $1 WHERE cliente_id = $2', [destinoId, origemId]);
    await client.query('UPDATE ao_vivo SET cliente_id = $1 WHERE cliente_id = $2', [destinoId, origemId]);

    // Mesclagem manual (arrastar-e-soltar na lista): o card de DESTINO
    // (onde o outro foi solto em cima) vence — mantém seus próprios
    // dados de cadastro (nome, telefone, endereço etc.) sem nenhuma
    // alteração. Só os pedidos da origem são migrados para o destino;
    // o registro de origem é arquivado (soft delete) sem que seus
    // dados de cadastro sejam copiados para lugar nenhum.
    await client.query('UPDATE clientes SET excluido_em = NOW() WHERE id = $1', [origemId]);

    // Os pedidos migrados da origem ainda carregam a cópia do nome
    // antigo (nome_comprador / comprador) — sincroniza com o nome do
    // destino, que é quem prevalece nessa mesclagem manual.
    await client.query('UPDATE fonadas SET nome_comprador = $1 WHERE cliente_id = $2 AND excluido_em IS NULL', [destino.nome, destinoId]);
    await client.query('UPDATE ao_vivo SET comprador = $1 WHERE cliente_id = $2 AND excluido_em IS NULL', [destino.nome, destinoId]);

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
