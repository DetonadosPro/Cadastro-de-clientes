const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');

const TABELAS_BACKUP = [
  'usuarios', 'clientes', 'fonadas', 'ao_vivo', 'creditos_fonada',
  'tentativas_contato', 'tentativas_prazo_ao_vivo', 'lembretes',
  'recall_registros', 'duplicatas_descartadas', 'contadores_os', 'configuracoes_sistema',
];
const ORDENACAO = { duplicatas_descartadas: 'cliente_menor_id, cliente_maior_id', contadores_os: 'sistema' };
const LOTE = 500;

// O cursor deve estar dentro da transação consistente aberta pelo chamador.
// Mantém somente um lote de objetos e o conteúdo já comprimido na memória.
async function comprimirTabela(client, tabela) {
  if (!TABELAS_BACKUP.includes(tabela)) throw new Error('Tabela não autorizada para backup.');
  await client.query(`DECLARE backup_tabela NO SCROLL CURSOR FOR SELECT * FROM ${tabela} ORDER BY ${ORDENACAO[tabela] || 'id'}`);
  let falhou = false;
  try {
    async function* blocos() {
      yield '[';
      let primeiro = true;
      while (true) {
        const { rows } = await client.query(`FETCH FORWARD ${LOTE} FROM backup_tabela`);
        if (!rows.length) break;
        yield `${primeiro ? '' : ','}${rows.map(linha => JSON.stringify(linha)).join(',')}`;
        primeiro = false;
      }
      yield ']';
    }
    const compactados = [];
    await pipeline(Readable.from(blocos()), createGzip(), async fonte => {
      for await (const bloco of fonte) compactados.push(bloco);
    });
    return Buffer.concat(compactados).toString('base64');
  } catch (erro) {
    falhou = true;
    throw erro;
  } finally {
    try { await client.query('CLOSE backup_tabela'); }
    catch (erro) { if (!falhou) throw erro; }
  }
}

module.exports = { comprimirTabela, TABELAS_BACKUP };
