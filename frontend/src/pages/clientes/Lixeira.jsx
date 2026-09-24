import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { AvisoInline, CabecalhoPagina, EstadoCarregando, EstadoVazio, Paginacao } from '../../components/Interface.jsx';

export default function Lixeira() {
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [expandido, setExpandido] = useState(null); // id do cliente com a "pasta" aberta
  const [pedidosPorCliente, setPedidosPorCliente] = useState({}); // id -> { fonada, aoVivo }
  const [carregandoPedidos, setCarregandoPedidos] = useState(false);
  const { mostrarToast } = useToast();

  const porPagina = 30;
  const totalPaginas = Math.max(Math.ceil(total / porPagina), 1);

  const carregar = useCallback(async (termo, pag) => {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await api.clientes.listarLixeira(termo, pag);
      setItens(resposta.clientes);
      setTotal(resposta.total);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(busca, pagina);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, carregar]);

  function aoSubmeterBusca(e) {
    e.preventDefault();
    setPagina(1);
    carregar(busca, 1);
  }

  async function alternarExpandido(cliente) {
    if (expandido === cliente.id) {
      setExpandido(null);
      return;
    }
    setExpandido(cliente.id);
    if (!pedidosPorCliente[cliente.id]) {
      setCarregandoPedidos(true);
      try {
        const resp = await api.clientes.pedidosLixeira(cliente.id);
        setPedidosPorCliente((atual) => ({ ...atual, [cliente.id]: resp }));
      } catch (err) {
        mostrarToast('Não foi possível carregar os pedidos deste cliente.', 'erro');
      } finally {
        setCarregandoPedidos(false);
      }
    }
  }

  async function restaurar(cliente) {
    try {
      await api.clientes.restaurar(cliente.id);
      mostrarToast(`"${cliente.nome}" foi restaurado.`);
      carregar(busca, pagina);
    } catch (err) {
      mostrarToast('Não foi possível restaurar. Tente novamente.', 'erro');
    }
  }

  async function apagarDefinitivo(cliente) {
    const confirmar = confirm(
      `Apagar "${cliente.nome}" DEFINITIVAMENTE, junto com todos os pedidos vinculados a ele?\n\nEssa ação NÃO PODE SER DESFEITA.`
    );
    if (!confirmar) return;
    try {
      await api.clientes.apagarDefinitivo(cliente.id);
      mostrarToast(`"${cliente.nome}" foi apagado para sempre.`);
      carregar(busca, pagina);
    } catch (err) {
      mostrarToast('Não foi possível apagar. Tente novamente.', 'erro');
    }
  }

  return (
    <div className="lixeira-pagina">
      <CabecalhoPagina
        contexto="Clientes"
        titulo="Lixeira"
        descricao="Revise cadastros removidos, consulte os pedidos vinculados e restaure quando necessário."
        meta={!carregando ? `${total} removido${total === 1 ? '' : 's'}` : null}
      />

      <div className="painel lixeira-toolbar">
        <form onSubmit={aoSubmeterBusca} className="lixeira-busca-form">
          <label htmlFor="busca-lixeira">Localizar cadastro removido</label>
          <div className="lixeira-busca-controles">
            <input id="busca-lixeira" type="search" placeholder="Digite o nome do cliente" value={busca} onChange={(e) => setBusca(e.target.value)} className="busca-input" />
            <button type="submit" className="btn secundario">Buscar</button>
          </div>
        </form>
        <p>Abra uma linha para conferir os pedidos antes de restaurar ou apagar definitivamente.</p>
      </div>

      {erro && <AvisoInline tom="erro" titulo="Não foi possível carregar a lixeira">{erro}</AvisoInline>}

      {carregando ? (
        <EstadoCarregando rotulo="Carregando cadastros removidos…" linhas={6} />
      ) : itens.length === 0 ? (
        <EstadoVazio icone="♲" titulo={busca ? 'Nenhum cadastro removido encontrado' : 'A lixeira está vazia'} descricao={busca ? 'Tente outro nome ou limpe a busca.' : 'Quando um cliente for removido, ele aparecerá aqui antes da exclusão definitiva.'} />
      ) : (
        <>
          <div className="painel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela-lista tabela-lixeira">
                <thead>
                  <tr>
                    <th></th>
                    <th>Nome</th>
                    <th>Nascimento</th>
                    <th>Celular</th>
                    <th>Pedidos</th>
                    <th>Excluído em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((c) => {
                    const totalPedidos = Number(c.total_fonada || 0) + Number(c.total_aovivo || 0);
                    const aberto = expandido === c.id;
                    const pedidos = pedidosPorCliente[c.id];
                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          onClick={() => alternarExpandido(c)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="lixeira-expansor">
                            <button
                              type="button"
                              className="lixeira-expandir"
                              aria-label={`${aberto ? 'Ocultar' : 'Mostrar'} pedidos de ${c.nome}`}
                              aria-expanded={aberto}
                              onClick={(evento) => { evento.stopPropagation(); alternarExpandido(c); }}
                            >{aberto ? '▾' : '▸'}</button>
                          </td>
                          <td style={{ fontWeight: 700 }}>{c.nome}</td>
                          <td>{c.nascimento || '—'}</td>
                          <td>{c.celular || c.fixo || '—'}</td>
                          <td>{totalPedidos > 0 ? `${totalPedidos} pedido(s)` : '—'}</td>
                          <td>{new Date(c.excluido_em).toLocaleString('pt-BR')}</td>
                          <td>
                            <div className="lixeira-acoes" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="btn-small" onClick={() => restaurar(c)}>
                                Restaurar
                              </button>
                              <button
                                type="button"
                                className="btn-small perigo"
                                onClick={() => apagarDefinitivo(c)}
                              >
                                Apagar de vez
                              </button>
                            </div>
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="lixeira-linha-detalhes">
                            <td colSpan={7}>
                              {!pedidos ? (
                                <span className="lixeira-detalhe-vazio">Carregando pedidos…</span>
                              ) : totalPedidos === 0 ? (
                                <span className="lixeira-detalhe-vazio">Este cliente não tinha pedidos.</span>
                              ) : (
                                <div className="lixeira-pedidos-grid">
                                  {pedidos.fonada.length > 0 && (
                                    <div className="lixeira-pedidos-grupo">
                                      <div className="lixeira-pedidos-titulo">
                                        FONADA ({pedidos.fonada.length})
                                      </div>
                                      {pedidos.fonada.map((p) => (
                                        <div key={`f-${p.id}`} className="lixeira-pedido-linha">
                                          OS {p.senha_os || p.id} — {p.nome_comprador} — {p.data_pedido || '—'}
                                          {p.valor ? ` — ${Number(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {pedidos.aoVivo.length > 0 && (
                                    <div className="lixeira-pedidos-grupo">
                                      <div className="lixeira-pedidos-titulo">
                                        AO VIVO ({pedidos.aoVivo.length})
                                      </div>
                                      {pedidos.aoVivo.map((p) => (
                                        <div key={`a-${p.id}`} className="lixeira-pedido-linha">
                                          OS {p.numero_os || p.id} — {p.comprador} — {p.dia_entrega || '—'}
                                          {p.valor ? ` — ${Number(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} rotulo="clientes removidos" onAnterior={() => setPagina((p) => p - 1)} onProxima={() => setPagina((p) => p + 1)} className="lixeira-paginacao" />
        </>
      )}
    </div>
  );
}

const estilos = {
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  buscaForm: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  paginacao: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
};
