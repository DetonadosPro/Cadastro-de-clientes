const express = require('express');
const { db } = require('../db/database');
const { configuracoesAtuais, limiteValido } = require('../utils/configuracoes');
const router = express.Router();
router.get('/', (_req, res) => res.json(configuracoesAtuais()));
router.put('/', async (req, res) => {
  const { limite_segunda_mensagem: limite, versao } = req.body;
  if (!limiteValido(limite) || !Number.isSafeInteger(versao) || versao < 1) {
    return res.status(400).json({ erro: 'Informe um limite válido, com até duas casas decimais.' });
  }
  try {
    const resultado = await db.query(`UPDATE configuracoes_sistema SET limite_segunda_mensagem=$1,
      versao=versao+1, atualizado_em=NOW(), atualizado_por=$2 WHERE id=1 AND versao=$3 RETURNING *`,
    [limite, req.usuario?.usuario || null, versao]);
    if (!resultado.rows.length) return res.status(409).json({ erro: 'As configurações foram alteradas. Recarregue antes de salvar novamente.' });
    res.json({ ...resultado.rows[0], limite_segunda_mensagem: Number(resultado.rows[0].limite_segunda_mensagem) });
  } catch (erro) { console.error('Erro configurações:', erro); res.status(500).json({ erro: 'Não foi possível salvar as configurações.' }); }
});
module.exports = router;
