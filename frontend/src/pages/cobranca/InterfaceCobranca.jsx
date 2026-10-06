import React from 'react';

export function IconeCobranca({ tipo, ...props }) {
  const formas = {
    fonada: <path d="M6 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-2l-5-2-2 2a14 14 0 0 1-8-8l2-2-2-5Z" />,
    aovivo: <><path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13" /><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z" /></>,
    total: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M15 14h3" /></>,
    atrasada: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16h.01" /></>,
    hoje: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M9 15h6" /></>,
    futura: <><path d="M4 17 10 11l4 4 6-10M14 5h6v6" /></>,
    recebida: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    pesquisa: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{formas[tipo] || formas.total}</svg>;
}

export function ResumoCobranca({ titulo, valor, quantidade, classe, ativo, onClick }) {
  const reais = Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return <button type="button" className={`resumo-cobranca-operacional ${classe}${ativo ? ' ativo' : ''}`} aria-pressed={ativo} onClick={onClick}>
    <span className="cb-resumo-topo"><span>{titulo}</span><i><IconeCobranca tipo={classe} /></i></span>
    <strong>{reais}</strong><small>{quantidade} pedido{quantidade !== 1 ? 's' : ''}</small>
  </button>;
}

export function CabecalhoPesquisa({ onLimpar, temFiltros }) {
  return <div className="cb-pesquisa-cabecalho"><div><span className="cb-icone-pesquisa"><IconeCobranca tipo="pesquisa" /></span><h2>Encontre uma cobrança</h2></div>
    {temFiltros && <button type="button" className="cb-limpar" onClick={onLimpar}>Limpar filtros</button>}
  </div>;
}

export function CabecalhoResultados({ titulo, quantidade, valor, children }) {
  return <div className="cb-resultados-cabecalho nao-imprimir"><div><span className="cb-sobretitulo">Resultado da pesquisa</span><h2>{titulo}</h2><p>{quantidade} pedido{quantidade !== 1 ? 's' : ''}<span aria-hidden="true"> · </span>{Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div><div className="cb-resultados-acoes">{children}</div></div>;
}
