import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { API_BASE, getIdTela, getToken } from './api.js';
import { lerEventosSse } from './utils/sse.js';

const TempoRealContext = createContext(null);
const ID_TELA = getIdTela();
const VERSAO_ATUAL = __APP_VERSION__;

export function TempoRealProvider({ children }) {
  const [evento, setEvento] = useState(null);
  const [novaVersao, setNovaVersao] = useState(false);
  const [revisaoSessao, setRevisaoSessao] = useState(0);

  useEffect(() => {
    const atualizarSessao = () => setRevisaoSessao((atual) => atual + 1);
    window.addEventListener('pombo:sessao-alterada', atualizarSessao);
    return () => window.removeEventListener('pombo:sessao-alterada', atualizarSessao);
  }, []);

  useEffect(() => {
    let encerrado = false;
    let controle;
    let temporizadorReconexao;
    let espera = 1000;

    async function conectar() {
      if (encerrado) return;
      const token = getToken();
      if (!token) return;
      controle = new AbortController();
      try {
        const resposta = await fetch(`${API_BASE}/eventos`, {
          headers: { Authorization: `Bearer ${token}`, 'x-pombo-tela': ID_TELA },
          signal: controle.signal,
        });
        if (!resposta.ok || !resposta.body) throw new Error('Fluxo indisponível');
        espera = 1000;
        await lerEventosSse(resposta, (recebido) => {
          if (recebido.origem !== ID_TELA) setEvento({ ...recebido, chave: `${Date.now()}-${Math.random()}` });
        });
      } catch (erro) {
        if (erro.name === 'AbortError' || encerrado) return;
      }
      if (!encerrado) {
        temporizadorReconexao = setTimeout(conectar, espera);
        espera = Math.min(espera * 2, 15000);
      }
    }

    conectar();
    return () => {
      encerrado = true;
      clearTimeout(temporizadorReconexao);
      controle?.abort();
    };
  }, [revisaoSessao]);

  useEffect(() => {
    let cancelado = false;
    async function verificar() {
      try {
        const resposta = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        const dados = await resposta.json();
        if (cancelado || !dados.versao) return;
        if (dados.versao !== VERSAO_ATUAL) setNovaVersao(true);
      } catch {
        // Uma falha temporária não interfere no uso do sistema.
      }
    }
    verificar();
    const intervalo = setInterval(verificar, 60000);
    return () => { cancelado = true; clearInterval(intervalo); };
  }, []);

  return (
    <TempoRealContext.Provider value={evento}>
      {children}
      {novaVersao && (
        <div className="aviso-nova-versao nao-imprimir" role="status">
          <div><strong>Nova versão disponível</strong><span>Atualize quando terminar o que estiver preenchendo.</span></div>
          <button type="button" onClick={() => window.location.reload()}>Atualizar agora</button>
        </div>
      )}
    </TempoRealContext.Provider>
  );
}

export function useAtualizacaoTempoReal(topicos, callback) {
  const evento = useContext(TempoRealContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const chaveTopicos = Array.isArray(topicos) ? topicos.join('|') : topicos;

  useEffect(() => {
    if (!evento) return;
    const aceitos = String(chaveTopicos || '').split('|').filter(Boolean);
    if (aceitos.some((topico) => evento.topicos?.includes(topico))) callbackRef.current(evento);
  }, [evento, chaveTopicos]);
}
