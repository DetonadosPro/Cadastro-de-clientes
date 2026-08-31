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
  const ultimaVersaoRef = useRef(null);
  const instanciaServidorRef = useRef(null);

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
        await lerEventosSse(
          resposta,
          (recebido) => {
            if (Number.isFinite(recebido.versao)) ultimaVersaoRef.current = recebido.versao;
            if (recebido.instancia) instanciaServidorRef.current = recebido.instancia;
            if (recebido.origem !== ID_TELA) setEvento({ ...recebido, chave: `${Date.now()}-${Math.random()}` });
          },
          (conexao) => {
            const jaEstavaConectado = instanciaServidorRef.current !== null;
            const servidorReiniciou = jaEstavaConectado && conexao.instancia !== instanciaServidorRef.current;
            const perdeuAtualizacao = jaEstavaConectado
              && Number.isFinite(conexao.versao)
              && Number.isFinite(ultimaVersaoRef.current)
              && conexao.versao > ultimaVersaoRef.current;
            instanciaServidorRef.current = conexao.instancia || instanciaServidorRef.current;
            ultimaVersaoRef.current = Number.isFinite(conexao.versao) ? conexao.versao : ultimaVersaoRef.current;
            // A primeira conexão não invalida a tela: ela já está fazendo
            // sua carga inicial. Só sincroniza se a aba realmente perdeu
            // uma alteração ou se o processo do backend foi substituído.
            if (servidorReiniciou || perdeuAtualizacao) {
              setEvento({
                topico: 'sistema',
                topicos: ['clientes', 'fonadas', 'ao-vivo', 'agenda', 'cobranca', 'relatorios', 'recall'],
                recurso: '/reconexao',
                metodo: 'SINCRONIZAR',
                chave: `${Date.now()}-${Math.random()}`,
              });
            }
          }
        );
      } catch (erro) {
        if (erro.name === 'AbortError' || encerrado) return;
      }
      if (!encerrado) {
        const esperaComDispersao = Math.round(espera * (0.7 + Math.random() * 0.6));
        temporizadorReconexao = setTimeout(conectar, esperaComDispersao);
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
    let verificando = false;

    async function verificar() {
      if (cancelado || verificando) return;
      verificando = true;
      try {
        const url = new URL('/version.json', window.location.origin);
        url.searchParams.set('t', Date.now());
        const resposta = await fetch(url, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!resposta.ok) return;
        const dados = await resposta.json();
        if (cancelado || !dados.versao) return;
        if (String(dados.versao).trim() !== String(VERSAO_ATUAL).trim()) setNovaVersao(true);
      } catch {
        // Uma falha temporária não interfere no uso do sistema.
      } finally {
        verificando = false;
      }
    }

    function verificarAoRetomar() {
      if (document.visibilityState === 'visible') verificar();
    }

    verificar();
    const intervalo = setInterval(verificar, 15000);
    window.addEventListener('focus', verificar);
    window.addEventListener('online', verificar);
    document.addEventListener('visibilitychange', verificarAoRetomar);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
      window.removeEventListener('focus', verificar);
      window.removeEventListener('online', verificar);
      document.removeEventListener('visibilitychange', verificarAoRetomar);
    };
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
