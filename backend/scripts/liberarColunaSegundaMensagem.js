// Migração aditiva explícita: nenhuma regra ou valor de pedido é reescrito.
const {Client}=require('pg');
async function aplicarColuna(client){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query('ALTER TABLE fonadas ADD COLUMN IF NOT EXISTS segunda_mensagem_liberada BOOLEAN NOT NULL DEFAULT FALSE');
    await client.query('COMMIT');
  }catch(erro){await client.query('ROLLBACK');throw erro;}
}
module.exports={aplicarColuna};
if(require.main===module){
  (async()=>{
    const client=new Client({connectionString:process.env.MIGRACAO_DATABASE_URL,ssl:process.env.MIGRACAO_SSL==='1'?{rejectUnauthorized:false}:false});
    if(!process.env.MIGRACAO_DATABASE_URL)throw new Error('Informe MIGRACAO_DATABASE_URL explicitamente.');
    await client.connect();
    try{await aplicarColuna(client);console.log('Coluna de liberação individual preparada.');}finally{await client.end();}
  })().catch(erro=>{console.error(erro.code||erro.message);process.exitCode=1;});
}
