// src/tarefas/agendador.js
//
// Centraliza os cron jobs do sistema. Os horários usam o fuso do
// servidor Railway — por padrão UTC, então os horários abaixo já
// consideram o ajuste para Brasília (UTC-3): "21:00 Brasília" vira
// "0 0 * * *" (meia-noite UTC).
//
// Para trocar os horários sem redeploy, dá para sobrescrever via
// variáveis de ambiente CRON_BACKUP e CRON_RESUMO (formato cron
// padrão), mas isso é opcional — os valores padrão já cobrem o uso
// comum.

const cron = require('node-cron');
const { rodarBackupSemanal } = require('./backupSemanal');
const { rodarResumoDiario } = require('./resumoDiario');

function iniciarAgendador() {
  // Backup semanal — todo domingo às 21h (horário de Brasília).
  // "0 0 * * 1" em UTC = domingo 21h em Brasília (UTC-3, vira segunda
  // 00h UTC).
  const cronBackup = process.env.CRON_BACKUP || '0 0 * * 1';
  cron.schedule(cronBackup, () => {
    rodarBackupSemanal();
  });

  // Resumo diário — todo dia às 21h (horário de Brasília) = 00h UTC.
  const cronResumo = process.env.CRON_RESUMO || '0 0 * * *';
  cron.schedule(cronResumo, () => {
    rodarResumoDiario();
  });

  console.log(`🕒 Agendador iniciado — backup semanal (${cronBackup}), resumo diário (${cronResumo}).`);
}

module.exports = { iniciarAgendador };
