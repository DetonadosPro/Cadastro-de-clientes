const test=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {randomUUID}=require('node:crypto');
const express=require('express');

test('PostgreSQL local: exceção por pedido persiste sem mudar valor, limite ou versão concorrente',{
  skip:!process.env.TEST_DATABASE_URL,timeout:30000,
},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  const schema=`qa_segunda_${randomUUID().replaceAll('-','')}`;
  const admin=new Pool({connectionString:url.toString()});let banco,server;
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);
    process.env.DATABASE_URL=url.toString();process.env.PGOPTIONS=`-c search_path=${schema}`;
    banco=require('../src/db/database');await banco.iniciarBanco();
    const migracao=await banco.pool.connect();
    try { await require('../scripts/liberarColunaSegundaMensagem').aplicarColuna(migracao); }
    finally { migracao.release(); }
    const cliente=(await banco.pool.query("INSERT INTO clientes(nome) VALUES('Cliente fictício') RETURNING id")).rows[0];
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.usuario={usuario:'QA'};next();});
    app.use('/fonadas',require('../src/routes/fonadas'));
    app.use('/agenda',require('../src/routes/agenda'));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const enviar=async(rota,method='GET',dados)=>{const r=await fetch(base+rota,{method,headers:{'Content-Type':'application/json'},...(dados?{body:JSON.stringify(dados)}:{})});return {status:r.status,dados:await r.json()};};
    const hoje=new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',year:'2-digit',month:'2-digit',day:'2-digit'});
    const pedido={cliente_id:cliente.id,nome_comprador:'Cliente fictício',valor:25,cobranca:hoje,periodo:'MANHÃ',p1_dia:hoje,p1_para:'ANA',p2_dia:hoje,p2_para:'JOÃO'};
    assert.equal((await enviar('/fonadas','POST',pedido)).status,409);
    assert.equal((await enviar('/fonadas','POST',{...pedido,segunda_mensagem_liberada:'true'})).status,400);
    const criado=await enviar('/fonadas','POST',{...pedido,segunda_mensagem_liberada:true});
    assert.equal(criado.status,201);
    const id=criado.dados.id;
    const lido=(await enviar(`/fonadas/${id}`)).dados;
    assert.equal(lido.segunda_mensagem_liberada,true);assert.equal(lido.valor,25);
    assert.equal(lido.mensagemEmHaver.concedida,true);
    const agenda=(await enviar(`/agenda/hoje?data=${hoje}`)).dados;
    assert.ok(agenda.fonada.some(p=>p.pedidoId===id&&p.mensagem===2));
    const alterado=await enviar(`/fonadas/${id}`,'PUT',{p2_tema:'ANIV GERAL',versao:lido.versao});
    assert.equal(alterado.status,200);assert.equal(alterado.dados.segunda_mensagem_liberada,true);
    assert.equal((await enviar(`/fonadas/${id}`,'PUT',{p2_tema:'OUTRO',versao:lido.versao})).status,409);
    const normal=await enviar('/fonadas','POST',{...pedido,p2_dia:'',p2_para:'',senha_os:undefined});
    assert.equal(normal.status,201);
    const liberado=await enviar(`/fonadas/${normal.dados.id}`,'PUT',{segunda_mensagem_liberada:true,p2_dia:hoje,p2_para:'PAULO',versao:normal.dados.versao});
    assert.equal(liberado.status,200);
    assert.equal((await banco.pool.query('SELECT limite_segunda_mensagem FROM configuracoes_sistema WHERE id=1')).rows[0].limite_segunda_mensagem,'12.00');
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(banco)await banco.pool.end();
    assert.match(schema,/^qa_segunda_[a-f0-9]{32}$/);await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
