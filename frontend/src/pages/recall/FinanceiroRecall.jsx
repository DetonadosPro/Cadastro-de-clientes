import React from 'react';

const reais = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const rotuloMensagens = quantidade => `${quantidade} ${quantidade === 1 ? 'mensagem em aberto' : 'mensagens em aberto'}`;

export function TagDividaRecall({ financeiro }) {
  if (!financeiro?.pedidos?.length) return null;
  return <span className="recall-tag-divida" title={`${rotuloMensagens(financeiro.quantidadeMensagens)} · ${reais(financeiro.valorTotal)}`}>
    <span aria-hidden="true">●</span> {rotuloMensagens(financeiro.quantidadeMensagens)}
  </span>;
}

export default function FinanceiroRecall({ financeiro, nome, navigate, returnTo }) {
  if (!financeiro) return null;
  if (!financeiro.pedidos.length) return <div className="recall-financeiro-quitado"><span aria-hidden="true">✓</span> Nenhum valor em aberto</div>;
  const datas = new Set(financeiro.pedidos.map(p => p.data).filter(Boolean));
  const temSemData = financeiro.pedidos.some(p => !p.data);
  const variasDatas = datas.size > 1 || (datas.size > 0 && temSemData);
  return <section className="recall-financeiro" aria-label={`Valores em aberto de ${nome}`}>
    <div className="recall-financeiro-topo"><span className="recall-financeiro-titulo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>Valores em aberto</span><TagDividaRecall financeiro={financeiro}/></div>
    <div className="recall-financeiro-resumo"><div><small>Total do cliente</small><strong>{reais(financeiro.valorTotal)}</strong></div><div className="recall-financeiro-data"><small>{variasDatas ? 'Primeiro vencimento' : 'Pagamento previsto'}</small><strong>{financeiro.proximaData || 'Sem data informada'}</strong>{variasDatas && <span>Há outras datas nos pedidos</span>}</div></div>
    <details className="recall-financeiro-pedidos"><summary>Ver {financeiro.pedidos.length === 1 ? 'pedido em aberto' : `${financeiro.pedidos.length} pedidos em aberto`}<span aria-hidden="true">⌄</span></summary><div>{financeiro.pedidos.map(pedido => <button type="button" key={`${pedido.tipo}-${pedido.pedidoId}`} onClick={() => navigate(`/${pedido.tipo === 'AOVIVO' ? 'ao-vivo' : 'fonada'}/${pedido.pedidoId}`, { state: { returnTo } })}>
      <span><strong>{pedido.tipo === 'AOVIVO' ? 'Ao Vivo' : 'Fonada'} · O.S. {pedido.os || pedido.pedidoId}</strong><small>{pedido.data ? `Pagamento previsto: ${pedido.data}` : 'Pagamento sem data informada'}</small></span><b>{reais(pedido.valor)} <span aria-hidden="true">↗</span></b>
    </button>)}</div></details>
  </section>;
}
