import {test,expect} from '@playwright/test';

async function preparar(page,{valor=12,status='DISPONIVEL',bloqueado=false,pago=false,erroConfiguracoes=false}={}) {
  await page.clock.setFixedTime(new Date('2026-10-07T13:00:00Z'));
  await page.addInitScript(()=>{
    localStorage.setItem('pombo_token','token-simulado');localStorage.setItem('pombo_usuario','QA');
    sessionStorage.setItem('fonadaListaNavegacao','[123,124]');
  });
  const cliente={id:1,nome:'Maria Aparecida da Silva de Oliveira',nascimento:'12/11/60',fixo:'(34) 3333-4444',celular:'(34) 9 8888-7777',whatsapp:'(34) 9 7777-6666',bairro:'JARDIM UBERABA',endereco:'RUA DAS FLORES, 123',complemento:'CASA DO FUNDO',referencia:'PORTÃO AZUL PERTO DA PRAÇA',bloqueado,bloqueio_motivo:bloqueado?'Solicitação do cliente':''};
  let pedido={id:123,senha_os:'37001',cliente_id:1,data_pedido:'07/10/26',horario_pedido:'09:50',valor,cobranca:'08/10/26',periodo:'MANHÃ',recall:'SIM',recall_codigo:'23001',pagou:pago?'SIM':'NÃO',data_pagamento:pago?'07/10/26':'',recebi:pago?'PIX — OPERADOR QA':'',p1_para:'Ana Clara (aniversário da mãe)',p1_tema:'ANIVERSÁRIO DE MÃE',p1_mensagem:'149',p1_fixo:'(34) 3333-2222',p1_celular:'(34) 9 9999-8888',p1_dia:'08/10/26',p1_horario:'09:30',p1_quem_oferece:'OS FILHOS JOÃO E MARIA, NETOS E TODA A FAMÍLIA',p1_resultado:'',p2_para:'Pedro Henrique',p2_tema:'ANIVERSÁRIO GERAL',p2_mensagem:'203',p2_fixo:'',p2_celular:'(34) 9 8888-7777',p2_dia:'09/10/26',p2_horario:'18:30',p2_quem_oferece:'TODA A FAMÍLIA',p2_resultado:'',versao:7,mensagemEmHaver:{status,dataExpiracao:'07/01/27'}};
  const mutacoes=[],tentativas=[{id:1,mensagem:1,data_hora_tentativa:'07/10/26 09:00',observacao:'Caixa postal. Cliente pediu outra tentativa.',remarcado_dia:'08/10/26',remarcado_horario:'09:30'}];
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    if(url.pathname==='/api/configuracoes')return route.fulfill(erroConfiguracoes?{status:500,json:{erro:'Configuração indisponível'}}:{json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}});
    if(url.pathname==='/api/fonadas/proxima-os')return route.fulfill({json:{proximaOs:'37002'}});
    if(['/api/fonadas/123','/api/fonadas/124','/api/fonadas'].includes(url.pathname)) {
      if(method==='PUT'||method==='POST') {const body=req.postDataJSON();mutacoes.push({url:url.pathname,body});pedido={...pedido,...body,versao:pedido.versao+1};return route.fulfill({status:method==='POST'?201:200,json:pedido});}
      return route.fulfill({json:{...pedido,id:url.pathname.endsWith('124')?124:123}});
    }
    if(url.pathname==='/api/clientes/1')return route.fulfill({json:{cliente,fonada:[],aoVivo:[]}});
    if(url.pathname.endsWith('/tentativas'))return route.fulfill({json:{tentativas}});
    if(url.pathname.endsWith('/baixa')||url.pathname.endsWith('/nao-atendeu')) {
      const body=req.postDataJSON();mutacoes.push({url:url.pathname,body});
      if(url.pathname.endsWith('/baixa'))pedido={...pedido,[`p${body.mensagem}_resultado`]:'OK QA 07/10/26 10:00',versao:8};
      else pedido={...pedido,[`p${body.mensagem}_dia`]:body.remarcadoDia,[`p${body.mensagem}_horario`]:body.remarcadoHorario,versao:8};
      return route.fulfill({json:{ok:true}});
    }
    if(url.pathname==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true}\n\n'});
    return route.fulfill({json:{tentativas:[],fonada:[],aoVivo:[]}});
  });
  return {mutacoes,getPedido:()=>pedido};
}
const campo=(page,nome)=>page.getByRole('textbox',{name:nome,exact:true});
async function abrir(page,opcoes) {const estado=await preparar(page,opcoes);await page.goto('/fonada/123');await expect(campo(page,'Valor do pedido Fonada')).toHaveValue(opcoes?.valor===15?'R$ 15,00':'R$ 12,00');return estado;}

