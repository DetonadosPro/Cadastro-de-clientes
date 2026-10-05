import { useEffect, useState } from 'react';

export default function RelogioAgenda() {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    const intervalo = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);
  const hh = String(agora.getHours()).padStart(2, '0');
  const mm = String(agora.getMinutes()).padStart(2, '0');
  return (
    <time className="workspace-relogio" aria-label={`Hora atual: ${hh}:${mm}`}>
      {hh}:{mm}
    </time>
  );
}

