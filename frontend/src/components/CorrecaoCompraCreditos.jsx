import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Dialogo, AvisoInline } from './Interface.jsx';
import { formatarValorMonetario, valorMonetarioParaNumero } from '../mascaras.js';

const reais = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CorrecaoCompraCreditos({ cliente, carteira, aberto, onAtualizar, onClose }) {
  const compras = carteira.comprasCorrigiveis || [];
  const [compraId, setCompraId] = useState(String(compras[0]?.id || ''));
  const [quantidade, setQuantidade] = useState(carteira.saldo > 0 && compras[0]?.quantidade_atual > 0 ? '1' : '0');
  const [valor, setValor] = useState('R$ 0,00');
  const [motivo, setMotivo] = useState('CORREÇÃO DE LANÇAMENTO');
  const [salvando, setSalvando] = useState(false);
  const [incerto, setIncerto] = useState(false);
  const [erro, setErro] = useState('');
  const operacao = useRef(crypto.randomUUID());
  const envio = useRef(false);
  const compra = compras.find(c => String(c.id) === compraId);
  const quantidadeRemover = Number(quantidade || 0);
  const valorRemover = valorMonetarioParaNumero(valor);
  const limite = Math.min(Number(carteira.saldo || 0), Number(compra?.quantidade_atual || 0));

  useEffect(() => {
    if (!aberto || incerto) return;
    setCompraId(String(compras[0]?.id || ''));
    setQuantidade(carteira.saldo > 0 && compras[0]?.quantidade_atual > 0 ? '1' : '0');
    setValor('R$ 0,00'); setMotivo('CORREÇÃO DE LANÇAMENTO'); setErro('');
    operacao.current = crypto.randomUUID();
    // Resposta incerta conserva os dados e a identificação ao reabrir.
  }, [aberto]);

  async function confirmar(e) {
    e.preventDefault();
    if (envio.current) return;
    if (!quantidadeRemover && !valorRemover) { setErro('Informe créditos ou valor para remover.'); return; }
    envio.current = true; setSalvando(true); setErro('');
    try {
      const resultado = await api.clientes.corrigirCompraCreditos(cliente.id, compraId, {
        quantidade: quantidadeRemover, valor: valorRemover, motivo, operacao: operacao.current,
      });
      setIncerto(false); onAtualizar(resultado); onClose();
    } catch (err) { setErro(err.message); setIncerto(!err.status || err.status >= 500); }
    finally { envio.current = false; setSalvando(false); }
  }

  if (!aberto) return null;
  return <Dialogo titulo="Corrigir compra de créditos" descricao="Reduza a quantidade ou o valor lançado por engano. Os relatórios serão ajustados na data da venda original." onClose={() => { if (!envio.current) onClose(); }} className="dialogo-creditos dialogo-corrigir-creditos">
    <form onSubmit={confirmar}>
      {erro && <AvisoInline titulo="Não foi possível corrigir">{erro}</AvisoInline>}
      <div className="credito-campos">
        <label>Compra a corrigir<select value={compraId} disabled={salvando || incerto} onChange={e => { setCompraId(e.target.value); setQuantidade('0'); setValor('R$ 0,00'); setErro(''); }}>
          {compras.map(c => <option key={c.id} value={c.id}>#{c.id} · {c.data_pedido} {c.horario_pedido} · {c.quantidade_atual} crédito(s) · {reais(c.valor_atual)}</option>)}
        </select></label>
        <label>Créditos a remover<input type="number" min="0" max={limite} step="1" required value={quantidade} disabled={salvando || incerto} onChange={e => setQuantidade(e.target.value)} /><small>Até {limite} crédito(s) disponíveis para esta correção.</small></label>
        <label>Valor a reduzir<input inputMode="numeric" value={valor} required disabled={salvando || incerto} onChange={e => setValor(formatarValorMonetario(e.target.value))} /><small>Até {reais(compra?.valor_atual)}. Informe zero para manter o valor.</small></label>
        <label>Motivo da correção<input required maxLength={300} value={motivo} disabled={salvando || incerto} onChange={e => setMotivo(e.target.value)} /></label>
      </div>
      <div className="credito-previa" aria-live="polite"><strong>Após a correção</strong><span>Saldo disponível: {Number(carteira.saldo || 0) - quantidadeRemover} crédito(s)</span><span>Compra: {Number(compra?.quantidade_atual || 0) - quantidadeRemover} crédito(s) · {reais(Number(compra?.valor_atual || 0) - valorRemover)}</span></div>
      <p className="credito-explicacao">A compra original e o motivo ficam no histórico. Créditos já usados em pedidos não podem ser removidos do saldo.</p>
      <div className="carteira-acoes"><button type="submit" className="btn" disabled={salvando}>{salvando ? 'Corrigindo…' : incerto ? 'Conferir e concluir correção' : 'Confirmar correção'}</button><button type="button" className="btn secundario" disabled={salvando} onClick={onClose}>Cancelar</button></div>
    </form>
  </Dialogo>;
}
