import React, { useEffect, useState } from 'react';
import { api, getNomeExibicao } from '../api.js';
import { useConfiguracoes } from '../ConfiguracoesContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { CabecalhoPagina, AvisoInline, EstadoCarregando } from '../components/Interface.jsx';
import { formatarValorMonetario, numeroParaValorMonetario, valorMonetarioParaNumero } from '../mascaras.js';

export default function Configuracoes() {
  const { configuracoes, setConfiguracoes, erro, carregando, recarregar } = useConfiguracoes();
  const { mostrarToast } = useToast();
  const [valor, setValor] = useState('');
  const [versao, setVersao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');
  useEffect(() => { if (configuracoes && versao === null) { setValor(numeroParaValorMonetario(configuracoes.limite_segunda_mensagem)); setVersao(configuracoes.versao); } }, [configuracoes, versao]);
  async function salvar(e) {
    e.preventDefault();
    if (salvando) return;
    if (!valor.trim()) { setErroSalvar('Informe o limite de valor.'); return; }
    setSalvando(true); setErroSalvar('');
    try {
      const atual = await api.configuracoes.salvar({ limite_segunda_mensagem: valorMonetarioParaNumero(valor), versao });
      setConfiguracoes(atual); setVersao(atual.versao);
      mostrarToast('Configurações salvas.');
    } catch (e) { setErroSalvar(e.message); }
    finally { setSalvando(false); }
  }
  return <div className="configuracoes-pagina">
    <CabecalhoPagina contexto="Sistema" titulo="Configurações" descricao="Ajuste as regras que orientam a operação do Pombo-Correio." />
    {erro && <AvisoInline tom="erro" titulo="Não foi possível carregar as configurações" acao={<button className="btn secundario" onClick={recarregar}>Tentar novamente</button>}>{erro}</AvisoInline>}
    {!configuracoes && carregando ? <EstadoCarregando rotulo="Carregando configurações…" /> : configuracoes && <div className="configuracoes-grade">
      <form className="painel configuracoes-regra" onSubmit={salvar}>
        <div className="section-title">Segunda mensagem Fonada</div>
        <p>Defina o valor máximo do pedido que dá direito à segunda mensagem.</p>
        <div className="campo"><label htmlFor="limite-segunda-mensagem">Limite do pedido (R$)</label><input id="limite-segunda-mensagem" inputMode="decimal" value={valor} onChange={(e) => setValor(formatarValorMonetario(e.target.value))} /></div>
        <div className="configuracoes-explicacao">Pedidos com valor igual ou abaixo deste limite têm direito à segunda mensagem. Acima dele, a segunda parte fica bloqueada e não há mensagem em haver, independentemente do DDD.</div>
        <p className="texto-suave fs-xs">A alteração vale para todos os pedidos, incluindo os já cadastrados. Os dados e resultados anteriores permanecem no histórico.</p>
        {erroSalvar && <AvisoInline tom="erro" titulo="Revise as configurações">{erroSalvar}</AvisoInline>}
        <div className="configuracoes-acoes"><button type="button" className="btn secundario" onClick={async () => { await recarregar(); setVersao(null); }}>Recarregar</button><button className="btn" type="submit" disabled={salvando || carregando || !!erro}>{salvando ? 'Salvando…' : 'Salvar configurações'}</button></div>
      </form>
      <div className="painel"><div className="section-title">Informações do sistema</div><dl className="configuracoes-informacoes"><div><dt>Validade da mensagem em haver</dt><dd>3 meses a partir da compra</dd></div><div><dt>Usuário conectado</dt><dd>{getNomeExibicao()}</dd></div><div><dt>Última alteração das regras</dt><dd>{configuracoes.atualizado_por || 'Configuração inicial'}</dd></div></dl><p className="texto-suave fs-xs">Este espaço reúne as configurações da operação e poderá receber novos ajustes no futuro.</p></div>
    </div>}
  </div>;
}
