// Datas de compras antigas são texto e podem conter valores impossíveis.
// Só ordenamos pelo calendário validado. NULL mantém essas compras ao final,
// sem transformar a data de importação em uma data de venda.
const data = 'btrim(data_pedido)';
const dia = `left(${data}, 2)::integer`;
const mes = `substring(${data} from 4 for 2)::integer`;
const ano = `(CASE WHEN length(${data}) = 8 THEN 2000 + right(${data}, 2)::integer ELSE right(${data}, 4)::integer END)`;

const DATA_PEDIDO_ORDENACAO_SQL = `
  CASE WHEN ${data} ~ '^\\d{2}/\\d{2}/(\\d{2}|\\d{4})$' THEN
    CASE WHEN ${ano} BETWEEN 1 AND 9999
      AND ${mes} BETWEEN 1 AND 12
      AND ${dia} BETWEEN 1 AND CASE
        WHEN ${mes} = 2 THEN CASE
          WHEN ${ano} % 400 = 0 OR (${ano} % 4 = 0 AND ${ano} % 100 != 0) THEN 29
          ELSE 28
        END
        WHEN ${mes} IN (4, 6, 9, 11) THEN 30
        ELSE 31
      END
    THEN ${ano} * 10000 + ${mes} * 100 + ${dia}
    END
  END`;

module.exports = { DATA_PEDIDO_ORDENACAO_SQL };
