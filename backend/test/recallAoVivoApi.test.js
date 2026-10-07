const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {db}=require('../src/db/database');
const router=require('../src/routes/recall');

test('fila Ao Vivo separa pesquisas e vincula destinatário sem usar telefone do comprador',async()=>{
  const original=db.query;
  db.query=async(sql,params)=>{
    if(sql.includes('FROM ao_vivo a')){
      assert.match(sql,/a.celular_local/);
      assert.match(sql,/c.nascimento cliente_nascimento/);
      const p={id:1,numero_os:'123',cliente_id:7,cliente_nome:'Katia',cliente_nascimento:'07/10/90',cliente_whatsapp:'34999999999',para:'Márcia',dia_entrega:'07/10/25',tema_1:'ANIV GERAL',celular_local:'34988887777'};
      return {rows:[p,{...p,id:2,para:'Sem celular',celular_local:''}]};
    }
    if(sql.includes('FROM clientes')){
      assert.deepEqual(params[0],['34988887777']);
      return {rows:[{id:3,nome:'Márcia',celular:'34988887777',bloqueado:false}]};
    }
    assert.match(sql,/recall_registros/);
    return {rows:[]};
  };
  const app=express();app.use('/api/recall',router);const servidor=app.listen(0);
  try{
    const resposta=await fetch(`http://127.0.0.1:${servidor.address().port}/api/recall/ao-vivo/fila?data=2026-10-07`);
    assert.equal(resposta.status,200);
    const dados=await resposta.json();
    assert.equal(dados.porDiaMensagem.length,2);
    assert.equal(dados.porAniversario.length,1);
    assert.equal(dados.porAniversario[0].clienteId,3);
    assert.equal(dados.porAniversario[0].telefone,'34988887777');
    assert.equal(dados.porAniversario[0].aniversariante,'KATIA');
    assert.equal(dados.porDiaMensagem[0].telefone,'34999999999');
  }finally{db.query=original;await new Promise(resolve=>servidor.close(resolve));}
});
