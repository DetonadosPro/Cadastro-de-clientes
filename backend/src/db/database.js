// src/db/database.js
// Conexão com PostgreSQL (produção — Railway) e criação das tabelas
// (schema). Esse arquivo substitui a versão anterior baseada em
// node:sqlite: a lógica de negócio é a mesma, só o motor de banco muda.
//
// Diferenças importantes da migração SQLite → PostgreSQL:
//   - AUTOINCREMENT vira SERIAL
//   - datetime('now') vira NOW()
//   - Os métodos db.prepare(...).get()/.all()/.run() SÍNCRONOS do SQLite
//     não existem mais — o driver "pg" é assíncrono (Promises). Toda
//     rota que usa o banco precisa de "await" agora.
//   - Placeholders mudam de "?" para "$1, $2, $3..." — todas as
//     consultas nas rotas foram reescritas para esse formato.

const { Pool } = require('pg');
const { performance } = require('node:perf_hooks');
const { registrarQuery } = require('../observabilidade');

// Em produção (Railway), a variável DATABASE_URL é injetada
// automaticamente quando você adiciona um banco Postgres ao projeto —
// não precisa configurar nada manualmente lá. Localmente, defina
// DATABASE_URL no seu .env apontando para um Postgres de teste.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
});

pool.on('error', (erro) => {
  // Sem um listener, um erro em uma conexão ociosa pode encerrar o
  // processo Node. No Railway isso se parece com uma lentidão/cold start.
  console.error('Erro inesperado em conexão ociosa do PostgreSQL:', erro.message);
});

async function queryObservada(texto, params) {
  const inicio = performance.now();
  try {
    const resultado = await pool.query(texto, params);
    registrarQuery(performance.now() - inicio, texto, true);
    return resultado;
  } catch (erro) {
    registrarQuery(performance.now() - inicio, texto, false);
    throw erro;
  }
}

const db = {
  query: queryObservada,
  pool,
};

let unaccentDisponivel = false;

