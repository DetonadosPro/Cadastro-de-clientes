import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparMensagensDuplas, itemConcluido, urgenciaAgenda, minutosHorario, ordenarAgenda, buscarNaAgenda, resumoAgenda, agruparTurnos } from '../src/utils/agenda.js';
const agora = new Date(2026, 9, 5, 10, 0);
const item = (chave, horario, extras={}) => ({_tipo:'fonada', _chave:chave, _horario:horario, passada:false, ...extras});

test('duas mensagens só se agrupam para o mesmo destinatário, dia, horário e situação', () => {
  const a={pedidoId:1,mensagem:1,para:'María',dia:'05/10/26',horario:'10:07',passada:false};
  const b={...a,mensagem:2,para:' MARÍA '};
  const agrupados=agruparMensagensDuplas([a,b]);
  assert.equal(agrupados.length,1);assert.equal(agrupados[0].agrupada,b);
  for(const mudanca of [{dia:'06/10/26'},{horario:'11:07'},{passada:true},{para:'José'}]) assert.equal(agruparMensagensDuplas([a,{...b,...mudanca}]).length,2);
});
test('urgência respeita a margem de dez minutos, a consulta histórica e os itens encerrados', () => {
  assert.equal(urgenciaAgenda(item('1','09:59'),true,agora),'atrasada');
  assert.equal(urgenciaAgenda(item('1','10:10'),true,agora),'proxima');
  assert.equal(urgenciaAgenda(item('1','10:11'),true,agora),null);
  assert.equal(urgenciaAgenda(item('1','09:00'),false,agora),null);
  assert.equal(urgenciaAgenda(item('1','09:00',{passada:true}),true,agora),null);
  assert.equal(urgenciaAgenda(item('1','09:00',{statusMensagemEmHaver:'EXPIRADA'}),true,agora),null);
  assert.equal(urgenciaAgenda(item('1','09:00',{_tipo:'aovivo'}),true,agora),null);
  assert.equal(urgenciaAgenda(item('1','09:00',{_tipo:'lembrete'}),true,agora),'atrasada');
});
test('horários inválidos e tarefas sem horário não geram alertas artificiais', () => {
  for(const horario of ['',null,'24:00','09:99','manhã']) assert.equal(minutosHorario(horario),null);
  assert.equal(minutosHorario('9:07'),547);
  assert.equal(urgenciaAgenda(item('1',''),true,agora),null);
});
test('ordenação mantém horários corretos e deixa tarefas do dia depois dos horários', () => {
  const lista=[item('dia',''),item('tarde','14:00'),item('proximo','10:03'),item('atrasado','09:00')];
  assert.deepEqual(ordenarAgenda(lista,'prioridade',true,agora).map(x=>x._chave),['atrasado','proximo','tarde','dia']);
  assert.equal(lista[0]._chave,'dia');
  assert.deepEqual(agruparTurnos(ordenarAgenda(lista)).map(g=>g.nome),['Manhã','Tarde','Sem horário']);
});
test('busca considera acentos, cliente, destinatário e código da mensagem agrupada', () => {
  const lista=[item('1','09:00',{nome_comprador:'João Silva',para:'Márcia',senha_os:'F-001',agrupada:{codigo:'PARABENS-2'}})];
  for(const busca of ['joao','marcia','F-001','parabens-2','joao marcia']) assert.equal(buscarNaAgenda(lista,busca).length,1);
  assert.equal(buscarNaAgenda(lista,'outra pessoa').length,0);
});
test('resumo separa andamento, atrasos e próximo horário sem contar tarefas vazias como concluídas', () => {
  const lista=[item('late','09:00'),item('next','10:05'),item('dia','',{_tipo:'lembrete'}),item('done','08:30',{passada:true})];
  const resumo=resumoAgenda(lista,true,agora);
  assert.deepEqual([resumo.total,resumo.pendentes,resumo.concluidos,resumo.atrasados,resumo.proximos,resumo.progresso],[4,3,1,1,1,25]);
  assert.equal(resumo.proximo._chave,'next');
  assert.equal(itemConcluido(item('lembrete','',{_tipo:'lembrete',concluido:true})),true);
  assert.equal(resumoAgenda([],true,agora).progresso,0);
  assert.equal(resumoAgenda([item('late','09:00')],true,agora).proximo,null);
});
