// src/routes/agenda.js
// Rota da "Agenda" — junta as mensagens fonada e ao vivo marcadas para
// hoje (ou outro dia selecionado), olhando p1_dia/p2_dia (transmissão
// da fonada) e dia_entrega (ao vivo). Só considera datas COMPLETAS
// (dd/mm/aa ou dd/mm/aaaa); datas parciais ou mal formatadas são
// ignoradas.
//
// Migrado para PostgreSQL: rotas assíncronas, placeholders $1/$2/...,
// e a rota "nao-atendeu" (que grava em duas tabelas) usa um client
// dedicado do pool para a transação real.

const express = require('express');
const { db, pool } = require('../db/database');
const { agoraBrasilia } = require('../utils/dataHora');
const { situacaoSegundaMensagem, validarDataUsoSegundaMensagem } = require('../utils/mensagemEmHaver');

const router = express.Router();

function dataCompleta(valor) {
  if (!valor) return false;
  const m = String(valor).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return false;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (dia < 1 || dia > 31) return false;
  if (mes < 1 || mes > 12) return false;
  return true;
}

function hojeEmAmbosFormatos() {
  const hoje = agoraBrasilia();
  const dd = String(hoje.getDate()).padStart(2, '0');
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const aaaa = String(hoje.getFullYear());
  const aa = aaaa.slice(-2);
  return { curto: `${dd}/${mm}/${aa}`, longo: `${dd}/${mm}/${aaaa}`, aaaa, aa, dd, mm };
}

function ambosFormatosDe(dataBr) {
  const m = String(dataBr).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, dd, mm, ano] = m;
  const aaaa = ano.length === 2 ? `20${ano}` : ano;
  const aa = aaaa.slice(-2);
  return { curto: `${dd}/${mm}/${aa}`, longo: `${dd}/${mm}/${aaaa}` };
}

function dataBrParaIso(dataBr) {
  const formatos = ambosFormatosDe(dataBr);
  if (!formatos) return null;
  const [dd, mm, aa] = formatos.longo.split('/');
  const data = new Date(Number(aa), Number(mm) - 1, Number(dd));
  if (data.getFullYear() !== Number(aa) || data.getMonth() !== Number(mm) - 1 || data.getDate() !== Number(dd)) return null;
  return `${aa}-${mm}-${dd}`;
}

function agoraFormatado() {
  const agora = agoraBrasilia();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const hh = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');
  return { data: `${dd}/${mm}/${aa}`, horario: `${hh}:${min}`, texto: `${dd}/${mm}/${aa} ${hh}:${min}` };
}

