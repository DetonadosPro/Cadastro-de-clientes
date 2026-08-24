// src/tarefas/backupSemanal.js
//
// Gera um backup das 3 tabelas principais (fonadas, ao_vivo,
// clientes) e envia por email — não salva nada em disco no servidor,
// porque o sistema de arquivos do Railway é efêmero (some a cada
// redeploy). O anexo vai direto no email, então o backup sobrevive
// independente do que aconteça com o servidor.
//
// Os arquivos são comprimidos com gzip antes de anexar — sem isso, o
// JSON de ~22 mil registros de fonadas passa dos 40MB que o Resend
// aceita por email. Comprimido, cabe tranquilamente (JSON repetitivo
// comprime muito bem). Para abrir depois: extrai o .json.gz com
// qualquer descompactador (7-Zip, WinRAR, etc. reconhecem .gz).

const zlib = require('zlib');
const { db } = require('../db/database');
const { enviarEmail } = require('../servicos/email');

function timestamp() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}-${pad(agora.getHours())}${pad(agora.getMinutes())}`;
}

async function gerarBackupTabela(nomeTabela) {
  const resultado = await db.query(`SELECT * FROM ${nomeTabela} ORDER BY id`);
  // Sem indentação (JSON.stringify sem o `null, 2`) — economiza bastante
  // espaço logo de cara, antes mesmo da compressão gzip.
  return JSON.stringify(resultado.rows);
}

function comprimir(textoJson) {
  return zlib.gzipSync(Buffer.from(textoJson, 'utf-8')).toString('base64');
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
      { filename: `fonadas-${ts}.json.gz`, content: comprimir(fonadas), jaComprimido: true },
      { filename: `ao_vivo-${ts}.json.gz`, content: comprimir(aoVivo), jaComprimido: true },
      { filename: `clientes-${ts}.json.gz`, content: comprimir(clientes), jaComprimido: true },
    ];

    const dataFormatada = new Date().toLocaleDateString('pt-BR');
    const resultado = await enviarEmail({
      assunto: `Pombo-Correio — Backup semanal (${dataFormatada})`,
      texto: 'Backup automático semanal em anexo: fonadas, ao_vivo e clientes (comprimidos em .gz — extraia com 7-Zip, WinRAR ou similar).\n\nGuarde este email — é o seu backup dos dados do sistema.',
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
