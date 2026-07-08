import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarData } from '../../mascaras.js';
import PaginaImpressaoRecibos from './PaginaImpressaoRecibos.jsx';

export default function ListaCobranca() {
  const [cobrarDia, setCobrarDia] = useState('');
  const [pagouFiltro, setPagouFiltro] = useState('NAO');
  const [nome, setNome] = useState('');
  const [os, setOs] = useState('');

  const [pedidos, setPedidos] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [jaBuscou, setJaBuscou] = useState(false);
  const [erro, setErro] = useState('');
  const [selecionados, setSelecionados] = useState(new Set());
  const [pedidosImpressao, setPedidosImpressao] = useState([]);

  const [itemBaixaAberto, setItemBaixaAberto] = useState(null);
  const [pagouBaixa, setPagouBaixa] = useState('SIM');
  const [statusBaixa, setStatusBaixa] = useState('');
  const [salvandoBaixa, setSalvandoBaixa] = useState(false);

  // Ordenação da tabela: por padrão vem "os" crescente (mesma ordem que
  // o backend já devolve), e clicar em O.S./Comprador alterna a direção
  // — feito no cliente (sem nova busca), já que o volume de uma busca de
  // cobrança é pequeno o bastante para isso ser instantâneo.
  const [ordenarPor, setOrdenarPor] = useState('os');
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState('asc');

  const navigate = useNavigate();
  const { mostrarToast } = useToast();

  function aoClicarOrdenacao(coluna) {
    if (ordenarPor === coluna) {
      setDirecaoOrdenacao((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenarPor(coluna);
      setDirecaoOrdenacao('asc');
    }
  }

  const pedidosOrdenados = [...pedidos].sort((a, b) => {
    let resultado;
    if (ordenarPor === 'comprador') {
      resultado = (a.nome || '').localeCompare(b.nome || '');
    } else {
      // "os": compara numericamente quando possível, senão cai para
      // comparação de texto (mesmo critério de fallback do backend).
      const numA = parseInt(a.senha_os, 10);
      const numB = parseInt(b.senha_os, 10);
      const ambosNumericos = !Number.isNaN(numA) && !Number.isNaN(numB);
      resultado = ambosNumericos
        ? numA - numB
        : String(a.senha_os || '').localeCompare(String(b.senha_os || ''));
    }
    return direcaoOrdenacao === 'asc' ? resultado : -resultado;
  });

  async function buscar(e) {
    if (e) e.preventDefault();
    setCarregando(true);
    setErro('');
    setJaBuscou(true);
    setOrdenarPor('os');
    setDirecaoOrdenacao('asc');
    try {
      const resp = await api.cobranca.buscar(cobrarDia, pagouFiltro, nome, os);
      setPedidos(resp.pedidos);
      setResumo(resp.resumo);
      setSelecionados(new Set());
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  function alternarSelecao(id, e) {
    e.stopPropagation();
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodos() {
    setSelecionados((atual) => (
      atual.size === pedidos.length ? new Set() : new Set(pedidos.map((p) => p.id))
    ));
  }

  function imprimir() {
    const alvo = selecionados.size > 0 ? pedidosOrdenados.filter((p) => selecionados.has(p.id)) : pedidosOrdenados;
    if (alvo.length === 0) {
      mostrarToast('Não há pedidos para imprimir.', 'erro');
      return;
    }
    setPedidosImpressao(alvo);
    // Aguarda o próximo ciclo de renderização (área de impressão já
    // populada com os pedidos certos) antes de abrir o diálogo do navegador.
    setTimeout(() => window.print(), 50);
  }

  function abrirBaixa(pedido) {
    setItemBaixaAberto(pedido);
    setPagouBaixa(pedido.pagou === 'SIM' ? 'SIM' : 'NAO');
    setStatusBaixa(pedido.recebi || '');
  }

  function fecharBaixa() {
    setItemBaixaAberto(null);
  }

  async function confirmarBaixa() {
    setSalvandoBaixa(true);
    try {
      await api.cobranca.darBaixa(itemBaixaAberto.id, pagouBaixa, statusBaixa.trim() || null);
      const statusTexto = pagouBaixa === 'SIM' ? 'marcado como pago' : 'marcado como não pago';
      mostrarToast(`"${itemBaixaAberto.nome}" foi ${statusTexto}.`);
      setItemBaixaAberto(null);
      buscar();
    } catch (err) {
      mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      setSalvandoBaixa(false);
    }
  }

  function formatarReais(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  return (
    <div>
      <div className="nao-imprimir" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Cobrança</h1>
          <p className="fs-sm" style={{ color: '#6c757d', margin: 0 }}>
            Busque pelo dia em que o cobrador passa para receber
          </p>
        </div>
        {pedidos.length > 0 && (
          <button type="button" className="btn" onClick={imprimir}>
            {selecionados.size > 0
              ? `🖨 Imprimir selecionados (${selecionados.size})`
              : `🖨 Imprimir tudo (${pedidos.length})`}
          </button>
        )}
      </div>

      <form onSubmit={buscar} className="painel nao-imprimir" style={estilos.formBusca}>
        <div className="grade grade-4">
          <div className="campo">
            <label>Cobrar dia</label>
            <input
              className="campo-data"
              placeholder="dd/mm/aa"
              value={cobrarDia}
              onChange={(e) => setCobrarDia(formatarData(e.target.value))}
            />
          </div>
          <div className="campo">
            <label>Pagou</label>
            <select value={pagouFiltro} onChange={(e) => setPagouFiltro(e.target.value)}>
              <option value="NAO">Não pagou</option>
              <option value="SIM">Já pagou</option>
              <option value="TODOS">Todos</option>
            </select>
          </div>
          <div className="campo">
            <label>Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do comprador" />
          </div>
          <div className="campo">
            <label>O.S.</label>
            <input value={os} onChange={(e) => setOs(e.target.value)} placeholder="Número exato" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="submit" className="btn" disabled={carregando}>
            {carregando ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </form>

      {erro && <p className="nao-imprimir" style={{ color: '#dc3545' }}>{erro}</p>}

      {resumo && (
        <div className="section-box nao-imprimir">
          <div className="grade grade-4 grade-resumo-financeiro">
            <CartaoResumo label="Total de pedidos" valor={resumo.totalPedidos} />
            <CartaoResumo label="PIX" valor={resumo.totalPix} />
            <CartaoResumo label="Presencial" valor={resumo.totalRecibo} />
            <CartaoResumo label="Valor total" valor={formatarReais(resumo.valorTotal)} destaque />
          </div>
        </div>
      )}

      {!jaBuscou ? (
        <div className="painel nao-imprimir" style={{ textAlign: 'center', color: '#6c757d' }}>
          Escolha os filtros acima e clique em Buscar.
        </div>
      ) : carregando ? (
        <p className="nao-imprimir" style={{ color: '#6c757d' }}>Carregando...</p>
      ) : pedidos.length === 0 ? (
        <div className="painel nao-imprimir" style={{ textAlign: 'center', color: '#6c757d' }}>
          Nenhum pedido encontrado com esses filtros.
        </div>
      ) : (
        <div className="painel nao-imprimir" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabela-lista">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selecionados.size === pedidos.length}
                      onChange={alternarSelecionarTodos}
                      title="Selecionar todos"
                    />
                  </th>
                  <th
                    onClick={() => aoClicarOrdenacao('os')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    O.S.{ordenarPor === 'os' && (direcaoOrdenacao === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                  <th
                    onClick={() => aoClicarOrdenacao('comprador')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Comprador{ordenarPor === 'comprador' && (direcaoOrdenacao === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                  <th>Cobrar dia</th>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th>Pagou</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pedidosOrdenados.map((p) => (
                  <tr key={p.id} onClick={() => abrirBaixa(p)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selecionados.has(p.id)}
                        onChange={(e) => alternarSelecao(p.id, e)}
                      />
                    </td>
                    <td><span className="carimbo-os carimbo-os-lista">{p.senha_os || p.id}</span></td>
                    <td>{p.nome}</td>
                    <td>{p.cobranca || '—'}</td>
                    <td>
                      <span className={`tag ${p.formaPagamento === 'PIX' ? 'ok' : 'neutro'}`}>
                        {p.formaPagamento === 'PIX' ? 'PIX' : 'PRESENCIAL'}
                      </span>
                    </td>
                    <td>{p.valor != null ? formatarReais(p.valor) : '—'}</td>
                    <td>
                      <span className={`tag ${p.pagou === 'SIM' ? 'ok' : 'pendente'}`}>
                        {p.pagou === 'SIM' ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn-small" onClick={(e) => { e.stopPropagation(); abrirBaixa(p); }}>
                        Dar baixa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {itemBaixaAberto && (
        <div className="modal-fundo nao-imprimir" onClick={fecharBaixa}>
          <div className="modal-caixa" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">Cobrança — {itemBaixaAberto.nome}</div>

            <div className="grade grade-2" style={{ marginBottom: 14 }}>
              <InfoSomenteLeitura label="O.S." valor={itemBaixaAberto.senha_os || itemBaixaAberto.id} />
              <InfoSomenteLeitura label="Data da compra" valor={itemBaixaAberto.data_pedido} />
              <InfoSomenteLeitura label="Valor" valor={itemBaixaAberto.valor != null ? formatarReais(itemBaixaAberto.valor) : '—'} />
              <InfoSomenteLeitura label="Forma" valor={itemBaixaAberto.formaPagamento === 'PIX' ? 'PIX' : 'PRESENCIAL'} />
              <InfoSomenteLeitura label="Celular" valor={itemBaixaAberto.celular} />
              <InfoSomenteLeitura label="Fixo" valor={itemBaixaAberto.fixo} />
              <InfoSomenteLeitura label="Endereço" valor={itemBaixaAberto.endereco} />
              <InfoSomenteLeitura label="Bairro" valor={itemBaixaAberto.bairro} />
              <InfoSomenteLeitura label="Referência" valor={itemBaixaAberto.referencia} />
            </div>

            <div className="campo">
              <label>Pagou</label>
              <select value={pagouBaixa} onChange={(e) => setPagouBaixa(e.target.value)}>
                <option value="SIM">Sim</option>
                <option value="NAO">Não</option>
              </select>
            </div>
            <div className="campo">
              <label>Status</label>
              <input
                placeholder="Observação de lançamento..."
                value={statusBaixa}
                onChange={(e) => setStatusBaixa(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
              {itemBaixaAberto.cliente_id && (
                <button type="button" className="btn-small" onClick={() => navigate(`/clientes/${itemBaixaAberto.cliente_id}`)}>
                  Ver cliente
                </button>
              )}
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button type="button" className="btn secundario" onClick={fecharBaixa}>Cancelar</button>
                <button type="button" className="btn" onClick={confirmarBaixa} disabled={salvandoBaixa}>
                  {salvandoBaixa ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Área de impressão: invisível na tela normal, só aparece via @media print. */}
      {pedidosImpressao.length > 0 && (
        <div className="somente-imprimir">
          <PaginaImpressaoRecibos pedidos={pedidosImpressao} />
        </div>
      )}
    </div>
  );
}

function InfoSomenteLeitura({ label, valor }) {
  return (
    <div>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6c757d', marginBottom: 2 }}>
        {label}
      </div>
      <div className="fs-md">{valor || '—'}</div>
    </div>
  );
}

function CartaoResumo({ label, valor, destaque }) {
  return (
    <div className={`cartao-valor ${destaque ? 'destaque' : ''}`}>
      <div className="cartao-valor-label">{label}</div>
      <div className="cartao-valor-numero">{valor}</div>
    </div>
  );
}

const estilos = {
  formBusca: {
    marginBottom: 20,
  },
};
