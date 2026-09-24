// Restauração integral dos arquivos de backup QA.
// Só cria/remove o banco descartável pombo_correio_qa_restore em PostgreSQL local.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const NOME_RESTORE = 'pombo_correio_qa_restore';
const NOME_QA = 'pombo_correio_qa_auditoria';
const TABELAS = [
  'usuarios', 'clientes', 'fonadas', 'ao_vivo',
  'tentativas_contato', 'tentativas_prazo_ao_vivo', 'lembretes',
  'recall_registros', 'duplicatas_descartadas', 'contadores_os',
];
const TABELAS_COM_ID = new Set(TABELAS.filter((t) => !['duplicatas_descartadas', 'contadores_os'].includes(t)));
const pasta = path.resolve(__dirname, '../../docs/auditoria/evidencias/backup-qa');
const modo = process.argv[2];
if (!['restaurar', 'verificar', 'limpar'].includes(modo)) throw new Error('Use restaurar, verificar ou limpar.');
const original = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(original.hostname) ||
    [NOME_RESTORE, NOME_QA].includes(original.pathname.slice(1))) {
  throw new Error('A restauração QA exige URL do PostgreSQL local original para descobrir o servidor.');
}
const adminUrl = new URL(original);
adminUrl.pathname = '/postgres';
const restoreUrl = new URL(original);
restoreUrl.pathname = `/${NOME_RESTORE}`;

function arquivosMaisRecentes() {
  const nomes = fs.readdirSync(pasta).filter((nome) => /^[a-z_]+-\d{8}-\d{4}\.json\.gz$/.test(nome));
  const timestamps = [...new Set(nomes.map((nome) => nome.match(/-(\d{8}-\d{4})\.json\.gz$/)[1]))].sort().reverse();
  const timestamp = timestamps.find((ts) => TABELAS.every((t) => nomes.includes(`${t}-${ts}.json.gz`)));
  if (!timestamp) throw new Error('Não há conjunto completo de arquivos QA para restaurar.');
  return Object.fromEntries(TABELAS.map((t) => [t, path.join(pasta, `${t}-${timestamp}.json.gz`)]));
}

function dataLocalSemFuso(valor) {
  if (valor == null) return valor;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) throw new Error('Data inválida no backup QA.');
  const dois = (numero) => String(numero).padStart(2, '0');
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())} ` +
    `${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}.${String(data.getMilliseconds()).padStart(3, '0')}`;
}

async function executar() {
  const admin = new Pool({ connectionString: adminUrl.toString() });
  try {
    const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [NOME_RESTORE]);
    if (modo === 'limpar') {
      if (existe.rows.length) await admin.query(`DROP DATABASE ${NOME_RESTORE} WITH (FORCE)`);
      console.log('Banco de restauração QA removido.');
      return;
    }
    if (modo === 'restaurar') {
      if (existe.rows.length) throw new Error('Banco de restauração QA já existe; não será sobrescrito.');
      await admin.query(`CREATE DATABASE ${NOME_RESTORE}`);
    } else if (!existe.rows.length) throw new Error('Banco de restauração QA não existe.');
  } finally {
    await admin.end();
  }
  const nomes = arquivosMaisRecentes();
  const esperados = Object.fromEntries(Object.entries(nomes).map(([tabela, arquivo]) => [tabela, JSON.parse(zlib.gunzipSync(fs.readFileSync(arquivo)).toString('utf8'))]));
  process.env.DATABASE_URL = restoreUrl.toString();
  const { iniciarBanco, pool } = require('../src/db/database');
  try {
    await iniciarBanco();
    if (modo === 'restaurar') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM contadores_os');
        for (const tabela of TABELAS) {
          const tipos = await client.query(
            'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND data_type = $3',
            ['public', tabela, 'timestamp without time zone']
          );
          const colunasDataLocal = new Set(tipos.rows.map((linha) => linha.column_name));
          for (const linha of esperados[tabela]) {
            const colunas = Object.keys(linha);
            if (colunas.some((coluna) => !/^[a-z_][a-z0-9_]*$/.test(coluna))) throw new Error('Coluna inválida no backup QA.');
            const quoted = colunas.map((coluna) => `"${coluna}"`).join(', ');
            const parametros = colunas.map((_, i) => `$${i + 1}`).join(', ');
            const valores = colunas.map((coluna) => colunasDataLocal.has(coluna) ? dataLocalSemFuso(linha[coluna]) : linha[coluna]);
            await client.query(`INSERT INTO ${tabela} (${quoted}) VALUES (${parametros})`, valores);
          }
          if (TABELAS_COM_ID.has(tabela)) {
            await client.query(`SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${tabela}), 1), 1), (SELECT COUNT(*) > 0 FROM ${tabela}))`);
          }
        }
        await client.query('COMMIT');
      } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;
      } finally {
        client.release();
      }
    }
    const contagens = {};
    const registrosConferidos = {};
    for (const tabela of TABELAS) {
      const contar = await pool.query(`SELECT COUNT(*)::int AS total FROM ${tabela}`);
      contagens[tabela] = { backup: esperados[tabela].length, restaurado: contar.rows[0].total };
      if (contagens[tabela].backup !== contagens[tabela].restaurado) throw new Error(`Contagem divergente: ${tabela}`);
      const ordem = tabela === 'duplicatas_descartadas' ? 'cliente_menor_id, cliente_maior_id' : tabela === 'contadores_os' ? 'sistema' : 'id';
      const lidos = await pool.query(`SELECT * FROM ${tabela} ORDER BY ${ordem}`);
      assert.deepEqual(JSON.parse(JSON.stringify(lidos.rows)), esperados[tabela], `Registros divergentes: ${tabela}`);
      registrosConferidos[tabela] = lidos.rows.length;
    }
    const esquema = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    const contadores = await pool.query('SELECT sistema, ultimo_numero FROM contadores_os ORDER BY sistema');
    for (const [sistema, tabela, coluna] of [['fonada', 'fonadas', 'senha_os'], ['ao_vivo', 'ao_vivo', 'numero_os']]) {
      const maior = esperados[tabela].reduce((atual, linha) => {
        const numero = Number.parseInt(linha[coluna], 10);
        return Number.isFinite(numero) ? Math.max(atual, numero) : atual;
      }, 0);
      assert.ok(contadores.rows.find((linha) => linha.sistema === sistema)?.ultimo_numero >= maior, `Contador O.S. inferior aos pedidos: ${sistema}`);
    }
    const tabelasNaoIncluidas = esquema.rows.map((linha) => linha.tablename).filter((nome) => !TABELAS.includes(nome));
    const relatorio = { banco: NOME_RESTORE, arquivos: Object.fromEntries(Object.entries(nomes).map(([k, v]) => [k, path.basename(v)])), contagens, registrosConferidos, contadoresReconstruidos: contadores.rows, tabelasNaoIncluidas };
    const saida = path.resolve(__dirname, '../../docs/auditoria/evidencias/restauracao-qa.json');
    fs.writeFileSync(saida, JSON.stringify(relatorio, null, 2));
    console.log(JSON.stringify(relatorio));
  } finally {
    await pool.end();
  }
}

executar().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
