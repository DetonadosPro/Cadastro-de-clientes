import React, { useEffect, useRef } from 'react';

const reais = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const rotuloMensagens = quantidade => `${quantidade} ${quantidade === 1 ? 'mensagem em aberto' : 'mensagens em aberto'}`;

export function TagDividaRecall({ financeiro }) {
  if (!financeiro?.pedidos?.length) return null;
  return <span className="recall-tag-divida" aria-label={rotuloMensagens(financeiro.quantidadeMensagens)} title={`${rotuloMensagens(financeiro.quantidadeMensagens)} · ${reais(financeiro.valorTotal)}`}>
    {financeiro.quantidadeMensagens} {financeiro.quantidadeMensagens === 1 ? 'msg' : 'msgs'} em aberto
  </span>;
}

export default function FinanceiroRecall({ financeiro, nome, navigate, returnTo }) {
  const referencia = useRef(null);
  useEffect(() => {
    const fechar = evento => {
      if (evento.type === 'keydown' ? evento.key === 'Escape' : !referencia.current?.contains(evento.target)) {
        referencia.current?.removeAttribute('open');
      }
    };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', fechar);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', fechar);
    };
  }, []);
  useEffect(() => { referencia.current?.removeAttribute('open'); }, [nome, financeiro]);
  if (!financeiro?.pedidos?.length) return null;
  const datas = new Set(financeiro.pedidos.map(p => p.data).filter(Boolean));
  const temSemData = financeiro.pedidos.some(p => !p.data);
  const variasDatas = datas.size > 1 || (datas.size > 0 && temSemData);
  return <details ref={referencia} className="recall-financeiro" aria-label={`Valores em aberto de ${nome}`}>
    <summary title={`${rotuloMensagens(financeiro.quantidadeMensagens)}. ${variasDatas ? 'Primeiro vencimento' : 'Pagamento previsto'}: ${financeiro.proximaData || 'sem data'}. Clique para ver os pedidos.`}>
      <span className="recall-financeiro-valor">{reais(financeiro.valorTotal)} <span>em aberto</span></span>
      <span className="recall-financeiro-data">{financeiro.proximaData || 'Sem data'}{variasDatas ? ' +' : ''}</span>
      <span className="recall-financeiro-quantidade" aria-label={rotuloMensagens(financeiro.quantidadeMensagens)}>{financeiro.quantidadeMensagens} {financeiro.quantidadeMensagens === 1 ? 'msg' : 'msgs'}</span>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </summary>
    <div className="recall-financeiro-pedidos"><span className="recall-financeiro-legenda">Pedidos em aberto{variasDatas ? ' · datas de pagamento' : ''}</span>{financeiro.pedidos.map(pedido => <button type="button" key={`${pedido.tipo}-${pedido.pedidoId}`} onClick={() => navigate(`/${pedido.tipo === 'AOVIVO' ? 'ao-vivo' : 'fonada'}/${pedido.pedidoId}`, { state: { returnTo } })}>
      <span><strong>{pedido.tipo === 'AOVIVO' ? 'Ao Vivo' : 'Fonada'} · O.S. {pedido.os || pedido.pedidoId}</strong><small>{pedido.data ? `Pagamento previsto: ${pedido.data}` : 'Pagamento sem data informada'}</small></span><b>{reais(pedido.valor)} <span aria-hidden="true">↗</span></b>
    </button>)}</div>
  </details>;
}
