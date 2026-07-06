// scripts/migrar-sqlite-para-postgres.js
//
// Copia os dados do banco SQLite local (backend/data/pombo.db) direto
// para o PostgreSQL configurado em DATABASE_URL — sem passar pela
// planilha. Útil para "adiantar" dados reais no banco de produção
// antes de ter a planilha atualizada em mãos.
//
// IMPORTANTE — roda isso NO SEU COMPUTADOR, não no Railway:
//   - O arquivo pombo.db só existe localmente, na sua máquina.
//   - A DATABASE_URL do Postgres de produção (Railway) precisa ser
//     acessível de onde você rodar isso — que é da sua própria máquina,
//     via internet, sem problema (o Railway aceita conexões externas).
//
// Como usar:
//   1. Copie a DATABASE_URL do Postgres no Railway (aba Variables do
//      serviço Postgres, ou do serviço do backend).
//   2. No terminal, dentro da pasta backend, rode:
//
//        set DATABASE_URL=postgresql://...   (Windows, PowerShell: $env:DATABASE_URL="postgresql://...")
//        node scripts/migrar-sqlite-para-postgres.js
//
//   3. Aguarde a mensagem final de resumo (quantos registros de cada
//      tabela foram migrados).
//
// Este script é seguro para rodar mais de uma vez: cada tabela é
// esvaziada (TRUNCATE) antes de receber os dados de novo, então rodar
// de novo não duplica nada — ele sempre reflete o estado atual do
// SQLite local no momento em que for executado.

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ Defina a variável DATABASE_URL antes de rodar este script.');
  console.error('   Exemplo (PowerShell): $env:DATABASE_URL="postgresql://..."');
  process.exit(1);
}

const DB_PATH = path.join(__dirname, '..', 'data', 'pombo.db');
const sqlite = new DatabaseSync(DB_PATH);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Ordem importa: clientes antes de fonadas/ao_vivo (que referenciam
// cliente_id), e fonadas antes de tentativas_contato (que referencia
// pedido_id).
const TABELAS = ['usuarios', 'clientes', 'fonadas', 'ao_vivo', 'tentativas_contato'];

async function migrarTabela(nomeTabela) {
  const linhas = sqlite.prepare(`SELECT * FROM ${nomeTabela}`).all();
  if (linhas.length === 0) {
    console.log(`  ${nomeTabela}: nenhum registro no SQLite local, pulando.`);
    return 0;
  }

  const colunas = Object.keys(linhas[0]);
  const colunasSql = colunas.join(', ');

  // Esvazia a tabela no Postgres antes de reinserir — torna o script
  // seguro para rodar mais de uma vez sem duplicar registros.
  await pool.query(`TRUNCATE TABLE ${nomeTabela} RESTART IDENTITY CASCADE`);

  // Insere em lotes de 500 para não gerar uma única query gigantesca.
  const TAMANHO_LOTE = 500;
  for (let inicio = 0; inicio < linhas.length; inicio += TAMANHO_LOTE) {
    const lote = linhas.slice(inicio, inicio + TAMANHO_LOTE);
    const valoresPlaceholders = [];
    const valoresParams = [];
    let contador = 1;

    for (const linha of lote) {
      const placeholdersLinha = colunas.map(() => `$${contador++}`);
      valoresPlaceholders.push(`(${placeholdersLinha.join(', ')})`);
      for (const coluna of colunas) {
        valoresParams.push(linha[coluna]);
      }
    }

    await pool.query(
      `INSERT INTO ${nomeTabela} (${colunasSql}) VALUES ${valoresPlaceholders.join(', ')}`,
      valoresParams
    );
  }

  // Ajusta a sequence do Postgres para o próximo valor livre, já que os
  // IDs foram inseridos manualmente (com os mesmos números do SQLite),
  // não gerados pelo SERIAL automaticamente.
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('${nomeTabela}', 'id'),
      COALESCE((SELECT MAX(id) FROM ${nomeTabela}), 1)
    )
  `);

  return linhas.length;
}

async function main() {
  console.log('Iniciando migração SQLite → PostgreSQL...\n');
  const resumo = {};

  try {
    for (const tabela of TABELAS) {
      console.log(`Migrando ${tabela}...`);
      resumo[tabela] = await migrarTabela(tabela);
    }

    console.log('\n✅ Migração concluída com sucesso:\n');
    for (const [tabela, quantidade] of Object.entries(resumo)) {
      console.log(`  ${tabela}: ${quantidade} registro(s)`);
    }
  } catch (erro) {
    console.error('\n❌ Erro durante a migração:', erro.message);
    console.error('   Nenhuma alteração adicional foi feita além do que já rodou até aqui.');
    process.exit(1);
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main();
