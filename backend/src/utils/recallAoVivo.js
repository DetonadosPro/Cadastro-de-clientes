const { normalizarTexto, chavePessoa, dataBrParaIso } = require('./recall');
const { formatarNome } = require('./textoPessoa');
const { dataBrParaDate } = require('./mensagemEmHaver');

function ocasiaoDoTema(tema) {
  const t = normalizarTexto(tema);
  if (/^(ANIV|ANIVERSARIO|NIVER|ANI)\b/.test(t) || /^FELIZ ANIVERSARIO/.test(t)) {
    if (/CASAMENTO|BODAS/.test(t)) return 'CASAMENTO';
    if (/NAMORO/.test(t)) return 'ANIVERSARIO_NAMORO';
    if (/EMPRESA/.test(t)) return 'EMPRESA';
    if (/15 ANOS/.test(t)) return 'HOMENAGEM';
    return 'ANIVERSARIO';
  }
  if (/BODAS/.test(t)) return 'CASAMENTO';
  if (/\b(D|DIA)\b.*\bMAES\b/.test(t)) return 'MAES';
  if (/\b(D|DIA)\b.*\bPAIS\b/.test(t)) return 'PAIS';
  if (/\b(D|DIA)\b.*\bNAMORADOS\b/.test(t)) return 'NAMORADOS';
  if (/\b(D|DIA)\b.*\bMULHER/.test(t)) return 'MULHER';
  if (/NATAL/.test(t)) return 'NATAL';
  return 'HOMENAGEM';
}

