// src/servicos/telegram.js
//
// Serviço de envio de mensagens via Telegram Bot API — 100% gratuito
// e oficial (sem risco de banimento, diferente de gambiarras de
// automação no WhatsApp). Depende de duas variáveis de ambiente:
//   TELEGRAM_BOT_TOKEN — token gerado pelo @BotFather no Telegram
//   TELEGRAM_CHAT_ID   — id da conversa entre você e o bot (obtido
//                        via api.telegram.org/bot<token>/getUpdates
//                        depois de mandar uma mensagem pro bot)
//
// Se essas variáveis não estiverem configuradas, o envio falha
// silenciosamente com um aviso no log.

const { performance } = require('node:perf_hooks');
const { registrarOperacao } = require('../observabilidade');

function telegramDisponivel() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function escaparHtml(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function dividirMensagem(texto, limite = 3800) {
  if (texto.length <= limite) return [texto];
  const blocos = texto.split(/\n{2,}/);
  const partes = [];
  let atual = '';

  function adicionarTrecho(trecho) {
    const candidato = atual ? `${atual}\n\n${trecho}` : trecho;
    if (candidato.length <= limite) {
      atual = candidato;
      return;
    }
    if (atual) partes.push(atual);
    atual = '';
    if (trecho.length <= limite) {
      atual = trecho;
      return;
    }
    const linhas = trecho.split('\n');
    linhas.forEach((linha) => {
      if (linha.length > limite) {
        if (atual) partes.push(atual);
        atual = '';
        for (let inicio = 0; inicio < linha.length; inicio += limite) {
          const fragmento = linha.slice(inicio, inicio + limite);
          if (fragmento.length === limite) partes.push(fragmento);
          else atual = fragmento;
        }
        return;
      }
      const comLinha = atual ? `${atual}\n${linha}` : linha;
      if (comLinha.length <= limite) atual = comLinha;
      else {
        if (atual) partes.push(atual);
        atual = linha;
      }
    });
  }

  blocos.forEach(adicionarTrecho);
  if (atual) partes.push(atual);
  return partes;
}

async function enviarTelegram(texto, opcoes = {}) {
  if (!telegramDisponivel()) {
    console.warn('⚠️  Telegram não enviado — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados.');
    return { enviado: false, motivo: 'não configurado' };
  }

  const inicio = performance.now();
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const partes = dividirMensagem(texto, opcoes.limite || 3800);

    for (const parte of partes) {
      const resposta = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(Number(process.env.TELEGRAM_TIMEOUT_MS || 15000)),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: parte,
          parse_mode: opcoes.parseMode || 'HTML',
          disable_web_page_preview: true,
        }),
      });

      if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => '');
        throw new Error(`Telegram respondeu ${resposta.status}: ${detalhe}`);
      }
    }

    registrarOperacao('telegram', performance.now() - inicio, true, { mensagens: partes.length });
    return { enviado: true, mensagens: partes.length };
  } catch (erro) {
    registrarOperacao('telegram', performance.now() - inicio, false);
    console.error('❌ Erro ao enviar Telegram:', erro.message);
    return { enviado: false, motivo: erro.message };
  }
}

module.exports = { enviarTelegram, telegramDisponivel, escaparHtml, dividirMensagem };
