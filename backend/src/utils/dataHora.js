// src/utils/dataHora.js
//
// O servidor (Railway) roda com o relógio do sistema operacional em UTC,
// não no horário de Brasília. Se qualquer rota usar `new Date()` puro
// para calcular "hoje" ou "agora", o resultado fica até 3-4 horas à
// frente do horário real do Brasil — isso já causou dois bugs
// reais: (1) o texto de "MENSAGEM PASSADA, ..." salvo com a data/hora
// erradas, e (2) pedidos não somem da Agenda porque o backend acha
// que "hoje" já virou o dia seguinte.
//
// A partir de agora, toda rota que precisa da data/hora atual deve usar
// `agoraBrasilia()` daqui, em vez de `new Date()` diretamente.

const FUSO_BRASILIA = 'America/Sao_Paulo';

// Devolve um objeto Date cujos componentes (getDate/getHours/etc.),
// quando lidos, já refletem o horário de Brasília — feito reconstruindo
// a data a partir das partes formatadas nesse fuso (truque comum, já
// que o JS não tem um jeito direto de "converter fuso" em um Date).
function agoraBrasilia() {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_BRASILIA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(agora);

  const obter = (tipo) => partes.find((p) => p.type === tipo).value;
  const ano = obter('year');
  const mes = obter('month');
  const dia = obter('day');
  let hora = obter('hour');
  const minuto = obter('minute');
  const segundo = obter('second');
  // Intl pode devolver "24" para meia-noite dependendo do ambiente —
  // normaliza para "00" para não quebrar o Date construído abaixo.
  if (hora === '24') hora = '00';

  return new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}`);
}

// Data de hoje (Brasília) no formato dd/mm/aa usado nos campos do
// sistema — mesmo formato que hojeFormatado() no frontend, para poder
// comparar/filtrar direto com as datas já salvas.
function formatarDataBrasilia() {
  const agora = agoraBrasilia();
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  return `${dd}/${mm}/${aa}`;
}

module.exports = { agoraBrasilia, formatarDataBrasilia };
