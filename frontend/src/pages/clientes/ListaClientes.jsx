import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';
import ClienteDrawer from '../../components/ClienteDrawer.jsx';
import { AvisoInline, CabecalhoPagina, Dialogo, EstadoVazio, Paginacao } from '../../components/Interface.jsx';

const FILTROS_RAPIDOS = [
  ['pendencia', 'Com cobrança pendente'],
  ['bloqueados', 'Bloqueados'],
];

const CAMPOS_MESCLA = [
  ['nome', 'Nome'], ['nascimento', 'Nascimento'], ['whatsapp', 'WhatsApp'], ['celular', 'Celular'],
  ['fixo', 'Telefone fixo'], ['endereco', 'Endereço'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['referencia', 'Referência'],
];

function formatarTelefonePesquisa(valor) {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 11);
  if (digitos.length < 10) return digitos;
  return digitos.length === 10 ? formatarFixo(digitos) : formatarCelular(digitos);
}

function valorUtil(valor) {
  const texto = String(valor || '').trim();
  return texto && !/^0+$/.test(texto) && texto !== '-' && texto !== '00/00/0000' ? texto : '';
}

function formatarReais(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Alça de arrastar — seis pontos em duas colunas, o desenho universal
// de "isso é arrastável" em interfaces de lista.
function IconeAlca() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="5" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="9" cy="19" r="1.6" />
      <circle cx="15" cy="5" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="15" cy="19" r="1.6" />
    </svg>
  );
}
function IconeMais() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconeAviso() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.3 18a1.8 1.8 0 0 0 1.5 2.7h16.4a1.8 1.8 0 0 0 1.5-2.7l-8-14.1a1.8 1.8 0 0 0-3.1 0Z" />
    </svg>
  );
}
function IconeSeta({ aberta }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Mostra ▲/▼ ao lado do nome da coluna quando ela é o critério de
// ordenação ativo, para indicar visualmente a direção corrente.
function indicadorOrdenacao(coluna, ordenarPorAtivo, direcaoAtiva) {
  if (ordenarPorAtivo !== coluna) return '';
  return direcaoAtiva === 'asc' ? ' ▲' : ' ▼';
}

export default function ListaClientes() {
  const [searchParams, setSearchParams] = useSearchParams();

  const buscaUrl = searchParams.get('busca') || '';
  const telefoneUrl = searchParams.get('telefone') || '';
  const aniversarioUrl = searchParams.get('aniversario') || '';
  const situacaoUrl = searchParams.get('situacao') || '';
  const paginaUrl = Math.max(1, parseInt(searchParams.get('pagina') || '1', 10) || 1);
  const ordenarPorUrl = searchParams.get('ordenarPor') || 'nome';
  const direcaoUrl = searchParams.get('direcao') || 'asc';
  const drawerUrl = searchParams.get('cliente');

  const [busca, setBusca] = useState(buscaUrl);
  const [telefone, setTelefone] = useState(telefoneUrl);
  const [aniversario, setAniversario] = useState(aniversarioUrl);
  const [situacao, setSituacao] = useState(situacaoUrl);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [excluindoSelecionados, setExcluindoSelecionados] = useState(false);
  const [arrastandoId, setArrastandoId] = useState(null);
  const [sobreId, setSobreId] = useState(null);
  const [mesclando, setMesclando] = useState(false);
  const [sugestoesDuplicata, setSugestoesDuplicata] = useState([]);
  const [descartadas, setDescartadas] = useState(() => new Set());
  const [duplicatasAbertas, setDuplicatasAbertas] = useState(false);
  const [buscandoDuplicatas, setBuscandoDuplicatas] = useState(false);
  const [duplicatasConsultadas, setDuplicatasConsultadas] = useState(false);
  const [erroDuplicatas, setErroDuplicatas] = useState('');
  const [comparacaoMescla, setComparacaoMescla] = useState(null);
  const [destinoMescla, setDestinoMescla] = useState(null);
  const [fontesMescla, setFontesMescla] = useState({});
  const [clienteDrawerId, setClienteDrawerId] = useState(() => drawerUrl ? Number(drawerUrl) : null);
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState(false);
  const navigate = useNavigate();
  const { mostrarToast } = useToast();

  const acabouDeArrastar = useRef(false);
  const consultaRef = useRef(null);

  const porPagina = 30;
  const totalPaginas = Math.max(Math.ceil(total / porPagina), 1);

  const carregar = useCallback(async (termo, pag, ordenarPor, direcao, extras = {}) => {
    consultaRef.current?.abort();
    const controle = new AbortController();
    consultaRef.current = controle;
    setCarregando(true);
    setErro('');
    setSelecionados(new Set());
    try {
      const resposta = await api.clientes.listar(termo, pag, 'nome', ordenarPor, direcao, { ...extras, signal: controle.signal });
      if (controle.signal.aborted) return;
      setItens(resposta.clientes);
      setTotal(resposta.total);
      setSelecionados(new Set());
    } catch (err) {
      if (!controle.signal.aborted) setErro(err.message);
    } finally {
      if (!controle.signal.aborted) setCarregando(false);
    }
  }, []);

  useEffect(() => () => consultaRef.current?.abort(), []);

  useEffect(() => {
    setBusca(buscaUrl);
    setTelefone(telefoneUrl);
    setAniversario(aniversarioUrl);
    setSituacao(situacaoUrl);
    carregar(buscaUrl, paginaUrl, ordenarPorUrl, direcaoUrl, { telefone: telefoneUrl, aniversario: aniversarioUrl, situacao: situacaoUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaUrl, telefoneUrl, aniversarioUrl, situacaoUrl, paginaUrl, ordenarPorUrl, direcaoUrl, carregar]);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      const atuais = {
        busca: buscaUrl, telefone: telefoneUrl, aniversario: aniversarioUrl, situacao: situacaoUrl,
      };
      if (busca === atuais.busca && telefone === atuais.telefone && aniversario === atuais.aniversario && situacao === atuais.situacao) return;
      setSearchParams(montarParams(busca, telefone, aniversario, situacao, 1, ordenarPorUrl, direcaoUrl), { replace: true });
    }, 350);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, telefone, aniversario, situacao]);

  // A varredura da base é solicitada pela ação Revisar duplicatas.
  // Depois da primeira consulta, atualiza apenas após mudanças nos cadastros.
  const buscarSugestoes = useCallback(async () => {
    setBuscandoDuplicatas(true);
    setErroDuplicatas('');
    try {
      const resp = await api.clientes.possiveisDuplicatas();
      setSugestoesDuplicata(resp.pares || []);
      setDuplicatasConsultadas(true);
    } catch (err) {
      setErroDuplicatas('Não foi possível consultar duplicatas. Tente novamente.');
    } finally {
      setBuscandoDuplicatas(false);
    }
  }, []);

  function alternarDuplicatas() {
    setDuplicatasAbertas((aberta) => !aberta);
    if (!duplicatasConsultadas && !buscandoDuplicatas) buscarSugestoes();
  }

  function chaveDoPar(par) {
    return [par.a.id, par.b.id].sort((x, y) => x - y).join('-');
  }

  async function descartarSugestao(par) {
    const chave = chaveDoPar(par);
    // Atualiza a tela imediatamente (sem esperar a resposta do
    // servidor) para a ação parecer instantânea; se o pedido falhar,
    // a sugestão volta a aparecer na próxima visita à tela — não é
    // grave, só significa que a pessoa vai precisar descartar de novo.
    setDescartadas((antigo) => new Set(antigo).add(chave));
    try {
      await api.clientes.descartarDuplicata(par.a.id, par.b.id);
    } catch (err) {
      setDescartadas((atual) => { const proxima = new Set(atual); proxima.delete(chave); return proxima; });
      mostrarToast('Não foi possível descartar a sugestão. Tente novamente.', 'erro');
    }
  }

  function abrirComparacao(a, b, destinoInicial = a.id, chave = null) {
    setComparacaoMescla({ a, b, chave });
    setDestinoMescla(destinoInicial);
    setFontesMescla(Object.fromEntries(CAMPOS_MESCLA.map(([campo]) => [campo, String(destinoInicial)])));
  }

  function preSelecionarCadastro(clienteId) {
    setDestinoMescla(clienteId);
    setFontesMescla(Object.fromEntries(CAMPOS_MESCLA.map(([campo]) => [campo, String(clienteId)])));
  }

  async function confirmarMesclagem() {
    if (!comparacaoMescla || !destinoMescla) return;
    const destino = String(comparacaoMescla.a.id) === String(destinoMescla) ? comparacaoMescla.a : comparacaoMescla.b;
    const origem = destino === comparacaoMescla.a ? comparacaoMescla.b : comparacaoMescla.a;
    setMesclando(true);
    try {
      const dadosFinais = Object.fromEntries(CAMPOS_MESCLA.map(([campo]) => {
        const fonte = String(fontesMescla[campo]) === String(comparacaoMescla.a.id) ? comparacaoMescla.a : comparacaoMescla.b;
        const valor = valorUtil(fonte[campo]);
        return [campo, campo === 'nascimento' && valor && !nascimentoValido(valor) ? '' : valor];
      }));
      await api.clientes.mesclar(destino.id, origem.id, dadosFinais);
      mostrarToast(`Clientes mesclados. Cadastro mantido: "${destino.nome}".`);
      if (comparacaoMescla.chave) setDescartadas((antigo) => new Set(antigo).add(comparacaoMescla.chave));
      setComparacaoMescla(null);
      setDestinoMescla(null);
      if (duplicatasConsultadas) buscarSugestoes();
      carregar(buscaUrl, paginaUrl, ordenarPorUrl, direcaoUrl, { telefone: telefoneUrl, aniversario: aniversarioUrl, situacao: situacaoUrl });
    } catch (err) {
      mostrarToast('Não foi possível mesclar. Tente novamente.', 'erro');
    } finally {
      setMesclando(false);
    }
  }

  const sugestoesVisiveis = sugestoesDuplicata.filter((par) => !descartadas.has(chaveDoPar(par)));

  function montarParams(novaBusca, novoTelefone, novoAniversario, novaSituacao, novaPagina, novoOrdenarPor, novaDirecao) {
    const params = {};
    if (novaBusca) params.busca = novaBusca;
    if (novoTelefone) params.telefone = novoTelefone;
    if (novoAniversario) params.aniversario = novoAniversario;
    if (novaSituacao) params.situacao = novaSituacao;
    params.pagina = String(novaPagina);
    if (novoOrdenarPor && novoOrdenarPor !== 'nome') params.ordenarPor = novoOrdenarPor;
    if (novaDirecao && novaDirecao !== 'asc') params.direcao = novaDirecao;
    return params;
  }

  function irParaPagina(novaPagina) {
    setSearchParams(montarParams(busca, telefone, aniversario, situacao, novaPagina, ordenarPorUrl, direcaoUrl), { replace: true });
  }

  function aplicarFiltroRapido(valor) {
    const novaSituacao = situacao === valor ? '' : valor;
    setSituacao(novaSituacao);
    setCarregando(true);
    setSearchParams(
      montarParams(busca, telefone, aniversario, novaSituacao, 1, ordenarPorUrl, direcaoUrl),
      { replace: true }
    );
  }

  function alternarSelecao(clienteId) {
    setSelecionados((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(clienteId)) novos.delete(clienteId);
      else novos.add(clienteId);
      return novos;
    });
  }

  function alternarTodosVisiveis() {
    const todosSelecionados = itens.length > 0 && itens.every((cliente) => selecionados.has(cliente.id));
    setSelecionados(todosSelecionados ? new Set() : new Set(itens.map((cliente) => cliente.id)));
  }

  function excluirClientesSelecionados() {
    if (selecionados.size === 0) return;
    setConfirmacaoExclusao(true);
  }

  async function confirmarExclusaoSelecionados() {
    if (selecionados.size === 0) return;
    const quantidade = selecionados.size;
    setExcluindoSelecionados(true);
    try {
      await Promise.all([...selecionados].map((clienteId) => api.clientes.excluir(clienteId)));
      mostrarToast(`${quantidade} cliente${quantidade > 1 ? 's enviados' : ' enviado'} para a Lixeira.`);
      setSelecionados(new Set());
      setConfirmacaoExclusao(false);
      if (duplicatasConsultadas) buscarSugestoes();
      carregar(buscaUrl, paginaUrl, ordenarPorUrl, direcaoUrl, { telefone: telefoneUrl, aniversario: aniversarioUrl, situacao: situacaoUrl });
    } catch (err) {
      mostrarToast(err.message || 'Não foi possível excluir os clientes selecionados.', 'erro');
    } finally {
      setExcluindoSelecionados(false);
    }
  }

  // Clicar numa coluna ordenável: se já é a coluna ativa, inverte a
  // direção; se é uma coluna nova, começa em ordem crescente.
  function aoClicarOrdenacao(coluna) {
    const novaDirecao = ordenarPorUrl === coluna
      ? (direcaoUrl === 'asc' ? 'desc' : 'asc')
      : (['ultimo_pedido', 'total_pedidos', 'valor_pendente'].includes(coluna) ? 'desc' : 'asc');
    setSearchParams(montarParams(busca, telefone, aniversario, situacao, 1, coluna, novaDirecao), { replace: true });
  }

  function aoClicarLinha(cliente) {
    if (acabouDeArrastar.current) {
      acabouDeArrastar.current = false;
      return;
    }
    setClienteDrawerId(cliente.id);
    setSearchParams((atuais) => { const novos = new URLSearchParams(atuais); novos.set('cliente', String(cliente.id)); return novos; }, { replace: true });
  }

  const fecharDrawer = useCallback(() => { setClienteDrawerId(null); setSearchParams((atuais) => { const novos = new URLSearchParams(atuais); novos.delete('cliente'); return novos; }, { replace: true }); }, [setSearchParams]);
  const navegarDoDrawer = useCallback((rota) => { navigate(rota); }, [navigate]);

  function aoIniciarArrasto(e, cliente) {
    setArrastandoId(cliente.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(cliente.id));
  }

  function aoTerminarArrasto() {
    setArrastandoId(null);
    setSobreId(null);
  }

  function aoPassarPorCima(e, cliente) {
    if (arrastandoId === null || arrastandoId === cliente.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setSobreId(cliente.id);
  }

  function aoSairDeCima(cliente) {
    if (sobreId === cliente.id) setSobreId(null);
  }

  async function aoSoltar(e, clienteDestino) {
    e.preventDefault();
    acabouDeArrastar.current = true;
    setSobreId(null);

    const origemId = arrastandoId;
    setArrastandoId(null);
    if (!origemId || origemId === clienteDestino.id) return;

    const origem = itens.find((c) => c.id === origemId);
    if (!origem) return;

    abrirComparacao(origem, clienteDestino, clienteDestino.id);
  }

  return (
    <div className="clientes-workspace">
      <CabecalhoPagina
        contexto="Relacionamento"
        titulo="Clientes"
        descricao="Encontre contatos, identifique pendências e abra o histórico sem perder o contexto da lista."
        meta={!carregando ? `${total} cliente${total === 1 ? '' : 's'}` : null}
        acoes={<button type="button" className="btn secundario" onClick={alternarDuplicatas} aria-expanded={duplicatasAbertas}>Revisar duplicatas</button>}
      />

      {duplicatasAbertas && buscandoDuplicatas && <p role="status">Consultando possíveis duplicatas…</p>}
      {duplicatasAbertas && erroDuplicatas && <AvisoInline titulo={erroDuplicatas} acao={<button className="btn-small" onClick={buscarSugestoes}>Tentar novamente</button>} />}
      {duplicatasAbertas && duplicatasConsultadas && !buscandoDuplicatas && !erroDuplicatas && sugestoesVisiveis.length === 0 && <AvisoInline tom="sucesso" titulo="Nenhuma sugestão de duplicata pendente" />}
      {duplicatasAbertas && sugestoesVisiveis.length > 0 && (
        <div className="painel" style={estilos.avisoDuplicata}>
          <button
            type="button"
            onClick={() => setDuplicatasAbertas((v) => !v)}
            style={estilos.cabecalhoDuplicata}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--aviso)', fontWeight: 700 }}>
              <IconeAviso /> {sugestoesVisiveis.length} {sugestoesVisiveis.length > 1 ? 'possíveis duplicatas encontradas' : 'possível duplicata encontrada'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--aviso)' }}>
              <span className="fs-sm">{duplicatasAbertas ? 'Ocultar' : 'Ver'}</span>
              <IconeSeta aberta={duplicatasAbertas} />
            </span>
          </button>

          {duplicatasAbertas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {sugestoesVisiveis.map((par) => {
                const chave = chaveDoPar(par);
                return (
                  <div
                    key={chave}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                      background: '#ffffff', border: '1px solid var(--borda)', borderRadius: 8, padding: '10px 14px',
                    }}
                  >
                    <div className="fs-sm">
                      <strong>{par.a.nome}</strong>
                      <span style={{ color: 'var(--tinta-suave)' }}> ({par.a.nascimento})</span>
                      <span style={{ color: 'var(--tinta-suave)', margin: '0 6px' }}>×</span>
                      <strong>{par.b.nome}</strong>
                      <span style={{ color: 'var(--tinta-suave)' }}> ({par.b.nascimento})</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button type="button" className="btn-small" onClick={() => descartarSugestao(par)}>
                        Não é duplicata
                      </button>
                      <button
                        type="button"
                        className="btn secundario"
                        onClick={() => abrirComparacao(par.a, par.b, par.a.id, chave)}
                      >
                        Comparar e mesclar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <section className="clientes-filtros" aria-label="Busca e filtros de clientes">
        <div className="filtros-cabecalho">
          <div><strong>Localizar clientes</strong></div>
          {(busca || telefone || aniversario || situacao) && <button type="button" className="btn-small" onClick={() => { setBusca(''); setTelefone(''); setAniversario(''); setSituacao(''); }}>Limpar tudo</button>}
        </div>
        <div className="clientes-filtros-rapidos">
          {FILTROS_RAPIDOS.map(([valor, rotulo]) => (
            <button key={valor} type="button" aria-pressed={situacao === valor} className={situacao === valor ? 'ativo' : ''} onClick={() => aplicarFiltroRapido(valor)}>{rotulo}</button>
          ))}
        </div>
        <div className="clientes-campos-busca">
          <div className="campo clientes-campo-nome"><label htmlFor="cliente-busca">Nome</label><input id="cliente-busca" type="search" placeholder="Nome do cliente" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div className="campo"><label htmlFor="cliente-telefone">Telefone ou WhatsApp</label><input id="cliente-telefone" type="search" inputMode="tel" placeholder="DDD e número" value={telefone} onChange={(e) => setTelefone(formatarTelefonePesquisa(e.target.value))} /></div>
          <div className="campo"><label htmlFor="cliente-aniversario">Aniversário</label><input id="cliente-aniversario" type="text" inputMode="numeric" placeholder="dd/mm" value={aniversario} onChange={(e) => setAniversario(formatarData(e.target.value))} /></div>
        </div>
      </section>

      <div className="clientes-ordenacao-mobile">
        <label htmlFor="ordenacao-clientes">Ordenar por</label>
        <select id="ordenacao-clientes" value={ordenarPorUrl} onChange={(evento) => setSearchParams(montarParams(busca, telefone, aniversario, situacao, 1, evento.target.value, direcaoUrl), { replace: true })}>
          <option value="nome">Nome</option><option value="ultimo_pedido">Último pedido</option><option value="total_pedidos">Pedidos</option><option value="valor_pendente">Pendente</option>
        </select>
        <button type="button" className="btn secundario" aria-label={direcaoUrl === 'asc' ? 'Mudar para ordem decrescente' : 'Mudar para ordem crescente'} onClick={() => aoClicarOrdenacao(ordenarPorUrl)}>{direcaoUrl === 'asc' ? '↑' : '↓'}</button>
      </div>

      {selecionados.size > 0 && (
        <div className="selecao-toolbar" role="status">
          <div><span className="selecao-contagem">{selecionados.size}</span><strong>{selecionados.size === 1 ? 'cliente selecionado' : 'clientes selecionados'}</strong><small>As ações se aplicam somente à seleção atual.</small></div>
          <button type="button" className="btn-small" onClick={() => setSelecionados(new Set())}>Limpar seleção</button>
          {selecionados.size === 2 && <button type="button" className="btn secundario" onClick={() => { const par = itens.filter((item) => selecionados.has(item.id)); abrirComparacao(par[0], par[1]); }}>Comparar e mesclar</button>}
          <button className="btn perigo" onClick={excluirClientesSelecionados} disabled={excluindoSelecionados}>Enviar para lixeira</button>
        </div>
      )}

      {erro && <AvisoInline tom="erro" titulo="Não foi possível atualizar os clientes" acao={<button className="btn-small" onClick={() => carregar(buscaUrl, paginaUrl, ordenarPorUrl, direcaoUrl, { telefone: telefoneUrl, aniversario: aniversarioUrl, situacao: situacaoUrl })}>Tentar novamente</button>}>{erro}</AvisoInline>}
      {mesclando && <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Mesclando clientes...</p>}

      <div className="clientes-status" role="status" aria-live="polite">{carregando ? 'Atualizando clientes…' : erro ? (itens.length ? 'Os resultados anteriores foram mantidos.' : 'Tente carregar a lista novamente.') : `${total.toLocaleString('pt-BR')} clientes · página ${paginaUrl} de ${totalPaginas}`}</div>
      {carregando && itens.length === 0 ? (
        <SkeletonClientes />
      ) : itens.length === 0 && !erro ? (
        <EstadoVazio
          titulo="Nenhum cliente encontrado"
          descricao={busca || telefone || aniversario || situacao ? 'Revise os filtros ou limpe a busca para ver outros cadastros.' : 'Cadastre o primeiro cliente para começar.'}
          acao={busca || telefone || aniversario || situacao
            ? <button className="btn secundario" onClick={() => { setBusca(''); setTelefone(''); setAniversario(''); setSituacao(''); }}>Limpar filtros</button>
            : <button className="btn" onClick={() => navigate('/clientes/novo')}><IconeMais /> Novo cliente</button>}
        />
      ) : (
        <>
          <div className={`painel clientes-resultados ${carregando ? 'atualizando' : ''}`} aria-busy={carregando} inert={carregando ? '' : undefined} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela-lista tabela-clientes">
                <thead>
                  <tr>
                    <th style={{ width: 38 }}>
                      <input
                        type="checkbox"
                        checked={itens.length > 0 && itens.every((cliente) => selecionados.has(cliente.id))}
                        onChange={alternarTodosVisiveis}
                        title="Selecionar todos os clientes desta página"
                        aria-label="Selecionar todos os clientes desta página"
                      />
                    </th>
                    <th aria-sort={ordenarPorUrl === 'nome' ? (direcaoUrl === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="tabela-ordenar" onClick={() => aoClicarOrdenacao('nome')}>Nome{indicadorOrdenacao('nome', ordenarPorUrl, direcaoUrl)}</button></th>
                    <th>Contato</th>
                    <th>Bairro</th>
                    <th aria-sort={ordenarPorUrl === 'ultimo_pedido' ? (direcaoUrl === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="tabela-ordenar" onClick={() => aoClicarOrdenacao('ultimo_pedido')}>Último pedido{indicadorOrdenacao('ultimo_pedido', ordenarPorUrl, direcaoUrl)}</button></th>
                    <th style={{textAlign:'center'}} aria-sort={ordenarPorUrl === 'total_pedidos' ? (direcaoUrl === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="tabela-ordenar" onClick={() => aoClicarOrdenacao('total_pedidos')}>Pedidos{indicadorOrdenacao('total_pedidos', ordenarPorUrl, direcaoUrl)}</button></th>
                    <th style={{textAlign:'right'}} aria-sort={ordenarPorUrl === 'valor_pendente' ? (direcaoUrl === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="tabela-ordenar" onClick={() => aoClicarOrdenacao('valor_pendente')}>Pendente{indicadorOrdenacao('valor_pendente', ordenarPorUrl, direcaoUrl)}</button></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((c) => (
                    <tr
                      key={c.id}
                      draggable
                      onDragStart={(e) => aoIniciarArrasto(e, c)}
                      onDragEnd={aoTerminarArrasto}
                      onDragOver={(e) => aoPassarPorCima(e, c)}
                      onDragLeave={() => aoSairDeCima(c)}
                      onDrop={(e) => aoSoltar(e, c)}
                      onClick={() => aoClicarLinha(c)}
                      className={
                        (selecionados.has(c.id) ? 'selecionado ' : '') + (arrastandoId === c.id ? 'linha-arrastando ' : '') +
                        (sobreId === c.id ? 'linha-soltar-aqui' : '')
                      }
                    >
                      <td data-label="Selecionar" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selecionados.has(c.id)}
                          onChange={() => alternarSelecao(c.id)}
                          aria-label={`Selecionar ${c.nome}`}
                        />
                      </td>
                      <td style={{ fontWeight: 700 }} data-label="Nome">
                        <span className="alca-arrastar" title="Arraste para mesclar com outro cliente"><IconeAlca /></span>
                        <button type="button" className="cliente-nome-abrir" onClick={(evento) => { evento.stopPropagation(); aoClicarLinha(c); }}>{c.nome}</button>
                        {![c.whatsapp, c.celular, c.fixo].some(valorUtil) && <span className="cliente-contato-tipo">Contato não informado</span>}
                      </td>
                      <td data-label="Contato">
                        <strong className="cliente-contato-principal">{valorUtil(c.whatsapp) || valorUtil(c.celular) || valorUtil(c.fixo) || '—'}</strong>
                        {valorUtil(c.whatsapp) && <span className="cliente-contato-tipo">WhatsApp</span>}
                      </td>
                      <td data-label="Bairro">{valorUtil(c.bairro) || '—'}</td>
                      <td data-label="Último pedido">{c.ultimo_pedido_data || 'Sem pedidos'}</td>
                      <td style={{ textAlign: 'center' }} data-label="Pedidos">
                        <span className="contagem-pedidos">{Number(c.total_fonada || 0) + Number(c.total_aovivo || 0)}</span>
                        <span className="cliente-contagem-detalhe">{c.total_fonada || 0} fonada · {c.total_aovivo || 0} ao vivo</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }} data-label="Pendente">{Number(c.valor_pendente || 0) > 0 ? formatarReais(c.valor_pendente) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Paginacao carregando={carregando} pagina={paginaUrl} totalPaginas={totalPaginas} total={total} rotulo="clientes" onAnterior={() => irParaPagina(paginaUrl - 1)} onProxima={() => irParaPagina(paginaUrl + 1)} />
        </>
      )}

      {comparacaoMescla && (
        <Dialogo titulo="Comparar e mesclar clientes" descricao="Escolha o cadastro principal. Os pedidos serão transferidos e o cadastro duplicado seguirá para a Lixeira." onClose={() => setComparacaoMescla(null)} className="modal-mesclar-clientes">
            <div className="comparacao-clientes">
              {[comparacaoMescla.a, comparacaoMescla.b].map((clienteComparado) => (
                <label key={clienteComparado.id} className={`cartao-comparacao-cliente ${String(destinoMescla) === String(clienteComparado.id) ? 'selecionado' : ''}`}>
                  <input type="radio" name="destinoMescla" checked={String(destinoMescla) === String(clienteComparado.id)} onChange={() => preSelecionarCadastro(clienteComparado.id)} />
                  <strong>{clienteComparado.nome}</strong>
                  <span>Nascimento: {valorUtil(clienteComparado.nascimento) || 'Não informado'}</span>
                  <span>WhatsApp: {valorUtil(clienteComparado.whatsapp) || 'Não informado'}</span>
                  <span>Celular: {valorUtil(clienteComparado.celular) || 'Não informado'}</span>
                  <span>Fixo: {valorUtil(clienteComparado.fixo) || 'Não informado'}</span>
                  <span>Endereço: {valorUtil(clienteComparado.endereco) || 'Não informado'}</span>
                  <span>Pedidos: {Number(clienteComparado.total_fonada || 0) + Number(clienteComparado.total_aovivo || 0)}</span>
                </label>
              ))}
            </div>
            <div className="section-title" style={{ marginTop: 8 }}>Dados que serão mantidos</div>
            <div className="campos-mescla-clientes">
              {CAMPOS_MESCLA.map(([campo, rotulo]) => (
                <div className="campo-mescla-cliente" key={campo}>
                  <label htmlFor={`mescla-${campo}`}>{rotulo}</label>
                  <select id={`mescla-${campo}`} value={fontesMescla[campo] || ''} onChange={(e) => setFontesMescla((atual) => ({ ...atual, [campo]: e.target.value }))}>
                    <option value={comparacaoMescla.a.id}>Cadastro {comparacaoMescla.a.id}: {valorUtil(comparacaoMescla.a[campo]) || 'Não informado'}</option>
                    <option value={comparacaoMescla.b.id}>Cadastro {comparacaoMescla.b.id}: {valorUtil(comparacaoMescla.b[campo]) || 'Não informado'}</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="aviso-mesclagem-clientes">Confira os dados com atenção. A ação poderá ser conferida posteriormente na Lixeira.</div>
            <div className="acoes-modal-cobranca">
              <button type="button" className="btn secundario" onClick={() => setComparacaoMescla(null)}>Cancelar</button>
              <button type="button" className="btn" onClick={confirmarMesclagem} disabled={mesclando}>{mesclando ? 'Mesclando...' : 'Confirmar mesclagem'}</button>
            </div>
        </Dialogo>
      )}
      {confirmacaoExclusao && (
        <Dialogo titulo="Enviar para a lixeira?" descricao={`${selecionados.size} cliente${selecionados.size > 1 ? 's' : ''} e seus pedidos sairão da lista principal, mas poderão ser restaurados.`} onClose={() => setConfirmacaoExclusao(false)} className="confirmacao-contextual">
            <div className="confirmacao-icone">!</div>
            <div className="confirmacao-acoes"><button className="btn secundario" onClick={() => setConfirmacaoExclusao(false)}>Cancelar</button><button className="btn perigo" onClick={confirmarExclusaoSelecionados} disabled={excluindoSelecionados}>{excluindoSelecionados ? 'Enviando…' : 'Confirmar'}</button></div>
        </Dialogo>
      )}
      <ClienteDrawer clienteId={clienteDrawerId} onFechar={fecharDrawer} onNavegar={navegarDoDrawer} />
    </div>
  );
}

const estilos = {
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  paginacao: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  colunaOrdenavel: { cursor: 'pointer', userSelect: 'none' },
  avisoDuplicata: {
    borderLeft: '4px solid var(--aviso)',
    background: 'var(--aviso-suave)',
    marginBottom: 20,
  },
  cabecalhoDuplicata: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};

function SkeletonClientes() {
  return <div className="clientes-skeleton painel" aria-label="Carregando clientes">{Array.from({ length: 7 }, (_, i) => <div className="cliente-skeleton-linha" key={i}><i/><span/><span/><span/><b/></div>)}</div>;
}
