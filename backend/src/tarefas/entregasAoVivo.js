// Registra automaticamente como entregues os eventos Ao Vivo cujo
// horário terminou há pelo menos 10 minutos. A entrega continua
// independente do pagamento: esta tarefa não altera pagou/data_pagou.

const { db } = require('../db/database');
const { agoraBrasilia } = require('../utils/dataHora');
const { publicar } = require('../tempoReal');

const ATRASO_AUTOMATICO_MINUTOS = 10;

function dataHoraDoEvento(dataTexto, horarioTexto) {
  const data = String(dataTexto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  const horario = String(horarioTexto || '').trim().match(/^(\d{2}):(\d{2})$/);
  if (!data || !horario) return null;

  const dia = Number(data[1]);
  const mes = Number(data[2]);
  const anoInformado = Number(data[3]);
  const ano = data[3].length === 2 ? 2000 + anoInformado : anoInformado;
  const hora = Number(horario[1]);
  const minuto = Number(horario[2]);
  if (hora > 23 || minuto > 59) return null;

  const resultado = new Date(ano, mes - 1, dia, hora, minuto, 0, 0);
  if (
    resultado.getFullYear() !== ano ||
    resultado.getMonth() !== mes - 1 ||
    resultado.getDate() !== dia
  ) return null;

  return resultado;
}

function formatarRegistroAutomatico(agora) {
  const dois = (valor) => String(valor).padStart(2, '0');
  const data = `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${String(agora.getFullYear()).slice(-2)}`;
  const horario = `${dois(agora.getHours())}:${dois(agora.getMinutes())}`;
  return `ENTREGUE AUTOMATICAMENTE, ${data} às ${horario} pelo sistema`;
}

async function marcarEntregasAoVivoAutomaticas() {
  const agora = agoraBrasilia();
  const limite = new Date(agora.getTime() - ATRASO_AUTOMATICO_MINUTOS * 60 * 1000);

  const pendentesResultado = await db.query(`
    SELECT id, dia_entrega, horario_entrega
    FROM ao_vivo
    WHERE excluido_em IS NULL
      AND NULLIF(BTRIM(COALESCE(resultado_entrega, '')), '') IS NULL
      AND NULLIF(BTRIM(COALESCE(dia_entrega, '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(horario_entrega, '')), '') IS NOT NULL
  `);

  const ids = pendentesResultado.rows
    .filter((pedido) => {
      const dataHora = dataHoraDoEvento(pedido.dia_entrega, pedido.horario_entrega);
      return dataHora && dataHora.getTime() <= limite.getTime();
    })
    .map((pedido) => pedido.id);

  if (ids.length === 0) return 0;

  const atualizados = await db.query(`
    UPDATE ao_vivo
    SET resultado_entrega = $1,
        entregue_por = 'SISTEMA',
        atualizado_em = NOW()
    WHERE id = ANY($2::int[])
      AND excluido_em IS NULL
      AND NULLIF(BTRIM(COALESCE(resultado_entrega, '')), '') IS NULL
    RETURNING id
  `, [formatarRegistroAutomatico(agora), ids]);

  if (atualizados.rows.length > 0) {
    console.log(`✅ ${atualizados.rows.length} evento(s) Ao Vivo marcado(s) como entregue(s) automaticamente.`);
    publicar({ topico: 'ao-vivo', recurso: '/tarefas/entregas-automaticas', metodo: 'SISTEMA' });
  }
  return atualizados.rows.length;
}

module.exports = {
  ATRASO_AUTOMATICO_MINUTOS,
  dataHoraDoEvento,
  marcarEntregasAoVivoAutomaticas,
};
