// scripts/backup-ao-vivo.js
//
// Exporta TODA a tabela ao_vivo (todas as colunas, todas as linhas,
// incluindo excluídos) para um arquivo JSON local, com timestamp no
// nome. Serve como rede de segurança antes de rodar qualquer migração
// que altere dados em massa nessa tabela — não altera nada no banco,
// só lê e salva em disco.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/backup-ao-vivo.js
//
// O arquivo é salvo em backend/scripts/backups/ao_vivo-<data-hora>.json

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada. Confira se o arquivo backend/.env existe e tem essa variável preenchida,');
  console.error('   ou defina manualmente antes de rodar: $env:DATABASE_URL="postgresql://..."');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

function timestamp() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}-${pad(agora.getHours())}${pad(agora.getMinutes())}${pad(agora.getSeconds())}`;
}

async function main() {
  console.log('Lendo tabela ao_vivo...');
  const resultado = await pool.query('SELECT * FROM ao_vivo ORDER BY id');
  console.log(`Total de pedidos encontrados: ${resultado.rows.length}`);

  const pastaBackups = path.join(__dirname, 'backups');
  if (!fs.existsSync(pastaBackups)) fs.mkdirSync(pastaBackups);

  const nomeArquivo = `ao_vivo-${timestamp()}.json`;
  const caminhoCompleto = path.join(pastaBackups, nomeArquivo);

  fs.writeFileSync(caminhoCompleto, JSON.stringify(resultado.rows, null, 2), 'utf-8');

  console.log(`\n✅ Backup salvo em: ${caminhoCompleto}`);
  console.log('Guarde esse arquivo antes de rodar qualquer migração na tabela ao_vivo.');

  await pool.end();
}

main().catch((erro) => {
  console.error('Erro ao gerar backup:', erro);
  process.exit(1);
});
