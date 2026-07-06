// src/db/database.js
// Conexão com PostgreSQL (produção — Railway) e criação das tabelas
// (schema). Esse arquivo substitui a versão anterior baseada em
// node:sqlite: a lógica de negócio é a mesma, só o motor de banco muda.
//
// Diferenças importantes da migração SQLite → PostgreSQL:
//   - AUTOINCREMENT vira SERIAL
//   - datetime('now') vira NOW()
//   - Os métodos db.prepare(...).get()/.all()/.run() SÍNCRONOS do SQLite
//     não existem mais — o driver "pg" é assíncrono (Promises). Toda
//     rota que usa o banco precisa de "await" agora.
//   - Placeholders mudam de "?" para "$1, $2, $3..." — todas as
//     consultas nas rotas foram reescritas para esse formato.

const { Pool } = require('pg');

// Em produção (Railway), a variável DATABASE_URL é injetada
// automaticamente quando você adiciona um banco Postgres ao projeto —
// não precisa configurar nada manualmente lá. Localmente, defina
// DATABASE_URL no seu .env apontando para um Postgres de teste.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
});

const db = {
  query: (texto, params) => pool.query(texto, params),
  pool,
};

async function iniciarBanco() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      nome TEXT,
      data_nascimento TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      nascimento TEXT,
      fixo TEXT,
      celular TEXT,
      endereco TEXT,
      complemento TEXT,
      bairro TEXT,
      referencia TEXT,
      excluido_em TIMESTAMP,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_nascimento ON clientes(nascimento)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fonadas (
      id SERIAL PRIMARY KEY,
      senha_os TEXT,
      cliente_id INTEGER REFERENCES clientes(id),
      nome_comprador TEXT NOT NULL,
      data_pedido TEXT,
      horario_pedido TEXT,
      nascimento TEXT,
      tipo TEXT,
      recall TEXT,
      recall_codigo TEXT,

      p1_dia TEXT,
      p1_para TEXT,
      p1_tema TEXT,
      p1_mensagem TEXT,
      p1_fixo TEXT,
      p1_celular TEXT,
      p1_horario TEXT,
      p1_quem_oferece TEXT,
      p1_resultado TEXT,

      p2_dia TEXT,
      p2_para TEXT,
      p2_tema TEXT,
      p2_mensagem TEXT,
      p2_fixo TEXT,
      p2_celular TEXT,
      p2_horario TEXT,
      p2_quem_oferece TEXT,
      p2_resultado TEXT,

      comprador_fixo TEXT,
      comprador_celular TEXT,
      comprador_endereco TEXT,
      comprador_complemento TEXT,
      comprador_bairro TEXT,
      comprador_referencia TEXT,

      valor REAL,
      cobranca TEXT,
      periodo TEXT,
      pagou TEXT,
      recebi TEXT,
      data_pagamento TEXT,

      vender TEXT,
      status TEXT,
      impresso TEXT,

      excluido_em TIMESTAMP,

      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_nome ON fonadas(nome_comprador)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_data ON fonadas(data_pedido)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_celular ON fonadas(p1_celular)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_cliente ON fonadas(cliente_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fonadas_excluido ON fonadas(excluido_em)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ao_vivo (
      id SERIAL PRIMARY KEY,
      numero_os TEXT,
      cliente_id INTEGER REFERENCES clientes(id),
      data_pedido TEXT,
      horario_pedido TEXT,
      dia_entrega TEXT,
      horario_entrega TEXT,

      comprador TEXT NOT NULL,
      para TEXT,
      oferecimento TEXT,

      endereco TEXT,
      bairro TEXT,
      referencia TEXT,

      fixo_local TEXT,
      celular_local TEXT,

      celular TEXT,
      celular2 TEXT,

      tema_1 TEXT,
      mensagem_codigo_1 TEXT,
      tema_2 TEXT,
      mensagem_codigo_2 TEXT,
      tema_3 TEXT,
      mensagem_codigo_3 TEXT,
      tema_4 TEXT,
      mensagem_codigo_4 TEXT,

      musica_1 TEXT,
      musica_2 TEXT,
      musica_3 TEXT,
      musica_4 TEXT,
      musica_5 TEXT,
      musica_6 TEXT,

      aniversario TEXT,

      valor REAL,
      pagamento TEXT,

      brinde TEXT,
      observacoes TEXT,

      excluido_em TIMESTAMP,

      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_aovivo_comprador ON ao_vivo(comprador)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_aovivo_data ON ao_vivo(dia_entrega)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_aovivo_celular ON ao_vivo(celular)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_aovivo_cliente ON ao_vivo(cliente_id)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tentativas_contato (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES fonadas(id),
      mensagem INTEGER NOT NULL,
      data_hora_tentativa TEXT NOT NULL,
      observacao TEXT,
      remarcado_dia TEXT,
      remarcado_horario TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tentativas_pedido ON tentativas_contato(pedido_id)');

  const colunasNovas = [
    { tabela: 'ao_vivo', coluna: 'tema_4', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'mensagem_codigo_4', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'cliente_id', tipo: 'INTEGER REFERENCES clientes(id)' },
    { tabela: 'ao_vivo', coluna: 'cliente_id', tipo: 'INTEGER REFERENCES clientes(id)' },
    { tabela: 'clientes', coluna: 'excluido_em', tipo: 'TIMESTAMP' },
    { tabela: 'fonadas', coluna: 'excluido_em', tipo: 'TIMESTAMP' },
    { tabela: 'ao_vivo', coluna: 'excluido_em', tipo: 'TIMESTAMP' },
    { tabela: 'fonadas', coluna: 'data_pagamento', tipo: 'TEXT' },
    { tabela: 'usuarios', coluna: 'nome', tipo: 'TEXT' },
    { tabela: 'usuarios', coluna: 'data_nascimento', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'recall_codigo', tipo: 'TEXT' },
  ];
  for (const { tabela, coluna, tipo } of colunasNovas) {
    await pool.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS ${coluna} ${tipo}`);
  }
}

module.exports = { db, pool, iniciarBanco };
