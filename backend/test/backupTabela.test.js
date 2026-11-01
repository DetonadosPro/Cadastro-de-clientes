const test = require('node:test');
const assert = require('node:assert/strict');
const { gunzipSync } = require('node:zlib');
const { comprimirTabela } = require('../src/tarefas/backupTabela');

for (const quantidade of [0, 1, 500, 1203]) test(`backup preserva ${quantidade} registros em lotes, inclusive caracteres e nulos`, async () => {
  const dados = Array.from({length:quantidade},(_,id)=>({id,nome:`José "${id}"\n😀`,valor:id/100,nulo:null}));
  let posicao=0;
  const client={query:async sql=>{
    if(sql.startsWith('DECLARE'))return {rows:[]};
    if(sql==='CLOSE backup_tabela')return {rows:[]};
    assert.equal(sql,'FETCH FORWARD 500 FROM backup_tabela');
    const rows=dados.slice(posicao,posicao+500);posicao+=500;return {rows};
  }};
  const texto=gunzipSync(Buffer.from(await comprimirTabela(client,'fonadas'),'base64')).toString('utf8');
  assert.equal(texto,JSON.stringify(dados));
});

test('cursor usa ordenação completa das chaves compostas e rejeita outra tabela', async()=>{
  const consultas=[];
  const client={query:async sql=>{consultas.push(sql);return {rows:[]};}};
  await comprimirTabela(client,'duplicatas_descartadas');
  assert.match(consultas[0],/ORDER BY cliente_menor_id, cliente_maior_id$/);
  await comprimirTabela(client,'contadores_os');
  assert.ok(consultas.some(sql=>sql.endsWith('ORDER BY sistema')));
  await assert.rejects(comprimirTabela(client,'segredos'),/não autorizada/);
});

test('falha na leitura não produz anexo parcial e preserva o erro original', async()=>{
  const original=new Error('Leitura interrompida');let fechou=false;
  const client={query:async sql=>{
    if(sql.startsWith('DECLARE'))return {rows:[]};
    if(sql.startsWith('CLOSE')){fechou=true;throw new Error('Transação abortada');}
    throw original;
  }};
  await assert.rejects(comprimirTabela(client,'clientes'),erro=>erro===original);
  assert.equal(fechou,true);
});
