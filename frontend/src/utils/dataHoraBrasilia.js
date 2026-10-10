export function dataHoraBrasilia(instante = new Date()) {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instante);
  const parte = tipo => partes.find(p => p.type === tipo).value;
  return { data: `${parte('day')}/${parte('month')}/${parte('year')}`, horario: `${parte('hour')}:${parte('minute')}` };
}
