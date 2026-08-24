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

function telegramDisponivel() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function enviarTelegram(texto) {
  if (!telegramDisponivel()) {
    console.warn('⚠️  Telegram não enviado — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados.');
    return { enviado: false, motivo: 'não configurado' };
  }

  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: texto,
      }),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      throw new Error(`Telegram respondeu ${resposta.status}: ${detalhe}`);
    }

    return { enviado: true };
  } catch (erro) {
    console.error('❌ Erro ao enviar Telegram:', erro.message);
    return { enviado: false, motivo: erro.message };
  }
}

module.exports = { enviarTelegram, telegramDisponivel };
