const { dataCurtaValida } = require('./validarDataCurta');

// A data reagendada na cobrança prevalece sobre a data combinada na venda.
const DATA_RECEBIMENTO_SQL = `COALESCE(NULLIF(TRIM(data_cobranca), ''),
  SUBSTRING(pagamento FROM '(?i)PRAZO\\s*-\\s*DIA\\s*(\\d{2}/\\d{2}/(?:\\d{4}|\\d{2}))'))`;

async function recebimentosAgenda(db, datas) {
  const { rows } = await db.query(`
    SELECT id, numero_os, comprador, cliente_id, para, valor, pagamento,
           ${DATA_RECEBIMENTO_SQL} AS dia_recebimento
    FROM ao_vivo
    WHERE excluido_em IS NULL AND UPPER(TRIM(COALESCE(pagou, ''))) <> 'SIM'
      AND TRIM(pagamento) ~* '^PRAZO(\\s|-|$)'
      AND ${DATA_RECEBIMENTO_SQL} = ANY($1::text[])
  `, [datas]);
  return rows.filter(item => dataCurtaValida(item.dia_recebimento) && datas.includes(item.dia_recebimento))
    .map(item => ({ ...item, ehCobranca: true, passada: false, horario_entrega: '' }));
}

module.exports = { recebimentosAgenda };
