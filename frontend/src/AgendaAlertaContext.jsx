// src/AgendaAlertaContext.jsx
//
// Centraliza a busca periódica da Agenda de hoje (usada para calcular
// alertas de urgência) em UM único lugar — antes, o Layout (bolinha do
// menu) e a tela Agenda (borda dos cards) cada um tinha seu próprio
// temporizador de 30s, começando em instantes diferentes, então a
// bolinha e a borda podiam mudar de cor em momentos levemente
// diferentes mesmo usando a mesma regra de 10 minutos.
//
// Com os dois consumindo deste contexto, ambos recalculam a partir do
// mesmo dado buscado no mesmo instante, ficando sempre sincronizados —
// e como fica sendo uma única chamada à API (não duas), o custo de
// rede/servidor cai à metade do que era antes.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AgendaAlertaContext = createContext(null);

const INTERVALO_VERIFICACAO_MS = 1000;
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
    if (item.passada) continue;
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

  useEffect(() => {
    let cancelado = false;

    function verificar() {
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

    verificar();
    const intervalo = setInterval(verificar, INTERVALO_VERIFICACAO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
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
