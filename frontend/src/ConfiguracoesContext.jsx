import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken } from './api.js';
import { useAtualizacaoTempoReal } from './TempoRealContext.jsx';
const Contexto = createContext(null);
export function ConfiguracoesProvider({ children }) {
  const [configuracoes, setConfiguracoes] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  async function recarregar() {
    if (!getToken()) { setConfiguracoes(null); setCarregando(false); return; }
    setCarregando(true);
    try { setConfiguracoes(await api.configuracoes.buscar()); setErro(''); }
    catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }
  useEffect(() => {
    recarregar();
    window.addEventListener('pombo:sessao-alterada', recarregar);
    return () => window.removeEventListener('pombo:sessao-alterada', recarregar);
  }, []);
  useAtualizacaoTempoReal(['configuracoes'], recarregar);
  return <Contexto.Provider value={{ configuracoes, setConfiguracoes, erro, carregando, recarregar }}>{children}</Contexto.Provider>;
}
export function useConfiguracoes() { return useContext(Contexto); }