function domingoDoMes(ano, mes, numero) {
  const primeiro = new Date(ano, mes - 1, 1);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(1 + (7 - primeiro.getDay()) % 7 + (numero - 1) * 7).padStart(2, '0')}`;
}

function telefoneDoComprador(p) {
  return [p.cliente_whatsapp, p.cliente_celular, p.cliente_fixo, p.whatsapp, p.celular, p.celular2].find((valor) => {
    let numero = String(valor || '').replace(/\D/g, '');
    if (numero.startsWith('55') && [12, 13].includes(numero.length)) numero = numero.slice(2);
    return /^([1-9]\d[2-9]\d{7}|[1-9]\d9\d{8})$/.test(numero);
  }) || '';
}

function agruparAoVivo(linhas, referencia) {
  const grupos = new Map();
  for (const p of linhas) {
    if (/^NAO ENTREGUE\b/.test(normalizarTexto(p.resultado_entrega))) continue;
    const dia = dataBrParaDate(p.dia_entrega);
    if (!dia || dia.getFullYear() >= Number(referencia.slice(0, 4))) continue;
    const data = dataBrParaIso(p.dia_entrega);
    const temas = [p.tema_1, p.tema_2, p.tema_3, p.tema_4].filter((t) => /[A-Z]/.test(normalizarTexto(t)) && !['SEM MENSAGEM', 'LER MENSAGEM'].includes(normalizarTexto(t)));
    const ocasioes = [...new Set(temas.map(ocasiaoDoTema))];
    let categorias = ocasioes.filter((c) => c !== 'HOMENAGEM');
    if (categorias.some((c) => ['CASAMENTO', 'ANIVERSARIO_NAMORO', 'EMPRESA'].includes(c))) categorias = categorias.filter((c) => c !== 'ANIVERSARIO');
    const ocasiao = categorias.length === 1 ? categorias[0] : 'HOMENAGEM';
    const ano = Number(referencia.slice(0, 4));
    const prevista = ocasiao === 'MAES' ? domingoDoMes(ano, 5, 2) : ocasiao === 'PAIS' ? domingoDoMes(ano, 8, 2) : ocasiao === 'NAMORADOS' ? `${ano}-06-12` : ocasiao === 'MULHER' ? `${ano}-03-08` : ocasiao === 'NATAL' ? `${ano}-12-25` : `${ano}-${data.slice(5)}`;
    if (prevista !== referencia) continue;
    const comprador = formatarNome(p.cliente_nome || p.comprador);
    const para = formatarNome(p.para);
    // Ao Vivo antigo guarda idade, telefone e observações junto do nome.
    // A presença de números não invalida uma pessoa; nomes só numéricos continuam fora.
    if (!/[A-Z]/.test(normalizarTexto(comprador)) || !/[A-Z]/.test(normalizarTexto(para))) continue;
    const telefone = telefoneDoComprador(p);
    const identidade = p.cliente_id ? `ID:${p.cliente_id}` : `NOME:${chavePessoa(comprador)}:${String(telefone).replace(/\D/g, '')}`;
    const chave = `AOVIVO:${identidade}|PARA:${chavePessoa(para)}|TEMA:${ocasiao}`;
    if (!grupos.has(chave)) grupos.set(chave, { relacaoChave: chave, sistema: 'AOVIVO', clienteId: p.cliente_id, clienteNome: comprador, clienteBloqueado: Boolean(p.cliente_bloqueado), aniversariante: para, telefone, ocasiao, historico: [] });
    grupos.get(chave).historico.push({ pedidoId: p.id, os: p.numero_os, data: p.dia_entrega, tema: temas.join(' · '), temas, ocasiao });
  }
  return [...grupos.values()].map((g) => {
    g.historico.sort((a, b) => dataBrParaIso(b.data).localeCompare(dataBrParaIso(a.data)) || b.pedidoId - a.pedidoId);
    return { ...g, ultimoPedido: g.historico[0], quantidade: g.historico.length };
  }).sort((a, b) => a.aniversariante.localeCompare(b.aniversariante, 'pt-BR') || a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'));
}
function agruparAoVivoAniversario(linhas, referencia) {
  const dm = `${referencia.slice(8,10)}/${referencia.slice(5,7)}`;
  const grupos = new Map();
  for (const p of linhas) {
    const nascimento = String(p.cliente_nascimento || p.aniversario || '').trim();
    if (nascimento.slice(0,5) !== dm || /^NAO ENTREGUE\b/.test(normalizarTexto(p.resultado_entrega))) continue;
    // Pesquisa 2 contata exclusivamente o destinatário, nunca o comprador.
    const telefone = telefoneDoComprador({ celular: p.celular_local });
    if (!telefone) continue;
    const contato = formatarNome(p.para), aniversariante = formatarNome(p.cliente_nome || p.comprador);
    if (!/[A-Z]/.test(normalizarTexto(contato)) || !/[A-Z]/.test(normalizarTexto(aniversariante))) continue;
    const comprador = p.cliente_id ? `ID:${p.cliente_id}` : `NOME:${chavePessoa(aniversariante)}`;
    const chave = `AOVIVO:ANIVERSARIO:NOME:${chavePessoa(contato)}:${telefone.replace(/\D/g,'')}|PARA:${comprador}`;
    if (!grupos.has(chave)) grupos.set(chave, { relacaoChave:chave, sistema:'AOVIVO', clienteId:null, clienteNome:contato, clienteBloqueado:false, compradorId:p.cliente_id, aniversariante, aniversarianteNascimento:nascimento, telefone, ocasiao:'ANIVERSARIO', modoFila:'ANIVERSARIO', historico:[] });
    const temas = [p.tema_1,p.tema_2,p.tema_3,p.tema_4].filter(Boolean);
    grupos.get(chave).historico.push({pedidoId:p.id,os:p.numero_os,data:p.dia_entrega,tema:temas.join(' · '),temas,ocasiao:'ANIVERSARIO'});
  }
  return [...grupos.values()].map(g=>{
    g.historico.sort((a,b)=>String(dataBrParaIso(b.data)||'').localeCompare(String(dataBrParaIso(a.data)||''))||b.pedidoId-a.pedidoId);
    return {...g,ultimoPedido:g.historico[0],quantidade:g.historico.length};
  }).sort((a,b)=>a.aniversariante.localeCompare(b.aniversariante,'pt-BR')||a.clienteNome.localeCompare(b.clienteNome,'pt-BR'));
}
module.exports = { ocasiaoDoTema, domingoDoMes, telefoneDoComprador, agruparAoVivo, agruparAoVivoAniversario };
