import test from 'node:test';
import assert from 'node:assert/strict';
import { nomePeriodo, diasPeriodo, dataRelatorio, compararValores, periodoAnterior, periodoRapido, seriesCalendario, totaisFormas, resumoRelatorio } from '../src/utils/relatorios.js';

test('identifica meses completos e mantém as datas em intervalos parciais', () => {
  assert.equal(nomePeriodo('01/09/26','30/09/26'),'Setembro de 2026');
  assert.equal(nomePeriodo('01/08/26','31/08/26'),'Agosto de 2026');
  assert.match(nomePeriodo('01/09/26','15/09/26'), /15/);
  assert.notEqual(nomePeriodo('01/09/26','15/09/26'),'Setembro de 2026');
});
test('a inversão da comparação troca o vencedor e usa o novo denominador', () => {
  assert.deepEqual(compararValores(8000,5000),{diferenca:3000,percentual:60,vencedor:'principal'});
  assert.deepEqual(compararValores(5000,8000),{diferenca:-3000,percentual:-37.5,vencedor:'comparado'});
  assert.deepEqual(compararValores(0,0),{diferenca:0,percentual:0,vencedor:'empate'});
  assert.equal(compararValores(8000,0).percentual,null);
});
test('intervalo anterior preserva a duração inclusive em mudança de ano', () => {
  assert.deepEqual(periodoAnterior('01/01/26','05/01/26'),{inicio:'27/12/25',fim:'31/12/25'});
  assert.equal(diasPeriodo('01/08/26','31/08/26'),31);
  assert.equal(diasPeriodo('02/09/26','01/09/26'),0);
  assert.equal(dataRelatorio('31/02/26'),null);
});
test('atalhos usam a data de Brasília e tratam fevereiro bissexto', () => {
  assert.deepEqual(periodoRapido('hoje',new Date('2026-10-05T02:00:00Z')),{inicio:'04/10/26',fim:'04/10/26'});
  assert.deepEqual(periodoRapido('mes-anterior',new Date('2024-03-10T12:00:00Z')),{inicio:'01/02/24',fim:'29/02/24'});
});
test('gráficos incluem dias vazios e não esticam um período menor', () => {
  const [a,b]=seriesCalendario([[{data:'01/09/26',valor:100,quantidade:2},{data:'03/09/26',valor:50,quantidade:1}],[]],[{inicio:'01/09/26',fim:'03/09/26'},{inicio:'01/08/26',fim:'02/08/26'}]);
  assert.deepEqual(a.map(p=>p.valor),[100,0,50]);
  assert.deepEqual(a.map(p=>p.quantidade),[2,0,1]);
  assert.equal(b.length,2);
  assert.equal(a[1].data,'02/09/26');
});
test('intervalos extensos mantêm os totais completos em faixas comparáveis', () => {
  const pontos=Array.from({length:365},(_,i)=>({data:new Date(Date.UTC(2026,0,i+1)).toLocaleDateString('en-GB',{timeZone:'UTC'}),valor:10,quantidade:1,fonada:10}));
  const [ano,curto]=seriesCalendario([pontos,[{data:'01/09/26',valor:90,quantidade:3}]],[{inicio:'01/01/26',fim:'31/12/26'},{inicio:'01/09/26',fim:'30/09/26'}]);
  assert.ok(ano.length<=90);
  assert.equal(ano.reduce((s,p)=>s+p.valor,0),3650);
  assert.equal(ano.reduce((s,p)=>s+p.quantidade,0),365);
  assert.equal(curto[0].fim,'05/09/26');
  assert.equal(curto.reduce((s,p)=>s+p.valor,0),90);
});
test('formas de pagamento são somadas da série completa', () => {
  assert.deepEqual(totaisFormas([{formas:{PIX:50,DINHEIRO:10}},{formas:{PIX:70,DINHEIRO:20}}]),[{categoria:'PIX',quantidade:120,valor:120},{categoria:'DINHEIRO',quantidade:30,valor:30}]);
});
test('resumo financeiro distingue recebimentos de vendas e equipe', () => {
  assert.deepEqual(resumoRelatorio({valorTotal:80,valorVendido:200,quantidade:2},'recebimentos'),{valor:80,quantidade:2,ticket:40});
  assert.deepEqual(resumoRelatorio({valorEquipe:150,funcionarios:[{vendasTotal:2},{vendasTotal:1}]},'desempenho'),{valor:150,quantidade:3,ticket:50});
});
