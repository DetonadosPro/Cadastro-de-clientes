// src/servicos/email.js
//
// Serviço de envio de email via Resend (API HTTPS), usado tanto pelo
// backup automático quanto pelo resumo diário. Depende de duas
// variáveis de ambiente (configuradas no Railway, nunca no código):
//   RESEND_API_KEY     — chave gerada em resend.com/api-keys
//   EMAIL_DESTINATARIO — para onde os backups/resumos são enviados
//                        (ex: pcmensagensbackup@gmail.com)
//
// Usa Resend em vez de SMTP direto (Gmail) porque o Railway, no plano
// Hobby, bloqueia conexões SMTP de saída (portas 465/587) — só libera
// isso a partir do plano Pro. Resend funciona via API HTTPS normal,
// que não tem essa restrição.
//
// Se as variáveis não estiverem configuradas, os envios falham
// silenciosamente com um aviso no log — o resto do sistema continua
// funcionando normalmente, o email é só um "extra".

const { performance } = require('node:perf_hooks');
const { registrarOperacao } = require('../observabilidade');

function transportadorDisponivel() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_DESTINATARIO);
}

// Envia um email simples (texto ou com anexos) via API do Resend.
// `anexos` segue o mesmo formato usado antes ({ filename, content }),
// convertido aqui para o formato que a API do Resend espera
// (content precisa ser base64).
async function enviarEmail({ destinatario, assunto, texto, anexos }) {
  if (!transportadorDisponivel()) {
    console.warn('⚠️  Email não enviado — RESEND_API_KEY/EMAIL_DESTINATARIO não configurados.');
    return { enviado: false, motivo: 'não configurado' };
  }

  const inicio = performance.now();
  try {
    const corpo = {
      from: 'Pombo-Correio <onboarding@resend.dev>',
      to: [destinatario || process.env.EMAIL_DESTINATARIO],
      subject: assunto,
      text: texto,
    };

    if (anexos && anexos.length > 0) {
      corpo.attachments = anexos.map((a) => ({
        filename: a.filename,
        // Anexos já comprimidos (gzip) chegam prontos em base64 — só
        // os que ainda são texto puro precisam da conversão aqui.
        content: a.jaComprimido ? a.content : Buffer.from(a.content, 'utf-8').toString('base64'),
      }));
    }

    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(Number(process.env.EMAIL_TIMEOUT_MS || 20000)),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      throw new Error(`Resend respondeu ${resposta.status}: ${detalhe}`);
    }

    registrarOperacao('email', performance.now() - inicio, true, { anexos: anexos?.length || 0 });
    return { enviado: true };
  } catch (erro) {
    registrarOperacao('email', performance.now() - inicio, false, { anexos: anexos?.length || 0 });
    console.error('❌ Erro ao enviar email:', erro.message);
    return { enviado: false, motivo: erro.message };
  }
}

module.exports = { enviarEmail, transportadorDisponivel };