test('pedido completo é legível em desktop, notebook e celular',async({page},testInfo)=>{
  const erros=[];page.on('pageerror',e=>erros.push(e.message));await abrir(page);
  for(const [width,height] of [[1920,1080],[1600,1000],[1366,768],[1280,900],[1024,768],[768,900],[390,844],[320,740]]) {
    await page.setViewportSize({width,height});
    expect(await page.locator('.pedido-fonada-moderno').evaluate(el=>el.scrollWidth>el.clientWidth+1),`Pedido transborda em ${width}`).toBe(false);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
    const tema=await campo(page,'Tema da 1ª mensagem').boundingBox(),numero=await campo(page,'Número da 1ª mensagem').boundingBox();
    expect(tema.width,`Tema deve ser maior que número em ${width}`).toBeGreaterThan(numero.width);
    await expect(page.getByRole('button',{name:'Salvar',exact:true})).toBeVisible();
    for(const nome of ['Celular da 1ª mensagem','Dia da 1ª mensagem','Valor do pedido Fonada','Dia da cobrança Fonada']) {
      const input=campo(page,nome);
      expect(await input.evaluate(el=>{const c=document.createElement('canvas').getContext('2d'),s=getComputedStyle(el);c.font=s.font;return c.measureText(el.value).width+parseFloat(s.paddingLeft)+parseFloat(s.paddingRight)<=el.clientWidth+1;}),`${nome} cortado em ${width}`).toBe(true);
    }
    await expect(campo(page,'Para da 1ª mensagem')).toHaveCSS('text-transform','uppercase');
    await expect(page.locator('.historico-tentativas')).not.toHaveAttribute('open','');
    if([1600,1366,390].includes(width))await page.screenshot({path:testInfo.outputPath(`pedido-fonada-${width}.png`),fullPage:true});
  }
  expect(erros).toEqual([]);
});

test('barra de ações e calendário continuam acessíveis após rolar no celular',async({page})=>{
  await page.setViewportSize({width:390,height:844});await abrir(page);
  await campo(page,'Dia da 2ª mensagem').scrollIntoViewIfNeeded();
  const salvar=page.getByRole('button',{name:'Salvar',exact:true});const posicao=await salvar.boundingBox();
  expect(posicao.y).toBeGreaterThanOrEqual(0);expect(posicao.y+posicao.height).toBeLessThan(844);
  await page.getByRole('region',{name:'2ª mensagem',exact:true}).getByRole('button',{name:'Escolher no calendário'}).click();
  const calendario=page.locator('.calendario-popover');await expect(calendario).toBeVisible();const caixa=await calendario.boundingBox();
  expect(caixa.x).toBeGreaterThanOrEqual(0);expect(caixa.x+caixa.width).toBeLessThanOrEqual(390);
  await calendario.getByRole('button',{name:'10',exact:true}).click();await expect(campo(page,'Dia da 2ª mensagem')).toHaveValue('10/10/26');
});

