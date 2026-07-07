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

function agoraFormatado() {
  const agora = agoraBrasilia();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const hh = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');
  return { data: `${dd}/${mm}/${aa}`, horario: `${hh}:${min}`, texto: `${dd}/${mm}/${aa} ${hh}:${min}` };
}

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
      SELECT id, senha_os, nome_comprador, cliente_id,
             p1_dia, p1_para, p1_tema, p1_horario, p1_celular, p1_fixo, p1_resultado,
             p2_dia, p2_para, p2_tema, p2_horario, p2_celular, p2_fixo, p2_resultado
      FROM fonadas
      WHERE excluido_em IS NULL AND (p1_dia IN ($1, $2) OR p2_dia IN ($1, $2))
    `, [curto, longo]);

    const itensFonada = [];
    for (const f of fonadasResultado.rows) {
      if ((f.p1_dia === curto || f.p1_dia === longo) && dataCompleta(f.p1_dia)) {
        itensFonada.push({
          pedidoId: f.id, mensagem: 1, senha_os: f.senha_os, nome_comprador: f.nome_comprador,
          cliente_id: f.cliente_id, para: f.p1_para, tema: f.p1_tema, horario: f.p1_horario,
          celular: f.p1_celular, fixo: f.p1_fixo, resultado: f.p1_resultado,
          passada: Boolean(f.p1_resultado),
        });
      }
      if ((f.p2_dia === curto || f.p2_dia === longo) && dataCompleta(f.p2_dia)) {
        itensFonada.push({
          pedidoId: f.id, mensagem: 2, senha_os: f.senha_os, nome_comprador: f.nome_comprador,
          cliente_id: f.cliente_id, para: f.p2_para, tema: f.p2_tema, horario: f.p2_horario,
          celular: f.p2_celular, fixo: f.p2_fixo, resultado: f.p2_resultado,
          passada: Boolean(f.p2_resultado),
        });
      }
    }
    itensFonada.sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));

    const aoVivoResultado = await db.query(`
      SELECT id, numero_os, comprador, cliente_id, para, dia_entrega, horario_entrega,
             endereco, bairro, referencia, resultado_entrega
      FROM ao_vivo
      WHERE excluido_em IS NULL AND dia_entrega IN ($1, $2)
    `, [curto, longo]);

    const itensAoVivo = aoVivoResultado.rows
      .filter((a) => dataCompleta(a.dia_entrega))
      .map((a) => ({ ...a, passada: Boolean(a.resultado_entrega) }))
      .sort((a, b) => (a.horario_entrega || '').localeCompare(b.horario_entrega || ''));

    res.json({ data: curto, consultandoHoje, fonada: itensFonada, aoVivo: itensAoVivo });
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

    const existenteResultado = await db.query('SELECT id, cliente_id FROM fonadas WHERE id = $1', [req.params.id]);
    if (existenteResultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    const clienteId = existenteResultado.rows[0].cliente_id;
    if (clienteId) {
      const clienteResultado = await db.query('SELECT bloqueado FROM clientes WHERE id = $1', [clienteId]);
      if (clienteResultado.rows[0]?.bloqueado) {
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível dar baixa nos pedidos dele.' });
      }
    }

    const { data, horario } = agoraFormatado();

    const usuarioResultado = await db.query('SELECT nome, usuario FROM usuarios WHERE id = $1', [req.usuario.id]);
    const usuarioLogado = usuarioResultado.rows[0];
    const nomeExibicao = usuarioLogado ? (usuarioLogado.nome || usuarioLogado.usuario) : req.usuario.usuario;

    const resultado = `MENSAGEM PASSADA, ${data} às ${horario} por ${nomeExibicao}`;

    const coluna = mensagem === 1 ? 'p1_resultado' : 'p2_resultado';
    await db.query(
      `UPDATE fonadas SET ${coluna} = $1, atualizado_em = NOW() WHERE id = $2`,
      [resultado, req.params.id]
    );

    res.json({ ok: true, resultado });
  } catch (erro) {
    console.error('Erro ao dar baixa na agenda:', erro);
    res.status(500).json({ erro: 'Erro ao dar baixa.' });
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

  const client = await pool.connect();
  try {
    const pedidoResultado = await client.query('SELECT id, cliente_id FROM fonadas WHERE id = $1', [req.params.id]);
    if (pedidoResultado.rows.length === 0) {
      client.release();
      return res.status(404).json({ erro: 'Pedido não encontrado.' });
    }

    const clienteId = pedidoResultado.rows[0].cliente_id;
    if (clienteId) {
      const clienteResultado = await client.query('SELECT bloqueado FROM clientes WHERE id = $1', [clienteId]);
      if (clienteResultado.rows[0]?.bloqueado) {
        client.release();
        return res.status(403).json({ erro: 'Este cliente está bloqueado. Não é possível registrar tentativas para ele.' });
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

module.exports = router;
