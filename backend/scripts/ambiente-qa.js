// Banco local descartável para testes de navegador. Nunca opera no banco principal.
const dotenv = require('dotenv');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('node:path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const NOME_QA = 'pombo_correio_qa_auditoria';
const comando = process.argv[2];
if (!['preparar', 'remover'].includes(comando)) throw new Error('Use preparar ou remover.');

const original = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(original.hostname)) {
  throw new Error('A preparação de QA exige PostgreSQL local.');
}
if (original.pathname.slice(1) === NOME_QA) {
  throw new Error('DATABASE_URL deve apontar para o banco principal apenas para descobrir o servidor local.');
}
const administracao = new URL(original);
administracao.pathname = '/postgres';
const qa = new URL(original);
qa.pathname = `/${NOME_QA}`;

async function executar() {
  const controle = new Pool({ connectionString: administracao.toString() });
  try {
    const existente = await controle.query('SELECT 1 FROM pg_database WHERE datname = $1', [NOME_QA]);
    if (comando === 'remover') {
      if (!existente.rows.length) return console.log('Banco QA já estava ausente.');
      await controle.query(`DROP DATABASE ${NOME_QA} WITH (FORCE)`);
      return console.log('Banco QA removido.');
    }
    if (!process.env.QA_E2E_PASSWORD || process.env.QA_E2E_PASSWORD.length < 12) {
      throw new Error('Defina QA_E2E_PASSWORD com pelo menos 12 caracteres.');
    }
    if (!existente.rows.length) await controle.query(`CREATE DATABASE ${NOME_QA}`);
  } finally {
    await controle.end();
  }

  process.env.DATABASE_URL = qa.toString();
  const { iniciarBanco, pool } = require('../src/db/database');
  try {
    await iniciarBanco();
    const hash = await bcrypt.hash(process.env.QA_E2E_PASSWORD, 10);
    await pool.query(
      `INSERT INTO usuarios (usuario, senha_hash, nome) VALUES ($1, $2, $3)
       ON CONFLICT (usuario) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, nome = EXCLUDED.nome`,
      [process.env.QA_E2E_USER || 'QA_AUDITOR', hash, 'Usuário de Teste QA']
    );
    console.log('Banco QA local preparado. Use DATABASE_URL do banco QA ao iniciar o servidor.');
  } finally {
    await pool.end();
  }
}

executar().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
