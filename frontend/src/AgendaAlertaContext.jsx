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

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AgendaAlertaContext = createContext(null);

const INTERVALO_BUSCA_MS = 30000;
const INTERVALO_RECALCULO_MS = 1000;
const LIMIAR_PROXIMA_MINUTOS = 10;

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
