// src/tarefas/agendador.js
//
// Centraliza os cron jobs do sistema. Os horários usam o fuso do
// servidor Railway — por padrão UTC. Brasília é UTC-3, então meia-noite
// em Brasília (00:00) equivale a 03:00 em UTC.
//
// Para trocar os horários sem redeploy, dá para sobrescrever via
// variáveis de ambiente CRON_BACKUP e CRON_RESUMO (formato cron
// padrão), mas isso é opcional — os valores padrão já cobrem o uso
// comum.

const cron = require('node-cron');
const { rodarBackupSemanal } = require('./backupSemanal');
const { rodarResumoDiario } = require('./resumoDiario');

function iniciarAgendador() {
  // Backup — todo dia à meia-noite (horário de Brasília) = 03:00 UTC.
  // O nome da função (rodarBackupSemanal) ficou de quando era semanal
  // — o comportamento em si (fazer backup das 3 tabelas) não mudou,
  // só a frequência.
  const cronBackup = process.env.CRON_BACKUP || '0 3 * * *';
  cron.schedule(cronBackup, () => {
    rodarBackupSemanal();
  });

  // Resumo diário — todo dia às 21h (horário de Brasília) = 00h UTC.
  const cronResumo = process.env.CRON_RESUMO || '0 0 * * *';
  cron.schedule(cronResumo, () => {
    rodarResumoDiario();
  });

  console.log(`🕒 Agendador iniciado — backup diário (${cronBackup}), resumo diário (${cronResumo}).`);
}

module.exports = { iniciarAgendador };
