export function agruparMensagensDuplas(lista) {
  const pedidos = new Map();
  for (const item of lista) {
    if (!pedidos.has(item.pedidoId)) pedidos.set(item.pedidoId, []);
    pedidos.get(item.pedidoId).push(item);
  }
  const pares = new Map();
  for (const item of lista) {
    if (item.mensagem !== 1) continue;
    const par = pedidos.get(item.pedidoId).find(outro => outro.mensagem === 2);
    if (par && item.para?.trim() && item.para.trim().toUpperCase() === (par.para || '').trim().toUpperCase()
      && item.dia && item.dia === par.dia && item.horario && item.horario === par.horario && item.passada === par.passada) pares.set(item.pedidoId, par);
  }
  return lista.filter(item => !(item.mensagem === 2 && pares.has(item.pedidoId)))
    .map(item => item.mensagem === 1 && pares.has(item.pedidoId) ? { ...item, agrupada: pares.get(item.pedidoId) } : item);
}

export const itemConcluido = item => item._tipo === 'lembrete' ? Boolean(item.concluido) : Boolean(item.passada);
export const itemExpirado = item => item.statusMensagemEmHaver === 'EXPIRADA' || item.agrupada?.statusMensagemEmHaver === 'EXPIRADA';
export function minutosHorario(horario) {
  const m = String(horario || '').match(/^(\d{1,2}):(\d{2})$/);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function urgenciaAgenda(item, ehHoje, agora = new Date()) {
  if (!ehHoje || itemConcluido(item) || itemExpirado(item)) return null;
  const horario = minutosHorario(item._horario);
  if (horario === null) return null;
  const diferenca = horario - (agora.getHours() * 60 + agora.getMinutes());
  // A entrega Ao Vivo encerra automaticamente; não exige baixa na Agenda.
  if (diferenca < 0) return item._tipo === 'aovivo' ? null : 'atrasada';
  return diferenca <= 10 ? 'proxima' : null;
}
export function ordenarAgenda(itens, ordem = 'horario', ehHoje = false, agora = new Date()) {
  const peso = item => ({ atrasada: 0, proxima: 1 }[urgenciaAgenda(item, ehHoje, agora)] ?? 2);
  return [...itens].sort((a, b) => (ordem === 'prioridade' ? peso(a) - peso(b) : 0)
    || (minutosHorario(a._horario) ?? 1440) - (minutosHorario(b._horario) ?? 1440)
    || String(a._chave).localeCompare(String(b._chave), 'pt-BR', { numeric: true }));
}
const normalizar = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function buscarNaAgenda(itens, busca) {
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  return itens.filter(item => {
    const campos = ['nome_comprador', 'comprador', 'para', 'titulo', 'senha_os', 'numero_os', 'tema', 'codigo', 'observacao', 'endereco', 'bairro', 'celular', 'fixo', 'whatsapp', 'quemOferece'];
    const texto = normalizar([...campos.map(c => item[c]), item.agrupada?.tema, item.agrupada?.codigo, ...[1,2,3,4].map(n => item[`tema_${n}`])].join(' '));
    return termos.every(termo => texto.includes(termo));
  });
}
export function resumoAgenda(itens, ehHoje, agora = new Date()) {
  const pendentes = itens.filter(item => !itemConcluido(item));
  const atrasados = pendentes.filter(item => urgenciaAgenda(item, ehHoje, agora) === 'atrasada');
  const proximos = pendentes.filter(item => urgenciaAgenda(item, ehHoje, agora) === 'proxima');
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const proximo = ordenarAgenda(pendentes.filter(item => !itemExpirado(item) && minutosHorario(item._horario) !== null
    && (!ehHoje || minutosHorario(item._horario) >= minutosAgora)))[0] || null;
  return { total: itens.length, pendentes: pendentes.length, concluidos: itens.length - pendentes.length,
    atrasados: atrasados.length, proximos: proximos.length, proximo,
    progresso: itens.length ? Math.round((itens.length - pendentes.length) / itens.length * 100) : 0 };
}
export function agruparTurnos(itens) {
  const grupos = [
    { nome: 'Madrugada', intervalo: '00h–06h' }, { nome: 'Manhã', intervalo: '06h–12h' },
    { nome: 'Tarde', intervalo: '12h–18h' }, { nome: 'Noite', intervalo: '18h–24h' },
    { nome: 'Sem horário', intervalo: 'Tarefas para o dia' },
  ].map(grupo => ({ ...grupo, itens: [] }));
  for (const item of itens) { const minutos = minutosHorario(item._horario); grupos[minutos === null ? 4 : Math.floor(minutos / 360)].itens.push(item); }
  return grupos.filter(grupo => grupo.itens.length);
}
