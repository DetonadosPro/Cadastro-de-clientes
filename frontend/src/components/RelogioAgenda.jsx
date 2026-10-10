import { useEffect, useState } from 'react';
import { dataHoraBrasilia } from '../utils/dataHoraBrasilia.js';

export default function RelogioAgenda() {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    const intervalo = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);
  const { horario } = dataHoraBrasilia(agora);
  return (
    <time className="workspace-relogio" aria-label={`Hora de Brasília: ${horario}`}>
      {horario}
    </time>
  );
}

