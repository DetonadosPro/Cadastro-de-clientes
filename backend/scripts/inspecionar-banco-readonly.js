// Inspeção estrutural pré-deploy. Executa somente SELECTs em transação READ ONLY.
// Nunca imprime credenciais nem linhas de clientes/pedidos.
const { Client } = require('pg');

const TABELAS = [
  'usuarios', 'clientes', 'fonadas', 'ao_vivo', 'tentativas_contato',
  'tentativas_prazo_ao_vivo', 'lembretes', 'recall_registros',
  'duplicatas_descartadas', 'contadores_os',
];

function colunaExiste(colunas, tabela, coluna) {
  return colunas.some((item) => item.table_name === tabela && item.column_name === coluna);
}

async function contar(client, sql) {
  return Number((await client.query(sql)).rows[0].total);
}

async function iniciar() {
  for (const nome of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
    if (!process.env[nome]) throw new Error(`Variável ${nome} ausente.`);
  }

  const ssl = process.env.PGSSLMODE === 'disable'
    ? false
    : (process.env.POMBO_INSPECT_ALLOW_UNVERIFIED_TLS === '1'
      ? { rejectUnauthorized: false }
      : { rejectUnauthorized: true });
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl,
    connectionTimeoutMillis: 10000,
    options: '-c default_transaction_read_only=on -c statement_timeout=30000',
  });

  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identidade = (await client.query(`
      SELECT current_database() AS banco, version() AS versao_postgresql,
             current_setting('TimeZone') AS timezone,
             pg_database_size(current_database()) AS tamanho_bytes,
             current_setting('transaction_read_only') AS somente_leitura
    `)).rows[0];
    if (identidade.somente_leitura !== 'on') throw new Error('Transação não está em READ ONLY.');

    const tabelas = (await client.query(`
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)).rows;
    const tamanhosTabelas = (await client.query(`
      SELECT c.relname AS tabela, pg_relation_size(c.oid) AS dados_bytes,
             pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `)).rows;
    const colunas = (await client.query(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `)).rows;
    const constraints = (await client.query(`
      SELECT rel.relname AS tabela, con.conname AS nome, con.contype AS tipo,
             pg_get_constraintdef(con.oid) AS definicao
      FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public' ORDER BY rel.relname, con.conname
    `)).rows;
    const indices = (await client.query(`
      SELECT tablename AS tabela, indexname AS nome, indexdef AS definicao
      FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname
    `)).rows;
    const sequences = (await client.query(`
      SELECT sequence_name FROM information_schema.sequences
      WHERE sequence_schema = 'public' ORDER BY sequence_name
    `)).rows.map((item) => item.sequence_name);
    const extensoes = (await client.query(`
      SELECT extname FROM pg_extension ORDER BY extname
    `)).rows.map((item) => item.extname);

    const contagens = {};
    const existentes = new Set(tabelas.map((item) => item.table_name));
    for (const tabela of TABELAS) {
      contagens[tabela] = existentes.has(tabela)
        ? await contar(client, `SELECT COUNT(*) AS total FROM public.${tabela}`)
        : null;
    }

    const impacto = {};
    const colunasAoVivo = ['pagou', 'financeiro_migrado', 'resultado_entrega', 'pagamento', 'forma_recebimento'];
    const aoVivoCompleto = colunasAoVivo.every((coluna) => colunaExiste(colunas, 'ao_vivo', coluna));
    if (aoVivoCompleto) {
      impacto.financeiro_entregue_avista = await contar(client, `
        SELECT COUNT(*) AS total FROM ao_vivo
        WHERE COALESCE(pagou, '') != 'SIM' AND financeiro_migrado = FALSE
          AND UPPER(COALESCE(resultado_entrega, '')) LIKE 'ENTREGUE%'
          AND UPPER(COALESCE(pagamento, '')) NOT LIKE 'PRAZO%'
      `);
      impacto.financeiro_migrado_falso = await contar(client,
        'SELECT COUNT(*) AS total FROM ao_vivo WHERE financeiro_migrado = FALSE');
      impacto.forma_recebimento_pago = await contar(client, `
        SELECT COUNT(*) AS total FROM ao_vivo
        WHERE UPPER(TRIM(COALESCE(forma_recebimento, ''))) LIKE '%PAGO%'
      `);
    } else {
      impacto.financeiro = `Não consultado: faltam colunas ${colunasAoVivo.filter((coluna) =>
        !colunaExiste(colunas, 'ao_vivo', coluna)).join(', ')}`;
    }

    const contadores = existentes.has('contadores_os')
      ? (await client.query('SELECT sistema, ultimo_numero FROM contadores_os ORDER BY sistema')).rows
      : [];
    const maiorOs = {};
    for (const [sistema, tabela, coluna] of [
      ['fonada', 'fonadas', 'senha_os'], ['ao_vivo', 'ao_vivo', 'numero_os'],
    ]) {
      if (!existentes.has(tabela) || !colunaExiste(colunas, tabela, coluna)) {
        maiorOs[sistema] = null;
        continue;
      }
      // Equivale a parseInt(value, 10) usado no boot, sem registrar valores individuais.
      const resultado = await client.query(`SELECT ${coluna} AS numero FROM ${tabela}
        WHERE ${coluna} IS NOT NULL AND ${coluna} != ''`);
      maiorOs[sistema] = resultado.rows.reduce((maior, item) => {
        const numero = Number.parseInt(item.numero, 10);
        return Number.isNaN(numero) ? maior : Math.max(maior, numero);
      }, 0);
    }

    const duplicatas = {};
    for (const [tabela, coluna] of [['fonadas', 'senha_os'], ['ao_vivo', 'numero_os']]) {
      if (!existentes.has(tabela) || !colunaExiste(colunas, tabela, coluna)) {
        duplicatas[tabela] = null;
        continue;
      }
      const filtroExcluido = colunaExiste(colunas, tabela, 'excluido_em') ? 'excluido_em IS NULL AND ' : '';
      duplicatas[tabela] = await contar(client, `
        SELECT COUNT(*) AS total FROM (
          SELECT ${coluna} FROM ${tabela}
          WHERE ${filtroExcluido}${coluna} IS NOT NULL AND ${coluna} != ''
          GROUP BY ${coluna} HAVING COUNT(*) > 1
        ) d
      `);
    }

    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({
      coletado_em_utc: new Date().toISOString(), identidade, tabelas, tamanhosTabelas, colunas,
      constraints, indices, sequences, extensoes, contagens, impacto,
      contadores, maior_os: maiorOs, duplicatas,
    }, null, 2));
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    await client.end().catch(() => {});
  }
}

iniciar().catch((erro) => {
  console.error(`Inspeção falhou: ${erro.code || erro.name}`);
  process.exitCode = 1;
});
