export const CORES_RELATORIO = { principal: '#3861ed', comparado: '#dc8a16', fonada: '#3861ed', aoVivo: '#9062da', recebido: '#168574' };
export const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const numero = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export function dataRelatorio(valor) {
  const m = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const ano = Number(m[3]) + (m[3].length === 2 ? 2000 : 0);
  const data = new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[1])));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === Number(m[2]) - 1 && data.getUTCDate() === Number(m[1]) ? data : null;
}
export function campoData(data) {
  return `${String(data.getUTCDate()).padStart(2, '0')}/${String(data.getUTCMonth() + 1).padStart(2, '0')}/${String(data.getUTCFullYear()).slice(-2)}`;
}
export function diasPeriodo(inicio, fim) {
  const a = dataRelatorio(inicio), b = dataRelatorio(fim || inicio);
  return a && b && b >= a ? Math.round((b - a) / 86400000) + 1 : 0;
}
export function nomePeriodo(inicio, fim) {
  const a = dataRelatorio(inicio), b = dataRelatorio(fim || inicio);
  if (!a || !b) return 'Escolha as datas';
  const formatar = (d, opcoes) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opcoes });
  if (a.getUTCDate() === 1 && a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && b.getUTCDate() === new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate()) {
    const nome = formatar(a, { month: 'long', year: 'numeric' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }
  if (+a === +b) return formatar(a, { day: 'numeric', month: 'long', year: 'numeric' });
  return `${formatar(a, { day: 'numeric', month: 'short', year: 'numeric' })} — ${formatar(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
export function compararValores(principal, referencia) {
  const a = Number(principal || 0), b = Number(referencia || 0);
  return { diferenca: a - b, percentual: b === 0 ? (a === 0 ? 0 : null) : (a - b) / b * 100, vencedor: a === b ? 'empate' : a > b ? 'principal' : 'comparado' };
}
export function periodoAnterior(inicio, fim) {
  const a = dataRelatorio(inicio), dias = diasPeriodo(inicio, fim);
  if (!a || !dias) return null;
  const b = new Date(+a - 86400000);
  return { inicio: campoData(new Date(+b - (dias - 1) * 86400000)), fim: campoData(b) };
}
export function periodoRapido(tipo, instante = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante);
  const p = (k) => Number(partes.find(x => x.type === k).value);
  const hoje = new Date(Date.UTC(p('year'), p('month') - 1, p('day')));
  let inicio = new Date(hoje), fim = new Date(hoje);
  if (tipo === 'ontem') inicio = fim = new Date(+hoje - 86400000);
  if (tipo === 'semana') inicio = new Date(+hoje - ((hoje.getUTCDay() || 7) - 1) * 86400000);
  if (tipo === 'mes') inicio = new Date(Date.UTC(p('year'), p('month') - 1, 1));
  if (tipo === 'mes-anterior') { inicio = new Date(Date.UTC(p('year'), p('month') - 2, 1)); fim = new Date(Date.UTC(p('year'), p('month') - 1, 0)); }
  return { inicio: campoData(inicio), fim: campoData(fim) };
}
// Mesma granularidade e mesma escala para os dois períodos. Dias sem movimento são zero.
export function seriesCalendario(series, periodos) {
  const maior = Math.max(...periodos.map(p => diasPeriodo(p.inicio, p.fim)), 0);
  const passo = Math.max(1, Math.ceil(maior / 90));
  return series.map((pontos, serie) => {
    const periodo = periodos[serie];
    const inicio = dataRelatorio(periodo?.inicio), dias = diasPeriodo(periodo?.inicio, periodo?.fim);
    if (!inicio || !dias) return [];
    const grupos = Array.from({ length: Math.ceil(dias / passo) }, (_, i) => ({ data: campoData(new Date(+inicio + i * passo * 86400000)), fim: campoData(new Date(+inicio + Math.min(dias - 1, (i + 1) * passo - 1) * 86400000)), valor: 0, quantidade: 0, fonada: 0, aoVivo: 0, quantidadeFonada: 0, quantidadeAoVivo: 0 }));
    for (const ponto of pontos || []) {
      const data = dataRelatorio(ponto.data);
      const dia = data ? Math.round((data - inicio) / 86400000) : -1;
      if (dia < 0 || dia >= dias) continue;
      const grupo = grupos[Math.floor(dia / passo)];
      for (const campo of ['valor', 'quantidade', 'fonada', 'aoVivo', 'quantidadeFonada', 'quantidadeAoVivo']) grupo[campo] += Number(ponto[campo] || 0);
    }
    return grupos;
  });
}
export function totaisFormas(dados = []) {
  const formas = new Map();
  for (const dia of dados) for (const [categoria, quantidade] of Object.entries(dia.formas || {})) formas.set(categoria, (formas.get(categoria) || 0) + Number(quantidade || 0));
  return [...formas].map(([categoria, quantidade]) => ({ categoria, quantidade, valor: quantidade })).sort((a,b) => b.quantidade - a.quantidade);
}
export function resumoRelatorio(dados, tipo) {
  if (tipo === 'vendas') return { valor: Number(dados?.geral?.valorTotal || 0), quantidade: Number(dados?.geral?.quantidade || 0), ticket: Number(dados?.geral?.ticketMedio || 0) };
  if (tipo === 'desempenho') { const quantidade = (dados?.funcionarios || []).reduce((s,f) => s + Number(f.vendasTotal || 0), 0); return { valor: Number(dados?.valorEquipe || 0), quantidade, ticket: quantidade ? Number(dados.valorEquipe || 0) / quantidade : 0 }; }
  return { valor: Number(dados?.valorTotal || 0), quantidade: Number(dados?.quantidade || 0), ticket: dados?.quantidade ? Number(dados.valorTotal || 0) / dados.quantidade : 0 };
}
