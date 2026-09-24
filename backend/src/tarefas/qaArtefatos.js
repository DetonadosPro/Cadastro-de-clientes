const fs = require('node:fs/promises');
const path = require('node:path');
const { db } = require('../db/database');

async function pastaArtefatosQa() {
  if (process.env.NODE_ENV !== 'test' || !process.env.QA_BACKUP_DIR) return null;
  const banco = await db.query('SELECT current_database() AS nome');
  if (banco.rows[0]?.nome !== 'pombo_correio_qa_auditoria') {
    throw new Error('Artefatos QA recusados fora do banco isolado.');
  }
  const pasta = path.resolve(process.env.QA_BACKUP_DIR);
  await fs.mkdir(pasta, { recursive: true });
  return pasta;
}

module.exports = { pastaArtefatosQa };
