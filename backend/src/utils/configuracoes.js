const { AsyncLocalStorage } = require('node:async_hooks');
const contexto = new AsyncLocalStorage();
const PADRAO = { limite_segunda_mensagem: 12, meses_mensagem_em_haver: 3, versao: 1 };

function configuracoesAtuais() { return contexto.getStore() || PADRAO; }
function comConfiguracoes(configuracoes, executar) { return contexto.run({ ...PADRAO, ...configuracoes }, executar); }
function mesesValidos(valor) { return Number.isInteger(valor) && valor >= 1 && valor <= 120; }
function limiteValido(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100000
    && Math.abs(valor * 100 - Math.round(valor * 100)) < 0.000001;
}
async function carregarConfiguracoes(consultar) {
  const resultado = await consultar('SELECT * FROM configuracoes_sistema WHERE id=1');
  if (!resultado.rows[0]) throw new Error('Configurações indisponíveis.');
  return { ...resultado.rows[0], limite_segunda_mensagem: Number(resultado.rows[0].limite_segunda_mensagem) };
}
module.exports = { configuracoesAtuais, comConfiguracoes, limiteValido, mesesValidos, carregarConfiguracoes };
