import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Dialogo, AvisoInline } from './Interface.jsx';
import { formatarValorMonetario, valorMonetarioParaNumero } from '../mascaras.js';
import '../creditos-fonada.css';

const reais = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CarteiraFonada({ cliente, carteira = {}, onAtualizar }) {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [quantidade, setQuantidade] = useState('6');
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState('PIX');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [incerto, setIncerto] = useState(false);
  const operacao = useRef(null);
  const emEnvio = useRef(false);
  const saldo = Number(carteira.saldo || 0);

  async function comprar(evento) {
    evento.preventDefault();
    if (emEnvio.current) return;
    emEnvio.current = true; setSalvando(true); setErro('');
    try {
      const resultado = await api.clientes.comprarCreditos(cliente.id, {
        quantidade: Number(quantidade), valor: valorMonetarioParaNumero(valor), forma,
        operacao: operacao.current,
      });
      onAtualizar(resultado); setAberto(false); setIncerto(false); operacao.current = null;
    } catch (err) {
      setErro(err.message);
      // Uma nova tentativa conserva a identificação e os valores da mesma compra.
      setIncerto(!err.status || err.status >= 500);
    } finally { emEnvio.current = false; setSalvando(false); }
  }

  return <section className="carteira-fonada fc-painel" aria-label="Créditos de Fonada">
    <div className="carteira-topo"><div><span>CRÉDITOS DE FONADA</span><strong>{saldo}<small> {saldo === 1 ? 'pedido disponível' : 'pedidos disponíveis'}</small></strong></div><span className="carteira-validade">SEM VENCIMENTO</span></div>
    <div className="carteira-acoes"><button type="button" className="btn-small" disabled={Boolean(cliente.bloqueado || cliente.excluido_em)} onClick={() => { if (!operacao.current) { operacao.current = crypto.randomUUID(); setQuantidade('6'); setValor(''); setForma('PIX'); setErro(''); } setAberto(true); }}>Adicionar créditos</button>
      {saldo > 0 && <button type="button" className="btn-small carteira-usar" disabled={Boolean(cliente.bloqueado || cliente.excluido_em)} onClick={() => navigate(`/fonada/novo?clienteId=${cliente.id}&usarCredito=1`, { state: { returnTo: `/clientes/${cliente.id}` } })}>Usar crédito →</button>}</div>
    {!!carteira.movimentos?.length && <details className="carteira-historico"><summary>Histórico de créditos · {carteira.comprados} comprados / {carteira.usados} usados</summary><ol>{carteira.movimentos.map(m => <li key={m.id}><div><strong>{m.tipo === 'COMPRA' ? `Compra de ${m.quantidade} crédito(s)` : m.tipo === 'ESTORNO' ? `Devolução de ${m.quantidade} crédito(s) · O.S. ${m.senha_os}` : `Uso de ${-m.quantidade} crédito(s) · O.S. ${m.senha_os}`}</strong><small>{m.data_pedido} · {m.horario_pedido} · {m.usuario}</small>{m.tipo === 'COMPRA' && <small>{reais(m.valor)} · {m.forma}</small>}</div>{m.tipo === 'USO' && m.pedido_id ? <button type="button" className="fc-link" onClick={() => navigate(`/fonada/${m.pedido_id}`, { state: { returnTo: `/clientes/${cliente.id}` } })}>Ver pedido</button> : <b className={m.tipo === 'COMPRA' ? 'credito-entrada' : ''}>{m.quantidade > 0 ? '+' : ''}{m.quantidade}</b>}</li>)}</ol>{carteira.movimentos.length === 100 && <small>Exibindo as 100 movimentações mais recentes.</small>}</details>}
    {aberto && <Dialogo titulo="Adicionar créditos de Fonada" descricao="Registre o pacote que o cliente pagou. Cada crédito vale um pedido com a segunda mensagem incluída, sem vencimento." onClose={() => { if (!emEnvio.current) setAberto(false); }} className="dialogo-creditos">
      <form onSubmit={comprar}>
        {erro && <AvisoInline titulo="Não foi possível concluir">{erro}</AvisoInline>}
        <div className="credito-campos"><label>Quantidade de créditos<input type="number" min="1" max="10000" step="1" required value={quantidade} disabled={salvando || incerto} onChange={e => setQuantidade(e.target.value)} /></label>
          <label>Valor total pago<input required inputMode="numeric" placeholder="0,00" value={valor} disabled={salvando || incerto} onChange={e => setValor(formatarValorMonetario(e.target.value))} /></label>
          <label>Forma de pagamento<select value={forma} disabled={salvando || incerto} onChange={e => setForma(e.target.value)}>{['PIX', 'DINHEIRO', 'DEPÓSITO', 'DÉBITO', 'CRÉDITO'].map(f => <option key={f}>{f}</option>)}</select></label></div>
        <div className="credito-previa"><strong>Saldo após a compra: {saldo + Number(quantidade || 0)} pedidos</strong><span>{reais(valorMonetarioParaNumero(valor))} no total{Number(quantidade) > 0 && ` · ${reais(valorMonetarioParaNumero(valor) / Number(quantidade))} por pedido`}</span></div>
        <p className="credito-explicacao">O valor será registrado em vendas e recebimentos. Ao salvar uma Fonada com crédito, um crédito será descontado. Excluir o pedido devolve o crédito.</p>
        <div className="carteira-acoes"><button type="submit" className="btn" disabled={salvando}>{salvando ? 'Registrando…' : incerto ? 'Conferir e concluir compra' : 'Confirmar pacote pago'}</button><button type="button" className="btn secundario" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</button></div>
      </form>
    </Dialogo>}
  </section>;
}