test('erro de concorrência mantém os dados preenchidos e não anuncia sucesso',async({page})=>{
  await abrir(page);await campo(page,'Para da 1ª mensagem').fill('NOME ALTERADO');
  await page.route('**/api/fonadas/123',route=>route.request().method()==='PUT'?route.fulfill({status:409,json:{erro:'Pedido alterado por outra pessoa. Recarregue antes de tentar novamente.'}}):route.fallback());
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect(page.locator('.pf-erro')).toContainText('Pedido alterado por outra pessoa');await expect(campo(page,'Para da 1ª mensagem')).toHaveValue('NOME ALTERADO');
  await expect(page.getByText('Pedido salvo com sucesso.',{exact:true})).toHaveCount(0);
});

test('data passada exige confirmação e valor acima do limite preserva a segunda mensagem salva',async({page})=>{
  const {mutacoes}=await abrir(page);await campo(page,'Dia da 1ª mensagem').fill('061026');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Confirmar data passada'});await expect(dialog).toBeVisible();expect(mutacoes).toHaveLength(0);
  await dialog.getByRole('button',{name:'Voltar e revisar'}).click();await campo(page,'Dia da 1ª mensagem').fill('081026');
  await campo(page,'Valor do pedido Fonada').fill('1500');await expect(campo(page,'Para da 2ª mensagem')).toBeDisabled();
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect.poll(()=>mutacoes.length).toBe(1);
  expect(mutacoes[0].body).toMatchObject({valor:15,p2_para:'Pedro Henrique',p2_dia:'09/10/26',p2_celular:'(34) 9 8888-7777'});
});

test('falha de configuração bloqueia salvar e permite tentar novamente',async({page})=>{
  await abrir(page,{erroConfiguracoes:true});await expect(page.getByRole('button',{name:'Salvar',exact:true})).toBeDisabled();
  await page.route('**/api/configuracoes',route=>route.fulfill({json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}}));
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByRole('button',{name:'Salvar',exact:true})).toBeEnabled();await expect(campo(page,'Para da 2ª mensagem')).toBeEnabled();
});

test('cópia preserva pares de campos e salvar envia valores, recall e versão corretos',async({page})=>{
  const {mutacoes}=await abrir(page);
  await campo(page,'Tema da 1ª mensagem').fill('TEMA ESPECIAL');await campo(page,'Número da 1ª mensagem').fill('620');
  await page.getByRole('button',{name:'Copiar tema/nº para a 2ª mensagem',exact:true}).click();
  await expect(campo(page,'Tema da 2ª mensagem')).toHaveValue('TEMA ESPECIAL');await expect(campo(page,'Número da 2ª mensagem')).toHaveValue('620');
  await page.getByRole('button',{name:'Copiar telefones para a 2ª mensagem',exact:true}).click();await expect(campo(page,'Celular da 2ª mensagem')).toHaveValue('(34) 9 9999-8888');
  await page.getByRole('button',{name:'Copiar dia/horário para a 2ª mensagem',exact:true}).click();await expect(campo(page,'Dia da 2ª mensagem')).toHaveValue('08/10/26');await expect(campo(page,'Horário da 2ª mensagem')).toHaveValue('09:30');
  await page.getByRole('button',{name:'Copiar destinatário para a 2ª mensagem',exact:true}).click();await expect(campo(page,'Para da 2ª mensagem')).toHaveValue('Ana Clara (aniversário da mãe)');
  await page.getByRole('combobox',{name:'Recall do pedido Fonada'}).selectOption('NÃO');await expect(campo(page,'Código de Recall do pedido Fonada')).toHaveValue('');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect.poll(()=>mutacoes.length).toBe(1);
  expect(mutacoes[0].body).toMatchObject({valor:12,recall:'NÃO',recall_codigo:'',versao:7,p2_tema:'TEMA ESPECIAL',p2_mensagem:'620',p2_celular:'(34) 9 9999-8888',p2_dia:'08/10/26',p2_horario:'09:30'});
});

