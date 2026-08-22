// src/AgendaAlertaContext.jsx
//
// Centraliza os dados da Agenda de hoje (usados para calcular alertas
// de urgência) em UM único lugar, compartilhado pela bolinha do menu
// (Layout) e pelas bordas dos cards na tela Agenda — assim os dois
// ficam sempre exibindo a mesma cor, em vez de cada um calcular por
// conta própria com timers desalinhados.
//
// Dois relógios diferentes, de propósito:
// - BUSCA DE DADOS (rede): a cada 30s, busca no servidor se há pedidos
//   novos ou se algum já foi baixado. Não precisa ser mais rápido que
//   isso — a lista de pedidos do dia não muda a todo instante.
// - RECÁLCULO LOCAL (sem rede): a cada 1s, apenas relê o relógio do
//   próprio computador e recalcula as cores a partir dos dados já em
//   memória. Como não depende de nenhuma resposta de rede, a mudança
//   de cor é instantânea — sem a pequena espera de uma requisição.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useToast } from './ToastContext.jsx';

const AgendaAlertaContext = createContext(null);

const INTERVALO_BUSCA_MS = 30000;
const INTERVALO_RECALCULO_MS = 1000;
const LIMIAR_PROXIMA_MINUTOS = 10;
const INTERVALO_REPETICAO_SOM_MS = 3 * 60 * 1000;

// Diferença em minutos entre um horário "hh:mm" e "agora". Retorna null
// se o horário estiver vazio ou mal formatado.
function minutosAteHorario(horarioStr, agora) {
  const m = String(horarioStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, hh, mm] = m;
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const minutosItem = parseInt(hh, 10) * 60 + parseInt(mm, 10);
  return minutosItem - minutosAgora;
}

// Status de urgência de um item específico (usado pelas bordas dos
// cards): 'atrasada', 'proxima', ou null (sem destaque).
export function statusUrgenciaItem(horarioStr) {
  const diff = minutosAteHorario(horarioStr, new Date());
  if (diff === null) return null;
  if (diff < 0) return 'atrasada';
  if (diff <= LIMIAR_PROXIMA_MINUTOS) return 'proxima';
  return null;
}

// Lista os itens atualmente atrasados (fonada + ao vivo) — usada para
// saber quantos estão atrasados agora e disparar o alerta sonoro
// quando essa contagem aumenta.
function itensAtrasados(itensFonada, itensAoVivo) {
  const agora = new Date();
  const atrasados = [];

  for (const item of itensFonada) {
    if (item.passada) continue;
    const diff = minutosAteHorario(item.horario, agora);
    if (diff !== null && diff < 0) {
      atrasados.push(`fonada-${item.pedidoId}-${item.mensagem}`);
    }
  }
  for (const item of itensAoVivo) {
    if (item.passada || item.ehCobranca) continue;
    const diff = minutosAteHorario(item.horario_entrega, agora);
    if (diff !== null && diff < 0) {
      atrasados.push(`aovivo-${item.id}`);
    }
  }

  return atrasados;
}

// Cor agregada para a bolinha do menu, considerando fonada + ao vivo
// juntos (vermelho se qualquer um estiver atrasado, laranja se algum
// estiver próximo, senão null).
function corAgregada(itensFonada, itensAoVivo) {
  let temAtrasada = false;
  let temProxima = false;
  const agora = new Date();

  for (const item of itensFonada) {
    if (item.passada) continue;
    const diff = minutosAteHorario(item.horario, agora);
    if (diff === null) continue;
    if (diff < 0) temAtrasada = true;
    else if (diff <= LIMIAR_PROXIMA_MINUTOS) temProxima = true;
  }
  for (const item of itensAoVivo) {
    if (item.passada || item.ehCobranca) continue;
    const diff = minutosAteHorario(item.horario_entrega, agora);
    if (diff === null) continue;
    if (diff < 0) temAtrasada = true;
    else if (diff <= LIMIAR_PROXIMA_MINUTOS) temProxima = true;
  }

  if (temAtrasada) return 'vermelho';
  if (temProxima) return 'laranja';
  return null;
}

