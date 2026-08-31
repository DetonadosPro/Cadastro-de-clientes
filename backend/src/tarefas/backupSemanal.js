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
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const { db } = require('../db/database');
const { enviarEmail } = require('../servicos/email');
const { registrarOperacao } = require('../observabilidade');

const gzip = promisify(zlib.gzip);

function timestamp() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}-${pad(agora.getHours())}${pad(agora.getMinutes())}`;
}

async function gerarBackupTabela(nomeTabela) {
  const resultado = await db.query(`SELECT * FROM ${nomeTabela} ORDER BY id`);
  // Serializa em blocos e devolve o event loop entre eles. Com mais de
  // 20 mil pedidos, um JSON.stringify único congelava todas as requests.
  const partes = ['['];
  for (let inicio = 0; inicio < resultado.rows.length; inicio += 500) {
    if (inicio > 0) partes.push(',');
    partes.push(resultado.rows.slice(inicio, inicio + 500).map((linha) => JSON.stringify(linha)).join(','));
    await new Promise((resolve) => setImmediate(resolve));
  }
  partes.push(']');
  return partes.join('');
}

async function comprimir(textoJson) {
  const compactado = await gzip(Buffer.from(textoJson, 'utf-8'));
  return compactado.toString('base64');
}

async function rodarBackupSemanal() {
  console.log('📦 Iniciando backup semanal automático...');
  const inicio = performance.now();
  try {
    const [fonadas, aoVivo, clientes] = await Promise.all([
      gerarBackupTabela('fonadas'),
      gerarBackupTabela('ao_vivo'),
      gerarBackupTabela('clientes'),
    ]);

    const ts = timestamp();
    const [fonadasGzip, aoVivoGzip, clientesGzip] = await Promise.all([
      comprimir(fonadas), comprimir(aoVivo), comprimir(clientes),
    ]);
    const anexos = [
      { filename: `fonadas-${ts}.json.gz`, content: fonadasGzip, jaComprimido: true },
      { filename: `ao_vivo-${ts}.json.gz`, content: aoVivoGzip, jaComprimido: true },
      { filename: `clientes-${ts}.json.gz`, content: clientesGzip, jaComprimido: true },
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
    registrarOperacao('backup-diario', performance.now() - inicio, resultado.enviado);
  } catch (erro) {
    registrarOperacao('backup-diario', performance.now() - inicio, false);
    console.error('❌ Erro ao gerar backup semanal:', erro);
  }
}

module.exports = { rodarBackupSemanal };
