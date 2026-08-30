import React, { useEffect, useState } from 'react';

const PASSO_LISTA = 50;

export function useListaIncremental(itens = [], chave = '') {
  const [limite, setLimite] = useState(PASSO_LISTA);

  useEffect(() => setLimite(PASSO_LISTA), [chave]);

  return {
    itensVisiveis: itens.slice(0, limite),
    limite,
    temMais: itens.length > limite,
    restantes: Math.max(itens.length - limite, 0),
    mostrarMais: () => setLimite((atual) => atual + PASSO_LISTA),
  };
}

export function BotaoMostrarMais({ temMais, restantes, onClick, rotulo = 'Mostrar mais' }) {
  if (!temMais) return null;
  return (
    <div className="lista-mostrar-mais nao-imprimir">
      <button type="button" className="btn secundario" onClick={onClick}>
        {rotulo} (+{Math.min(PASSO_LISTA, restantes)} de {restantes} restante{restantes === 1 ? '' : 's'})
      </button>
    </div>
  );
}
