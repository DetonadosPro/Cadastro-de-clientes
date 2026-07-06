// src/routes/agenda.js
// Rota da "Agenda" — junta as mensagens fonada e ao vivo marcadas para
// hoje, olhando p1_dia/p2_dia (transmissão da fonada) e dia_entrega (ao
// vivo). Só considera datas COMPLETAS (dd/mm/aa ou dd/mm/aaaa); datas
// parciais ou mal formatadas são ignoradas.

const express = require('express');
const { db } = require('../db/database');

const router = express.Router();

// Verifica se uma data está no formato completo dd/mm/aa ou dd/mm/aaaa,
// com dia e mês em faixas plausíveis. Datas parciais (ex: "03/07") ou
// vazias não contam.
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

// Retorna as duas formas válidas de "hoje" (ano com 2 e com 4 dígitos),
// já que a base tem registros salvos nos dois formatos.
function hojeEmAmbosFormatos() {
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, '0');
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const aaaa = String(hoje.getFullYear());
  const aa = aaaa.slice(-2);
  return { curto: `${dd}/${mm}/${aa}`, longo: `${dd}/${mm}/${aaaa}`, aaaa, aa, dd, mm };
}

// Dada uma data no formato dd/mm/aa ou dd/mm/aaaa, devolve as duas formas
// (2 e 4 dígitos de ano) para comparar contra os dois formatos salvos no
// banco. Retorna null se a data não for válida.
function ambosFormatosDe(dataBr) {
  const m = String(dataBr).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, dd, mm, ano] = m;
  const aaaa = ano.length === 2 ? `20${ano}` : ano;
  const aa = aaaa.slice(-2);
  return { curto: `${dd}/${mm}/${aa}`, longo: `${dd}/${mm}/${aaaa}` };
}

// Formata a data/hora atual do servidor como "dd/mm/aa hh:mm", usado
// tanto para registrar a tentativa quanto para preencher o resultado
// automático ao dar baixa com sucesso.
function agoraFormatado() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const hh = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');
  return { data: `${dd}/${mm}/${aa}`, horario: `${hh}:${min}`, texto: `${dd}/${mm}/${aa} ${hh}:${min}` };
}

// GET /api/agenda/hoje?data=dd/mm/aa
// Sem o parâmetro "data", mostra o dia de hoje (comportamento original).
// Com ele, mostra a agenda daquele dia específico — usado pelo seletor
// de data da Agenda para consultar outros dias além de hoje.
router.get('/hoje', (req, res) => {
  const dataConsultada = (req.query.data || '').trim();
  const { curto, longo } = dataConsultada
    ? (ambosFormatosDe(dataConsultada) || hojeEmAmbosFormatos())
    : hojeEmAmbosFormatos();

  // No dia de hoje, a Agenda funciona como lista de tarefas: só mostra o
  // que ainda está pendente (sem resultado). Em outros dias, é consulta
  // histórica — mostra tudo que estava marcado, resolvido ou não.
  const { curto: curtoHoje, longo: longoHoje } = hojeEmAmbosFormatos();
  const consultandoHoje = !dataConsultada || curto === curtoHoje || curto === longoHoje || longo === curtoHoje || longo === longoHoje;

  const fonadasBrutas = db.prepare(`
    SELECT id, senha_os, nome_comprador, cliente_id,
           p1_dia, p1_para, p1_tema, p1_horario, p1_celular, p1_fixo, p1_resultado,
           p2_dia, p2_para, p2_tema, p2_horario, p2_celular, p2_fixo, p2_resultado
    FROM fonadas
    WHERE excluido_em IS NULL AND (p1_dia IN (?, ?) OR p2_dia IN (?, ?))
  `).all(curto, longo, curto, longo);

  const itensFonada = [];
  for (const f of fonadasBrutas) {
    if ((f.p1_dia === curto || f.p1_dia === longo) && dataCompleta(f.p1_dia) && (!consultandoHoje || !f.p1_resultado)) {
      itensFonada.push({
        pedidoId: f.id, mensagem: 1, senha_os: f.senha_os, nome_comprador: f.nome_comprador,
        cliente_id: f.cliente_id, para: f.p1_para, tema: f.p1_tema, horario: f.p1_horario,
        celular: f.p1_celular, fixo: f.p1_fixo, resultado: f.p1_resultado,
      });
    }
    if ((f.p2_dia === curto || f.p2_dia === longo) && dataCompleta(f.p2_dia) && (!consultandoHoje || !f.p2_resultado)) {
      itensFonada.push({
        pedidoId: f.id, mensagem: 2, senha_os: f.senha_os, nome_comprador: f.nome_comprador,
        cliente_id: f.cliente_id, para: f.p2_para, tema: f.p2_tema, horario: f.p2_horario,
        celular: f.p2_celular, fixo: f.p2_fixo, resultado: f.p2_resultado,
      });
    }
  }
  itensFonada.sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));

  const aoVivoBrutos = db.prepare(`
    SELECT id, numero_os, comprador, cliente_id, para, dia_entrega, horario_entrega,
           endereco, bairro, referencia
    FROM ao_vivo
    WHERE excluido_em IS NULL AND dia_entrega IN (?, ?)
  `).all(curto, longo);

  const itensAoVivo = aoVivoBrutos
    .filter((a) => dataCompleta(a.dia_entrega))
    .sort((a, b) => (a.horario_entrega || '').localeCompare(b.horario_entrega || ''));

  res.json({ data: curto, fonada: itensFonada, aoVivo: itensAoVivo });
});