// Beep curto sintetizado via Web Audio API — evita depender de um
// arquivo de áudio externo. Toca 3 vezes em sequência, com um
// pequeno intervalo entre cada uma, para chamar mais atenção que um
// beep único. Falha silenciosamente se o navegador bloquear áudio
// automático (política comum antes de qualquer interação do usuário
// na aba) — o toast visual continua funcionando normalmente sem som.
function tocarBeep() {
  try {
    const AudioContextClasse = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClasse) return;
    const ctx = new AudioContextClasse();
    const duracaoBeep = 0.35;
    const espacoEntreBeeps = 0.15;

    for (let i = 0; i < 3; i++) {
      const inicio = ctx.currentTime + i * (duracaoBeep + espacoEntreBeeps);
      const oscilador = ctx.createOscillator();
      const ganho = ctx.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = 880;
      ganho.gain.setValueAtTime(0.15, inicio);
      ganho.gain.exponentialRampToValueAtTime(0.001, inicio + duracaoBeep);
      oscilador.connect(ganho);
      ganho.connect(ctx.destination);
      oscilador.start(inicio);
      oscilador.stop(inicio + duracaoBeep);
    }

    const duracaoTotal = 3 * (duracaoBeep + espacoEntreBeeps);
    setTimeout(() => ctx.close(), duracaoTotal * 1000 + 100);
  } catch {
    // Silencioso — som é um extra, não deve quebrar nada se falhar.
  }
}

export function AgendaAlertaProvider({ children }) {
  const [fonadaHoje, setFonadaHoje] = useState([]);
  const [aoVivoHoje, setAoVivoHoje] = useState([]);
  // Só serve para forçar uma nova renderização a cada segundo — o valor
  // em si não é usado, é apenas o "pulso" que faz o React reavaliar
  // corAgregada()/statusUrgenciaItem() com o relógio atualizado.
  const [, forcarRecalculo] = useState(0);

  // Busca os dados no servidor periodicamente (rede).
  useEffect(() => {
    let cancelado = false;

    function buscar() {
      api.agenda.hoje()
        .then((resp) => {
          if (cancelado) return;
          setFonadaHoje(resp.fonada || []);
          setAoVivoHoje(resp.aoVivo || []);
        })
        .catch(() => {
          // Falha silenciosa — o alerta é só um indicativo visual, não
          // deve interromper o uso do resto do sistema se a rede falhar.
        });
    }

    buscar();
    const intervalo = setInterval(buscar, INTERVALO_BUSCA_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  // Recalcula localmente a cada 1s, sem nenhuma chamada de rede — só
  // relê o relógio do computador contra os dados já carregados.
  useEffect(() => {
    const intervalo = setInterval(() => forcarRecalculo((n) => n + 1), INTERVALO_RECALCULO_MS);
    return () => clearInterval(intervalo);
  }, []);

  const alertaMenu = corAgregada(fonadaHoje, aoVivoHoje);
  const atrasados = itensAtrasados(fonadaHoje, aoVivoHoje);

  // Alerta sonoro + toast: toca uma vez assim que a contagem de
  // atrasados aumenta (item novo atrasando), e depois repete a cada 5
  // minutos enquanto a lista de atrasados continuar não-vazia — mesmo
  // que a contagem não mude nesse meio tempo, é um lembrete de que
  // ainda há algo pendente. Resolver todos os atrasos (contagem volta
  // a 0) reseta o ciclo, para o próximo atraso soar imediatamente.
  //
  // Guardado em refs (não state) porque o pulso de recálculo já roda
  // a cada 1s — usar state aqui geraria re-render extra sem necessidade;
  // o que importa é só decidir, a cada pulso, se toca o alerta agora.
  const { mostrarToast } = useToast();
  const contagemAnteriorRef = useRef(0);
  const ultimoSomEmRef = useRef(0);

  useEffect(() => {
    const contagemAtual = atrasados.length;
    const agora = Date.now();

    if (contagemAtual === 0) {
      contagemAnteriorRef.current = 0;
      ultimoSomEmRef.current = 0;
      return;
    }

    const primeiroAtrasoDoCiclo = ultimoSomEmRef.current === 0;
    const aumentou = contagemAtual > contagemAnteriorRef.current;
    const jaPassouIntervalo = agora - ultimoSomEmRef.current >= INTERVALO_REPETICAO_SOM_MS;

    if (primeiroAtrasoDoCiclo || aumentou || jaPassouIntervalo) {
      tocarBeep();
      mostrarToast(
        contagemAtual === 1
          ? '1 mensagem está atrasada na Agenda.'
          : `${contagemAtual} mensagens estão atrasadas na Agenda.`,
        'erro'
      );
      ultimoSomEmRef.current = agora;
    }

    contagemAnteriorRef.current = contagemAtual;
    // Este efeito roda a cada pulso de recálculo (1s) — de propósito,
    // é o que permite tanto reagir a um aumento imediato de atrasados
    // quanto checar, a cada segundo, se já passou o intervalo de
    // repetição de 5 minutos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  return (
    <AgendaAlertaContext.Provider value={{ alertaMenu, fonadaHoje, aoVivoHoje }}>
      {children}
    </AgendaAlertaContext.Provider>
  );
}

export function useAgendaAlerta() {
  const ctx = useContext(AgendaAlertaContext);
  if (!ctx) throw new Error('useAgendaAlerta precisa estar dentro de AgendaAlertaProvider');
  return ctx;
}
