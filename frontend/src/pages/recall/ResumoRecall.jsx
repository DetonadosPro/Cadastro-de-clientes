import React from 'react';

export default function ResumoRecall({itens,modo,unidade}) {
  const aniversariantes=new Set(itens.map(i=>i.aniversariante)).size;
  const anteriores=itens.reduce((total,item)=>total+(item.quantidade||0),0);
  return <section className="recall-resumo" aria-label="Resumo da pesquisa">
    <div className="recall-resumo-intro"><span>Pesquisa {modo==='ANIVERSARIO'?'2':'1'}</span><strong>{modo==='ANIVERSARIO'?'Aniversário do cliente':'Dia da mensagem'}</strong><p>{modo==='ANIVERSARIO'?'Destinatários anteriores para contatar o cliente aniversariante.':'Compradores com homenagens nesta data em anos anteriores.'}</p></div>
    <div className="recall-resumo-numeros"><div><strong>{itens.length}</strong><span>Relações</span></div><div><strong>{aniversariantes}</strong><span>{unidade==='Pedidos'&&modo!=='ANIVERSARIO'?'Homenageados':'Aniversariantes'}</span></div><div><strong>{anteriores}</strong><span>{unidade} anteriores</span></div></div>
  </section>;
}
