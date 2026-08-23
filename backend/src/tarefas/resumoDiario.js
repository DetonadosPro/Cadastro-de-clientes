// src/tarefas/resumoDiario.js
//
// Todo fim de expediente, monta um resumo do dia (vendido, recebido,
// pendentes) e envia por email — com um link pronto do WhatsApp
// (api.whatsapp.com/send?text=...) já preenchido com o resumo, para
// abrir e enviar com um toque.
//
// Isso é uma limitação real do WhatsApp: não existe API gratuita para
// enviar mensagens de forma 100% automática sem a pessoa tocar em
// nada — a API oficial (WhatsApp Business Cloud API) tem custo e
// processo de aprovação. Esse meio-termo (email com link pronto) é a
// forma mais simples e sem custo de chegar perto do que foi pedido.

const { db } = require('../db/database');
const { enviarEmail } = require('../servicos/email');

function hojeBr() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(agora.getDate())}/${pad(agora.getMonth() + 1)}/${String(agora.getFullYear()).slice(-2)}`;
}

function paraChaveComparavel(dataBr) {
  if (!dataBr) return null;
  const m = String(dataBr).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let [, dd, mm, aa] = m;
  const ano = aa.length === 2 ? `20${aa}` : aa;
  return `${ano}-${mm}-${dd}`;
}

function formatarReais(valor) {
  return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function montarResumoDoDia() {
  const hoje = hojeBr();
  const hojeChave = paraChaveComparavel(hoje);

  const [fonadasResultado, aoVivoResultado] = await Promise.all([
    db.query(`
      SELECT valor, data_pedido, pagou, data_pagamento
      FROM fonadas WHERE excluido_em IS NULL
    `),
    db.query(`
      SELECT valor, data_pedido, pagou, data_pagou
      FROM ao_vivo WHERE excluido_em IS NULL
    `),
  ]);

  const todasLinhas = [
    ...fonadasResultado.rows.map((l) => ({ ...l, dataPago: l.data_pagamento })),
    ...aoVivoResultado.rows.map((l) => ({ ...l, dataPago: l.data_pagou })),
  ];

  const vendidoHoje = todasLinhas.filter((l) => paraChaveComparavel(l.data_pedido) === hojeChave);
  const valorVendido = vendidoHoje.reduce((soma, l) => soma + (l.valor || 0), 0);

  const recebidoHoje = todasLinhas.filter((l) => paraChaveComparavel(l.dataPago) === hojeChave && l.pagou === 'SIM');
  const valorRecebido = recebidoHoje.reduce((soma, l) => soma + (l.valor || 0), 0);

  const pendentes = todasLinhas.filter((l) => l.pagou !== 'SIM');

  return {
    dia: hoje,
    quantidadeVendida: vendidoHoje.length,
    valorVendido,
    quantidadeRecebida: recebidoHoje.length,
    valorRecebido,
    quantidadePendente: pendentes.length,
  };
}

async function rodarResumoDiario() {
  console.log('📊 Gerando resumo diário...');
  try {
    const resumo = await montarResumoDoDia();

    const textoWhatsapp =
      `📋 Resumo do dia ${resumo.dia} — Pombo-Correio\n\n` +
      `💰 Vendido: ${resumo.quantidadeVendida} pedido(s), ${formatarReais(resumo.valorVendido)}\n` +
      `✅ Recebido: ${resumo.quantidadeRecebida} pagamento(s), ${formatarReais(resumo.valorRecebido)}\n` +
      `⏳ Pendentes no total: ${resumo.quantidadePendente} pedido(s)`;

    const linkWhatsapp = process.env.WHATSAPP_RESUMO_NUMERO
      ? `https://api.whatsapp.com/send?phone=${process.env.WHATSAPP_RESUMO_NUMERO}&text=${encodeURIComponent(textoWhatsapp)}`
      : null;

    const textoEmail = linkWhatsapp
      ? `${textoWhatsapp}\n\nToque para abrir no WhatsApp já preenchido:\n${linkWhatsapp}`
      : `${textoWhatsapp}\n\n(Configure WHATSAPP_RESUMO_NUMERO no Railway para receber também um link pronto do WhatsApp.)`;

    const resultado = await enviarEmail({
      assunto: `Resumo do dia — ${resumo.dia}`,
      texto: textoEmail,
    });

    if (resultado.enviado) {
      console.log('✅ Resumo diário enviado por email com sucesso.');
    } else {
      console.warn(`⚠️  Resumo gerado, mas não enviado: ${resultado.motivo}`);
    }
  } catch (erro) {
    console.error('❌ Erro ao gerar resumo diário:', erro);
  }
}

module.exports = { rodarResumoDiario, montarResumoDoDia };
