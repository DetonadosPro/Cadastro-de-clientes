// Auditoria somente de leitura. Não imprime nomes, telefones nem credenciais.
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { agruparAoVivo } = require('../src/utils/recallAoVivo');
const { normalizarTexto, nomePessoaValido } = require('../src/utils/recall');
const { dataBrParaDate } = require('../src/utils/mensagemEmHaver');
const { hojeIsoBrasilia } = require('../src/utils/dataHora');
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
async function executar() {
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const linhas = (await client.query(`SELECT a.*, c.nome cliente_nome FROM ao_vivo a
      LEFT JOIN clientes c ON c.id=a.cliente_id AND c.excluido_em IS NULL WHERE a.excluido_em IS NULL`)).rows;
    const datas = process.argv.slice(2).length ? process.argv.slice(2) : [hojeIsoBrasilia()];
    const anos = {};
    for (const p of linhas) { const d = dataBrParaDate(p.dia_entrega); if (d) anos[d.getFullYear()] = (anos[d.getFullYear()] || 0) + 1; }
    const comNome = (p) => /[A-Z]/.test(normalizarTexto(p.cliente_nome || p.comprador)) && /[A-Z]/.test(normalizarTexto(p.para));
    const nomeAntes = (p) => nomePessoaValido(p.cliente_nome || p.comprador) && nomePessoaValido(p.para);
    const auditoria = datas.map((data) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Use datas no formato AAAA-MM-DD.');
      const grupos = agruparAoVivo(linhas, data);
      return { data, oportunidades: grupos.length, pedidosHistoricos: grupos.reduce((s, g) => s + g.quantidade, 0), oportunidadesAntesDaCorrecao: agruparAoVivo(linhas.filter(nomeAntes), data).length };
    });
    console.log(JSON.stringify({ base: ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname) ? 'local' : 'banco configurado', totalPedidosAtivos: linhas.length, anos, datasInvalidasOuIncompletas: linhas.filter((p) => !dataBrParaDate(p.dia_entrega)).length, semNomeUtilizavel: linhas.filter((p) => !comNome(p)).length, nomesComNumerosRecuperados: linhas.filter((p) => comNome(p) && !nomeAntes(p)).length, auditoria }, null, 2));
    await client.query('COMMIT');
  } finally { await client.end(); }
}
executar().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
