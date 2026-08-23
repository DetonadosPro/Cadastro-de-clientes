// src/servicos/email.js
//
// Serviço de envio de email via Gmail, usado tanto pelo backup
// automático quanto pelo resumo diário. Depende de duas variáveis de
// ambiente (configuradas no Railway, nunca no código):
//   GMAIL_USUARIO    — o email do Gmail que envia (ex: seuemail@gmail.com)
//   GMAIL_SENHA_APP   — uma "senha de app" gerada em
//                        myaccount.google.com/apppasswords (não é a
//                        senha normal da conta — Gmail bloqueia login
//                        de app com a senha normal por segurança)
//
// Se essas variáveis não estiverem configuradas, os envios falham
// silenciosamente com um aviso no log — o resto do sistema continua
// funcionando normalmente, o email é só um "extra".

const nodemailer = require('nodemailer');

function transportadorDisponivel() {
  return Boolean(process.env.GMAIL_USUARIO && process.env.GMAIL_SENHA_APP);
}

function criarTransportador() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USUARIO,
      pass: process.env.GMAIL_SENHA_APP,
    },
  });
}

// Envia um email simples (texto ou com anexo). `destinatario` pode ser
// omitido — nesse caso envia para o próprio GMAIL_USUARIO (útil para
// backups e resumos que são "para você mesmo").
async function enviarEmail({ destinatario, assunto, texto, anexos }) {
  if (!transportadorDisponivel()) {
    console.warn('⚠️  Email não enviado — GMAIL_USUARIO/GMAIL_SENHA_APP não configurados.');
    return { enviado: false, motivo: 'não configurado' };
  }

  try {
    const transportador = criarTransportador();
    await transportador.sendMail({
      from: `Pombo-Correio <${process.env.GMAIL_USUARIO}>`,
      to: destinatario || process.env.GMAIL_USUARIO,
      subject: assunto,
      text: texto,
      attachments: anexos || [],
    });
    return { enviado: true };
  } catch (erro) {
    console.error('❌ Erro ao enviar email:', erro.message);
    return { enviado: false, motivo: erro.message };
  }
}

module.exports = { enviarEmail, transportadorDisponivel };