// GET /api/agenda/contagens?datas=dd/mm/aa,dd/mm/aa...
// Alimenta o carrossel com uma única ida à API. A implementação anterior
// buscava a Agenda completa de 9 a 16 dias em paralelo (27 a 48 queries).
router.get('/contagens', async (req, res) => {
  try {
    const solicitadas = String(req.query.datas || '')
      .split(',')
      .map((data) => data.trim())
      .filter(Boolean);
    if (solicitadas.length === 0 || solicitadas.length > 31) {
      return res.status(400).json({ erro: 'Informe entre 1 e 31 datas válidas.' });
    }

    const formatos = solicitadas.map(ambosFormatosDe);
    const datasIsoValidadas = formatos.map((item) => item && dataBrParaIso(item.curto));
    if (formatos.some((item) => !item) || datasIsoValidadas.some((data) => !data)) {
      return res.status(400).json({ erro: 'Uma ou mais datas são inválidas.' });
    }

    const chavePorFormato = new Map();
    const datasTexto = [];
    const datasIso = [];
    const contagens = {};
    formatos.forEach((item) => {
      chavePorFormato.set(item.curto, item.curto);
      chavePorFormato.set(item.longo, item.curto);
      datasTexto.push(item.curto, item.longo);
      datasIso.push(dataBrParaIso(item.curto));
      contagens[item.curto] = 0;
    });

    const [fonadasResultado, aoVivoResultado, lembretesResultado] = await Promise.all([
      db.query(`
        SELECT id, p1_dia, p1_para, p1_horario, p1_resultado,
                   p2_dia, p2_para, p2_horario, p2_resultado
        FROM fonadas
        WHERE excluido_em IS NULL
          AND (p1_dia = ANY($1::text[]) OR p2_dia = ANY($1::text[]))
      `, [datasTexto]),
      db.query(`
        SELECT dia_entrega, COUNT(*)::int AS total
        FROM ao_vivo
        WHERE excluido_em IS NULL AND dia_entrega = ANY($1::text[])
        GROUP BY dia_entrega
      `, [datasTexto]),
      db.query(`
        SELECT TO_CHAR(data, 'DD/MM/YY') AS dia, COUNT(*)::int AS total
        FROM lembretes
        WHERE data = ANY($1::date[])
        GROUP BY data
      `, [datasIso]),
    ]);

    for (const pedido of fonadasResultado.rows) {
      const chaveP1 = chavePorFormato.get(pedido.p1_dia);
      const chaveP2 = chavePorFormato.get(pedido.p2_dia);
      if (chaveP1) contagens[chaveP1] += 1;
      if (chaveP2) contagens[chaveP2] += 1;

      const mesmoDestinatario = String(pedido.p1_para || '').trim()
        && String(pedido.p1_para || '').trim().toUpperCase() === String(pedido.p2_para || '').trim().toUpperCase();
      const podemSerUmaLinha = chaveP1 && chaveP1 === chaveP2
        && pedido.p1_dia === pedido.p2_dia
        && mesmoDestinatario
        && pedido.p1_horario
        && pedido.p1_horario === pedido.p2_horario
        && Boolean(pedido.p1_resultado) === Boolean(pedido.p2_resultado);
      if (podemSerUmaLinha) contagens[chaveP1] -= 1;
    }

    aoVivoResultado.rows.forEach((item) => {
      const chave = chavePorFormato.get(item.dia_entrega);
      if (chave) contagens[chave] += item.total;
    });
    lembretesResultado.rows.forEach((item) => {
      if (contagens[item.dia] !== undefined) contagens[item.dia] += item.total;
    });

    res.json({ contagens });
  } catch (erro) {
    console.error('Erro ao buscar contagens da agenda:', erro);
    res.status(500).json({ erro: 'Erro ao buscar contagens da agenda.' });
  }
});

