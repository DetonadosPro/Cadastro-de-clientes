import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';

export default function Lixeira() {
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
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
    <div>
      <div style={estilos.cabecalho}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Lixeira</h1>
          <p className="fs-sm" style={{ color: '#6c757d', margin: 0 }}>
            Clientes excluídos — restaure ou apague para sempre
          </p>
        </div>
      </div>

      <form onSubmit={aoSubmeterBusca} style={estilos.buscaForm}>
        <input
          type="text"
          placeholder="Buscar por nome..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="busca-input"
        />
        <button type="submit" className="btn secundario">Buscar</button>
      </form>

      {erro && <p style={{ color: '#dc3545' }}>{erro}</p>}

      {carregando ? (
        <p style={{ color: '#6c757d' }}>Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="painel" style={{ textAlign: 'center', color: '#6c757d' }}>
          A lixeira está vazia.
        </div>
      ) : (
        <>
          <div className="painel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela-lista">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Nascimento</th>
                    <th>Celular</th>
                    <th>Excluído em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>{c.nome}</td>
                      <td>{c.nascimento || '—'}</td>
                      <td>{c.celular || c.fixo || '—'}</td>
                      <td>{new Date(c.excluido_em).toLocaleString('pt-BR')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button type="button" className="btn-small" onClick={() => restaurar(c)}>
                            Restaurar
                          </button>
                          <button
                            type="button"
                            className="btn-small"
                            style={{ color: '#dc3545', borderColor: '#dc3545' }}
                            onClick={() => apagarDefinitivo(c)}
                          >
                            Apagar de vez
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={estilos.paginacao}>
            <button className="btn secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              ← Anterior
            </button>
            <span className="fs-sm" style={{ color: '#6c757d' }}>
              Página {pagina} de {totalPaginas} — {total} cliente(s) na lixeira
            </span>
            <button className="btn secundario" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              Próxima →
            </button>
          </div>
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