for(const opcoes of [{valor:15,status:'NAO_CONCEDIDA'},{valor:12,status:'EXPIRADA'},{valor:12,bloqueado:true}])test(`restrições continuam protegidas: ${opcoes.bloqueado?'cliente bloqueado':opcoes.status}`,async({page})=>{
  await abrir(page,opcoes);
  await expect(campo(page,'Para da 2ª mensagem')).toBeDisabled();
  for(const botao of await page.locator('.botao-p-copiar').all())await expect(botao).toBeDisabled();
  if(opcoes.bloqueado) {
    await expect(campo(page,'Para da 1ª mensagem')).toBeDisabled();await expect(campo(page,'Valor do pedido Fonada')).toBeDisabled();await expect(page.getByRole('button',{name:'Salvar',exact:true})).toBeDisabled();
    await expect(page.getByRole('button',{name:'Voltar',exact:true})).toBeEnabled();
  }
});

test('histórico inicia contraído e baixa é registrada sem alterar os dados de cobrança',async({page})=>{
  const {mutacoes}=await abrir(page);
  const historico=page.locator('.historico-tentativas');await expect(historico).not.toHaveAttribute('open','');
  await historico.locator('summary').click();await expect(historico).toContainText('Caixa postal');await historico.locator('summary').click();
  await page.getByRole('region',{name:'1ª mensagem',exact:true}).getByRole('button',{name:'Marcar passada',exact:true}).click();
  await expect(campo(page,'Resultado da 1ª mensagem')).toHaveValue('OK QA 07/10/26 10:00');await expect(campo(page,'Valor do pedido Fonada')).toHaveValue('R$ 12,00');
  expect(mutacoes[0].body).toMatchObject({mensagem:1,versao:7});
});

test('remarcação mantém o diálogo acessível e registra nova data e horário',async({page})=>{
  const {mutacoes}=await abrir(page);
  await page.getByRole('region',{name:'1ª mensagem',exact:true}).getByRole('button',{name:'Não atendeu',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Não atendeu — 1ª mensagem'});await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('dd/mm/aa').fill('091026');await dialog.getByPlaceholder('hh:mm').fill('1130');
  await dialog.getByRole('button',{name:'Registrar e remarcar'}).click();await expect(dialog).not.toBeVisible();
  expect(mutacoes[0].body).toMatchObject({mensagem:1,remarcadoDia:'09/10/26',remarcadoHorario:'11:30',versao:7});
});

test('novo pedido salva uma vez e navegação entre pedidos mantém os rascunhos',async({page})=>{
  const {mutacoes}=await preparar(page);await page.goto('/fonada/novo?clienteId=1');
  await campo(page,'Valor do pedido Fonada').fill('1200');await campo(page,'Dia da cobrança Fonada').fill('081026');await campo(page,'Período de cobrança Fonada').fill('MANHÃ');
  await campo(page,'Para da 1ª mensagem').fill('DESTINATÁRIO NOVO');await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect(page).toHaveURL(/\/fonada\/123$/);
  expect(mutacoes.filter(m=>m.url==='/api/fonadas')).toHaveLength(1);
  await campo(page,'Para da 1ª mensagem').fill('ALTERAÇÃO EM RASCUNHO');await page.getByTitle('Próximo pedido na busca').click();await expect(page).toHaveURL(/\/fonada\/124$/);
  await page.getByTitle('Pedido anterior na busca').click();await expect(campo(page,'Para da 1ª mensagem')).toHaveValue('ALTERAÇÃO EM RASCUNHO');
});

test('pagamento recebido permanece somente leitura',async({page})=>{
  await abrir(page,{pago:true});await expect(page.locator('.pf-pagamento')).toContainText('Pago');await expect(page.locator('.pf-pagamento')).toContainText('PIX — OPERADOR QA');
  await expect(page.locator('.pf-pagamento input')).toHaveCount(0);
});
