// src/tarefas/backupSemanal.js
//
// Gera um backup das tabelas persistentes e envia por email — não salva nada em disco no servidor,
// porque o sistema de arquivos do Railway é efêmero (some a cada
// redeploy). O anexo vai direto no email, então o backup sobrevive
// independente do que aconteça com o servidor.
//
// Os arquivos são comprimidos com gzip antes de anexar — sem isso, o
// JSON de ~22 mil registros de fonadas passa dos 40MB que o Resend
// aceita por email. Comprimido, cabe tranquilamente (JSON repetitivo
// comprime muito bem). Para abrir depois: extrai o .json.gz com
// qualquer descompactador (7-Zip, WinRAR, etc. reconhecem .gz).

const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { pool } = require('../db/database');
const { enviarEmail } = require('../servicos/email');
const { registrarOperacao } = require('../observabilidade');
const { pastaArtefatosQa } = require('./qaArtefatos');
const { comprimirTabela, TABELAS_BACKUP } = require('./backupTabela');

function timestamp() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}-${pad(agora.getHours())}${pad(agora.getMinutes())}`;
}

async function executarBackup() {
  console.log('📦 Iniciando backup semanal automático...');
  const inicio = performance.now();
  try {
    const client = await pool.connect();
    const anexos = [];
    const ts = timestamp();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      for (const tabela of TABELAS_BACKUP) {
        anexos.push({ filename: `${tabela}-${ts}.json.gz`, content: await comprimirTabela(client, tabela), jaComprimido: true });
      }
      await client.query('COMMIT');
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    } finally {
      client.release();
    }

    const pastaQa = await pastaArtefatosQa();
    if (pastaQa) {
      for (const anexo of anexos) {
        await fs.writeFile(path.join(pastaQa, anexo.filename), Buffer.from(anexo.content, 'base64'));
      }
      registrarOperacao('backup-diario', performance.now() - inicio, true, { modo: 'qa', anexos: anexos.length });
      return { ok: true, modo: 'qa', arquivos: anexos.map((anexo) => anexo.filename) };
    }

    const dataFormatada = new Date().toLocaleDateString('pt-BR');
    const resultado = await enviarEmail({
      assunto: `Pombo-Correio — Backup semanal (${dataFormatada})`,
      texto: 'Backup automático semanal em anexo: todas as tabelas persistentes (comprimidas em .gz — extraia com 7-Zip, WinRAR ou similar).\n\nGuarde este email em local seguro: inclui dados de clientes e hashes de senhas.',
      anexos,
    });

    if (resultado.enviado) {
      console.log('✅ Backup semanal enviado por email com sucesso.');
    } else {
      console.warn(`⚠️  Backup gerado, mas não enviado: ${resultado.motivo}`);
    }
    registrarOperacao('backup-diario', performance.now() - inicio, resultado.enviado);
    return { ok: resultado.enviado, motivo: resultado.motivo || null };
  } catch (erro) {
    registrarOperacao('backup-diario', performance.now() - inicio, false);
    console.error('❌ Erro ao gerar backup semanal:', erro);
    return { ok: false, motivo: erro.message };
  }
}

// Cron e solicitação manual simultâneos compartilham a mesma execução.
let emAndamento = null;
function rodarBackupSemanal() {
  if (!emAndamento) emAndamento = executarBackup().finally(() => { emAndamento = null; });
  return emAndamento;
}

module.exports = { rodarBackupSemanal, TABELAS_BACKUP };
