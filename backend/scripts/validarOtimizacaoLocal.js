// Usa um banco local dedicado; nunca inicia o servidor nem envia mensagens.
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Pool}=require('pg');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
async function executar(){
  const url=new URL(process.env.DATABASE_URL||'');
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('A validação exige PostgreSQL local.');
  const nome='pombo_correio_qa_otimizacao';
  const adminUrl=new URL(url);adminUrl.pathname='/postgres';
  const admin=new Pool({connectionString:adminUrl.toString()});
  try{
    if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[nome])).rowCount)await admin.query(`CREATE DATABASE ${nome}`);
  }finally{await admin.end();}
  url.pathname=`/${nome}`;
  const resultado=spawnSync(process.execPath,['--test','test/backupPostgres.test.js','test/creditosFonadaApi.test.js'],{
    cwd:path.resolve(__dirname,'..'),env:{...process.env,TEST_DATABASE_URL:url.toString()},stdio:'inherit',windowsHide:true,
  });
  process.exitCode=resultado.status??1;
}
executar().catch(erro=>{console.error(erro.message);process.exitCode=1;});
