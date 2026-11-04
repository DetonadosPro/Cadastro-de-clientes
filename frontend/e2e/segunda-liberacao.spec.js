import {test,expect} from '@playwright/test';

async function preparar(page,{bloqueado=false}={}){
  await page.addInitScript(()=>{localStorage.setItem('pombo_token','qa');localStorage.setItem('pombo_usuario','QA');});
  const hoje=new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',year:'2-digit',month:'2-digit',day:'2-digit'});
  let pedido={id:7,senha_os:'700',cliente_id:1,nome_comprador:'CLIENTE QA',valor:25,cobranca:hoje,periodo:'MANHÃ',data_pedido:hoje,p1_para:'ANA',p1_dia:hoje,pagou:'NÃO',versao:1,segunda_mensagem_liberada:false,mensagemEmHaver:{status:'NAO_CONCEDIDA'}};
  let gravacoes=0;
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/api/configuracoes')return route.fulfill({json:{limite_segunda_mensagem:12,meses_mensagem_em_haver:3,versao:1}});
    if(url.pathname==='/api/fonadas/7'){
      if(req.method()==='PUT'){gravacoes++;pedido={...pedido,...req.postDataJSON(),versao:2,mensagemEmHaver:{status:'DISPONIVEL',disponivel:true,dataExpiracao:'31/12/2026'}};}
      return route.fulfill({json:pedido});
    }
    if(url.pathname==='/api/clientes/1')return route.fulfill({json:{cliente:{id:1,nome:'CLIENTE QA',bloqueado},fonada:[],aoVivo:[]}});
    if(url.pathname==='/api/eventos')return route.fulfill({contentType:'text/event-stream',body:'event: conectado\ndata: {"ok":true,"versao":1,"instancia":"qa"}\n\n'});
    return route.fulfill({json:{fonada:[],aoVivo:[],lembretes:[],contagens:[],tentativas:[],saldo:0}});
  });
  await page.goto('/fonada/7');
  await expect(page.getByLabel('Para da 2ª mensagem',{exact:true})).toBeDisabled();
  return {ler:()=>pedido,gravacoes:()=>gravacoes};
}

test('Ctrl+Q libera apenas o pedido aberto, salva e permanece após recarregar',async({page})=>{
  const estado=await preparar(page);
  await page.getByLabel('Valor do pedido Fonada').focus();
  await page.keyboard.press('Control+q');
  const segunda=page.getByLabel('Para da 2ª mensagem',{exact:true});
  await expect(segunda).toBeEnabled();await expect(segunda).toBeFocused();
  await segunda.fill('JOÃO');
  expect(estado.gravacoes()).toBe(0);
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await expect.poll(()=>estado.gravacoes()).toBe(1);
  expect(estado.ler().segunda_mensagem_liberada).toBe(true);expect(estado.ler().valor).toBe(25);
  await page.reload();await expect(segunda).toBeEnabled();await expect(segunda).toHaveValue('JOÃO');
  await expect(page.getByText('Liberada neste pedido',{exact:true})).toBeVisible();
});

test('atalho não desbloqueia pedido de cliente bloqueado',async({page})=>{
  await preparar(page,{bloqueado:true});
  await expect(page.getByText('Cliente bloqueado.',{exact:true})).toBeVisible();
  await page.keyboard.press('Control+q');
  await expect(page.getByLabel('Para da 2ª mensagem',{exact:true})).toBeDisabled();
});
