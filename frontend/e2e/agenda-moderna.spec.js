import { test, expect } from '@playwright/test';
const HOJE='05/10/26';
function dadosDoDia(data=HOJE) {
  const base={cliente_id:100,versao:7,passada:false,resultado:null,whatsapp:'',dia:data,celular:'34999998888',tema:'Aniversário',codigo:'ABC',quemOferece:'Toda a família'};
  const fonada=[{...base,pedidoId:1,mensagem:1,senha_os:'F001',nome_comprador:'João Silva',para:'Marília',horario:'09:20'},
    ...[1,2].map(mensagem=>({...base,pedidoId:2,mensagem,senha_os:'F002',nome_comprador:'Ana Maria',para:'José',horario:'10:07',codigo:`PARABENS-${mensagem}`})),
    {...base,pedidoId:3,mensagem:1,senha_os:'F003',nome_comprador:'Carla',para:'Vitória',horario:'14:00'},
    {...base,pedidoId:4,mensagem:1,senha_os:'F004',nome_comprador:'Roberto',para:'Fernanda',horario:'08:30',passada:true,resultado:'OK'},
    {...base,pedidoId:5,mensagem:2,senha_os:'F005',nome_comprador:'Paulo',para:'Lúcia',horario:'09:00',statusMensagemEmHaver:'EXPIRADA',dataExpiracaoMensagem:'01/10/26'}];
  const aoVivo=[{id:20,cliente_id:100,numero_os:'AV020',comprador:'Renata',para:'Antônio',dia_entrega:data,horario_entrega:'13:30',bairro:'Centro',endereco:'Rua das Flores, 20',brinde:'Flores',pagamento:'PIX',pagou:'SIM',passada:false,tema_1:'Aniversário',mensagem_codigo_1:'AV-01'},
    {id:21,numero_os:'AV021',comprador:'Silvia',para:'Carlos',horario_entrega:'09:30',passada:true,resultado_entrega:'Entregue',pagou:'NÃO'}];
  const lembretes=[{id:30,titulo:'Ligar para fornecedor',data:'2026-10-05',horario:null,observacao:'Conferir disponibilidade das flores',concluido:false},
    {id:31,titulo:'Separar material',data:'2026-10-05',horario:'10:05',observacao:'Preparar entregas da tarde',concluido:false},
    {id:32,titulo:'Conferir pedidos',data:'2026-10-05',horario:'09:50',concluido:true}];
  return {data,fonada,aoVivo,lembretes};
}
async function preparar(page,opcoes={}) {
  await page.clock.setFixedTime(new Date('2026-10-05T13:00:00Z'));
  await page.addInitScript(()=>{localStorage.setItem('pombo_token','token-simulado');localStorage.setItem('pombo_usuario','QA');localStorage.setItem('pombo_nome','Operador de exemplo');});
  const estado=dadosDoDia(),mutacoes=[];
  if(opcoes.listaGrande)estado.fonada.push(...Array.from({length:80},(_,i)=>({...estado.fonada[0],pedidoId:100+i,senha_os:`F${100+i}`,nome_comprador:`Cliente extra ${i}`,para:`Destinatário extra ${i}`,horario:'15:00'})));
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),metodo=req.method(),body=req.postDataJSON();
    if(url.pathname==='/api/agenda/hoje') {
      if(opcoes.falha){opcoes.falha--;return route.fulfill({status:503,json:{erro:'Agenda indisponível no momento.'}});}
      const data=url.searchParams.get('data')||HOJE;
      return route.fulfill({json:data===HOJE?estado:opcoes.vazio?{data,fonada:[],aoVivo:[],lembretes:[]}:dadosDoDia(data)});
    }
    if(url.pathname==='/api/agenda/contagens')return route.fulfill({json:{contagens:Object.fromEntries((url.searchParams.get('datas')||'').split(',').map(d=>[d,10]))}});
    if(/\/tentativas/.test(url.pathname))return route.fulfill({json:{tentativas:[]}});
    if(url.pathname==='/api/agenda/lembretes'&&metodo==='POST') {
      mutacoes.push({url:url.pathname,body});const novo={...body,id:90};estado.lembretes.push(novo);return route.fulfill({status:201,json:novo});
    }
    if(url.pathname.startsWith('/api/agenda/lembretes/')&&metodo==='PUT') {
      mutacoes.push({url:url.pathname,body});const id=Number(url.pathname.split('/').pop());estado.lembretes=estado.lembretes.map(l=>l.id===id?{...l,...body}:l);return route.fulfill({json:body});
    }
    if(/\/fonada\/\d+\/(baixa|desfazer-baixa|nao-atendeu)$/.test(url.pathname)) {
      mutacoes.push({url:url.pathname,body});
      if(opcoes.conflito)return route.fulfill({status:409,json:{erro:'Pedido alterado por outra pessoa. Recarregue antes de tentar novamente.'}});
      const id=Number(url.pathname.split('/')[4]),mensagens=body.mensagens||[body.mensagem];
      estado.fonada=estado.fonada.map(f=>f.pedidoId===id&&mensagens.includes(f.mensagem)?{...f,passada:!url.pathname.endsWith('desfazer-baixa'),resultado:url.pathname.endsWith('desfazer-baixa')?null:'OK',versao:f.versao+1}:f);
      if(url.pathname.endsWith('nao-atendeu'))estado.fonada=estado.fonada.filter(f=>!(f.pedidoId===id&&mensagens.includes(f.mensagem)));
      return route.fulfill({json:{ok:true}});
    }
    if(url.pathname==='/api/configuracoes')return route.fulfill({json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}});
    if(url.pathname==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n'});
    return route.fulfill({json:{}});
  });
  await page.goto('/agenda');
  if(!opcoes.semEsperar)await expect(page.getByRole('region',{name:'Resumo do dia'})).toBeVisible();
  return {estado,mutacoes};
}
const linha=(page,texto)=>page.locator('.linha-agenda').filter({hasText:texto});

