const test=require('node:test');
const assert=require('node:assert/strict');
const {gunzipSync}=require('node:zlib');
let falhar=false,transacoes=0,liberacoes=0,envios=[];
const consultas=[];
let retornou=false;
const client={query:async sql=>{
  consultas.push(sql);
  if(sql.startsWith('BEGIN'))transacoes++;
  if(sql.startsWith('DECLARE')){retornou=false;if(falhar&&sql.includes('FROM fonadas'))throw new Error('Falha simulada');}
  if(sql.startsWith('FETCH')){if(retornou)return {rows:[]};retornou=true;return {rows:[{id:1,texto:'Conteúdo fictício'}]};}
  return {rows:[]};
},release:()=>{liberacoes++;}};
function substituir(caminho,exports){const id=require.resolve(caminho);require.cache[id]={id,filename:id,loaded:true,exports};}
substituir('../src/db/database',{pool:{connect:async()=>client}});
substituir('../src/servicos/email',{enviarEmail:async dados=>{envios.push(dados);return {enviado:true};}});
substituir('../src/tarefas/qaArtefatos',{pastaArtefatosQa:async()=>null});
const {rodarBackupSemanal,TABELAS_BACKUP}=require('../src/tarefas/backupSemanal');

test('backup completo usa um snapshot e compartilha execução concorrente',async()=>{
  const a=rodarBackupSemanal(),b=rodarBackupSemanal();
  assert.equal(a,b);
  assert.equal((await a).ok,true);
  assert.equal(transacoes,1);assert.equal(liberacoes,1);assert.equal(envios.length,1);
  assert.equal(envios[0].anexos.length,TABELAS_BACKUP.length);
  assert.equal(consultas[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(consultas.at(-1),'COMMIT');
  for(const anexo of envios[0].anexos){
    assert.match(anexo.filename,/^[a-z_]+-\d{8}-\d{4}\.json\.gz$/);
    assert.equal(anexo.jaComprimido,true);
    assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(anexo.content,'base64'))),[{id:1,texto:'Conteúdo fictício'}]);
  }
});

test('erro em uma tabela reverte e não envia o conjunto incompleto; permite nova tentativa',async()=>{
  falhar=true;const antes=envios.length;
  assert.equal((await rodarBackupSemanal()).ok,false);
  assert.equal(consultas.at(-1),'ROLLBACK');assert.equal(envios.length,antes);
  falhar=false;
  assert.equal((await rodarBackupSemanal()).ok,true);
  assert.equal(envios.length,antes+1);
});
