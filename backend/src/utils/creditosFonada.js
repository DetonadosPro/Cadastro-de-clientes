const { registroPedidoBrasilia } = require('./dataHora');

async function criarEstruturaCreditos(banco) {
  await banco.query('ALTER TABLE fonadas ADD COLUMN IF NOT EXISTS creditos_usados INTEGER NOT NULL DEFAULT 0 CHECK (creditos_usados BETWEEN 0 AND 2)');
  await banco.query('ALTER TABLE fonadas ADD COLUMN IF NOT EXISTS credito_operacao UUID UNIQUE');
  await banco.query(`CREATE TABLE IF NOT EXISTS creditos_fonada (
    id SERIAL PRIMARY KEY, cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    nome_cliente TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('COMPRA', 'USO')),
    quantidade INTEGER NOT NULL CHECK ((tipo = 'COMPRA' AND quantidade > 0) OR (tipo = 'USO' AND quantidade < 0)),
    valor NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0), forma TEXT,
    data_pedido TEXT NOT NULL, horario_pedido TEXT NOT NULL, usuario TEXT NOT NULL,
    pedido_id INTEGER REFERENCES fonadas(id) ON DELETE SET NULL, senha_os TEXT,
    operacao UUID NOT NULL UNIQUE, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await banco.query('CREATE INDEX IF NOT EXISTS idx_creditos_fonada_cliente ON creditos_fonada(cliente_id, id DESC)');
  await banco.query(`ALTER TABLE creditos_fonada
    DROP CONSTRAINT IF EXISTS creditos_fonada_tipo_check,
    DROP CONSTRAINT IF EXISTS creditos_fonada_check,
    ADD CONSTRAINT creditos_fonada_tipo_check CHECK (tipo IN ('COMPRA', 'USO', 'ESTORNO')),
    ADD CONSTRAINT creditos_fonada_check CHECK ((tipo IN ('COMPRA', 'ESTORNO') AND quantidade > 0) OR (tipo = 'USO' AND quantidade < 0))`);
  await banco.query('ALTER TABLE creditos_fonada ADD COLUMN IF NOT EXISTS uso_estornado_id INTEGER UNIQUE REFERENCES creditos_fonada(id)');
  // A venda é o pacote pago. A mensagem custeada por crédito não vende novamente.
  await banco.query(`CREATE OR REPLACE VIEW financeiro_fonada AS
    SELECT f.id, f.cliente_id, f.nome_comprador, f.senha_os, f.valor::numeric AS valor,
      f.periodo, f.data_pedido, f.horario_pedido, f.data_pagamento, f.pagou, f.recall,
      f.vendedor_usuario, f.excluido_em, '/fonada/' || f.id AS rota, 'PEDIDO'::text AS tipo_registro
    FROM fonadas f WHERE f.creditos_usados = 0
    UNION ALL
    SELECT -m.id, m.cliente_id, COALESCE(c.nome, m.nome_cliente), 'CRÉDITOS ×' || m.quantidade,
      m.valor, m.forma, m.data_pedido, m.horario_pedido, m.data_pedido, 'SIM', 'NÃO',
      m.usuario, NULL::timestamp, CASE WHEN m.cliente_id IS NOT NULL THEN '/clientes/' || m.cliente_id END, 'CREDITOS'
    FROM creditos_fonada m LEFT JOIN clientes c ON c.id = m.cliente_id WHERE m.tipo = 'COMPRA'`);
}

function falha(erro, status = 409) { return Object.assign(new Error(erro), { status }); }
function uuidValido(valor) { return typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor); }

async function carteira(banco, clienteId, historico = true) {
  const resumo = (await banco.query(`SELECT COALESCE(SUM(quantidade), 0)::integer AS saldo,
    COALESCE(SUM(quantidade) FILTER (WHERE tipo = 'COMPRA'), 0)::integer AS comprados,
    COALESCE(-SUM(quantidade) FILTER (WHERE tipo IN ('USO', 'ESTORNO')), 0)::integer AS usados,
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'COMPRA'), 0)::float AS valor_comprado,
    COUNT(*) FILTER (WHERE tipo = 'COMPRA')::integer AS compras,
    (SELECT row_to_json(compra) FROM (SELECT id, quantidade, data_pedido, horario_pedido
      FROM creditos_fonada WHERE cliente_id = $1 AND tipo = 'COMPRA' ORDER BY id DESC LIMIT 1) compra) AS ultima_compra
    FROM creditos_fonada WHERE cliente_id = $1`, [clienteId])).rows[0];
  const movimentos = historico ? (await banco.query(`SELECT id, tipo, quantidade, valor, forma,
    data_pedido, horario_pedido, usuario, pedido_id, senha_os FROM creditos_fonada
    WHERE cliente_id = $1 ORDER BY id DESC LIMIT 100`, [clienteId])).rows : [];
  return { ...resumo, movimentos };
}

async function comprarCreditos(banco, clienteId, dados, usuario) {
  if (!Number.isInteger(dados.quantidade) || dados.quantidade < 1 || dados.quantidade > 10000) throw falha('Informe de 1 a 10.000 créditos.', 400);
  if (typeof dados.valor !== 'number' || !Number.isFinite(dados.valor) || dados.valor <= 0 || dados.valor > 9999999.99 || Math.abs(dados.valor * 100 - Math.round(dados.valor * 100)) > 0.000001) throw falha('Informe o valor total pago pelo pacote, com até duas casas decimais.', 400);
  if (!['PIX', 'DINHEIRO', 'DEPÓSITO', 'DÉBITO', 'CRÉDITO'].includes(dados.forma)) throw falha('Selecione a forma de pagamento.', 400);
  if (!uuidValido(dados.operacao)) throw falha('Identificação da compra inválida. Reabra o formulário.', 400);
  const cliente = (await banco.query('SELECT * FROM clientes WHERE id = $1 FOR UPDATE', [clienteId])).rows[0];
  if (!cliente || cliente.excluido_em) throw falha('Cliente não disponível.', 404);
  if (cliente.bloqueado) throw falha('Desbloqueie o cliente antes de adicionar créditos.', 403);
  const anterior = (await banco.query('SELECT * FROM creditos_fonada WHERE operacao = $1', [dados.operacao])).rows[0];
  if (anterior) {
    if (anterior.cliente_id !== Number(clienteId) || anterior.tipo !== 'COMPRA' || anterior.quantidade !== dados.quantidade || Number(anterior.valor) !== dados.valor || anterior.forma !== dados.forma) throw falha('Esta identificação já pertence a outra compra.');
    return carteira(banco, clienteId);
  }
  const registro = registroPedidoBrasilia();
  await banco.query(`INSERT INTO creditos_fonada (cliente_id, nome_cliente, tipo, quantidade, valor, forma, data_pedido, horario_pedido, usuario, operacao)
    VALUES ($1, $2, 'COMPRA', $3, $4, $5, $6, $7, $8, $9)`,
    [clienteId, cliente.nome, dados.quantidade, dados.valor, dados.forma, registro.data_pedido, registro.horario_pedido, usuario, dados.operacao]);
  return carteira(banco, clienteId);
}

async function consumirCreditos(banco, pedido, usuario) {
  // O chamador mantém a linha do cliente travada até confirmar o pedido e o débito.
  const saldo = await carteira(banco, pedido.cliente_id, false);
  if (saldo.saldo < pedido.creditos_usados) throw falha(`Saldo insuficiente: ${saldo.saldo} crédito(s) disponível(is). Este pedido precisa de ${pedido.creditos_usados}.`);
  await banco.query(`INSERT INTO creditos_fonada (cliente_id, nome_cliente, tipo, quantidade, data_pedido, horario_pedido, usuario, pedido_id, senha_os, operacao)
    VALUES ($1, $2, 'USO', $3, $4, $5, $6, $7, $8, $9)`,
    [pedido.cliente_id, pedido.nome_comprador, -pedido.creditos_usados, pedido.data_pedido, pedido.horario_pedido, usuario, pedido.id, pedido.senha_os, pedido.credito_operacao]);
}

async function devolverCreditos(banco, pedido, usuario) {
  if (!pedido.creditos_usados || !pedido.cliente_id) return;
  const registro = registroPedidoBrasilia();
  await banco.query(`INSERT INTO creditos_fonada (cliente_id, nome_cliente, tipo, quantidade, data_pedido,
      horario_pedido, usuario, pedido_id, senha_os, operacao, uso_estornado_id)
    SELECT m.cliente_id, m.nome_cliente, 'ESTORNO', -m.quantidade, $2, $3, $4, m.pedido_id, m.senha_os, $5, m.id
    FROM creditos_fonada m WHERE m.pedido_id = $1 AND m.tipo = 'USO'
    ON CONFLICT (uso_estornado_id) DO NOTHING`,
    [pedido.id, registro.data_pedido, registro.horario_pedido, usuario, require('node:crypto').randomUUID()]);
}

module.exports = { criarEstruturaCreditos, carteira, comprarCreditos, consumirCreditos, devolverCreditos, uuidValido, falha };
