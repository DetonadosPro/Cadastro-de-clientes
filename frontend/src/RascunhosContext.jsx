import React, { createContext, useContext, useState, useCallback } from 'react';

const RascunhosContext = createContext(null);

export function RascunhosProvider({ children }) {
  const [rascunhosFonada, setRascunhosFonada] = useState({});
  const [rascunhosAoVivo, setRascunhosAoVivo] = useState({});

  const salvarRascunhoFonada = useCallback((chave, dados, cliente, busca) => {
    setRascunhosFonada((atuais) => ({
      ...atuais,
      [chave]: { chave, dados, cliente, criadoEm: atuais[chave]?.criadoEm || Date.now(), busca: busca ?? atuais[chave]?.busca ?? '' },
    }));
  }, []);
  const salvarRascunhoAoVivo = useCallback((chave, dados, cliente, busca) => {
    setRascunhosAoVivo((atuais) => ({
      ...atuais,
      [chave]: { chave, dados, cliente, criadoEm: atuais[chave]?.criadoEm || Date.now(), busca: busca ?? atuais[chave]?.busca ?? '' },
    }));
  }, []);
  const atualizarClienteRascunhoFonada = useCallback((chave, cliente) => {
    setRascunhosFonada((atuais) => atuais[chave]
      ? { ...atuais, [chave]: { ...atuais[chave], cliente } }
      : atuais);
  }, []);
  const atualizarClienteRascunhoAoVivo = useCallback((chave, cliente) => {
    setRascunhosAoVivo((atuais) => atuais[chave]
      ? { ...atuais, [chave]: { ...atuais[chave], cliente } }
      : atuais);
  }, []);
  const limparRascunhoFonada = useCallback((chave) => {
    setRascunhosFonada((atuais) => {
      if (!atuais[chave]) return atuais;
      const proximos = { ...atuais };
      delete proximos[chave];
      return proximos;
    });
  }, []);
  const limparRascunhoAoVivo = useCallback((chave) => {
    setRascunhosAoVivo((atuais) => {
      if (!atuais[chave]) return atuais;
      const proximos = { ...atuais };
      delete proximos[chave];
      return proximos;
    });
  }, []);

  return (
    <RascunhosContext.Provider
      value={{
        rascunhosFonada,
        salvarRascunhoFonada,
        atualizarClienteRascunhoFonada,
        limparRascunhoFonada,
        rascunhosAoVivo,
        salvarRascunhoAoVivo,
        atualizarClienteRascunhoAoVivo,
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
