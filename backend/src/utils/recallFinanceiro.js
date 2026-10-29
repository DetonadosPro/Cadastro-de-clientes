const { dataBrParaIso } = require('./recall');
const { dataCurtaValida } = require('./validarDataCurta');

// Consulta única por fila, sempre pela ficha do contato (não do homenageado).
async function anexarFinanceiroRecall(grupos, consultar) {
  const ids = [...new Set(grupos.map(g => g.clienteId).filter(Boolean))];
  const porCliente = new Map(ids.map(id => [String(id), []]));
  if (ids.length) {
    const resultado = await consultar(String.raw`/* recall_financeiro */
      SELECT f.id, f.cliente_id, f.senha_os os, 'FONADA' tipo, f.valor,
        COALESCE(NULLIF(TRIM(f.cobranca_reagendada),''), f.cobranca) data,
        GREATEST(1, (CASE WHEN COALESCE(TRIM(f.p1_para),'')<>'' THEN 1 ELSE 0 END)
          + (CASE WHEN COALESCE(TRIM(f.p2_para),'')<>'' THEN 1 ELSE 0 END)) mensagens
      FROM fonadas f JOIN clientes c ON c.id=f.cliente_id AND c.excluido_em IS NULL
      WHERE f.excluido_em IS NULL AND f.cliente_id=ANY($1::int[])
        AND COALESCE(f.pagou,'')<>'SIM' AND f.valor>0
      UNION ALL
      SELECT a.id, a.cliente_id, a.numero_os, 'AOVIVO', a.valor,
        COALESCE(NULLIF(TRIM(a.data_cobranca),''),
          SUBSTRING(a.pagamento FROM '(?i)PRAZO\s*-\s*DIA\s*(\d{2}/\d{2}/(?:\d{4}|\d{2}))'),
          a.dia_entrega), 1
      FROM ao_vivo a JOIN clientes c ON c.id=a.cliente_id AND c.excluido_em IS NULL
      WHERE a.excluido_em IS NULL AND a.cliente_id=ANY($1::int[])
        AND COALESCE(a.pagou,'')<>'SIM' AND a.valor>0`, [ids]);
    for (const pedido of resultado.rows) {
      if (!porCliente.has(String(pedido.cliente_id))) continue;
      const valor = Number(pedido.valor);
      if (!Number.isFinite(valor) || valor <= 0) continue;
      porCliente.get(String(pedido.cliente_id)).push({
        pedidoId: pedido.id, os: pedido.os, tipo: pedido.tipo,
        valor, data: dataCurtaValida(pedido.data) ? String(pedido.data).trim() : null,
        mensagens: Number(pedido.mensagens) || 1,
      });
    }
  }
  const resumos = new Map();
  for (const [id, pedidos] of porCliente) {
    pedidos.sort((a, b) => (dataBrParaIso(a.data) || '9999').localeCompare(dataBrParaIso(b.data) || '9999') || a.pedidoId - b.pedidoId);
    resumos.set(id, {
      valorTotal: pedidos.reduce((centavos, p) => centavos + Math.round(p.valor * 100), 0) / 100,
      quantidadeMensagens: pedidos.reduce((total, p) => total + p.mensagens, 0),
      proximaData: pedidos.find(p => p.data)?.data || null,
      pedidos,
    });
  }
  return grupos.map(g => ({ ...g, financeiro: resumos.get(String(g.clienteId)) || null }));
}

module.exports = { anexarFinanceiroRecall };