async function iniciarBanco() {
  // Extensão para busca por nome ignorar acentos (ex: buscar "jose"
  // encontra "José") — além de ILIKE, que já ignora maiúsculas
  ///minúsculas. Tentativa best-effort: alguns provedores gerenciados
  // não permitem criar extensões sem privilégio de superusuário; se
  // falhar, o sistema segue funcionando normalmente, só sem ignorar
  // acentos na busca (ILIKE continua funcionando de qualquer forma).
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    unaccentDisponivel = true;
  } catch (erro) {
    console.warn('⚠️  Extensão "unaccent" não pôde ser criada (busca vai ignorar maiúsculas/minúsculas, mas não acentos):', erro.message);
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS configuracoes_sistema (
    id INTEGER PRIMARY KEY CHECK (id=1), limite_segunda_mensagem NUMERIC(12,2) NOT NULL DEFAULT 12 CHECK (limite_segunda_mensagem>=0),
    versao INTEGER NOT NULL DEFAULT 1, atualizado_em TIMESTAMP DEFAULT NOW(), atualizado_por TEXT
  )`);
  await pool.query('ALTER TABLE configuracoes_sistema ADD COLUMN IF NOT EXISTS meses_mensagem_em_haver INTEGER NOT NULL DEFAULT 3 CHECK (meses_mensagem_em_haver BETWEEN 1 AND 120)');
  await pool.query('INSERT INTO configuracoes_sistema (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      nome TEXT,
      data_nascimento TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      nascimento TEXT,
      fixo TEXT,
      celular TEXT,
      endereco TEXT,
      complemento TEXT,
      bairro TEXT,
      referencia TEXT,
      bloqueado BOOLEAN DEFAULT FALSE,
      bloqueio_motivo TEXT,
      versao INTEGER NOT NULL DEFAULT 1,
      excluido_em TIMESTAMP,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_nascimento ON clientes(nascimento)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fonadas (
      id SERIAL PRIMARY KEY,
      versao INTEGER NOT NULL DEFAULT 1,
      senha_os TEXT,
      cliente_id INTEGER REFERENCES clientes(id),
      nome_comprador TEXT NOT NULL,
      data_pedido TEXT,
      horario_pedido TEXT,
      nascimento TEXT,
      tipo TEXT,
      recall TEXT,
      recall_codigo TEXT,

      p1_dia TEXT,
      p1_para TEXT,
      p1_tema TEXT,
      p1_mensagem TEXT,
      p1_fixo TEXT,
      p1_celular TEXT,
      p1_horario TEXT,
      p1_quem_oferece TEXT,
      p1_resultado TEXT,

      p2_dia TEXT,
      p2_para TEXT,
      p2_tema TEXT,
      p2_mensagem TEXT,
      p2_fixo TEXT,
      p2_celular TEXT,
      p2_horario TEXT,
      p2_quem_oferece TEXT,
      p2_resultado TEXT,

      comprador_fixo TEXT,
      comprador_celular TEXT,
      comprador_endereco TEXT,
      comprador_complemento TEXT,
      comprador_bairro TEXT,
      comprador_referencia TEXT,

      valor REAL,
      cobranca TEXT,
      periodo TEXT,
      pagou TEXT,
      recebi TEXT,
      data_pagamento TEXT,

      vender TEXT,
      status TEXT,
      impresso TEXT,

      excluido_em TIMESTAMP,

      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_nome ON fonadas(nome_comprador)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_data ON fonadas(data_pedido)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_celular ON fonadas(p1_celular)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_cliente ON fonadas(cliente_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_excluido ON fonadas(excluido_em)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_p1_dia ON fonadas(p1_dia)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_p2_dia ON fonadas(p2_dia)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ao_vivo (
      id SERIAL PRIMARY KEY,
      versao INTEGER NOT NULL DEFAULT 1,
      numero_os TEXT,
      cliente_id INTEGER REFERENCES clientes(id),
      data_pedido TEXT,
      horario_pedido TEXT,
      dia_entrega TEXT,
      horario_entrega TEXT,

      comprador TEXT NOT NULL,
      para TEXT,
      oferecimento TEXT,

      endereco TEXT,
      bairro TEXT,
      referencia TEXT,

      fixo_local TEXT,
      celular_local TEXT,

      celular TEXT,
      celular2 TEXT,

      tema_1 TEXT,
      mensagem_codigo_1 TEXT,
      tema_2 TEXT,
      mensagem_codigo_2 TEXT,
      tema_3 TEXT,
      mensagem_codigo_3 TEXT,
      tema_4 TEXT,
      mensagem_codigo_4 TEXT,

      musica_1 TEXT,
      musica_2 TEXT,
      musica_3 TEXT,
      musica_4 TEXT,
      musica_5 TEXT,
      musica_6 TEXT,

      aniversario TEXT,

      valor REAL,
      pagamento TEXT,

      brinde TEXT,
      observacoes TEXT,

      excluido_em TIMESTAMP,

      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_aovivo_comprador ON ao_vivo(comprador)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_aovivo_data ON ao_vivo(dia_entrega)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_aovivo_celular ON ao_vivo(celular)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_aovivo_cliente ON ao_vivo(cliente_id)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tentativas_contato (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES fonadas(id),
      mensagem INTEGER NOT NULL,
      data_hora_tentativa TEXT NOT NULL,
      observacao TEXT,
      remarcado_dia TEXT,
      remarcado_horario TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tentativas_pedido ON tentativas_contato(pedido_id)');

  // Compromissos operacionais independentes de clientes e pedidos.
  // A data usa DATE para permitir filtros/indexação corretos; horário é
  // opcional para lembretes que valem para o dia inteiro.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lembretes (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      data DATE NOT NULL,
      horario TIME,
      observacao TEXT,
      concluido BOOLEAN NOT NULL DEFAULT FALSE,
      criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_lembretes_data ON lembretes(data)');

  // Equivalente a tentativas_contato, mas para o prazo de pagamento do
  // Ao Vivo — não tem o conceito de "1ª/2ª mensagem" (é um pedido só),
  // então não existe coluna mensagem. Guarda o histórico de "não
  // recebeu no dia previsto" + remarcação do dia do prazo.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tentativas_prazo_ao_vivo (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES ao_vivo(id),
      data_hora_tentativa TEXT NOT NULL,
      observacao TEXT,
      remarcado_dia TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tentativas_prazo_pedido ON tentativas_prazo_ao_vivo(pedido_id)');

  // Uma linha por oportunidade diária (cliente ↔ aniversariante). A fila é
  // derivada do histórico de pedidos; aqui ficam apenas o andamento da
  // ligação e o vínculo com um novo pedido, evitando duplicar dados antigos.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recall_registros (
      id SERIAL PRIMARY KEY,
      data_referencia TEXT NOT NULL,
      relacao_chave TEXT NOT NULL,
      cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
      cliente_nome TEXT NOT NULL,
      aniversariante_nome TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      observacao TEXT,
      retornar_em TIMESTAMP,
      pedido_origem_id INTEGER REFERENCES fonadas(id) ON DELETE SET NULL,
      pedido_novo_id INTEGER REFERENCES fonadas(id) ON DELETE SET NULL,
      atualizado_por TEXT,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW(),
      UNIQUE (data_referencia, relacao_chave)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_recall_data ON recall_registros(data_referencia)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_recall_relacao ON recall_registros(relacao_chave)');

  // Pares de clientes que a pessoa já confirmou não serem a mesma
  // pessoa, mesmo batendo no critério de nome parecido + mesmo
  // dia/mês de aniversário — a sugestão de duplicata (ver
  // GET /clientes/possiveis-duplicatas) para de aparecer para esse
  // par especificamente, de forma permanente. cliente_menor_id e
  // cliente_maior_id guardam o par sempre na mesma ordem (menor
  // primeiro), para que a checagem de "esse par já foi descartado?"
  // não dependa de qual dos dois é "a" ou "b" na hora da consulta.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS duplicatas_descartadas (
      cliente_menor_id INTEGER NOT NULL,
      cliente_maior_id INTEGER NOT NULL,
      criado_em TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (cliente_menor_id, cliente_maior_id)
    );
  `);

  // Contador dedicado para gerar números de O.S. sem risco de duas
  // pessoas receberem o mesmo número ao mesmo tempo (ver
  // reservarProximaOs, em routes/fonadas.js e routes/aoVivo.js). Uma
  // linha por sistema; o valor é o último número já entregue.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contadores_os (
      sistema TEXT PRIMARY KEY,
      ultimo_numero INTEGER NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    INSERT INTO contadores_os (sistema, ultimo_numero) VALUES ('fonada', 0)
    ON CONFLICT (sistema) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO contadores_os (sistema, ultimo_numero) VALUES ('ao_vivo', 0)
    ON CONFLICT (sistema) DO NOTHING
  `);
  // Sincroniza o contador com o maior número já em uso, para o caso de
  // o contador ainda não refletir o histórico existente (primeira vez
  // que esta tabela é criada, com pedidos antigos já no banco). Só
  // avança o contador para cima — nunca para baixo — então rodar isso
  // de novo no futuro não tem efeito colateral.
  await sincronizarContadorComMaximoExistente(pool, 'fonada', 'fonadas', 'senha_os');
  await sincronizarContadorComMaximoExistente(pool, 'ao_vivo', 'ao_vivo', 'numero_os');

  const colunasNovas = [
    { tabela: 'ao_vivo', coluna: 'tema_4', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'mensagem_codigo_4', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'cliente_id', tipo: 'INTEGER REFERENCES clientes(id)' },
    { tabela: 'ao_vivo', coluna: 'cliente_id', tipo: 'INTEGER REFERENCES clientes(id)' },
    { tabela: 'clientes', coluna: 'excluido_em', tipo: 'TIMESTAMP' },
    { tabela: 'clientes', coluna: 'versao', tipo: 'INTEGER NOT NULL DEFAULT 1' },
    { tabela: 'fonadas', coluna: 'versao', tipo: 'INTEGER NOT NULL DEFAULT 1' },
    { tabela: 'ao_vivo', coluna: 'versao', tipo: 'INTEGER NOT NULL DEFAULT 1' },
    { tabela: 'fonadas', coluna: 'excluido_em', tipo: 'TIMESTAMP' },
    { tabela: 'ao_vivo', coluna: 'excluido_em', tipo: 'TIMESTAMP' },
    { tabela: 'fonadas', coluna: 'data_pagamento', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'cobranca_reagendada', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'impresso', tipo: 'TEXT' },
    { tabela: 'usuarios', coluna: 'nome', tipo: 'TEXT' },
    { tabela: 'usuarios', coluna: 'data_nascimento', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'recall_codigo', tipo: 'TEXT' },
    { tabela: 'clientes', coluna: 'bloqueado', tipo: 'BOOLEAN DEFAULT FALSE' },
    { tabela: 'clientes', coluna: 'bloqueio_motivo', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'resultado_entrega', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'pagou', tipo: 'TEXT' },
    { tabela: 'clientes', coluna: 'whatsapp', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'comprador_whatsapp', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'whatsapp', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'data_pagou', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'data_cobranca', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'valor_recebido', tipo: 'REAL' },
    { tabela: 'ao_vivo', coluna: 'forma_recebimento', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'pagamento_recebido_por', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'financeiro_migrado', tipo: 'BOOLEAN DEFAULT FALSE' },
    { tabela: 'fonadas', coluna: 'vendedor_usuario', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'vendedor_usuario', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'p1_passada_por', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'p2_passada_por', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'entregue_por', tipo: 'TEXT' },
  ];
  for (const { tabela, coluna, tipo } of colunasNovas) {
    await pool.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS ${coluna} ${tipo}`);
  }

  // Antes da central financeira, os pedidos Ao Vivo à vista eram
  // considerados recebidos quando a entrega era marcada. Preserva esse
  // histórico uma única vez, mas os novos recebimentos passam a depender
  // exclusivamente de pagou/data_pagou.
  await pool.query(`
    UPDATE ao_vivo
    SET pagou = 'SIM',
        data_pagou = COALESCE(NULLIF(data_pagou, ''), dia_entrega),
        valor_recebido = COALESCE(valor_recebido, valor),
        forma_recebimento = COALESCE(NULLIF(forma_recebimento, ''), NULLIF(pagamento, ''), 'PRESENCIAL')
    WHERE COALESCE(pagou, '') != 'SIM'
      AND financeiro_migrado = FALSE
      AND UPPER(COALESCE(resultado_entrega, '')) LIKE 'ENTREGUE%'
      AND UPPER(COALESCE(pagamento, '')) NOT LIKE 'PRAZO%'
  `);
  await pool.query('UPDATE ao_vivo SET financeiro_migrado = TRUE WHERE financeiro_migrado = FALSE');

  // Corrige somente valores legados cuja intenção é inequívoca. A antiga
  // migração podia copiar “PAGO” (status) para forma_recebimento. Formas
  // reconhecíveis são recuperadas; status puro volta a NULL para não virar
  // uma categoria financeira falsa nos relatórios.
  await pool.query(`
    UPDATE ao_vivo
    SET forma_recebimento = CASE
      WHEN UPPER(COALESCE(forma_recebimento, '')) LIKE '%PIX%' THEN 'PIX'
      WHEN UPPER(COALESCE(forma_recebimento, '')) ~ 'D[ÉE]BITO|DEBITO' THEN 'DÉBITO'
      WHEN UPPER(COALESCE(forma_recebimento, '')) ~ 'CR[ÉE]DITO|CREDITO' THEN 'CRÉDITO'
      WHEN UPPER(COALESCE(forma_recebimento, '')) LIKE '%CART%' THEN 'CARTÃO'
      WHEN UPPER(COALESCE(forma_recebimento, '')) ~ 'DINHEIRO|GRANA|PRESENCIAL' THEN 'DINHEIRO'
      ELSE NULL
    END
    WHERE UPPER(TRIM(COALESCE(forma_recebimento, ''))) LIKE '%PAGO%'
  `);

  // Trava de integridade contra O.S. duplicada: dois pedidos criados ao
  // mesmo tempo em máquinas diferentes podiam, antes desta trava,
  // receber o mesmo número sugerido (o cálculo de "próxima O.S." não
  // era atômico). O índice único parcial abaixo garante, no nível do
  // banco, que isso nunca fica salvo — mesmo que a camada de
  // aplicação falhe em prevenir. É "parcial" (WHERE excluido_em IS
  // NULL) porque um número de um pedido excluído pode legitimamente
  // ser reaproveitado por um pedido novo depois.
  //
  // Antes de criar o índice, verificamos se já existem duplicatas
  // salvas — se existirem, a criação falharia e travaria a
  // inicialização do sistema inteiro. Nesse caso só avisamos no log,
  // sem quebrar o boot; o índice fica pendente até os dados serem
  // corrigidos manualmente.
  await aplicarIndiceUnicoSeguro(pool, 'fonadas', 'senha_os', 'idx_unico_fonadas_senha_os');
  await aplicarIndiceUnicoSeguro(pool, 'ao_vivo', 'numero_os', 'idx_unico_aovivo_numero_os');
}

