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
  if(opcoes.detalhesLongos)estado.fonada=estado.fonada.map(f=>f.pedidoId===2?{...f,quemOferece:'Toda a família. '.repeat(180)}:f);
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),metodo=req.method(),body=req.postDataJSON();
    if(url.pathname==='/api/agenda/hoje') {
      if(opcoes.falha){opcoes.falha--;return route.fulfill({status:503,json:{erro:'Agenda indisponível no momento.'}});}
      const data=url.searchParams.get('data')||HOJE;
      return route.fulfill({json:data===HOJE?estado:opcoes.vazio?{data,fonada:[],aoVivo:[],lembretes:[]}:dadosDoDia(data)});
    }
    if(url.pathname==='/api/agenda/contagens')return route.fulfill({json:{contagens:Object.fromEntries((url.searchParams.get('datas')||'').split(',').map(d=>[d,10]))}});
    if(/\/tentativas/.test(url.pathname))return route.fulfill({json:{tentativas:opcoes.historico?[{id:1,mensagem:1,data_hora_tentativa:'05/10/26 09:00',remarcado_dia:HOJE,remarcado_horario:'10:07',observacao:'Cliente pediu para ligar mais tarde. '+ 'Observação longa '.repeat(30)},{id:2,mensagem:2,data_hora_tentativa:'05/10/26 09:10',remarcado_dia:HOJE,remarcado_horario:'10:07'}]:[]}});
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
  await expect(page.getByRole('group',{name:'Em aberto',exact:true}).locator('strong')).toHaveText('7');
  await expect(page.getByRole('group',{name:'Precisam de atenção',exact:true}).locator('strong')).toHaveText('1');
  await expect(page.getByRole('button',{name:'Ver próximo compromisso'})).toContainText('10:05');
  await expect(linha(page,'José')).toHaveCount(1);
  await expect(linha(page,'José')).toContainText('1ª + 2ª juntas');
  await expect(page.getByLabel('Legenda da agenda')).toHaveCount(0);
  await expect(page.getByLabel('Ordenar compromissos')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^Filtrar por/})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Sem horário',exact:true})).toContainText('Ligar para fornecedor');
  await expect(page.locator('.agenda-detalhe-transicao')).toHaveCSS('opacity','1');
  await expect(page.locator('.agenda-detalhe-fonada')).toContainText('Marília');
  await expect(page.getByText('Seu espaço de trabalho',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Detalhes do compromisso',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Fechar detalhes'})).toHaveCount(0);
  await expect(linha(page,'Marília').locator('.linha-agenda-detalhes')).toHaveText('João Silva');
  await expect(linha(page,'José')).not.toContainText('Duas mensagens nesta ligação');
  await expect(linha(page,'Antônio')).not.toContainText('Renata');
  await expect(linha(page,'Antônio').locator('.linha-agenda-detalhes')).toHaveText('Centro');
  await expect(page.locator('.ag-type-marker svg')).toHaveCount(7);
  const os=await linha(page,'Marília').locator('.linha-agenda-os').boundingBox();
  const tags=await linha(page,'Marília').locator('.linha-agenda-tags').boundingBox();
  expect(tags.y).toBeGreaterThan(os.y+os.height);
  expect(tags.x+tags.width).toBeCloseTo(os.x+os.width,0);
  for(const seletor of ['.linha-agenda-titulo','.linha-agenda-detalhes','.agenda-destinatario-principal .info-valor','.agenda-cliente-nome','.agenda-tema-linha > strong','.agenda-oferecimento-fonada p']) {
    await expect(page.locator(seletor).first()).toHaveCSS('text-transform','uppercase');
  }
  await page.screenshot({path:testInfo.outputPath('agenda-desktop.png')});
});
test('busca encontra destinatário, cliente e código da segunda mensagem sem alterar o resumo',async({page})=>{
  await preparar(page);
  await page.getByLabel('Buscar na agenda').fill('marilia');
  await expect(page.locator('.linha-agenda')).toHaveCount(1);
  await expect(linha(page,'Marília')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');
  await page.getByLabel('Buscar na agenda').fill('joao silva');
  await expect(page.locator('.linha-agenda')).toHaveCount(1);
  await expect(linha(page,'Marília')).toBeVisible();
  await page.getByLabel('Buscar na agenda').fill('parabens-2');
  await expect(linha(page,'José')).toHaveCount(1);
  await page.getByRole('button',{name:'Limpar busca'}).click();
  await expect(page.locator('.linha-agenda')).toHaveCount(7);
  await page.getByRole('button',{name:/^Concluídos/}).click();
  await expect(page.locator('.linha-agenda')).toHaveCount(10);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');
});
test('próximo compromisso troca a aba e abre o item correto',async({page})=>{
  await preparar(page);
  await page.getByRole('button',{name:'Fonada 5',exact:true}).click();
  await page.getByRole('button',{name:'Ver próximo compromisso'}).click();
  await expect(page.locator('.painel-detalhes-agenda')).toContainText('Separar material');
  await expect(page).toHaveURL(/item=lembrete-31/);
});
test('baixa e desfazer preservam as duas mensagens e a versão de concorrência',async({page})=>{
  const {mutacoes}=await preparar(page);
  await linha(page,'José').click();
  await expect(page.locator('.agenda-detalhe-fonada')).toContainText('PARABENS-2');
  await page.getByRole('button',{name:'Marcar as 2 passadas',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','40');
  expect(mutacoes[0].body).toMatchObject({mensagens:[1,2],versao:7});
  await page.getByRole('button',{name:/^Concluídos/}).click();
  await linha(page,'José').click();
  await page.getByRole('button',{name:'Desfazer as 2',exact:true}).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');
  expect(mutacoes[1].body).toMatchObject({mensagens:[1,2],versao:8});
});
test('remarcação mantém o pedido agrupado e exige novo horário',async({page})=>{
  const {mutacoes}=await preparar(page);
  await linha(page,'José').click();
  await page.getByRole('button',{name:'Não atendeu',exact:true}).click();
  const modal=page.getByRole('dialog');
  await expect(modal).toContainText('nas 2 mensagens');
  await modal.getByRole('button',{name:'Registrar e remarcar as 2',exact:true}).click();
  await expect(page.getByText('Informe o novo dia e horário para remarcar.',{exact:true})).toBeVisible();
  expect(mutacoes).toHaveLength(0);
  await modal.getByPlaceholder('hh:mm').fill('11:20');
  await modal.getByRole('button',{name:'Registrar e remarcar as 2',exact:true}).click();
  await expect(linha(page,'José')).toHaveCount(0);
  expect(mutacoes[0].body).toMatchObject({mensagens:[1,2],remarcadoDia:HOJE,remarcadoHorario:'11:20',versao:7});
});
test('conflito de outro operador não altera o andamento nem simula uma baixa',async({page})=>{
  await preparar(page,{conflito:true});
  await linha(page,'José').click();
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
  await expect(page.getByRole('group',{name:'Precisam de atenção'})).toContainText('Alertas somente hoje');
  await linha(page,'José').click();
  await expect(page.getByRole('button',{name:'Marcar as 2 passadas',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Hoje',exact:true}).click();
  await expect(page.getByRole('group',{name:'Precisam de atenção',exact:true}).locator('strong')).toHaveText('1');
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
  await linha(page,'José').tap();
  await expect(page.getByRole('dialog',{name:'Detalhes do compromisso'})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Detalhes do compromisso'})).toHaveCSS('opacity','1');
  await expect(page.getByRole('button',{name:'Fechar detalhes'})).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.screenshot({path:testInfo.outputPath('agenda-detalhes-celular.png')});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await linha(page,'José').focus();
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
  await page.locator('.ag-filter-empty').getByRole('button',{name:'Limpar busca',exact:true}).click();
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

test('dias cheios mantêm a leitura por horário e links antigos não ocultam pedidos',async({page})=>{
  await preparar(page,{listaGrande:true});
  await expect(page.locator('.linha-agenda')).toHaveCount(50);
  await expect(page.getByRole('group',{name:'Em aberto',exact:true}).locator('strong')).toHaveText('87');
  await page.getByRole('button',{name:/^Mostrar mais/}).click();
  await expect(page.locator('.linha-agenda')).toHaveCount(87);
  await expect(page.getByRole('region',{name:'Manhã',exact:true})).toBeVisible();
  await page.goto('/agenda?ordem=prioridade&situacao=atrasados&item=179-1');
  await expect.poll(()=>new URL(page.url()).searchParams.has('situacao')).toBe(false);
  await expect.poll(()=>new URL(page.url()).searchParams.has('ordem')).toBe(false);
  await expect(linha(page,'Destinatário extra 79')).toHaveAttribute('aria-pressed','true');
  await expect(linha(page,'Destinatário extra 79')).toBeVisible();
});

test('selecionar pedidos preserva a posição da página quando a janela é baixa',async({page})=>{
  await page.setViewportSize({width:1366,height:500});
  await preparar(page,{listaGrande:true});
  const pedido=linha(page,'Destinatário extra 5');
  await page.waitForTimeout(600);
  await pedido.scrollIntoViewIfNeeded();
  const conteudo=page.locator('.layout-conteudo');
  const posicao=await conteudo.evaluate(el=>el.scrollTop);
  expect(posicao).toBeGreaterThan(100);
  await pedido.click();
  await expect(page).toHaveURL(/item=105-1/);
  await expect.poll(()=>conteudo.evaluate(el=>el.scrollTop)).toBeCloseTo(posicao,0);
  await expect(pedido).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/Novo cliente/}).click();
  await expect(page).toHaveURL(/\/clientes\/novo$/);
  await page.goBack();
  await expect(page).toHaveURL(/item=105-1/);
  await expect.poll(()=>conteudo.evaluate(el=>el.scrollTop)).toBeCloseTo(posicao,0);
});

test('rodinha move a lista sob o mouse sem clicar ou mudar o foco',async({page})=>{
  await page.setViewportSize({width:1920,height:940});
  await preparar(page,{listaGrande:true,detalhesLongos:true});
  await linha(page,'José').click();
  const busca=page.getByLabel('Buscar na agenda');
  await busca.focus();
  const lista=page.getByRole('region',{name:'Lista de compromissos'});
  const painel=page.getByRole('region',{name:'Detalhes do pedido selecionado'});
  const caixa=await lista.boundingBox();
  await page.mouse.move(caixa.x+caixa.width/2,caixa.y+60);
  await page.mouse.wheel(0,240);
  await expect.poll(()=>lista.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  await expect(busca).toBeFocused();
  await expect(page).toHaveURL(/item=2-1/);
  await expect(page.locator('.layout-conteudo')).toHaveJSProperty('scrollTop',0);
  await page.mouse.wheel(0,-240);
  await expect.poll(()=>lista.evaluate(el=>el.scrollTop)).toBe(0);
  await page.mouse.wheel(0,240);
  await expect.poll(()=>lista.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  const posicao=await lista.evaluate(el=>el.scrollTop);
  const caixaPainel=await painel.boundingBox();
  await page.mouse.move(caixaPainel.x+caixaPainel.width/2,caixaPainel.y+60);
  await page.mouse.wheel(0,240);
  await expect.poll(()=>painel.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  await expect(lista).toHaveJSProperty('scrollTop',posicao);
  const calendario=await page.locator('.ag-calendar').boundingBox();
  await page.mouse.move(calendario.x+20,calendario.y+20);
  await page.mouse.wheel(0,240);
  await expect(lista).toHaveJSProperty('scrollTop',posicao);
  const zoom=await lista.evaluate(el=>{
    const evento=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:100});
    el.dispatchEvent(evento);
    return {cancelado:evento.defaultPrevented,posicao:el.scrollTop};
  });
  expect(zoom).toEqual({cancelado:false,posicao});
});

test('calendário compacto mantém pedidos e detalhes dentro da área útil do computador',async({page},testInfo)=>{
  await preparar(page,{listaGrande:true,detalhesLongos:true});
  for(const [width,height] of [[1920,940],[1600,800],[1366,650],[1280,600]]) {
    await page.setViewportSize({width,height});
    await expect(page.locator('.agenda-moderna').first()).toHaveClass(/ag-workspace-fixo/);
    await expect.poll(()=>page.locator('.layout-conteudo').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
    const calendario=await page.locator('.ag-calendar').boundingBox();
    const resumo=await page.locator('.ag-overview').boundingBox();
    const grade=await page.locator('.grid-agenda-lista-painel').boundingBox();
    expect(calendario.height).toBeLessThan(110);
    expect(resumo.height).toBeLessThanOrEqual(52);
    expect(grade.height).toBeGreaterThan(height-380);
    expect(grade.height).toBeGreaterThanOrEqual(160);
    expect(grade.y+grade.height).toBeLessThanOrEqual(height-12);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
    await page.screenshot({path:testInfo.outputPath(`agenda-compacta-${width}x${height}.png`)});
  }
  await page.setViewportSize({width:1920,height:940});
  await linha(page,'José').click();
  const painel=page.getByRole('region',{name:'Detalhes do pedido selecionado'});
  const lista=page.getByRole('region',{name:'Lista de compromissos'});
  await expect.poll(()=>painel.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(100);
  await painel.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await expect(painel.getByRole('button',{name:'Marcar as 2 passadas',exact:true})).toBeInViewport();
  await expect(page.getByRole('button',{name:'+ Lembrete',exact:true})).toBeInViewport();
  await lista.evaluate(el=>{el.scrollTop=200;});
  const alvo=linha(page,'Destinatário extra 5');
  await alvo.scrollIntoViewIfNeeded();
  const posicao=await lista.evaluate(el=>el.scrollTop);
  // Clique real na linha visível, sem a rolagem preparatória do localizador.
  const caixaAlvo=await alvo.boundingBox();
  await page.mouse.click(caixaAlvo.x+caixaAlvo.width/2,caixaAlvo.y+caixaAlvo.height/2);
  await expect(page).toHaveURL(/item=105-1/);
  await expect.poll(()=>lista.evaluate(el=>el.scrollTop)).toBeCloseTo(posicao,0);
  await expect(painel).toHaveJSProperty('scrollTop',0);
  await expect(page.locator('.layout-conteudo')).toHaveJSProperty('scrollTop',0);
  await page.setViewportSize({width:1366,height:500});
  await expect(page.locator('.agenda-moderna').first()).not.toHaveClass(/ag-workspace-fixo/);
  await page.setViewportSize({width:1280,height:720});
  await expect(page.locator('.agenda-moderna').first()).toHaveClass(/ag-workspace-fixo/);
  await page.getByRole('button',{name:'Próximo dia',exact:true}).click();
  await expect(page.locator('.ag-consultation-note')).toBeVisible();
  await expect.poll(()=>page.locator('.layout-conteudo').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
  await page.getByLabel('Buscar na agenda').fill('Sem resultado algum');
  await expect(page.getByText('Nenhum compromisso encontrado',{exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('.layout-conteudo').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
});


test('remarcações fechadas ocupam uma linha e abrem o histórico sem cortar o painel',async({page},testInfo)=>{
  await page.setViewportSize({width:1366,height:650});
  await preparar(page,{historico:true});
  await linha(page,'José').click();
  const caixas=page.locator('.ag-remarcacoes');
  await expect(caixas).toHaveCount(2);
  for(const caixa of await caixas.all()) {
    expect((await caixa.boundingBox()).height).toBeLessThanOrEqual(40);
    await expect(caixa.getByRole('button')).toHaveAttribute('aria-expanded','false');
  }
  const toggle=caixas.first().getByRole('button');
  await toggle.scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('remarcacoes-compactas.png')});
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(caixas.first().getByText('Remarcado para 05/10/26 às 10:07')).toBeVisible();
  const painel=page.getByRole('region',{name:'Detalhes do pedido selecionado'});
  expect(await painel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  expect((await caixas.first().boundingBox()).height).toBeLessThanOrEqual(40);
});


test('painel termina após remarcações e limita apenas detalhes que excedem a tela',async({page},testInfo)=>{
  await page.setViewportSize({width:1660,height:1050});
  await preparar(page,{historico:true});
  await linha(page,'Marília').click();
  const painel=page.getByRole('region',{name:'Detalhes do pedido selecionado'});
  const historico=painel.locator('.ag-remarcacoes');
  await expect(historico).toHaveCount(1);
  const grade=await page.locator('.grid-agenda-lista-painel').boundingBox();
  const caixaPainel=await painel.boundingBox();
  const caixaHistorico=await historico.boundingBox();
  expect(caixaPainel.height).toBeLessThan(grade.height-50);
  expect(caixaPainel.y+caixaPainel.height-caixaHistorico.y-caixaHistorico.height).toBeLessThanOrEqual(18);
  await expect(painel).toHaveJSProperty('scrollTop',0);
  await page.screenshot({path:testInfo.outputPath('detalhes-sem-espaco-vazio.png')});
  await historico.getByRole('button').click();
  await expect(historico.getByRole('button')).toHaveAttribute('aria-expanded','true');
  await page.setViewportSize({width:1366,height:650});
  await expect.poll(()=>painel.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(0);
  await expect.poll(()=>page.locator('.layout-conteudo').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
  const caixaMenor=await painel.boundingBox();
  expect(caixaMenor.y+caixaMenor.height).toBeLessThanOrEqual(650-12);
  await painel.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await expect(historico.getByText('Remarcado para 05/10/26 às 10:07')).toBeInViewport();
});
