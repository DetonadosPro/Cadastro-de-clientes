const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const Module=require('node:module');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {gunzipSync}=require('node:zlib');
const {Pool}=require('pg');
const {comprimirTabela,TABELAS_BACKUP}=require('../src/tarefas/backupTabela');

function carregarCodigo(codigo,arquivo){const m=new Module(arquivo,module);m.filename=arquivo;m.paths=Module._nodeModulePaths(path.dirname(arquivo));m._compile(codigo,arquivo);return m.exports;}
function dataLocal(valor){
  if(valor==null)return valor;
  const d=new Date(valor),pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,'0')}`;
}

test('PostgreSQL local: restaura as 12 tabelas, preserva snapshot e mantém resumo financeiro',{
  skip:!process.env.TEST_DATABASE_URL,timeout:60000,
},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  assert.equal(url.pathname,'/pombo_correio_qa_otimizacao');
  const fonte=`qa_otimizacao_${randomUUID().replaceAll('-','')}`;
  const destino=`qa_restauracao_${randomUUID().replaceAll('-','')}`;
  const admin=new Pool({connectionString:url.toString()});
  const bancos=[];let pasta;
  try{
    for(const schema of [fonte,destino])await admin.query(`CREATE SCHEMA ${schema}`);
    const arquivoDb=path.resolve(__dirname,'../src/db/database.js');
    const baseline=process.env.BASELINE_OTIMIZACAO_REF||'6f0b4f5';
    const codigoDb=execFileSync('git',['show',`${baseline}:backend/src/db/database.js`],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});
    for(const schema of [fonte,destino]){
      const conexao=new URL(url);conexao.searchParams.set('options',`-c search_path=${schema},public`);
      process.env.DATABASE_URL=conexao.toString();process.env.NODE_ENV='test';
      const banco=carregarCodigo(codigoDb,arquivoDb);bancos.push(banco);
      assert.equal((await banco.pool.query('SELECT current_schema() nome')).rows[0].nome,schema);
      await banco.iniciarBanco();
    }
    const banco=bancos[0];
    await banco.pool.query("INSERT INTO usuarios(usuario,senha_hash,nome) VALUES ('QA_BACKUP','hash-ficticio','Operador fictício')");
    await banco.pool.query("INSERT INTO clientes(nome) VALUES ('Cliente fictício José'),('Outro fictício')");
    const hoje=new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
    const curto=hoje.slice(0,6)+hoje.slice(-2),passado=hoje.slice(0,6)+'2020';
    const fora=hoje.slice(0,5)==='02/01'?'03/01/2020':'02/01/2020';
    await banco.pool.query(`INSERT INTO fonadas(senha_os,cliente_id,nome_comprador,data_pedido,valor,pagou,data_pagamento,p1_dia,p1_para,p2_dia,p2_para)
      SELECT (10000+i)::text,1,'FICTÍCIO '||i,CASE WHEN i%50=0 THEN $1 ELSE $2 END,12.5,'NÃO',NULL,CASE WHEN i%50=0 THEN $1 ELSE $2 END,'Destinatário 😀',NULL,NULL FROM generate_series(1,1203) i`,[passado,fora]);
    await banco.pool.query(`UPDATE fonadas SET data_pedido=$1,p1_dia=$1,p2_dia=$2,p2_para='Outro destinatário',pagou='SIM',data_pagamento=$2 WHERE id=1`,[curto,` \t${hoje}\n `]);
    await banco.pool.query('UPDATE fonadas SET p1_dia=$1,data_pagamento=$1,pagou=$2 WHERE id=2',[hoje,'SIM']);
    await banco.pool.query("INSERT INTO ao_vivo(cliente_id,comprador,numero_os,data_pedido,dia_entrega,valor,pagou,data_pagou,valor_recebido) VALUES (1,'Fictício','9000',$1,$2,80,'SIM',$1,75)",[curto,hoje]);
    await banco.pool.query("INSERT INTO creditos_fonada(cliente_id,nome_cliente,tipo,quantidade,valor,forma,data_pedido,horario_pedido,usuario,operacao) VALUES (1,'Cliente fictício','COMPRA',5,50,'PIX',$1,'12:00','QA_BACKUP',$2)",[curto,randomUUID()]);
    await banco.pool.query("INSERT INTO tentativas_contato(pedido_id,mensagem,data_hora_tentativa,observacao) VALUES(1,1,'01/11/26 12:00','Texto com aspas \" e quebra\n de linha')");
    await banco.pool.query("INSERT INTO recall_registros(data_referencia,relacao_chave,cliente_id,cliente_nome,aniversariante_nome,pedido_origem_id) VALUES('2026-11-01','QA',1,'Fictício','Pessoa fictícia',1)");
    await banco.pool.query('INSERT INTO duplicatas_descartadas(cliente_menor_id,cliente_maior_id) VALUES(1,2)');
    await banco.pool.query("UPDATE contadores_os SET ultimo_numero=11203 WHERE sistema='fonada'");
    const idDb=require.resolve('../src/db/database');require.cache[idDb]={id:idDb,filename:idDb,loaded:true,exports:banco};
    const arquivoResumo=path.resolve(__dirname,'../src/tarefas/resumoDiario.js');
    const codigoAnterior=execFileSync('git',['show',`${baseline}:backend/src/tarefas/resumoDiario.js`],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});
    let fase='antes';const lidas={antes:0,depois:0};const consultar=banco.db.query;
    banco.db.query=async(...args)=>{const r=await consultar(...args);lidas[fase]+=r.rows.length;return r;};
    const anterior=await carregarCodigo(codigoAnterior,arquivoResumo).montarResumoDoDia();
    fase='depois';
    const atual=await require('../src/tarefas/resumoDiario').montarResumoDoDia();
    banco.db.query=consultar;
    assert.deepEqual(atual,anterior,'O resumo completo, incluindo créditos e datas legadas, deve continuar igual.');
    assert.ok(lidas.depois<lidas.antes);
    const ordens={duplicatas_descartadas:'cliente_menor_id,cliente_maior_id',contadores_os:'sistema'};
    const esperados={};
    for(const tabela of TABELAS_BACKUP)esperados[tabela]=JSON.parse(JSON.stringify((await banco.pool.query(`SELECT * FROM ${tabela} ORDER BY ${ordens[tabela]||'id'}`)).rows));
    pasta=await fs.mkdtemp(path.join(os.tmpdir(),'pombo-backup-validacao-'));
    const artefatos=require.resolve('../src/tarefas/qaArtefatos');require.cache[artefatos]={id:artefatos,filename:artefatos,loaded:true,exports:{pastaArtefatosQa:async()=>pasta}};
    const email=require.resolve('../src/servicos/email');require.cache[email]={id:email,filename:email,loaded:true,exports:{enviarEmail:async()=>{throw new Error('Envio externo proibido neste teste');}}};
    const r=await require('../src/tarefas/backupSemanal').rodarBackupSemanal();
    assert.equal(r.ok,true);assert.equal(r.arquivos.length,12);
    const restore=bancos[1].pool;
    assert.equal((await restore.query('SELECT current_schema() nome')).rows[0].nome,destino);
    await restore.query(`TRUNCATE ${TABELAS_BACKUP.join(',')} RESTART IDENTITY CASCADE`);
    let registros=0;
    for(const tabela of TABELAS_BACKUP){
      const arquivo=r.arquivos.find(n=>n.startsWith(`${tabela}-`));
      const linhas=JSON.parse(gunzipSync(await fs.readFile(path.join(pasta,arquivo))));
      assert.deepEqual(linhas,esperados[tabela]);
      const colunasData=new Set((await restore.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND data_type='timestamp without time zone'",[destino,tabela])).rows.map(l=>l.column_name));
      for(const linha of linhas){
        const colunas=Object.keys(linha);
        await restore.query(`INSERT INTO ${tabela} (${colunas.map(c=>`"${c}"`).join(',')}) VALUES (${colunas.map((_,i)=>`$${i+1}`).join(',')})`,colunas.map(c=>colunasData.has(c)?dataLocal(linha[c]):linha[c]));
      }
      registros+=linhas.length;
      assert.deepEqual(JSON.parse(JSON.stringify((await restore.query(`SELECT * FROM ${tabela} ORDER BY ${ordens[tabela]||'id'}`)).rows)),linhas);
    }
    const client=await banco.pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query('SELECT COUNT(*) FROM clientes'); // estabelece o snapshot
      await banco.pool.query("INSERT INTO clientes(nome) VALUES('Concorrente, fora do snapshot')");
      const linhas=JSON.parse(gunzipSync(Buffer.from(await comprimirTabela(client,'clientes'),'base64')));
      assert.deepEqual(linhas,esperados.clientes);
      await client.query('COMMIT');
    }finally{await client.query('ROLLBACK');client.release();}
    console.log(JSON.stringify({validacao:'backup-restauracao-local',tabelas:12,registros,resumoIdentico:true,linhasLidasResumo:lidas,snapshotConcorrente:true,enviosExternos:0}));
  }finally{
    await Promise.all(bancos.map(b=>b.pool.end()));
    for(const schema of [fonte,destino]){
      assert.match(schema,/^qa_(otimizacao|restauracao)_[a-f0-9]{32}$/);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    await admin.end();
    if(pasta){assert.equal(path.dirname(pasta),os.tmpdir());assert.ok(path.basename(pasta).startsWith('pombo-backup-validacao-'));await fs.rm(pasta,{recursive:true,force:true});}
  }
});
