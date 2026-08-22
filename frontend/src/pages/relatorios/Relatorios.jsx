import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { formatarData } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';

export default function Relatorios() {
  // Aba e filtro de sistema ficam na URL — assim, ao abrir um pedido a
  // partir de algum resultado e depois voltar, a tela é restaurada na
  // mesma aba/filtro em que a pessoa estava, em vez de resetar.
  const [searchParams, setSearchParams] = useSearchParams();
  const aba = searchParams.get('aba') || 'vendas';
  const sistema = searchParams.get('sistema') || 'TODOS';

  function irParaAba(novaAba) {
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('aba', novaAba);
      return novo;
    }, { replace: true });
  }

  function mudarSistema(novoSistema) {
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('sistema', novoSistema);
      return novo;
    }, { replace: true });
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 2 }}>Relatórios</h1>
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)', margin: 0 }}>
          Valores por período — vendas realizadas e pagamentos recebidos
        </p>
      </div>

      <div className="section-box secao-relatorios">
        <div className="abas-cliente abas-relatorio">
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'vendas' ? 'ativa' : ''}`}
            onClick={() => irParaAba('vendas')}
          >
            Vendas
          </button>
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'recebimentos' ? 'ativa' : ''}`}
            onClick={() => irParaAba('recebimentos')}
          >
            Recebimentos
          </button>
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'desempenho' ? 'ativa' : ''}`}
            onClick={() => irParaAba('desempenho')}
          >
            Desempenho
          </button>
          <div className="filtro-sistema-relatorio">
            <select value={sistema} onChange={(e) => mudarSistema(e.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="FONADA">Fonada</option>
              <option value="AOVIVO">Ao vivo</option>
            </select>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {/* Ambas as abas ficam sempre montadas (só uma é exibida por vez).
              Isso preserva período, dados buscados e estado de cada uma ao
              navegar entre elas, em vez de resetar tudo a cada troca. */}
          <div style={{ display: aba === 'vendas' ? 'block' : 'none' }}>
            <AbaVendas sistema={sistema} />
          </div>
          <div style={{ display: aba === 'recebimentos' ? 'block' : 'none' }}>
            <AbaRecebimentos sistema={sistema} />
          </div>
          <div style={{ display: aba === 'desempenho' ? 'block' : 'none' }}>
            <AbaDesempenho sistema={sistema} />
          </div>
        </div>
      </div>
    </div>
  );
}

function useIntervaloData() {
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  return {
    inicio, fim,
    setInicio: (v) => setInicio(formatarData(v)),
    setFim: (v) => setFim(formatarData(v)),
  };
}

function formatarReais(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function AbaVendas({ sistema }) {
  const { inicio, fim, setInicio, setFim } = useIntervaloData();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [jaBuscou, setJaBuscou] = useState(false);

  async function buscar(e, sistemaAtual = sistema) {
    if (e) e.preventDefault();
    if (!inicio) {
      setErro('Informe pelo menos a data inicial.');
      return;
    }
    setCarregando(true);
    setErro('');
    setJaBuscou(true);
    try {
      const resp = await api.relatorios.vendas(inicio, fim, sistemaAtual);
      setDados(resp);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  // Se já tinha buscado antes, refaz a busca automaticamente quando o
  // filtro de sistema muda (sem precisar clicar em Buscar de novo).
  React.useEffect(() => {
    if (jaBuscou) buscar(null, sistema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sistema]);

  return (
    <div>
      <FormularioPeriodo
        inicio={inicio} fim={fim} setInicio={setInicio} setFim={setFim}
        onSubmit={buscar} carregando={carregando}
      />

      {erro && <p className="fs-sm" style={{ color: 'var(--selo)' }}>{erro}</p>}

      {!jaBuscou ? (
        <EstadoVazio texto="Escolha o período e clique em Buscar." />
      ) : carregando ? (
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : dados && (
        <>
          <div className="cartao-valor destaque" style={{ marginBottom: 16, textAlign: 'center' }}>
            <div className="cartao-valor-label">Total geral</div>
            <div className="cartao-valor-numero" style={{ fontSize: 28 }}>{formatarReais(dados.geral.valorTotal)}</div>
            <div className="fs-xs" style={{ marginTop: 4, color: 'rgba(255,255,255,0.75)' }}>{dados.geral.quantidade} pedido(s) no período</div>
          </div>

          {dados.fonada && (
            <BlocoSistema titulo="Fonada" cor="azul">
              <div className="grade grade-relatorio grade-4">
                <CartaoValor label="Total de pedidos" valor={dados.fonada.quantidade} />
                <CartaoValor label="PIX" valor={dados.fonada.totalPix} sub={`${dados.fonada.percentualPix}%`} />
                <CartaoValor label="Outros" valor={dados.fonada.totalRecibo} sub={`${dados.fonada.percentualRecibo}%`} />
                <CartaoValor label="Valor total" valor={formatarReais(dados.fonada.valorTotal)} />
              </div>
              <div className="grade grade-relatorio grade-2" style={{ marginTop: 10 }}>
                <CartaoValor label="Recall" valor={dados.fonada.totalRecall} sub={`${dados.fonada.percentualRecall}%`} />
                <CartaoValor label="Clientes" valor={dados.fonada.totalOutros} sub={`${dados.fonada.percentualOutros}%`} />
              </div>
            </BlocoSistema>
          )}

          {dados.aoVivo && (
            <BlocoSistema titulo="Ao vivo" cor="vermelho">
              <div className="grade grade-relatorio grade-2">
                <CartaoValor label="Total de pedidos" valor={dados.aoVivo.quantidade} />
                <CartaoValor label="Valor total" valor={formatarReais(dados.aoVivo.valorTotal)} />
              </div>
            </BlocoSistema>
          )}

          {dados.itens && <TabelaDetalhada itens={dados.itens} tituloColunaValor="Venda" />}
        </>
      )}
    </div>
  );
}

function AbaRecebimentos({ sistema }) {
  const { inicio, fim, setInicio, setFim } = useIntervaloData();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [jaBuscou, setJaBuscou] = useState(false);

  async function buscar(e, sistemaAtual = sistema) {
    if (e) e.preventDefault();
    if (!inicio) {
      setErro('Informe pelo menos a data inicial.');
      return;
    }
    setCarregando(true);
    setErro('');
    setJaBuscou(true);
    try {
      const resp = await api.relatorios.recebimentos(inicio, fim, sistemaAtual);
      setDados(resp);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    if (jaBuscou) buscar(null, sistema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sistema]);

  return (
    <div>
      <FormularioPeriodo
        inicio={inicio} fim={fim} setInicio={setInicio} setFim={setFim}
        onSubmit={buscar} carregando={carregando}
      />

      {erro && <p className="fs-sm" style={{ color: 'var(--selo)' }}>{erro}</p>}

      {!jaBuscou ? (
        <EstadoVazio texto="Escolha o período e clique em Buscar." />
      ) : carregando ? (
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : dados && (
        <>
          <div className="cartao-valor destaque" style={{ marginBottom: 16, textAlign: 'center' }}>
            <div className="cartao-valor-label">Recebido no período</div>
            <div className="cartao-valor-numero" style={{ fontSize: 28 }}>{formatarReais(dados.valorTotal)}</div>
            <div className="fs-xs" style={{ marginTop: 4, color: 'rgba(255,255,255,0.75)' }}>{dados.quantidade} registro(s)</div>
          </div>

          <div className={`cartao-diferenca ${dados.diferencaVendidoRecebido > 0 ? 'positiva' : 'neutra'}`} style={{ marginBottom: 16 }}>
            <div>
              <div className="fs-xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.75 }}>
                Vendido − recebido no período
              </div>
              <div className="fs-xs" style={{ marginTop: 2, opacity: 0.75 }}>
                Vendido: {formatarReais(dados.valorVendido)} · Recebido: {formatarReais(dados.valorTotal)}
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{formatarReais(dados.diferencaVendidoRecebido)}</div>
          </div>

          {dados.fonada && (
            <BlocoSistema titulo="Fonada" cor="azul">
              <div className="grade grade-relatorio grade-4">
                <CartaoValor label="Total de pedidos" valor={dados.fonada.quantidade} />
                <CartaoValor label="PIX" valor={dados.fonada.totalPix} sub={`${dados.fonada.percentualPix}%`} />
                <CartaoValor label="Outros" valor={dados.fonada.totalRecibo} sub={`${dados.fonada.percentualRecibo}%`} />
                <CartaoValor label="Valor total" valor={formatarReais(dados.fonada.valorTotal)} />
              </div>
            </BlocoSistema>
          )}

          {dados.aoVivo && (
            <BlocoSistema titulo="Ao vivo" cor="vermelho">
              <div className="grade grade-relatorio grade-2">
                <CartaoValor label="Total de pedidos" valor={dados.aoVivo.quantidade} />
                <CartaoValor label="Valor total" valor={formatarReais(dados.aoVivo.valorTotal)} />
              </div>
            </BlocoSistema>
          )}

          {dados.itens && <TabelaDetalhada itens={dados.itens} tituloColunaValor="Recebido" />}
        </>
      )}
    </div>
  );
}

function AbaDesempenho({ sistema }) {
  const { inicio, fim, setInicio, setFim } = useIntervaloData();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [jaBuscou, setJaBuscou] = useState(false);

  async function buscar(e, sistemaAtual = sistema) {
    if (e) e.preventDefault();
    if (!inicio) {
      setErro('Informe pelo menos a data inicial.');
      return;
    }
    setCarregando(true);
    setErro('');
    setJaBuscou(true);
    try {
      const resp = await api.relatorios.desempenho(inicio, fim, sistemaAtual);
      setDados(resp);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    if (jaBuscou) buscar(null, sistema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sistema]);

  return (
    <div>
      <FormularioPeriodo
        inicio={inicio} fim={fim} setInicio={setInicio} setFim={setFim}
        onSubmit={buscar} carregando={carregando}
      />

      {erro && <p className="fs-sm" style={{ color: 'var(--selo)' }}>{erro}</p>}

      {!jaBuscou ? (
        <EstadoVazio texto="Escolha o período e clique em Buscar." />
      ) : carregando ? (
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : dados && (
        dados.funcionarios.length === 0 ? (
          <div className="painel" style={{ marginTop: 16, textAlign: 'center', color: 'var(--tinta-suave)' }}>
            Nenhum vendedor ou mensagem passada registrada nesse período. Pedidos antigos, de antes desse
            registro existir, não aparecem aqui.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {dados.funcionarios.map((f) => (
              <CartaoFuncionario key={f.usuario} funcionario={f} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function CartaoFuncionario({ funcionario }) {
  return (
    <div className="painel">
      <div style={{ marginBottom: 12 }}>
        <span className="fs-lg" style={{ fontWeight: 700 }}>{funcionario.usuario}</span>
      </div>
      <div className="grade grade-relatorio grade-4">
        <CartaoValor label="Vendas" valor={funcionario.vendasTotal} sub={`${funcionario.vendasFonada} fonada · ${funcionario.vendasAoVivo} ao vivo`} />
        <CartaoValor label="Valor vendido Fonada" valor={formatarReais(funcionario.valorVendidoFonada)} />
        <CartaoValor label="Valor vendido Ao Vivo" valor={formatarReais(funcionario.valorVendidoAoVivo)} />
        <CartaoValor label="Valor médio/venda" valor={funcionario.vendasTotal ? formatarReais(funcionario.valorVendidoTotal / funcionario.vendasTotal) : '—'} />
      </div>
      <div className="grade grade-relatorio grade-4" style={{ marginTop: 10 }}>
        <CartaoValor label="Mensagens passadas (Fonada)" valor={funcionario.mensagensPassadasFonada} />
      </div>
    </div>
  );
}

function FormularioPeriodo({ inicio, fim, setInicio, setFim, onSubmit, carregando }) {
  return (
    <form onSubmit={onSubmit} className="form-periodo-relatorio">
      <div className="campo">
        <label>Data inicial</label>
        <CampoData placeholder="dd/mm/aa" value={inicio} onChange={setInicio} />
      </div>
      <div className="campo">
        <label>Data final (opcional)</label>
        <CampoData placeholder="dd/mm/aa" value={fim} onChange={setFim} />
      </div>
      <button type="submit" className="btn" disabled={carregando}>
        {carregando ? 'Buscando...' : 'Buscar'}
      </button>
    </form>
  );
}

function BlocoSistema({ titulo, cor, children }) {
  return (
    <div className={`bloco-sistema bloco-sistema-${cor}`}>
      <div className="bloco-sistema-titulo">{titulo}</div>
      {children}
    </div>
  );
}

function EstadoVazio({ texto }) {
  return (
    <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '28px 0' }}>
      {texto}
    </p>
  );
}

function CartaoValor({ label, valor, sub, destaque }) {
  return (
    <div className={`cartao-valor ${destaque ? 'destaque' : ''}`}>
      <div className="cartao-valor-label">{label}</div>
      <div className="cartao-valor-numero">{valor}</div>
      {sub && <div className="fs-xs" style={{ marginTop: 4, opacity: 0.8 }}>{sub}</div>}
    </div>
  );
}

// Tabela com um pedido por linha (comprador, O.S., forma, valor) — só
// aparece quando a busca é de um dia único (inicio === fim), já que
// num período de vários dias a lista ficaria longa demais para ser
// útil junto com os agregados. Clicar na linha abre o pedido, igual
// às listas de Fonada/Ao Vivo.
function TabelaDetalhada({ itens, tituloColunaValor }) {
  const navigate = useNavigate();

  if (itens.length === 0) {
    return (
      <div className="painel" style={{ marginTop: 16, textAlign: 'center', color: 'var(--tinta-suave)' }}>
        Nenhum pedido nesse dia.
      </div>
    );
  }

  return (
    <div className="painel" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="tabela-lista">
          <thead>
            <tr>
              <th>O.S.</th>
              <th>Comprador</th>
              <th>Sistema</th>
              <th>Forma</th>
              <th>{tituloColunaValor}</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr
                key={`${item.sistema}-${item.id}`}
                onClick={() => navigate(item.sistema === 'FONADA' ? `/fonada/${item.id}` : `/ao-vivo/${item.id}`)}
              >
                <td data-label="O.S.">
                  <span className="carimbo-os carimbo-os-lista">{item.os}</span>
                </td>
                <td data-label="Comprador">{item.nome}</td>
                <td data-label="Sistema">{item.sistema === 'FONADA' ? 'Fonada' : 'Ao vivo'}</td>
                <td data-label="Forma">{item.forma}</td>
                <td data-label={tituloColunaValor} style={{ fontFamily: 'var(--fonte-mono)', fontWeight: 700 }}>
                  {formatarReais(item.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
