// scripts/restaurar-fonadas.js
//
// Restaura a tabela fonadas inteira a partir de um arquivo de backup
// gerado por backup-fonadas.js (backend/scripts/backups/fonadas-*.json).
// Substitui TODAS as colunas de cada linha existente no backup pelos
// valores salvos ali — é um "voltar no tempo" completo da tabela para
// o momento em que o backup foi feito.
//
// Só atualiza linhas que existem no backup (por id) — não cria nem
// apaga linhas. Se algum pedido tiver sido criado DEPOIS do backup,
// ele não é afetado (continua existindo, não é removido).
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/restaurar-fonadas.js caminho/do/backup.json --simular   → só mostra o que seria feito
//   node scripts/restaurar-fonadas.js caminho/do/backup.json             → aplica de verdade

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { Pool } = require('pg');

const SIMULAR = process.argv.includes('--simular');
const caminhoBackup = process.argv[2];

if (!caminhoBackup || caminhoBackup.startsWith('--')) {
  console.error('❌ Informe o caminho do arquivo de backup como primeiro argumento.');
  console.error('   Exemplo: node scripts/restaurar-fonadas.js backend/scripts/backups/fonadas-20260821-153000.json --simular');
  process.exit(1);
}

if (!fs.existsSync(caminhoBackup)) {
  console.error(`❌ Arquivo não encontrado: ${caminhoBackup}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada. Confira se o arquivo backend/.env existe e tem essa variável preenchida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
  keepAlive: true,
  // Reduz a chance de o Railway derrubar a conexão por inatividade
  // durante uma restauração longa (linha por linha).
  idleTimeoutMillis: 0,
});

async function main() {
  console.log(SIMULAR ? '=== MODO SIMULAÇÃO (nada será alterado) ===' : '=== MODO APLICAÇÃO (vai alterar o banco) ===');
  console.log(`Backup: ${caminhoBackup}`);

  const linhasBackup = JSON.parse(fs.readFileSync(caminhoBackup, 'utf-8'));
  console.log(`Linhas no backup: ${linhasBackup.length}`);

  if (linhasBackup.length === 0) {
    console.log('Backup vazio, nada a fazer.');
    await pool.end();
    return;
  }

  // Usa as colunas presentes no primeiro registro do backup como
  // referência — assume-se que todos os registros têm as mesmas
  // colunas (é assim que o backup-fonadas.js gera o arquivo).
  const colunas = Object.keys(linhasBackup[0]).filter((c) => c !== 'id');

  console.log(`Colunas a restaurar por linha: ${colunas.length}`);
  console.log('\nPrimeiros 5 ids que serão restaurados:');
  for (const l of linhasBackup.slice(0, 5)) {
    console.log(`  #${l.id} — ${l.nome_comprador || '(sem nome)'}`);
  }

  if (SIMULAR) {
    console.log('\nSimulação concluída. Rode sem --simular para aplicar de verdade.');
    await pool.end();
    return;
  }

  const setClause = colunas.map((c, i) => `${c} = $${i + 2}`).join(', ');
  let atualizados = 0;
  let falhas = 0;

  // --retomar-de=ID: pula direto para esse id no backup, para continuar
  // uma restauração interrompida sem repetir tudo desde o início.
  const argRetomar = process.argv.find((a) => a.startsWith('--retomar-de='));
  const idRetomada = argRetomar ? parseInt(argRetomar.split('=')[1], 10) : null;
  const linhasParaRodar = idRetomada
    ? linhasBackup.filter((l) => l.id >= idRetomada)
    : linhasBackup;

  if (idRetomada) {
    console.log(`\nRetomando a partir do id ${idRetomada} (${linhasParaRodar.length} linhas restantes).`);
  }

  const inicio = Date.now();

  for (let i = 0; i < linhasParaRodar.length; i++) {
    const linha = linhasParaRodar[i];
    const valores = colunas.map((c) => linha[c]);

    // Cada linha tenta até 3 vezes antes de desistir — conexões com o
    // Railway podem cair pontualmente no meio de uma restauração longa.
    let tentativas = 0;
    let sucesso = false;
    while (tentativas < 3 && !sucesso) {
      tentativas++;
      try {
        const resultado = await pool.query(
          `UPDATE fonadas SET ${setClause} WHERE id = $1`,
          [linha.id, ...valores]
        );
        atualizados += resultado.rowCount;
        sucesso = true;
      } catch (erro) {
        if (tentativas >= 3) {
          falhas++;
          console.error(`\n❌ Falhou definitivamente no id ${linha.id} após 3 tentativas: ${erro.message}`);
          console.error(`   Para retomar depois, rode com: --retomar-de=${linha.id}`);
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    if ((i + 1) % 500 === 0 || i === linhasParaRodar.length - 1) {
      const decorridoSeg = Math.round((Date.now() - inicio) / 1000);
      console.log(`  ${i + 1}/${linhasParaRodar.length} processadas (${atualizados} ok, ${falhas} falhas) — ${decorridoSeg}s`);
    }
  }

  console.log(`\n✅ Linhas restauradas: ${atualizados} de ${linhasParaRodar.length}`);
  if (falhas > 0) {
    console.log(`⚠️  ${falhas} linha(s) falharam — veja os ids acima para retomar com --retomar-de=<id>.`);
  }
  await pool.end();
}

main().catch((erro) => {
  console.error('Erro ao restaurar:', erro);
  process.exit(1);
});
