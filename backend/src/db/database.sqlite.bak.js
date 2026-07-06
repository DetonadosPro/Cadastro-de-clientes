// src/db/database.js
// Conexão com o banco SQLite e criação das tabelas (schema).
// SQLite guarda tudo em um único arquivo: backend/data/pombo.db
// Isso é ótimo para uso local/rede pequena: não precisa instalar
// nenhum servidor de banco de dados separado.
//
// O negócio tem duas modalidades de mensagem, que no sistema antigo
// eram DUAS ABAS/BANCOS SEPARADOS — mantemos essa separação aqui:
//
//   1. MENSAGEM FONADA (por telefone): vendida como um pacote com
//      direito a 2 mensagens dentro de 6 meses (por isso "Ped. 1" e
//      "Ped. 2" na planilha antiga — são as 2 entregas do mesmo
//      pacote, não pedidos diferentes).
//
//   2. MENSAGEM AO VIVO (carro de som): pedido único (sem o conceito
//      de pacote/2-em-6-meses), com endereço de entrega e uma lista
//      ordenada de até 6 músicas.

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'pombo.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL'); // permite várias pessoas lendo/escrevendo ao mesmo tempo com menos travamento

function iniciarBanco() {
  db.exec(`
    -- Usuários que podem logar no sistema
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      nome TEXT,
      data_nascimento TEXT,
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- ============================================================
    -- CLIENTES — cadastro único, compartilhado entre fonada e ao vivo.
    -- Um cliente pode ter vários pedidos (dos dois tipos) ao longo
    -- do tempo. Reúne os dados que antes ficavam duplicados dentro
    -- de cada pedido (comprador_* na fonada, campos soltos no ao vivo).
    -- ============================================================
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      nascimento TEXT,
      fixo TEXT,
      celular TEXT,
      endereco TEXT,
      complemento TEXT,
      bairro TEXT,
      referencia TEXT,

      excluido_em TEXT,              -- data/hora em que foi enviado pra lixeira (NULL = ativo)

      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);
    CREATE INDEX IF NOT EXISTS idx_clientes_nascimento ON clientes(nascimento);

    -- ============================================================
    -- MENSAGEM FONADA (telefone) — pacote com 2 entregas em 6 meses
    -- Equivalente à aba "BD" da planilha original.
    --
    -- Importante: os campos "p1_*"/"p2_*" são dados do DESTINATÁRIO
    -- da mensagem (quem vai receber a ligação). Os campos "comprador_*"
    -- são o histórico de pedidos ANTIGOS (antes do cadastro de
    -- clientes existir) — pedidos novos usam cliente_id em vez disso.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS fonadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      senha_os TEXT,                -- número "Senha"/O.S. da planilha original (referência histórica)
      cliente_id INTEGER REFERENCES clientes(id),  -- cliente vinculado (pedidos novos)
      nome_comprador TEXT NOT NULL,
      data_pedido TEXT,             -- data em que o pacote foi comprado
      horario_pedido TEXT,          -- horário em que o pedido foi feito/atendido
      nascimento TEXT,              -- aniversário do homenageado
      tipo TEXT,                    -- ANI. / OUT.
      recall TEXT,                  -- SIM / NÃO
      recall_codigo TEXT,           -- código de referência de 5 dígitos, só numérico

      -- Entrega 1 do pacote (dados de quem RECEBE a ligação)
      p1_dia TEXT,
      p1_para TEXT,
      p1_tema TEXT,
      p1_mensagem TEXT,
      p1_fixo TEXT,
      p1_celular TEXT,
      p1_horario TEXT,
      p1_quem_oferece TEXT,
      p1_resultado TEXT,

      -- Entrega 2 do pacote (dentro de 6 meses da primeira)
      p2_dia TEXT,
      p2_para TEXT,
      p2_tema TEXT,
      p2_mensagem TEXT,
      p2_fixo TEXT,
      p2_celular TEXT,
      p2_horario TEXT,
      p2_quem_oferece TEXT,
      p2_resultado TEXT,

      -- Dados do comprador — histórico de pedidos antigos, sem cliente
      -- vinculado. Pedidos novos não preenchem mais estes campos aqui;
      -- os dados vêm do cliente (cliente_id) na hora de exibir.
      comprador_fixo TEXT,
      comprador_celular TEXT,
      comprador_endereco TEXT,
      comprador_complemento TEXT,
      comprador_bairro TEXT,
      comprador_referencia TEXT,

      -- Financeiro
      valor REAL,
      cobranca TEXT,
      periodo TEXT,
      pagou TEXT,
      recebi TEXT,                  -- observação de lançamento de cobrança (referência/consulta)
      data_pagamento TEXT,          -- data em que a baixa de pagamento foi registrada (automática,
                                     -- vinda do sistema) — usada no relatório de Recebimentos por período

      vender TEXT,
      status TEXT,
      impresso TEXT,

      excluido_em TEXT,              -- preenchido quando o cliente vinculado vai pra lixeira

      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_fonadas_nome ON fonadas(nome_comprador);
    CREATE INDEX IF NOT EXISTS idx_fonadas_data ON fonadas(data_pedido);
    CREATE INDEX IF NOT EXISTS idx_fonadas_celular ON fonadas(p1_celular);

    -- ============================================================
    -- MENSAGEM AO VIVO (carro de som) — pedido único
    -- Equivalente à aba "aovivo" da planilha original.
    --
    -- Como funciona: a pessoa liga, ouve mensagens gravadas por tema
    -- (catálogo), escolhe 1 grátis e pode pagar por mensagens extras
    -- (por isso até 4 pares tema/código — na prática quase sempre 1).
    -- Duas pessoas vão de carro até o endereço e tocam até 6 músicas
    -- escolhidas, em ordem.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS ao_vivo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_os TEXT,                -- "OS" da planilha original
      cliente_id INTEGER REFERENCES clientes(id),  -- cliente vinculado (pedidos novos)
      data_pedido TEXT,
      horario_pedido TEXT,           -- horário em que o pedido foi feito
      dia_entrega TEXT,              -- dia em que o carro vai até o local
      horario_entrega TEXT,          -- horário da entrega/apresentação

      comprador TEXT NOT NULL,       -- histórico de pedidos antigos (sem cliente vinculado)
      para TEXT,                     -- quem recebe a homenagem
      oferecimento TEXT,             -- dedicatória / lista de quem oferece

      -- Local de entrega (onde o carro de som vai)
      endereco TEXT,
      bairro TEXT,
      referencia TEXT,

      -- Contato do local (raramente preenchido na planilha antiga)
      fixo_local TEXT,
      celular_local TEXT,

      -- Contato do comprador — histórico de pedidos antigos, sem cliente
      -- vinculado. Pedidos novos usam os dados do cliente (cliente_id).
      celular TEXT,
      celular2 TEXT,

      -- Mensagem(ns) escolhida(s) do catálogo (tema + código da gravação).
      -- Começa com 1 mensagem grátis; a pessoa pode pagar por até 3 extras (total 4).
      tema_1 TEXT,
      mensagem_codigo_1 TEXT,
      tema_2 TEXT,
      mensagem_codigo_2 TEXT,
      tema_3 TEXT,
      mensagem_codigo_3 TEXT,
      tema_4 TEXT,
      mensagem_codigo_4 TEXT,

      -- Até 6 músicas, em ordem
      musica_1 TEXT,
      musica_2 TEXT,
      musica_3 TEXT,
      musica_4 TEXT,
      musica_5 TEXT,
      musica_6 TEXT,

      aniversario TEXT,              -- histórico antigo (pedidos novos usam o do cliente)

      -- Financeiro
      valor REAL,
      pagamento TEXT,

      brinde TEXT,
      observacoes TEXT,

      excluido_em TEXT,              -- preenchido quando o cliente vinculado vai pra lixeira

      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_aovivo_comprador ON ao_vivo(comprador);
    CREATE INDEX IF NOT EXISTS idx_aovivo_data ON ao_vivo(dia_entrega);
    CREATE INDEX IF NOT EXISTS idx_aovivo_celular ON ao_vivo(celular);

    -- ============================================================
    -- TENTATIVAS DE CONTATO (fonada) — histórico de ligações que não
    -- foram atendidas, com o reagendamento feito em cada uma. Não
    -- apaga nem substitui nada: cada tentativa fica registrada aqui
    -- para consulta, mesmo depois do pedido ser remarcado várias vezes.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS tentativas_contato (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES fonadas(id),
      mensagem INTEGER NOT NULL,          -- 1 ou 2 (qual mensagem do pacote)

      data_hora_tentativa TEXT NOT NULL,  -- quando a ligação foi feita (automático, do sistema)
      observacao TEXT,                    -- comentário rápido opcional (ex: "caixa postal")

      remarcado_dia TEXT,                 -- novo dia para o qual foi remarcado
      remarcado_horario TEXT,             -- novo horário para o qual foi remarcado

      criado_em TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tentativas_pedido ON tentativas_contato(pedido_id);
  `);

  // Migração leve: adiciona colunas novas em bancos que já existiam antes
  // dessas colunas serem criadas. Se a coluna já existir, o erro é ignorado.
  const colunasNovas = [
    { tabela: 'ao_vivo', coluna: 'tema_4', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'mensagem_codigo_4', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'cliente_id', tipo: 'INTEGER REFERENCES clientes(id)' },
    { tabela: 'ao_vivo', coluna: 'cliente_id', tipo: 'INTEGER REFERENCES clientes(id)' },
    { tabela: 'clientes', coluna: 'excluido_em', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'excluido_em', tipo: 'TEXT' },
    { tabela: 'ao_vivo', coluna: 'excluido_em', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'data_pagamento', tipo: 'TEXT' },
    { tabela: 'usuarios', coluna: 'nome', tipo: 'TEXT' },
    { tabela: 'usuarios', coluna: 'data_nascimento', tipo: 'TEXT' },
    { tabela: 'fonadas', coluna: 'recall_codigo', tipo: 'TEXT' },
  ];
  for (const { tabela, coluna, tipo } of colunasNovas) {
    try {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    } catch (e) {
      // Coluna já existe — ignora.
    }
  }

  // Garante o índice de tentativas_contato mesmo em bancos migrados.
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tentativas_pedido ON tentativas_contato(pedido_id)'); } catch (e) {}

  // Garante os índices de cliente_id/excluido_em mesmo em bancos migrados
  // (a criação via CREATE INDEX IF NOT EXISTS no bloco acima só cobre
  // bancos novos — bancos antigos só ganham a coluna agora).
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_fonadas_cliente ON fonadas(cliente_id)'); } catch (e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_aovivo_cliente ON ao_vivo(cliente_id)'); } catch (e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_clientes_excluido ON clientes(excluido_em)'); } catch (e) {}
}

module.exports = { db, iniciarBanco };