// GET /api/agenda/hoje?data=dd/mm/aa
router.get('/hoje', async (req, res) => {
  try {
    const dataConsultada = (req.query.data || '').trim();
    const { curto, longo } = dataConsultada
      ? (ambosFormatosDe(dataConsultada) || hojeEmAmbosFormatos())
      : hojeEmAmbosFormatos();

    const { curto: curtoHoje, longo: longoHoje } = hojeEmAmbosFormatos();
    const consultandoHoje = !dataConsultada || curto === curtoHoje || curto === longoHoje || longo === curtoHoje || longo === longoHoje;

    const fonadasResultado = await db.query(`
      SELECT f.id, f.senha_os, f.nome_comprador, f.cliente_id, f.data_pedido, c.whatsapp AS cliente_whatsapp,
             f.p1_dia, f.p1_para, f.p1_tema, f.p1_mensagem, f.p1_horario, f.p1_celular, f.p1_fixo, f.p1_quem_oferece, f.p1_resultado,
             f.p2_dia, f.p2_para, f.p2_tema, f.p2_mensagem, f.p2_horario, f.p2_celular, f.p2_fixo, f.p2_quem_oferece, f.p2_resultado
      FROM fonadas f
      LEFT JOIN clientes c ON c.id = f.cliente_id
      WHERE f.excluido_em IS NULL AND (f.p1_dia IN ($1, $2) OR f.p2_dia IN ($1, $2))
    `, [curto, longo]);

    const itensFonada = [];
    for (const f of fonadasResultado.rows) {
      const situacaoP2 = situacaoSegundaMensagem(f);
      if ((f.p1_dia === curto || f.p1_dia === longo) && dataCompleta(f.p1_dia)) {
        itensFonada.push({
          pedidoId: f.id, mensagem: 1, senha_os: f.senha_os, nome_comprador: f.nome_comprador,
          cliente_id: f.cliente_id, whatsapp: f.cliente_whatsapp, para: f.p1_para, tema: f.p1_tema, codigo: f.p1_mensagem, dia: f.p1_dia, horario: f.p1_horario,
          celular: f.p1_celular, fixo: f.p1_fixo, quemOferece: f.p1_quem_oferece, resultado: f.p1_resultado,
          passada: Boolean(f.p1_resultado),
        });
      }
      if ((f.p2_dia === curto || f.p2_dia === longo) && dataCompleta(f.p2_dia)) {
        itensFonada.push({
          pedidoId: f.id, mensagem: 2, senha_os: f.senha_os, nome_comprador: f.nome_comprador,
          cliente_id: f.cliente_id, whatsapp: f.cliente_whatsapp, para: f.p2_para, tema: f.p2_tema, codigo: f.p2_mensagem, dia: f.p2_dia, horario: f.p2_horario,
          celular: f.p2_celular, fixo: f.p2_fixo, quemOferece: f.p2_quem_oferece, resultado: f.p2_resultado,
          passada: Boolean(f.p2_resultado),
          statusMensagemEmHaver: situacaoP2.status,
          dataExpiracaoMensagem: situacaoP2.dataExpiracao,
        });
      }
    }
    itensFonada.sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));

    const aoVivoResultado = await db.query(`
      SELECT id, numero_os, comprador, cliente_id, para, dia_entrega, horario_entrega,
             endereco, bairro, referencia, fixo_local, celular_local,
             tema_1, mensagem_codigo_1, tema_2, mensagem_codigo_2,
             tema_3, mensagem_codigo_3, tema_4, mensagem_codigo_4,
             musica_1, musica_2, musica_3, musica_4, musica_5, musica_6,
             brinde, pagamento, pagou, data_pagou,
             resultado_entrega, entregue_por
      FROM ao_vivo
      WHERE excluido_em IS NULL AND dia_entrega IN ($1, $2)
    `, [curto, longo]);

    const itensAoVivo = aoVivoResultado.rows
      .filter((a) => dataCompleta(a.dia_entrega))
      .map((a) => ({
        ...a,
        passada: Boolean(String(a.resultado_entrega || '').trim()),
        ehCobranca: false,
      }))
      .sort((a, b) => (a.horario_entrega || '').localeCompare(b.horario_entrega || ''));

    const dataIso = dataBrParaIso(curto);
    const lembretesResultado = dataIso ? await db.query(`
      SELECT id, titulo, TO_CHAR(data, 'YYYY-MM-DD') AS data, TO_CHAR(horario, 'HH24:MI') AS horario,
             observacao, concluido, criado_em, atualizado_em
      FROM lembretes
      WHERE data = $1::date
      ORDER BY concluido ASC, horario ASC NULLS FIRST, id ASC
    `, [dataIso]) : { rows: [] };

    // A Agenda mostra somente compromissos. Cobranças previstas e ações
    // financeiras ficam concentradas na central de Cobrança.
    res.json({ data: curto, consultandoHoje, fonada: itensFonada, aoVivo: itensAoVivo, lembretes: lembretesResultado.rows });
  } catch (erro) {
    console.error('Erro ao buscar agenda:', erro);
    res.status(500).json({ erro: 'Erro ao buscar agenda.' });
  }
});