// POST /api/agenda/fonada/:id/baixa
// Dá baixa numa mensagem específica (1 ou 2) de um pacote fonada — a
// mensagem foi passada com sucesso. Preenche automaticamente o campo de
// resultado com "MENSAGEM PASSADA, dd/mm/aa às hh:mm" usando a data/hora
// atual do servidor (não aceita texto vindo do cliente, para garantir
// que o registro é sempre fiel ao momento real da baixa).
router.post('/fonada/:id/baixa', (req, res) => {
  const { mensagem } = req.body;
  if (mensagem !== 1 && mensagem !== 2) {
    return res.status(400).json({ erro: 'Informe qual mensagem (1 ou 2).' });
  }

  const existe = db.prepare('SELECT id FROM fonadas WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ erro: 'Pedido não encontrado.' });

  const { data, horario } = agoraFormatado();

  // Busca o nome completo de quem está logado (vindo do token) para
  // registrar quem deu a baixa, junto com a data/hora automática.
  const usuarioLogado = db.prepare('SELECT nome, usuario FROM usuarios WHERE id = ?').get(req.usuario.id);
  const nomeExibicao = usuarioLogado ? (usuarioLogado.nome || usuarioLogado.usuario) : req.usuario.usuario;

  const resultado = `MENSAGEM PASSADA, ${data} às ${horario} por ${nomeExibicao}`;

  const coluna = mensagem === 1 ? 'p1_resultado' : 'p2_resultado';
  db.prepare(`UPDATE fonadas SET ${coluna} = ?, atualizado_em = datetime('now') WHERE id = ?`)
    .run(resultado, req.params.id);

  res.json({ ok: true, resultado });
});

// POST /api/agenda/fonada/:id/nao-atendeu
// Registra uma tentativa de contato sem sucesso (o horário da tentativa
// é sempre o horário atual do servidor, não confia em nada vindo do
// cliente) e remarca a mensagem para o novo dia/horário informado.
// O pedido original é atualizado (p1_dia/p1_horario ou p2_dia/p2_horario)
// para que a Agenda passe a considerar a nova data — mas a tentativa em
// si fica guardada para sempre em tentativas_contato, para consulta.
router.post('/fonada/:id/nao-atendeu', (req, res) => {
  const { mensagem, observacao, remarcadoDia, remarcadoHorario } = req.body;

  if (mensagem !== 1 && mensagem !== 2) {
    return res.status(400).json({ erro: 'Informe qual mensagem (1 ou 2).' });
  }
  if (!remarcadoDia || !remarcadoHorario) {
    return res.status(400).json({ erro: 'Informe o novo dia e horário para remarcar.' });
  }

  const pedido = db.prepare('SELECT id FROM fonadas WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

  const { texto } = agoraFormatado();
  const colunaDia = mensagem === 1 ? 'p1_dia' : 'p2_dia';
  const colunaHorario = mensagem === 1 ? 'p1_horario' : 'p2_horario';

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO tentativas_contato (pedido_id, mensagem, data_hora_tentativa, observacao, remarcado_dia, remarcado_horario)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.id, mensagem, texto, observacao || null, remarcadoDia, remarcadoHorario);

    db.prepare(`
      UPDATE fonadas SET ${colunaDia} = ?, ${colunaHorario} = ?, atualizado_em = datetime('now') WHERE id = ?
    `).run(remarcadoDia, remarcadoHorario, req.params.id);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ erro: 'Não foi possível registrar a tentativa.' });
  }

  res.json({ ok: true });
});

// GET /api/agenda/fonada/:id/tentativas
// Retorna o histórico completo de tentativas de contato de um pedido,
// mais recentes primeiro — usado tanto na Agenda quanto no cadastro do
// pedido, para consulta caso o comprador ligue reclamando.
router.get('/fonada/:id/tentativas', (req, res) => {
  const tentativas = db.prepare(`
    SELECT * FROM tentativas_contato WHERE pedido_id = ? ORDER BY id DESC
  `).all(req.params.id);
  res.json({ tentativas });
});

module.exports = router;
