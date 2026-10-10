import React, { useEffect, useRef, useState } from 'react';
import { api, getNomeExibicao } from '../api.js';
import { useConfiguracoes } from '../ConfiguracoesContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { AvisoInline, Dialogo, EstadoCarregando } from '../components/Interface.jsx';
import Icone from '../components/IconeAdministracao.jsx';
import { formatarValorMonetario, numeroParaValorMonetario, valorMonetarioParaNumero } from '../mascaras.js';
import './administracao.css';

const moeda=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function Configuracoes() {
  const { configuracoes, setConfiguracoes, erro, carregando, recarregar } = useConfiguracoes();
  const { mostrarToast } = useToast();
  const [valor,setValor]=useState(''),[meses,setMeses]=useState(''),[base,setBase]=useState(null);
  const [salvando,setSalvando]=useState(false),[erroSalvar,setErroSalvar]=useState(''),[conflito,setConflito]=useState(false);
  const [confirmarRecarga,setConfirmarRecarga]=useState(false),[simulado,setSimulado]=useState(numeroParaValorMonetario(12));
  const ocupado=useRef(false);
  const limite=valorMonetarioParaNumero(valor),prazo=Number(meses);
  const valido=Boolean(valor.trim())&&Number.isFinite(limite)&&limite>=0&&limite<=100000&&Number.isInteger(prazo)&&prazo>=1&&prazo<=120;
  const alterado=Boolean(base)&&(limite!==Number(base.limite_segunda_mensagem)||prazo!==Number(base.meses_mensagem_em_haver??3));
  const atualizadoEmOutraSessao=Boolean(base&&configuracoes&&base.versao!==configuracoes.versao);
  function preencher(dados) {
    setBase(dados);setValor(numeroParaValorMonetario(dados.limite_segunda_mensagem));
    setMeses(String(dados.meses_mensagem_em_haver??3));setErroSalvar('');setConflito(false);
  }
  useEffect(()=>{if(configuracoes&&(!base||(!alterado&&!salvando&&base.versao!==configuracoes.versao)))preencher(configuracoes);},[configuracoes,base,alterado,salvando]);
  useEffect(()=>{
    if(!alterado)return;
    const proteger=e=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',proteger);return()=>window.removeEventListener('beforeunload',proteger);
  },[alterado]);
  async function carregarRegras() {
    if(ocupado.current)return;
    const atuais=await recarregar();if(atuais)preencher(atuais);setConfirmarRecarga(false);
  }
  async function salvar(e) {
    e.preventDefault();if(ocupado.current||!alterado)return;
    if(!valido){setErroSalvar('Informe um limite entre R$ 0,00 e R$ 100.000,00 e um prazo inteiro entre 1 e 120 meses.');return;}
    ocupado.current=true;setSalvando(true);setErroSalvar('');setConflito(false);
    try {
      const atual=await api.configuracoes.salvar({limite_segunda_mensagem:limite,meses_mensagem_em_haver:prazo,versao:base.versao});
      setConfiguracoes(atual);preencher(atual);mostrarToast('Configurações salvas.');
    }catch(e){setErroSalvar(e.message);setConflito(e.status===409);}
    finally{ocupado.current=false;setSalvando(false);}
  }
  const valorTeste=valorMonetarioParaNumero(simulado),liberado=Boolean(simulado.trim())&&valorTeste<=limite;
  return <div className="admin-workspace ajustes-renovados">
    <header className="admin-header"><div><span className="admin-eyebrow">Controle da operação</span><h1>Configurações</h1><p>Regras claras. Uma prévia antes de cada mudança.</p></div><span className={`admin-state ${alterado?'rascunho':''}`}><Icone tipo={alterado?'ajustes':'salvo'}/>{alterado?'Alterações não salvas':'Regras em vigor'}</span></header>
    {erro&&<AvisoInline titulo="Não foi possível carregar as configurações" acao={<button className="btn secundario" onClick={recarregar}>Tentar novamente</button>}>{erro}</AvisoInline>}
    {!base?carregando&&<EstadoCarregando rotulo="Carregando configurações…"/>:<>
      <nav className="admin-section-nav" aria-label="Seções das configurações"><a href="#regras-fonada"><Icone tipo="ajustes"/>Regras da Fonada</a><a href="#simular-pedido"><Icone tipo="simulador"/>Simular pedido</a><a href="#informacoes-sistema"><Icone tipo="sistema"/>Sistema</a></nav>
      <div className="ajustes-layout">
        <form id="regras-fonada" className="admin-card ajustes-form" onSubmit={salvar}>
          <div className="admin-card-title"><span className="admin-icon"><Icone tipo="ajustes"/></span><div><h2>Segunda mensagem Fonada</h2><p>Elegibilidade e prazo da mensagem em haver.</p></div></div>
          {(atualizadoEmOutraSessao||conflito)&&<AvisoInline tom="aviso" titulo="As regras mudaram em outra sessão" acao={<button className="btn-small" type="button" onClick={()=>setConfirmarRecarga(true)}>Carregar regras atuais</button>}>Seus ajustes foram preservados. Confira a versão atual antes de salvar.</AvisoInline>}
          <div className="ajustes-step"><span className="ajustes-step-number">01</span><div><h3>Até qual valor liberar?</h3><p>O limite inclui pedidos com exatamente esse valor.</p></div></div>
          <div className="campo ajustes-campo"><label htmlFor="limite-segunda-mensagem">Limite do pedido (R$)</label><input id="limite-segunda-mensagem" inputMode="decimal" required disabled={salvando} value={valor} onChange={e=>setValor(formatarValorMonetario(e.target.value))}/><small>Em vigor: {moeda(configuracoes?.limite_segunda_mensagem??base.limite_segunda_mensagem)}</small></div>
          <div className="ajustes-rule-note">Pedidos acima do limite não recebem segunda mensagem nem saldo em haver. O DDD não interfere nessa regra.</div>
          <div className="ajustes-step"><span className="ajustes-step-number">02</span><div><h3>Por quanto tempo fica em haver?</h3><p>O prazo começa na data da compra.</p></div></div>
          <div className="campo ajustes-campo"><label htmlFor="meses-mensagem-em-haver">Validade da mensagem em haver (meses)</label><input id="meses-mensagem-em-haver" type="number" min="1" max="120" step="1" required disabled={salvando} value={meses} onChange={e=>setMeses(e.target.value)}/><small>Em vigor: {configuracoes?.meses_mensagem_em_haver??base.meses_mensagem_em_haver??3} meses · permitido de 1 a 120</small></div>
          <div className="ajustes-impact"><strong>Onde a mudança se aplica</strong><p>As regras valem para novos pedidos e para os já cadastrados. Mensagens transmitidas e resultados anteriores permanecem no histórico.</p></div>
          {erroSalvar&&<AvisoInline titulo="Não foi possível salvar">{erroSalvar}</AvisoInline>}
          <footer className="ajustes-savebar"><span role="status">{salvando?'Salvando regras…':alterado?'Você tem alterações para salvar.':'Tudo atualizado.'}</span><div><button type="button" className="btn secundario" disabled={salvando||carregando} onClick={()=>alterado?setConfirmarRecarga(true):carregarRegras()}>Recarregar</button><button className="btn" type="submit" disabled={salvando||carregando||!!erro||!alterado||!valido||atualizadoEmOutraSessao||conflito}>{salvando?'Salvando…':'Salvar configurações'}</button></div></footer>
        </form>
        <aside className="ajustes-side">
          <section id="simular-pedido" className="admin-card ajustes-simulator"><div className="admin-card-title"><span className="admin-icon"><Icone tipo="simulador"/></span><div><h2>Experimente a regra</h2><p>Simulação com os valores do formulário.</p></div></div>
            <div className="campo"><label htmlFor="valor-simulacao">Valor do pedido para simular</label><input id="valor-simulacao" inputMode="decimal" value={simulado} onChange={e=>setSimulado(formatarValorMonetario(e.target.value))}/></div>
            <div className={`ajustes-simulation-result ${valido&&simulado.trim()?(liberado?'liberado':'bloqueado'):'invalido'}`} role="status"><strong>{!valido||!simulado.trim()?'Preencha valores válidos':liberado?'Segunda mensagem liberada':'Somente a primeira mensagem'}</strong><p>{!valido||!simulado.trim()?'A prévia aparece assim que o limite, o prazo e o valor estiverem preenchidos.':liberado?`Se ficar em haver, a segunda mensagem valerá por ${prazo} ${prazo===1?'mês':'meses'} a partir da compra.`:`${moeda(valorTeste)} supera o limite de ${moeda(limite)}. Este pedido não gera mensagem em haver.`}</p></div>
            <div className="ajustes-boundary"><span>No limite <strong>{valido?moeda(limite):'—'}</strong></span><b>Libera</b><span>Um centavo acima <strong>{valido?moeda(limite+.01):'—'}</strong></span><b className="fora">Não libera</b></div><small className="admin-muted">A simulação não cria pedidos nem salva configurações.</small>
          </section>
          <section id="informacoes-sistema" className="admin-card"><div className="admin-card-title"><span className="admin-icon"><Icone tipo="sistema"/></span><div><h2>Regras e sessão</h2><p>Referência da configuração salva.</p></div></div><dl className="admin-info"><div><dt>Usuário conectado</dt><dd>{getNomeExibicao()}</dd></div><div><dt>Última alteração por</dt><dd>{configuracoes?.atualizado_por||'Configuração inicial'}</dd></div><div><dt>Última alteração em</dt><dd>{configuracoes?.atualizado_em&&!Number.isNaN(new Date(configuracoes.atualizado_em).getTime())?new Date(configuracoes.atualizado_em).toLocaleString('pt-BR'):'Data não informada'}</dd></div></dl></section>
        </aside>
      </div>
    </>}
    {confirmarRecarga&&<Dialogo titulo="Carregar as regras salvas?" descricao="Os ajustes ainda não salvos serão substituídos pela configuração atual do sistema." onClose={()=>setConfirmarRecarga(false)} className="admin-dialog"><div className="admin-dialog-actions"><button className="btn secundario" onClick={()=>setConfirmarRecarga(false)}>Continuar editando</button><button className="btn" disabled={carregando} onClick={carregarRegras}>{carregando?'Carregando…':'Carregar regras'}</button></div></Dialogo>}
  </div>;
}
