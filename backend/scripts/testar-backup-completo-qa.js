// Massa descartável para verificar o backup integral. Nunca executa fora do banco QA.
const { URL } = require('node:url');
require('dotenv').config();
const url = new URL(process.env.DATABASE_URL || '');
url.pathname = '/pombo_correio_qa_auditoria';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || process.env.QA_E2E_ISOLATED_DB !== '1') {
  throw new Error('Exige PostgreSQL local e flag QA_E2E_ISOLATED_DB=1.');
}
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
const { pool } = require('../src/db/database');
const NOME = 'TESTE_QA_BACKUP_INTEGRAL_20260922';
const modo = process.argv[2];
if (!['preparar', 'limpar'].includes(modo)) throw new Error('Use preparar ou limpar.');

async function executar() {
  const client = await pool.connect();
  try {
    if ((await client.query('SELECT current_database() AS nome')).rows[0].nome !== 'pombo_correio_qa_auditoria') throw new Error('Banco QA obrigatório.');
    await client.query('BEGIN');
    if (modo === 'preparar') {
      if ((await client.query('SELECT 1 FROM clientes WHERE nome = $1', [NOME])).rowCount) throw new Error('Massa QA já existe.');
      const usuario = (await client.query('SELECT id FROM usuarios ORDER BY id LIMIT 1')).rows[0];
      if (!usuario) throw new Error('Usuário QA necessário.');
      const cliente = (await client.query('INSERT INTO clientes (nome) VALUES ($1) RETURNING id', [NOME])).rows[0];
      const fonada = (await client.query('INSERT INTO fonadas (cliente_id, nome_comprador, valor) VALUES ($1, $2, 10) RETURNING id', [cliente.id, NOME])).rows[0];
      const aoVivo = (await client.query('INSERT INTO ao_vivo (cliente_id, comprador, valor) VALUES ($1, $2, 20) RETURNING id', [cliente.id, NOME])).rows[0];
      await client.query("INSERT INTO tentativas_contato (pedido_id, mensagem, data_hora_tentativa, observacao) VALUES ($1, 1, '22/09/26 12:00', 'QA backup')", [fonada.id]);
      await client.query("INSERT INTO tentativas_prazo_ao_vivo (pedido_id, data_hora_tentativa, observacao) VALUES ($1, '22/09/26 12:00', 'QA backup')", [aoVivo.id]);
      await client.query("INSERT INTO lembretes (titulo, data, criado_por) VALUES ($1, '2026-09-22', $2)", [NOME, usuario.id]);
    } else {
      const clientes = await client.query('SELECT id FROM clientes WHERE nome = $1', [NOME]);
      for (const { id } of clientes.rows) {
        await client.query('DELETE FROM tentativas_contato WHERE pedido_id IN (SELECT id FROM fonadas WHERE cliente_id = $1)', [id]);
        await client.query('DELETE FROM tentativas_prazo_ao_vivo WHERE pedido_id IN (SELECT id FROM ao_vivo WHERE cliente_id = $1)', [id]);
        await client.query('DELETE FROM fonadas WHERE cliente_id = $1', [id]);
        await client.query('DELETE FROM ao_vivo WHERE cliente_id = $1', [id]);
        await client.query('DELETE FROM clientes WHERE id = $1', [id]);
      }
      await client.query('DELETE FROM lembretes WHERE titulo = $1', [NOME]);
    }
    await client.query('COMMIT');
    console.log(`${modo} concluído no banco QA.`);
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
    await pool.end();
  }
}

executar().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
