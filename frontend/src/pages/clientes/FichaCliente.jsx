import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';

function IconeVoltar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function IconeMais() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconeEditar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export default function FichaCliente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mostrarToast } = useToast();

  const [cliente, setCliente] = useState(null);
  const [pedidosFonada, setPedidosFonada] = useState([]);
  const [pedidosAoVivo, setPedidosAoVivo] = useState([]);
  const [aba, setAba] = useState('fonada');
  const [editando, setEditando] = useState(false);
  const [dadosEdicao, setDadosEdicao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [mostrandoBloqueio, setMostrandoBloqueio] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [salvandoBloqueio, setSalvandoBloqueio] = useState(false);

  function carregar() {
    setCarregando(true);
    setErro('');
    api.clientes.buscar(id)
      .then((resp) => {
        setCliente(resp.cliente);
        setPedidosFonada(resp.pedidosFonada);
        setPedidosAoVivo(resp.pedidosAoVivo);
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function iniciarEdicao() {
    setDadosEdicao({ ...cliente });
    setEditando(true);
  }

  function setEdicao(campo, valor) {
    setDadosEdicao((d) => ({ ...d, [campo]: valor }));
  }

  function setEdicaoComMascara(campo, valorBruto, tipoMascara) {
    const formatadores = { celular: formatarCelular, fixo: formatarFixo, data: formatarData };
    setEdicao(campo, formatadores[tipoMascara](valorBruto));
  }

  async function salvarEdicao() {
    setSalvando(true);
    try {
      const atualizado = await api.clientes.atualizar(id, dadosEdicao);
      setCliente(atualizado);
      setEditando(false);
      mostrarToast('Dados do cliente atualizados.');
    } catch (err) {
      mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function novoPedidoFonada() {
    if (cliente.bloqueado) {
      mostrarToast('Este cliente está bloqueado. Desbloqueie antes de criar um novo pedido.', 'erro');
      return;
    }
    navigate(`/fonada/novo?clienteId=${id}`);
  }

  function novoPedidoAoVivo() {
    if (cliente.bloqueado) {
      mostrarToast('Este cliente está bloqueado. Desbloqueie antes de criar um novo pedido.', 'erro');
      return;
    }
    navigate(`/ao-vivo/novo?clienteId=${id}`);
  }

  async function confirmarBloqueio() {
    setSalvandoBloqueio(true);
    try {
      const atualizado = await api.clientes.bloquear(id, true, motivoBloqueio.trim() || null);
      setCliente(atualizado);
      setMostrandoBloqueio(false);
      setMotivoBloqueio('');
      mostrarToast('Cliente bloqueado. Não será mais possível criar ou editar pedidos dele.');
    } catch (err) {
      mostrarToast('Não foi possível bloquear o cliente. Tente novamente.', 'erro');
    } finally {
      setSalvandoBloqueio(false);
    }
  }

  async function desbloquear() {
    if (!confirm(`Desbloquear "${cliente.nome}"? Voltará a ser possível criar e editar pedidos dele normalmente.`)) return;
    try {
      const atualizado = await api.clientes.bloquear(id, false);
      setCliente(atualizado);
      mostrarToast('Cliente desbloqueado.');
    } catch (err) {
      mostrarToast('Não foi possível desbloquear o cliente. Tente novamente.', 'erro');
    }
  }

  function voltar() {
    // Volta para a lista de clientes exatamente como estava (busca e
    // página preservadas na URL), ou para outra tela de onde a pessoa
    // realmente veio. Só cai em /clientes "zerada" se não houver histórico.
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/clientes');
    }
  }

  async function excluirCliente() {
    const totalPedidos = pedidosFonada.length + pedidosAoVivo.length;
    const aviso = totalPedidos > 0
      ? `Excluir "${cliente.nome}" também envia ${totalPedidos} pedido(s) vinculado(s) para a lixeira. Confirma?`
      : `Excluir "${cliente.nome}"? Vai para a lixeira, dá pra restaurar depois.`;
    if (!confirm(aviso)) return;

    try {
      await api.clientes.excluir(id);
      mostrarToast('Cliente enviado para a lixeira.');
      navigate('/clientes');
    } catch (err) {
      mostrarToast('Não foi possível excluir. Tente novamente.', 'erro');
    }
  }

  if (carregando) return <p style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>;
  if (erro) return <p style={{ color: 'var(--selo)' }}>{erro}</p>;
  if (!cliente) return null;

  const totalFonada = pedidosFonada.reduce((soma, p) => soma + (p.valor || 0), 0);
  const totalAoVivo = pedidosAoVivo.reduce((soma, p) => soma + (p.valor || 0), 0);
  const totalGeral = totalFonada + totalAoVivo;

  function formatarReais(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  return (
    <div className="form-pagina">
      <div style={estilos.cabecalho}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ marginBottom: 4 }}>{cliente.nome}</h1>
            {cliente.bloqueado && <span className="tag pendente" style={{ marginBottom: 4 }}>Bloqueado</span>}
          </div>
          <p className="fs-sm" style={{ color: 'var(--tinta-suave)', margin: 0 }}>
            Cliente desde {new Date(cliente.criado_em).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {cliente.bloqueado ? (
            <button className="btn" onClick={desbloquear}>
              Desbloquear cliente
            </button>
          ) : (
            <button className="btn perigo" onClick={() => setMostrandoBloqueio(true)}>
              Bloquear cliente
            </button>
          )}
          <button className="btn perigo" onClick={excluirCliente}>
            Excluir cliente
          </button>
          <button className="btn secundario" onClick={voltar} style={{ gap: 6 }}>
            <IconeVoltar /> Voltar
          </button>
        </div>
      </div>

      {cliente.bloqueado && (
        <div className="aviso-bloqueio">
          <strong>Cliente bloqueado.</strong> Não é possível criar ou editar pedidos dele em nenhuma tela do sistema.
          {cliente.bloqueio_motivo && <> Motivo: {cliente.bloqueio_motivo}</>}
        </div>
      )}

      {mostrandoBloqueio && (
        <div className="modal-fundo" onClick={() => setMostrandoBloqueio(false)}>
          <div className="modal-caixa" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">Bloquear {cliente.nome}</div>
            <p className="fs-sm" style={{ color: 'var(--tinta-suave)', marginBottom: 12 }}>
              Depois de bloqueado, não será possível criar ou editar pedidos deste cliente em nenhuma
              tela (Fonada, Ao vivo, Cobrança, Agenda), até que seja desbloqueado.
            </p>
            <div className="campo">
              <label>Motivo (opcional)</label>
              <input
                value={motivoBloqueio}
                onChange={(e) => setMotivoBloqueio(e.target.value)}
                placeholder="Ex: não pagou, pediu para não ligarem mais..."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn secundario" onClick={() => setMostrandoBloqueio(false)}>
                Cancelar
              </button>
              <button type="button" className="btn perigo" onClick={confirmarBloqueio} disabled={salvandoBloqueio}>
                {salvandoBloqueio ? 'Bloqueando...' : 'Confirmar bloqueio'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="section-box">
        <div className="section-title">
          <span>Dados do cliente</span>
          {!editando && (
            <button type="button" className="btn-small" onClick={iniciarEdicao} style={{ gap: 5 }}>
              <IconeEditar /> Editar
            </button>
          )}
        </div>

        {!editando ? (
          <div className="grade grade-3">
            <Info label="Nascimento" valor={cliente.nascimento} />
            <Info label="Telefone fixo" valor={cliente.fixo} />
            <Info label="WhatsApp" valor={cliente.whatsapp} />
            <Info label="Celular" valor={cliente.celular} />
            <Info label="Endereço" valor={cliente.endereco} />
            <Info label="Complemento" valor={cliente.complemento} />
            <Info label="Bairro" valor={cliente.bairro} />
            <Info label="Referência" valor={cliente.referencia} />
          </div>
        ) : (
          <>
            <div className="grade grade-2">
              <div className="campo">
                <label>Nome</label>
                <input value={dadosEdicao.nome} onChange={(e) => setEdicao('nome', e.target.value)} />
              </div>
              <div className="campo">
                <label>Nascimento</label>
                <input placeholder="dd/mm/aa" value={dadosEdicao.nascimento || ''} onChange={(e) => setEdicaoComMascara('nascimento', e.target.value, 'data')} />
              </div>
            </div>
            <div className="grade grade-3">
              <div className="campo">
                <label>Telefone fixo</label>
                <input value={dadosEdicao.fixo || ''} onChange={(e) => setEdicaoComMascara('fixo', e.target.value, 'fixo')} />
              </div>
              <div className="campo">
                <label>WhatsApp</label>
                <input value={dadosEdicao.whatsapp || ''} onChange={(e) => setEdicaoComMascara('whatsapp', e.target.value, 'celular')} />
              </div>
              <div className="campo">
                <label>Celular</label>
                <input value={dadosEdicao.celular || ''} onChange={(e) => setEdicaoComMascara('celular', e.target.value, 'celular')} />
              </div>
            </div>
            <div className="campo">
              <label>Endereço</label>
              <input value={dadosEdicao.endereco || ''} onChange={(e) => setEdicao('endereco', e.target.value)} />
            </div>
            <div className="grade grade-3">
              <div className="campo">
                <label>Complemento</label>
                <input value={dadosEdicao.complemento || ''} onChange={(e) => setEdicao('complemento', e.target.value)} />
              </div>
              <div className="campo">
                <label>Bairro</label>
                <input value={dadosEdicao.bairro || ''} onChange={(e) => setEdicao('bairro', e.target.value)} />
              </div>
              <div className="campo">
                <label>Referência</label>
                <input value={dadosEdicao.referencia || ''} onChange={(e) => setEdicao('referencia', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn secundario" onClick={() => setEditando(false)}>Cancelar</button>
              <button type="button" className="btn" onClick={salvarEdicao} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="section-box">
        <div className="section-title">Valor gasto</div>
        <div className="grade grade-3 grade-resumo-financeiro">
          <CartaoValor label="Fonada" valor={totalFonada} formatarReais={formatarReais} />
          <CartaoValor label="Ao vivo" valor={totalAoVivo} formatarReais={formatarReais} />
          <CartaoValor label="Total geral" valor={totalGeral} formatarReais={formatarReais} destaque />
        </div>
      </div>

      <div className="section-box" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="abas-cliente">
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'fonada' ? 'ativa' : ''}`}
            onClick={() => setAba('fonada')}
          >
            Fonada <span className="aba-contagem">{pedidosFonada.length}</span>
          </button>
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'aovivo' ? 'ativa' : ''}`}
            onClick={() => setAba('aovivo')}
          >
            Ao vivo <span className="aba-contagem">{pedidosAoVivo.length}</span>
          </button>
          <div className="abas-cliente-acao">
            {aba === 'fonada' ? (
              <button type="button" className="btn" onClick={novoPedidoFonada} style={{ gap: 6 }}><IconeMais /> Novo pedido</button>
            ) : (
              <button type="button" className="btn" onClick={novoPedidoAoVivo} style={{ gap: 6 }}><IconeMais /> Novo pedido</button>
            )}
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {aba === 'fonada' && (
            <>
              {pedidosFonada.length === 0 ? (
                <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '20px 0' }}>
                  Nenhum pedido de mensagem fonada ainda.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div className="fs-xs" style={{ display: 'flex', gap: 14, marginBottom: 10, color: 'var(--tinta-suave)' }}>
                    <span><span className="bolinha-status usada" /> MARCADA</span>
                    <span><span className="bolinha-status livre" /> DISPONÍVEL</span>
                  </div>
                  <table className="tabela-lista">
                    <thead>
                      <tr>
                        <th>O.S.</th>
                        <th>Data</th>
                        <th>Para (1ª)</th>
                        <th>Para (2ª)</th>
                        <th>Valor</th>
                        <th>Pagou</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosFonada.map((p) => (
                        <tr key={p.id} onClick={() => navigate(`/fonada/${p.id}`)}>
                          <td><span className="carimbo-os carimbo-os-lista">{p.senha_os || p.id}</span></td>
                          <td>{p.data_pedido || '—'}</td>
                          <td>
                            <span
                              className={`bolinha-status ${p.p1_dia ? 'usada' : 'livre'}`}
                              title={p.p1_dia ? `1ª mensagem marcada para ${p.p1_dia}` : '1ª mensagem ainda disponível'}
                              style={{ marginLeft: 0, marginRight: 6 }}
                            />
                            {p.p1_para || '—'}
                          </td>
                          <td>
                            <span
                              className={`bolinha-status ${p.p2_dia ? 'usada' : 'livre'}`}
                              title={p.p2_dia ? `2ª mensagem marcada para ${p.p2_dia}` : '2ª mensagem ainda disponível'}
                              style={{ marginLeft: 0, marginRight: 6 }}
                            />
                            {p.p2_para || '—'}
                          </td>
                          <td>{p.valor != null ? formatarReais(p.valor) : '—'}</td>
                          <td>
                            <span className={`tag ${p.pagou === 'SIM' ? 'ok' : 'pendente'}`}>
                              {p.pagou === 'SIM' ? 'Pago' : 'Pendente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {aba === 'aovivo' && (
            <>
              {pedidosAoVivo.length === 0 ? (
                <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '20px 0' }}>
                  Nenhum pedido de mensagem ao vivo ainda.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="tabela-lista">
                    <thead>
                      <tr>
                        <th>O.S.</th>
                        <th>Data</th>
                        <th>Entrega</th>
                        <th>Para</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosAoVivo.map((p) => (
                        <tr key={p.id} onClick={() => navigate(`/ao-vivo/${p.id}`)}>
                          <td><span className="carimbo-os carimbo-os-lista">{p.numero_os || p.id}</span></td>
                          <td>{p.data_pedido || '—'}</td>
                          <td>{p.dia_entrega || '—'}</td>
                          <td>{p.para || '—'}</td>
                          <td>{p.valor != null ? formatarReais(p.valor) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, valor }) {
  return (
    <div>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
        {label}
      </div>
      <div className="fs-md">{valor || '—'}</div>
    </div>
  );
}

function CartaoValor({ label, valor, formatarReais, destaque }) {
  return (
    <div className={`cartao-valor ${destaque ? 'destaque' : ''}`}>
      <div className="cartao-valor-label">{label}</div>
      <div className="cartao-valor-numero">{formatarReais(valor)}</div>
    </div>
  );
}

const estilos = {
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
};
