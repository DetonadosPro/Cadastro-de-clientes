const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { db } = require('../src/db/database');
const router = require('../src/routes/aoVivo');

test('edição persiste aniversário e celular do destinatário, sem alterar nascimento do comprador',async()=>{
  const original=db.query;
  let atualizacoes=0;
  db.query=async(sql,params)=>{
    if(sql.startsWith('SELECT id, cliente_id'))return {rows:[{id:123,cliente_id:1}]};
    if(sql.startsWith('SELECT bloqueado'))return {rows:[{bloqueado:false}]};
    assert.match(sql,/UPDATE ao_vivo SET celular_local = \$1, aniversario_destinatario = \$2/);
    assert.doesNotMatch(sql,/\baniversario\s*=/);
    assert.equal(params[0],'(34) 9 9999-8888');
    atualizacoes++;
    return {rows:[{id:123,celular_local:params[0],aniversario_destinatario:params[1],versao:2}]};
  };
  const app=express();app.use(express.json());app.use('/api/ao-vivo',router);
  const servidor=app.listen(0);
  try{
    for(const aniversario of ['29/02','07/10/26','', '31/02','29/02/25']){
      const valido=['29/02','07/10/26',''].includes(aniversario);
      const resposta=await fetch(`http://127.0.0.1:${servidor.address().port}/api/ao-vivo/123`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({celular_local:'(34) 9 9999-8888',aniversario_destinatario:aniversario,versao:1})});
      assert.equal(resposta.status,valido?200:400);
      const dados=await resposta.json();
      if(valido)assert.equal(dados.aniversario_destinatario,aniversario);
      else assert.match(dados.erro,/Aniversário do destinatário inválido/);
    }
    assert.equal(atualizacoes,3);
  }finally{
    db.query=original;
    await new Promise(resolve=>servidor.close(resolve));
  }
});