async function sincronizarContadorComMaximoExistente(pool, sistema, tabela, coluna) {
  const resultado = await pool.query(`SELECT ${coluna} FROM ${tabela} WHERE ${coluna} IS NOT NULL AND ${coluna} != ''`);
  let maior = 0;
  for (const linha of resultado.rows) {
    const n = parseInt(linha[coluna], 10);
    if (!isNaN(n) && n > maior) maior = n;
  }
  await pool.query(
    `UPDATE contadores_os SET ultimo_numero = $1 WHERE sistema = $2 AND ultimo_numero < $1`,
    [maior, sistema]
  );
}

// Reserva o próximo número de O.S. de forma atômica: a linha do
// contador é travada (FOR UPDATE) durante o incremento, então se duas
// pessoas pedirem o "próximo número" ao mesmo tempo, a segunda espera
// a primeira terminar antes de ler o valor — nunca as duas recebem o
// mesmo número, mesmo em máquinas diferentes na mesma rede.
async function reservarProximaOs(pool, sistema) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await client.query(
      'SELECT ultimo_numero FROM contadores_os WHERE sistema = $1 FOR UPDATE',
      [sistema]
    );
    const atual = resultado.rows[0] ? resultado.rows[0].ultimo_numero : 0;
    const proximo = atual + 1;
    await client.query(
      'UPDATE contadores_os SET ultimo_numero = $1 WHERE sistema = $2',
      [proximo, sistema]
    );
    await client.query('COMMIT');
    return proximo;
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}

async function aplicarIndiceUnicoSeguro(pool, tabela, coluna, nomeIndice) {
  const duplicatas = await pool.query(`
    SELECT ${coluna}, COUNT(*) as qtd
    FROM ${tabela}
    WHERE excluido_em IS NULL AND ${coluna} IS NOT NULL AND ${coluna} != ''
    GROUP BY ${coluna}
    HAVING COUNT(*) > 1
  `);

  if (duplicatas.rows.length > 0) {
    console.warn(
      `⚠️  ${tabela}.${coluna}: ${duplicatas.rows.length} valor(es) duplicado(s) encontrado(s) ` +
      `(ex: "${duplicatas.rows[0][coluna]}" aparece ${duplicatas.rows[0].qtd}x). ` +
      `Índice único NÃO criado até os dados serem corrigidos manualmente.`
    );
    return;
  }

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${nomeIndice}
    ON ${tabela} (${coluna})
    WHERE excluido_em IS NULL AND ${coluna} IS NOT NULL AND ${coluna} != ''
  `);
}

function unaccentEstaDisponivel() {
  return unaccentDisponivel;
}

module.exports = { db, pool, iniciarBanco, reservarProximaOs, unaccentEstaDisponivel };
