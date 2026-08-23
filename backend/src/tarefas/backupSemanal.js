// src/tarefas/backupSemanal.js
//
// Gera um backup das 3 tabelas principais (fonadas, ao_vivo,
// clientes) e envia por email — não salva nada em disco no servidor,
// porque o sistema de arquivos do Railway é efêmero (some a cada
// redeploy). O anexo vai direto no email, então o backup sobrevive
// independente do que aconteça com o servidor.

const { db } = require('../db/database');
const { enviarEmail } = require('../servicos/email');

function timestamp() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}-${pad(agora.getHours())}${pad(agora.getMinutes())}`;
}

async function gerarBackupTabela(nomeTabela) {
  const resultado = await db.query(`SELECT * FROM ${nomeTabela} ORDER BY id`);
  return JSON.stringify(resultado.rows, null, 2);
}

async function rodarBackupSemanal() {
  console.log('📦 Iniciando backup semanal automático...');
  try {
    const [fonadas, aoVivo, clientes] = await Promise.all([
      gerarBackupTabela('fonadas'),
      gerarBackupTabela('ao_vivo'),
      gerarBackupTabela('clientes'),
    ]);

    const ts = timestamp();
    const anexos = [
      { filename: `fonadas-${ts}.json`, content: fonadas },
      { filename: `ao_vivo-${ts}.json`, content: aoVivo },
      { filename: `clientes-${ts}.json`, content: clientes },
    ];

    const dataFormatada = new Date().toLocaleDateString('pt-BR');
    const resultado = await enviarEmail({
      assunto: `Pombo-Correio — Backup semanal (${dataFormatada})`,
      texto: 'Backup automático semanal em anexo: fonadas, ao_vivo e clientes.\n\nGuarde este email — é o seu backup dos dados do sistema.',
      anexos,
    });

    if (resultado.enviado) {
      console.log('✅ Backup semanal enviado por email com sucesso.');
    } else {
      console.warn(`⚠️  Backup gerado, mas não enviado: ${resultado.motivo}`);
    }
  } catch (erro) {
    console.error('❌ Erro ao gerar backup semanal:', erro);
  }
}

module.exports = { rodarBackupSemanal };
