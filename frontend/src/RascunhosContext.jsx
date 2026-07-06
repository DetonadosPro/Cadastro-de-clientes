// src/RascunhosContext.jsx
//
// Guarda o "rascunho" (formulário ainda não salvo) de cada sistema
// (fonada e ao vivo) num estado que vive acima das telas — assim,
// se você está preenchendo um pedido de fonada, troca pra tela de
// ao vivo pra atender outro cliente, e depois volta pra fonada, o
// que você tinha digitado continua lá, exatamente como deixou.
//
// Cada tela de formulário só lê/escreve nesse estado compartilhado
// em vez de guardar tudo sozinha com useState local.

import React, { createContext, useContext, useState, useCallback } from 'react';

const RascunhosContext = createContext(null);

export function RascunhosProvider({ children }) {
  // Guarda até um rascunho por sistema, indexado por "novo" ou pelo id do registro em edição.
  const [rascunhoFonada, setRascunhoFonada] = useState(null);
  const [rascunhoAoVivo, setRascunhoAoVivo] = useState(null);

  const limparRascunhoFonada = useCallback(() => setRascunhoFonada(null), []);
  const limparRascunhoAoVivo = useCallback(() => setRascunhoAoVivo(null), []);

  return (
    <RascunhosContext.Provider
      value={{
        rascunhoFonada,
        setRascunhoFonada,
        limparRascunhoFonada,
        rascunhoAoVivo,
        setRascunhoAoVivo,
        limparRascunhoAoVivo,
      }}
    >
      {children}
    </RascunhosContext.Provider>
  );
}

export function useRascunhos() {
  const ctx = useContext(RascunhosContext);
  if (!ctx) throw new Error('useRascunhos precisa estar dentro de RascunhosProvider');
  return ctx;
}
