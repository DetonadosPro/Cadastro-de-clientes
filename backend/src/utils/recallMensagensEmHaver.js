const { situacaoSegundaMensagem } = require('./mensagemEmHaver');

async function anexarMensagensEmHaver(grupos, consultar, referencia) {
  const ids = [...new Set(grupos.map((grupo) => grupo.clienteId).filter(Boolean))];
  const porCliente = new Map();
  if (ids.length) {
    const resultado = await consultar(`SELECT f.* FROM fonadas f
      JOIN clientes c ON c.id=f.cliente_id AND c.excluido_em IS NULL
      WHERE f.excluido_em IS NULL AND f.cliente_id=ANY($1::int[])
        AND COALESCE(TRIM(f.p2_resultado),'')=''`, [ids]);
    for (const pedido of resultado.rows) {
      const situacao = situacaoSegundaMensagem(pedido, referencia);
      if (!situacao.disponivel) continue;
      if (!porCliente.has(pedido.cliente_id)) porCliente.set(pedido.cliente_id, []);
      porCliente.get(pedido.cliente_id).push({ pedidoId: pedido.id, os: pedido.senha_os, dataExpiracao: situacao.dataExpiracao });
    }
  }
  return grupos.map((grupo) => ({ ...grupo,
    mensagensEmHaver: grupo.clienteId ? (porCliente.get(grupo.clienteId) || []) : null,
  }));
}

module.exports = { anexarMensagensEmHaver };