test('resumo, horários e mensagens agrupadas representam o dia completo',async({page},testInfo)=>{
  await page.setViewportSize({width:1440,height:1000});
  await preparar(page);
  await expect(page.getByRole('progressbar',{name:'Compromissos concluídos'})).toHaveAttribute('aria-valuenow','30');
  await expect(page.getByRole('button',{name:'Mostrar pendentes',exact:true}).locator('strong')).toHaveText('7');
  await expect(page.getByRole('button',{name:'Mostrar atrasados',exact:true}).locator('strong')).toHaveText('1');
  await expect(page.getByRole('button',{name:'Ver próximo compromisso'})).toContainText('10:05');
  await expect(linha(page,'Ana Maria')).toHaveCount(1);
  await expect(linha(page,'Ana Maria')).toContainText('1ª + 2ª juntas');
  await expect(page.getByLabel('Legenda da agenda')).toContainText('Lembrete');
  await expect(page.getByRole('region',{name:'Sem horário',exact:true})).toContainText('Ligar para fornecedor');
  await expect(page.locator('.agenda-detalhe-transicao')).toHaveCSS('opacity','1');
  await expect(page.locator('.agenda-detalhe-fonada')).toContainText('Marília');
  await page.screenshot({path:testInfo.outputPath('agenda-desktop.png')});
});
test('busca encontra destinatário, cliente e código da segunda mensagem; filtros mantêm os totais',async({page})=>{
  await preparar(page);
  await page.getByLabel('Buscar na agenda').fill('marilia');
  await expect(page.locator('.linha-agenda')).toHaveCount(1);
  await expect(linha(page,'João Silva')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');
  await page.getByLabel('Buscar na agenda').fill('parabens-2');
  await expect(linha(page,'Ana Maria')).toHaveCount(1);
  await page.getByRole('button',{name:'Limpar busca'}).click();
  await page.getByRole('button',{name:'Filtrar por atrasados',exact:true}).click();
  await expect(page.locator('.linha-agenda')).toHaveCount(1);
  await expect(linha(page,'João Silva')).toBeVisible();
  await page.getByRole('button',{name:'Filtrar por próximos',exact:true}).click();
  await expect(page.locator('.linha-agenda')).toHaveCount(2);
  await page.getByRole('button',{name:'Filtrar por concluídos',exact:true}).click();
  await expect(page.locator('.linha-agenda')).toHaveCount(3);
});
test('próximo compromisso muda os filtros e abre o item correto',async({page})=>{
  await preparar(page);
  await page.getByRole('button',{name:'Fonada 5',exact:true}).click();
  await page.getByRole('button',{name:'Ver próximo compromisso'}).click();
  await expect(page.locator('.painel-detalhes-agenda')).toContainText('Separar material');
  await expect(page).toHaveURL(/item=lembrete-31/);
});
test('baixa e desfazer preservam as duas mensagens e a versão de concorrência',async({page})=>{
  const {mutacoes}=await preparar(page);
  await linha(page,'Ana Maria').click();
  await expect(page.locator('.agenda-detalhe-fonada')).toContainText('PARABENS-2');
  await page.getByRole('button',{name:'Marcar as 2 passadas',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','40');
  expect(mutacoes[0].body).toMatchObject({mensagens:[1,2],versao:7});
  await page.getByRole('button',{name:/^Concluídos/}).click();
  await linha(page,'Ana Maria').click();
  await page.getByRole('button',{name:'Desfazer as 2',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');
  expect(mutacoes[1].body).toMatchObject({mensagens:[1,2],versao:8});
});
test('remarcação mantém o pedido agrupado e exige novo horário',async({page})=>{
  const {mutacoes}=await preparar(page);
  await linha(page,'Ana Maria').click();
  await page.getByRole('button',{name:'Não atendeu',exact:true}).click();
  const modal=page.getByRole('dialog');
  await expect(modal).toContainText('nas 2 mensagens');
  await modal.getByRole('button',{name:'Registrar e remarcar as 2',exact:true}).click();
  await expect(page.getByText('Informe o novo dia e horário para remarcar.',{exact:true})).toBeVisible();
  expect(mutacoes).toHaveLength(0);
  await modal.getByPlaceholder('hh:mm').fill('11:20');
  await modal.getByRole('button',{name:'Registrar e remarcar as 2',exact:true}).click();
  await expect(linha(page,'Ana Maria')).toHaveCount(0);
  expect(mutacoes[0].body).toMatchObject({mensagens:[1,2],remarcadoDia:HOJE,remarcadoHorario:'11:20',versao:7});
});
test('conflito de outro operador não altera o andamento nem simula uma baixa',async({page})=>{
  await preparar(page,{conflito:true});
  await linha(page,'Ana Maria').click();
  await page.getByRole('button',{name:'Marcar as 2 passadas',exact:true}).click();
  await expect(page.getByText('Pedido alterado por outra pessoa. Recarregue antes de tentar novamente.',{exact:true})).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');
  await expect(page.getByRole('button',{name:'Marcar as 2 passadas',exact:true})).toBeEnabled();
});
test('lembrete pode ser criado, concluído e reaberto pela nova agenda',async({page})=>{
  await preparar(page);
  await page.getByRole('button',{name:'+ Lembrete',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Novo lembrete'});
  await modal.getByLabel('Título *').fill('Confirmar estoque');
  await modal.getByLabel('Horário (opcional)').fill('15:10');
  await modal.getByRole('button',{name:'Salvar lembrete',exact:true}).click();
  await linha(page,'Confirmar estoque').click();
  await page.getByRole('button',{name:'Marcar concluído',exact:true}).click();
  await page.getByRole('button',{name:/^Concluídos/}).click();
  await linha(page,'Confirmar estoque').click();
  await page.getByRole('button',{name:'Reabrir',exact:true}).click();
  await expect(linha(page,'Confirmar estoque')).toBeVisible();
});
test('consulta de outro dia limpa seleção, evita alertas de hoje e permite voltar',async({page})=>{
  await preparar(page);
  await page.getByRole('button',{name:'Próximo dia',exact:true}).click();
  await expect(page.locator('.ag-day-content')).toHaveAttribute('aria-busy','false');
  await expect(page).toHaveURL(/data=06%2F10%2F26/);
  await expect(page.getByRole('button',{name:'Filtrar por atrasados'})).toBeDisabled();
  await linha(page,'Ana Maria').click();
  await expect(page.getByRole('button',{name:'Marcar as 2 passadas',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Hoje',exact:true}).click();
  await expect(page.getByRole('button',{name:'Mostrar atrasados',exact:true}).locator('strong')).toHaveText('1');
});
test('celular e tablet mantêm o layout e detalhes com teclado, toque e fechamento acessível',async({page},testInfo)=>{
  const erros=[];page.on('pageerror',erro=>erros.push(erro.message));
  await page.setViewportSize({width:390,height:900});
  await preparar(page);
  for(const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),`Transbordamento em ${width}px`).toBe(false);
    await expect(page.locator('.workspace-relogio')).toBeVisible();
  }
  await page.setViewportSize({width:390,height:900});
  await page.screenshot({path:testInfo.outputPath('agenda-celular.png'),fullPage:true});
  await linha(page,'Ana Maria').tap();
  await expect(page.getByRole('dialog',{name:'Detalhes do compromisso'})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Detalhes do compromisso'})).toHaveCSS('opacity','1');
  await expect(page.getByRole('button',{name:'Fechar detalhes'})).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.screenshot({path:testInfo.outputPath('agenda-detalhes-celular.png')});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await linha(page,'Ana Maria').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.drawer-overlay-mobile').click({position:{x:2,y:2}});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('data inválida mantém o dia identificado e não dispara uma consulta para o período errado',async({page})=>{
  await preparar(page);
  await page.locator('#ag-data').fill('31/02/26');
  await expect(page.getByText('Informe uma data completa e válida para trocar o dia.')).toBeVisible();
  await expect(page.locator('.ag-day-title h2')).toContainText('5 de outubro de 2026');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');
  await page.getByRole('button',{name:'Hoje',exact:true}).click();
  await expect(page.locator('#ag-data')).toHaveValue(HOJE);
});

test('dia vazio e busca sem resultado têm orientações próprias',async({page})=>{
  await preparar(page,{vazio:true});
  await page.getByRole('button',{name:'Próximo dia',exact:true}).click();
  await expect(page.getByText('Agenda livre neste dia',{exact:true})).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
  await page.getByLabel('Buscar na agenda').fill('teste');
  await expect(page.getByText('Nenhum compromisso encontrado',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
  await expect(page.getByText('Agenda livre neste dia',{exact:true})).toBeVisible();
});

test('falha inicial permite tentar novamente sem deixar a agenda presa no carregamento',async({page})=>{
  const opcoes={falha:999,semEsperar:true};
  await preparar(page,opcoes);
  await expect(page.getByText('Não foi possível atualizar a agenda',{exact:true})).toBeVisible();
  opcoes.falha=0;
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await expect(page.getByRole('region',{name:'Resumo do dia'})).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');
});

test('dias cheios mostram mais registros sem reduzir o resumo e preservam a organização escolhida',async({page})=>{
  await preparar(page,{listaGrande:true});
  await expect(page.locator('.linha-agenda')).toHaveCount(50);
  await expect(page.getByRole('button',{name:'Mostrar pendentes',exact:true}).locator('strong')).toHaveText('87');
  await page.getByRole('button',{name:/^Mostrar mais/}).click();
  await expect(page.locator('.linha-agenda')).toHaveCount(87);
  await page.getByLabel('Ordenar compromissos').selectOption('prioridade');
  await expect(page.getByRole('region',{name:'Prioridades do dia'})).toBeVisible();
  await expect(page.locator('.linha-agenda').first()).toContainText('Marília');
  await page.reload();
  await expect(page.getByLabel('Ordenar compromissos')).toHaveValue('prioridade');
  await page.goto('/agenda?ordem=prioridade&item=179-1');
  await expect(linha(page,'Cliente extra 79')).toHaveAttribute('aria-pressed','true');
  await expect(linha(page,'Cliente extra 79')).toBeVisible();
});
