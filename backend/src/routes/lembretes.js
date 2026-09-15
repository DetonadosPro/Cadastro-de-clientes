// src/routes/lembretes.js
//
// Lembretes de aniversário recorrente: encontra mensagens de Fonada
// (1ª e 2ª) do ANO PASSADO cujo dia/mês de transmissão cai amanhã —
// sinal de que a pessoa provavelmente vai querer mandar uma mensagem
// parecida de novo esse ano. Só olha Fonada (p1_dia/p2_dia), não
// Ao Vivo.

const express = require('express');
const { db } = require('../db/database');

const router = express.Router();

// Converte "dd/mm/aa" ou "dd/mm/aaaa" em { dia, mes, ano } numéricos,
// ou null se o formato não bater.
function partesData(dataBr) {
  const m = String(dataBr || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, ddStr, mmStr, anoStr] = m;
  const dia = parseInt(ddStr, 10);
  const mes = parseInt(mmStr, 10);
  const ano = parseInt(anoStr.length === 2 ? `20${anoStr}` : anoStr, 10);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  return { dia, mes, ano };
}

// GET /api/lembretes/aniversarios
//
// Amanhã (dia/mês) é o alvo. Busca fonadas cujo p1_dia ou p2_dia caem
// nesse dia/mês, com ANO anterior ao ano de amanhã — ou seja, "isso
// aconteceu num ano passado, e o dia/mês está de volta amanhã".
router.get('/aniversarios', async (req, res) => {
  try {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const diaAlvo = amanha.getDate();
    const mesAlvo = amanha.getMonth() + 1;
    const anoAtual = amanha.getFullYear();

    const resultado = await db.query(`
      SELECT id, senha_os, nome_comprador, cliente_id,
             p1_dia, p1_para, p1_tema,
             p2_dia, p2_para, p2_tema
      FROM fonadas
      WHERE excluido_em IS NULL
    `);

    const lembretes = [];

    for (const f of resultado.rows) {
      const p1 = partesData(f.p1_dia);
      if (p1 && p1.dia === diaAlvo && p1.mes === mesAlvo && p1.ano < anoAtual) {
        lembretes.push({
          pedidoId: f.id, mensagem: 1, senha_os: f.senha_os,
          nome_comprador: f.nome_comprador, cliente_id: f.cliente_id,
          para: f.p1_para, tema: f.p1_tema, dataOriginal: f.p1_dia,
          anosAtras: anoAtual - p1.ano,
        });
      }
      const p2 = partesData(f.p2_dia);
      if (p2 && p2.dia === diaAlvo && p2.mes === mesAlvo && p2.ano < anoAtual) {
        lembretes.push({
          pedidoId: f.id, mensagem: 2, senha_os: f.senha_os,
          nome_comprador: f.nome_comprador, cliente_id: f.cliente_id,
          para: f.p2_para, tema: f.p2_tema, dataOriginal: f.p2_dia,
          anosAtras: anoAtual - p2.ano,
        });
      }
    }

    // Mais recentes primeiro (1 ano atrás antes de 3 anos atrás) —
    // mensagens repetidas com mais frequência têm mais chance de
    // virar recompra do que uma coisa isolada de anos atrás.
    lembretes.sort((a, b) => a.anosAtras - b.anosAtras);

    res.json({
      dia: `${String(diaAlvo).padStart(2, '0')}/${String(mesAlvo).padStart(2, '0')}`,
      lembretes,
    });
  } catch (erro) {
    console.error('Erro ao buscar lembretes de aniversário:', erro);
    res.status(500).json({ erro: 'Erro ao buscar lembretes.' });
  }
});

module.exports = router;
