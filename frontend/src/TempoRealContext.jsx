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
  const [estadoConexao, setEstadoConexao] = useState(() => navigator.onLine ? 'online' : 'offline');
  const temporizadorConexaoRef = useRef(null);

  useEffect(() => {
    function aoFicarOffline() {
      clearTimeout(temporizadorConexaoRef.current);
      setEstadoConexao('offline');
    }

    function aoVoltarOnline() {
      clearTimeout(temporizadorConexaoRef.current);
      setEstadoConexao('reconectado');
      // Reinicia imediatamente o SSE, sem esperar o próximo ciclo de
      // reconexão exponencial que estava em andamento enquanto offline.
      setRevisaoSessao((atual) => atual + 1);
      temporizadorConexaoRef.current = setTimeout(() => setEstadoConexao('online'), 4500);
    }

    window.addEventListener('offline', aoFicarOffline);
    window.addEventListener('online', aoVoltarOnline);
    return () => {
      clearTimeout(temporizadorConexaoRef.current);
      window.removeEventListener('offline', aoFicarOffline);
      window.removeEventListener('online', aoVoltarOnline);
    };
  }, []);

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
      {(estadoConexao !== 'online' || novaVersao) && (
        <div className="avisos-sistema nao-imprimir" aria-live="assertive">
          {estadoConexao !== 'online' && (
            <div className={`aviso-conexao ${estadoConexao}`} role="status">
              <span className="aviso-conexao-icone" aria-hidden="true">
                <i /><i /><i />
              </span>
              <div>
                <strong>{estadoConexao === 'offline' ? 'Você está sem internet' : 'Internet restabelecida'}</strong>
                <span>
                  {estadoConexao === 'offline'
                    ? 'O que já está aberto continua visível, mas não será possível salvar até a conexão voltar.'
                    : 'O sistema voltou a atualizar os dados automaticamente.'}
                </span>
              </div>
            </div>
          )}
          {novaVersao && (
            <div className="aviso-nova-versao" role="status">
              <div><strong>Nova versão disponível</strong><span>Atualize quando terminar o que estiver preenchendo.</span></div>
              <button type="button" onClick={() => window.location.reload()}>Atualizar agora</button>
            </div>
          )}
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
