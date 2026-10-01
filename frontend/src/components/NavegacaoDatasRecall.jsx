import React, { useState } from 'react';

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
function somarDias(iso, quantidade) {
  const data = new Date(`${iso}T12:00:00`);
  data.setDate(data.getDate() + quantidade);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

export default function NavegacaoDatasRecall({ data, onChange }) {
  const referencia = hoje();
  const [inicio, setInicio] = useState(() => Math.max(-7, Math.min(0, Math.round((new Date(`${data}T12:00:00`) - new Date(`${referencia}T12:00:00`)) / 86400000) || 0)));
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(referencia, inicio + i));
  return <div className="recall-dias-navegacao">
    <button type="button" className="recall-dias-seta" onClick={() => setInicio((v) => Math.max(-7, v - 1))} disabled={inicio <= -7} aria-label="Mostrar dias anteriores" title="Mostrar dias anteriores">←</button>
    <div className="recall-dias">{dias.map((dia) => {
      const valor = new Date(`${dia}T12:00:00`);
      const rotulo = dia === referencia ? 'Hoje' : dia === somarDias(referencia, 1) ? 'Amanhã' : valor.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      return <button key={dia} type="button" className={dia === data ? 'ativo' : ''} aria-pressed={dia === data} aria-label={`Selecionar ${valor.toLocaleDateString('pt-BR')}`} onClick={() => onChange(dia)}><small>{rotulo}</small><strong>{valor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</strong></button>;
    })}</div>
    <button type="button" className="recall-dias-seta" onClick={() => setInicio((v) => Math.min(0, v + 1))} disabled={inicio >= 0} aria-label="Mostrar dias seguintes" title="Mostrar dias seguintes">→</button>
  </div>;
}