// POST /api/agenda/fonada/:id/baixa
router.post('/fonada/:id/baixa', async (req, res) => {
  try {
    const { mensagem } = req.body;
    if (mensagem !== 1 && mensagem !== 2) {
      return res.status(400).json({ erro: 'Informe qual mensagem (1 ou 2).' });
    }

    const existenteResultado = await db.query('SELECT * FROM fonadas WHERE id = $1', [req.params.id]);
    if (existenteResultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    const clienteId = existenteResultado.rows[0].cliente_id;
    if (clienteId) {
      const clienteResultado = await db.query('SELECT bloqueado FROM clientes WHERE id = $1', [clienteId]);
      if (clienteResultado.rows[0]?.bloqueado) {
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível dar baixa nos pedidos dele.' });
      }
    }

    if (mensagem === 2) {
      const validacao = validarDataUsoSegundaMensagem(existenteResultado.rows[0]);
      if (!validacao.ok) return res.status(409).json({ erro: validacao.erro });
    }

    const { data, horario } = agoraFormatado();

    const usuarioResultado = await db.query('SELECT nome, usuario FROM usuarios WHERE id = $1', [req.usuario.id]);
    const usuarioLogado = usuarioResultado.rows[0];
    const nomeExibicao = usuarioLogado ? usuarioLogado.usuario : req.usuario.usuario;

    const resultado = `OK ${nomeExibicao} ${data} ${horario}`;

    const coluna = mensagem === 1 ? 'p1_resultado' : 'p2_resultado';
    const colunaPassadaPor = mensagem === 1 ? 'p1_passada_por' : 'p2_passada_por';
    await db.query(
      `UPDATE fonadas SET ${coluna} = $1, ${colunaPassadaPor} = $2, atualizado_em = NOW() WHERE id = $3`,
      [resultado, nomeExibicao, req.params.id]
    );

    res.json({ ok: true, resultado });
  } catch (erro) {
    console.error('Erro ao dar baixa na agenda:', erro);
    res.status(500).json({ erro: 'Erro ao dar baixa.' });
  }
});

// POST /api/agenda/fonada/:id/desfazer-baixa
router.post('/fonada/:id/desfazer-baixa', async (req, res) => {
  try {
    const { mensagem } = req.body;
    if (mensagem !== 1 && mensagem !== 2) {
      return res.status(400).json({ erro: 'Informe qual mensagem (1 ou 2).' });
    }

    const existenteResultado = await db.query('SELECT id FROM fonadas WHERE id = $1', [req.params.id]);
    if (existenteResultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    const coluna = mensagem === 1 ? 'p1_resultado' : 'p2_resultado';
    await db.query(
      `UPDATE fonadas SET ${coluna} = NULL, atualizado_em = NOW() WHERE id = $1`,
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao desfazer baixa da fonada:', erro);
    res.status(500).json({ erro: 'Erro ao desfazer.' });
  }
});

// POST /api/agenda/fonada/:id/nao-atendeu
router.post('/fonada/:id/nao-atendeu', async (req, res) => {
  const { mensagem, observacao, remarcadoDia, remarcadoHorario } = req.body;

  if (mensagem !== 1 && mensagem !== 2) {
    return res.status(400).json({ erro: 'Informe qual mensagem (1 ou 2).' });
  }
  if (!remarcadoDia || !remarcadoHorario) {
    return res.status(400).json({ erro: 'Informe o novo dia e horário para remarcar.' });
  }
  if (!dataCompleta(remarcadoDia)) {
    return res.status(400).json({ erro: 'Data de remarcação inválida.' });
  }
  // Nunca remarcar para um dia anterior a hoje — mesma checagem que o
  // frontend já faz, repetida aqui para não depender só da validação
  // do cliente (alguém poderia chamar a API direto).
  const hoje = hojeEmAmbosFormatos();
  const hojeChave = `${hoje.aaaa}${hoje.mm}${hoje.dd}`;
  const [, ddR, mmR, aaR] = String(remarcadoDia).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  const aaaaR = aaR.length === 2 ? `20${aaR}` : aaR;
  const remarcadoChave = `${aaaaR}${mmR}${ddR}`;
  if (remarcadoChave < hojeChave) {
    return res.status(400).json({ erro: 'Não é possível remarcar para um dia anterior a hoje.' });
  }

  const client = await pool.connect();
  try {
    const pedidoResultado = await client.query('SELECT * FROM fonadas WHERE id = $1', [req.params.id]);
    if (pedidoResultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Pedido não encontrado.' });
    }

    const clienteId = pedidoResultado.rows[0].cliente_id;
    if (clienteId) {
      const clienteResultado = await client.query('SELECT bloqueado FROM clientes WHERE id = $1', [clienteId]);
      if (clienteResultado.rows[0]?.bloqueado) {
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível registrar tentativas para ele.' });
      }
    }

    if (mensagem === 2) {
      const validacao = validarDataUsoSegundaMensagem(pedidoResultado.rows[0], remarcadoDia);
      if (!validacao.ok) {
        return res.status(409).json({ erro: validacao.erro });
      }
    }

    const { texto } = agoraFormatado();
    const colunaDia = mensagem === 1 ? 'p1_dia' : 'p2_dia';
    const colunaHorario = mensagem === 1 ? 'p1_horario' : 'p2_horario';

    await client.query('BEGIN');

    await client.query(`
      INSERT INTO tentativas_contato (pedido_id, mensagem, data_hora_tentativa, observacao, remarcado_dia, remarcado_horario)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [req.params.id, mensagem, texto, observacao || null, remarcadoDia, remarcadoHorario]);

    await client.query(`
      UPDATE fonadas SET ${colunaDia} = $1, ${colunaHorario} = $2, atualizado_em = NOW() WHERE id = $3
    `, [remarcadoDia, remarcadoHorario, req.params.id]);

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar tentativa:', erro);
    res.status(500).json({ erro: 'Não foi possível registrar a tentativa.' });
  } finally {
    client.release();
  }
});

// GET /api/agenda/fonada/:id/tentativas
router.get('/fonada/:id/tentativas', async (req, res) => {
  try {
    const resultado = await db.query(
      'SELECT * FROM tentativas_contato WHERE pedido_id = $1 ORDER BY id DESC',
      [req.params.id]
    );
    res.json({ tentativas: resultado.rows });
  } catch (erro) {
    console.error('Erro ao buscar tentativas:', erro);
    res.status(500).json({ erro: 'Erro ao buscar tentativas.' });
  }
});

function validarLembrete(dados, parcial = false) {
  if (!parcial || dados.titulo !== undefined) {
    if (!String(dados.titulo || '').trim()) return 'Informe o título do lembrete.';
  }
  if (!parcial || dados.data !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dados.data || ''))) return 'Informe uma data válida.';
    const [ano, mes, dia] = dados.data.split('-').map(Number);
    const data = new Date(ano, mes - 1, dia);
    if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return 'Informe uma data válida.';
  }
  if (dados.horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(dados.horario))) return 'Informe um horário válido.';
  return null;
}

// CRUD de lembretes: entidade própria, sem cliente ou pedido artificial.
router.post('/lembretes', async (req, res) => {
  try {
    const erro = validarLembrete(req.body);
    if (erro) return res.status(400).json({ erro });
    const resultado = await db.query(`
      INSERT INTO lembretes (titulo, data, horario, observacao, criado_por)
      VALUES ($1, $2::date, NULLIF($3, '')::time, $4, $5)
      RETURNING id, titulo, TO_CHAR(data, 'YYYY-MM-DD') AS data,
                TO_CHAR(horario, 'HH24:MI') AS horario, observacao, concluido, criado_em, atualizado_em
    `, [req.body.titulo.trim(), req.body.data, req.body.horario || null, req.body.observacao?.trim() || null, req.usuario.id]);
    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    console.error('Erro ao criar lembrete:', erro);
    res.status(500).json({ erro: 'Não foi possível criar o lembrete.' });
  }
});

router.put('/lembretes/:id', async (req, res) => {
  try {
    const atual = await db.query(`
      SELECT id, titulo, TO_CHAR(data, 'YYYY-MM-DD') AS data,
             TO_CHAR(horario, 'HH24:MI') AS horario, observacao, concluido
      FROM lembretes WHERE id = $1
    `, [req.params.id]);
    if (!atual.rows[0]) return res.status(404).json({ erro: 'Lembrete não encontrado.' });
    const dados = { ...atual.rows[0], ...req.body };
    const erro = validarLembrete(dados);
    if (erro) return res.status(400).json({ erro });
    const resultado = await db.query(`
      UPDATE lembretes SET titulo = $1, data = $2::date, horario = NULLIF($3, '')::time,
        observacao = $4, concluido = $5, atualizado_em = NOW()
      WHERE id = $6
      RETURNING id, titulo, TO_CHAR(data, 'YYYY-MM-DD') AS data,
                TO_CHAR(horario, 'HH24:MI') AS horario, observacao, concluido, criado_em, atualizado_em
    `, [String(dados.titulo).trim(), dados.data, dados.horario || null, dados.observacao?.trim() || null, Boolean(dados.concluido), req.params.id]);
    res.json(resultado.rows[0]);
  } catch (erro) {
    console.error('Erro ao editar lembrete:', erro);
    res.status(500).json({ erro: 'Não foi possível editar o lembrete.' });
  }
});

router.delete('/lembretes/:id', async (req, res) => {
  try {
    const resultado = await db.query('DELETE FROM lembretes WHERE id = $1 RETURNING id', [req.params.id]);
    if (!resultado.rows[0]) return res.status(404).json({ erro: 'Lembrete não encontrado.' });
    res.json({ ok: true });
  } catch (erro) {
    console.error('Erro ao excluir lembrete:', erro);
    res.status(500).json({ erro: 'Não foi possível excluir o lembrete.' });
  }
});

module.exports = router;
