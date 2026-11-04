const test=require('node:test');
const assert=require('node:assert/strict');
const {temDireitoSegundaMensagem,situacaoSegundaMensagem,validarDataUsoSegundaMensagem}=require('../src/utils/mensagemEmHaver');

test('liberação individual ignora somente o valor e mantém validade e uso',()=>{
  const p={valor:25,data_pedido:'04/11/26',segunda_mensagem_liberada:true};
  const hoje=new Date(2026,10,4);
  assert.equal(temDireitoSegundaMensagem({...p,segunda_mensagem_liberada:false}),false);
  assert.equal(temDireitoSegundaMensagem(p),true);
  assert.equal(temDireitoSegundaMensagem({...p,segunda_mensagem_liberada:'true'}),false);
  assert.equal(situacaoSegundaMensagem(p,hoje).disponivel,true);
  assert.equal(validarDataUsoSegundaMensagem(p,'05/11/26',hoje).ok,true);
  assert.equal(situacaoSegundaMensagem(p,new Date(2027,10,4)).status,'EXPIRADA');
  assert.equal(validarDataUsoSegundaMensagem({...p,p2_resultado:'PASSADA'},'05/11/26',hoje).ok,false);
  assert.equal(temDireitoSegundaMensagem({valor:25}),false);
});
