import React, { useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useRascunhos } from '../../RascunhosContext.jsx';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';
import { useSmartBack } from '../../hooks/useSmartBack.js';
import CampoEnderecoAutocomplete from '../../components/CampoEnderecoAutocomplete.jsx';
import { AvisoInline } from '../../components/Interface.jsx';
import Icone from '../../components/IconeAdministracao.jsx';
import '../administracao.css';
import './novo-cliente.css';

const VAZIO = {
  nome: '', nascimento: '', fixo: '', whatsapp: '', celular: '',
  endereco: '', numero: '', complemento: '', bairro: '', referencia: '',
};

function enderecoCompleto(endereco, numero) {
  const logradouro = String(endereco || '').trim();
  const numeroInformado = String(numero || '').trim();
  if (!numeroInformado) return logradouro;
  return `${logradouro}${logradouro ? ', ' : ''}${numeroInformado}`;
}

export default function FormNovoCliente() {
  const [params] = useSearchParams();
  return <FormularioNovoCliente key={params.get('rascunho') || 'novo'} />;
}

function FormularioNovoCliente() {
  const navigate = useNavigate();
  const location = useLocation();
  const voltarHistorico = useSmartBack('/clientes');
  const { mostrarToast } = useToast();

  const [params] = useSearchParams();
  const { rascunhosClientes, salvarRascunhoCliente, limparRascunhoCliente } = useRascunhos();
  const [novoId] = useState(() => crypto.randomUUID());
  const idRascunho = params.get('rascunho') || novoId;
  const chaveRascunho = `novo-${idRascunho}`;
  const rascunho = rascunhosClientes[chaveRascunho];
  const estadoOrigem = rascunho?.estado || location.state;
  const salvo = useRef(false);
  const [dados, setDados] = useState(() => ({ ...VAZIO, ...(rascunho?.dados || location.state?.dadosIniciais || {}) }));
  React.useEffect(() => {
    if (!params.get('rascunho')) {
      const novos = new URLSearchParams(params);
      novos.set('rascunho', idRascunho);
      navigate({ pathname: location.pathname, search: novos.toString() }, { replace: true, state: estadoOrigem });
    }
  }, [idRascunho, location.pathname, navigate, params, estadoOrigem]);
  React.useEffect(() => {
    if (!salvo.current && (rascunho || Object.values(dados).some(valor => String(valor || '').trim())))
      salvarRascunhoCliente(chaveRascunho, dados, estadoOrigem);
  }, [dados, chaveRascunho, salvarRascunhoCliente]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [duplicados, setDuplicados] = useState(null);
  const [enderecoAberto, setEnderecoAberto] = useState(() =>
    ['endereco', 'numero', 'complemento', 'bairro', 'referencia'].some(campo => dados[campo]?.trim()));
  const [fase, setFase] = useState('');
  const duplicadosRef = useRef(null);
  const nomeRef = useRef(null);
  const submissaoEmAndamento = useRef(false);
  React.useEffect(() => {
    if (duplicados !== null) duplicadosRef.current?.focus();
  }, [duplicados]);

  function set(campo, valor) {
    setDados((d) => ({ ...d, [campo]: valor }));
    setDuplicados(null);
  }

  function setComMascara(campo, valorBruto, tipoMascara) {
    const formatadores = { celular: formatarCelular, fixo: formatarFixo, data: formatarData };
    set(campo, formatadores[tipoMascara](valorBruto));
  }

  function selecionarEndereco({ logradouro, bairro }) {
    setDados((atual) => ({
      ...atual,
      endereco: logradouro,
      bairro: bairro || atual.bairro,
    }));
    setDuplicados(null);
  }

  async function persistirCliente() {
    setSalvando(true);
    setFase('Salvando cliente…');
    try {
      // O banco atual mantém logradouro e número juntos em `endereco`.
      // A tela os separa para facilitar o preenchimento, mas envia o mesmo
      // formato histórico consumido por pedidos, cobrança e recibos.
      const { numero, ...dadosPersistidos } = dados;
      const novo = await api.clientes.criar({
        ...dadosPersistidos,
        endereco: enderecoCompleto(dados.endereco, numero),
      });
      salvo.current = true;
      limparRascunhoCliente(chaveRascunho);
      mostrarToast('Cliente cadastrado com sucesso.');
      navigate(`/clientes/${novo.id}`, { replace: true });
    } catch (err) {
      setErro(err.message);
      mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      setSalvando(false);
      setFase('');
    }
  }

  async function salvarDeVerdade() {
    if (submissaoEmAndamento.current) return;
    setErro('');
    submissaoEmAndamento.current = true;
    try {
      await persistirCliente();
    } finally {
      submissaoEmAndamento.current = false;
    }
  }

  async function salvar() {
    if (submissaoEmAndamento.current) return;
    setErro('');
    if (!dados.nome.trim()) {
      setErro('O nome é obrigatório.');
      nomeRef.current?.focus();
      return;
    }
    // A revisão permanece ao lado dos dados: um segundo Enter não deve
    // ignorar a duplicidade enquanto a pessoa ainda está conferindo.
    if (duplicados?.length) { duplicadosRef.current?.focus(); return; }

    submissaoEmAndamento.current = true;
    try {
      if (duplicados === null && dados.nascimento.trim()) {
        setSalvando(true);
        setFase('Conferindo cadastros existentes…');
        try {
          const resp = await api.clientes.verificarDuplicidade(dados.nome, dados.nascimento);
          setSalvando(false);
          setFase('');
          if (resp.possiveisDuplicados.length > 0) {
            setDuplicados(resp.possiveisDuplicados);
            return;
          }
        } catch (err) {
          setSalvando(false);
          setFase('');
          setErro('Não foi possível verificar duplicidades. Tente salvar novamente.');
          return;
        }
      }

      await persistirCliente();
    } finally {
      submissaoEmAndamento.current = false;
    }
  }

  function cancelar() {
    voltarHistorico();
  }

  const temDados = Object.values(dados).some(valor => String(valor || '').trim());
  const nome = dados.nome.trim();
  const iniciais = nome.split(/\s+/).filter(Boolean).map((parte, i, lista) => i === 0 || i === lista.length - 1 ? parte[0] : '').join('').slice(0, 2).toUpperCase();
  const endereco = enderecoCompleto(dados.endereco, dados.numero);
  const enderecoPreenchido = Boolean(endereco || dados.bairro.trim() || dados.complemento.trim() || dados.referencia.trim());
  const temContato = Boolean(dados.whatsapp || dados.celular || dados.fixo);
  const revisando = Boolean(duplicados?.length);
  const confirmado = duplicados !== null && duplicados.length === 0;

  return (
    <form className="admin-workspace novo-cliente-workspace" onSubmit={evento => {
      evento.preventDefault();
      confirmado ? salvarDeVerdade() : salvar();
    }}>
      <header className="admin-header">
        <div><span className="admin-eyebrow">Relacionamento · Clientes</span><h1>Novo cliente</h1><p>Um cadastro simples, uma ficha pronta para os próximos pedidos.</p></div>
        <div className="novo-cliente-header-actions">
          {temDados && <span className="novo-cliente-draft"><Icone tipo="salvo"/>Rascunho em edição</span>}
          <button type="button" className="btn secundario" disabled={salvando} onClick={cancelar}>Fechar</button>
        </div>
      </header>

      <div className="novo-cliente-layout">
        <div className="novo-cliente-main">
          {erro && <AvisoInline titulo="Não foi possível salvar o cliente">{erro}</AvisoInline>}
          {duplicados !== null && <section className="novo-cliente-duplicates cadastro-duplicados" ref={duplicadosRef} tabIndex={-1} aria-labelledby="novo-duplicados-titulo">
            <div className="novo-cliente-duplicates-heading"><span aria-hidden="true">!</span><div>
              <h2 id="novo-duplicados-titulo">{revisando ? 'Já existe cliente parecido com o mesmo aniversário' : 'Cadastro pronto para confirmar'}</h2>
              <p>{revisando ? 'Confira os cadastros encontrados. Seus dados continuam no formulário abaixo.' : 'Você indicou que é outra pessoa. Confira a prévia e confirme para criar o cadastro.'}</p>
            </div></div>
            {revisando && <div className="novo-cliente-candidates">{duplicados.map(c => <article key={c.id}>
              <div><strong>{c.nome}</strong><span>Cadastro #{c.id} · nascimento {c.nascimento}{(c.whatsapp || c.celular || c.fixo) && ` · ${c.whatsapp || c.celular || c.fixo}`}</span></div>
              <button type="button" className="btn secundario" onClick={() => navigate(`/clientes/${c.id}`)}>Abrir</button>
            </article>)}</div>}
            <div className="novo-cliente-duplicate-actions">
              <button type="button" className="btn secundario" disabled={salvando} onClick={() => {setDuplicados(null); nomeRef.current?.focus();}}>Voltar à edição</button>
              {revisando && <button type="button" className="btn" onClick={() => setDuplicados([])}>É pessoa diferente, cadastrar assim mesmo</button>}
            </div>
          </section>}

          <section className="admin-card novo-cliente-section" aria-labelledby="novo-identificacao-titulo">
            <div className="admin-card-title"><span className="admin-icon"><Icone tipo="cliente"/></span><div><h2 id="novo-identificacao-titulo">Quem é o cliente?</h2><p>O nome é o único campo obrigatório.</p></div><span className="novo-cliente-step">01</span></div>
            <fieldset className="novo-cliente-fields novo-cliente-identity" disabled={salvando}>
              <legend className="novo-cliente-sr">Identificação do cliente</legend>
              <div className="campo"><label htmlFor="novo-nome">Nome *</label><input id="novo-nome" ref={nomeRef} required autoComplete="name" placeholder="Nome completo do cliente" value={dados.nome} onChange={e => set('nome', e.target.value)} autoFocus/></div>
              <div className="campo"><label htmlFor="novo-nascimento">Nascimento</label><input id="novo-nascimento" inputMode="numeric" placeholder="dd/mm/aa" aria-describedby="novo-nascimento-ajuda" value={dados.nascimento} onChange={e => setComMascara('nascimento', e.target.value, 'data')}/><small id="novo-nascimento-ajuda">Pode informar só dia e mês.</small></div>
            </fieldset>
          </section>

          <section className="admin-card novo-cliente-section" aria-labelledby="novo-contato-titulo">
            <div className="admin-card-title"><span className="admin-icon"><Icone tipo="contato"/></span><div><h2 id="novo-contato-titulo">Como falar com ele?</h2><p>Preencha os contatos que tiver, com DDD.</p></div><span className="novo-cliente-step">02</span></div>
            <fieldset className="novo-cliente-fields novo-cliente-contacts" disabled={salvando}>
              <legend className="novo-cliente-sr">Telefones do cliente</legend>
              <div className="campo"><label htmlFor="novo-whatsapp">WhatsApp</label><input id="novo-whatsapp" inputMode="tel" autoComplete="tel" placeholder="(00) 0 0000-0000" value={dados.whatsapp} onChange={e => setComMascara('whatsapp', e.target.value, 'celular')}/></div>
              <div className="campo"><label htmlFor="novo-celular">Celular</label><input id="novo-celular" inputMode="tel" autoComplete="tel" placeholder="(00) 0 0000-0000" value={dados.celular} onChange={e => setComMascara('celular', e.target.value, 'celular')}/></div>
              <div className="campo"><label htmlFor="novo-fixo">Telefone fixo</label><input id="novo-fixo" inputMode="tel" autoComplete="tel" placeholder="(00) 0000-0000" value={dados.fixo} onChange={e => setComMascara('fixo', e.target.value, 'fixo')}/></div>
            </fieldset>
            <div className="novo-cliente-contact-note"><span>O celular é o mesmo do WhatsApp?</span><button type="button" className="btn-small" disabled={salvando || !dados.whatsapp || dados.celular === dados.whatsapp} onClick={() => set('celular', dados.whatsapp)}>Usar WhatsApp no celular</button></div>
          </section>

          <section className={`admin-card novo-cliente-section novo-cliente-address ${enderecoAberto ? 'aberto' : ''}`}>
            <button type="button" className="novo-cliente-address-toggle" aria-expanded={enderecoAberto} aria-controls="novo-endereco-campos" onClick={() => setEnderecoAberto(atual => !atual)}>
              <span className="admin-icon"><Icone tipo="endereco"/></span><span><strong>Endereço e referência</strong><small>{enderecoPreenchido ? 'Endereço adicionado · confira ou complete os dados' : 'Opcional · acrescente agora ou complete depois'}</small></span><span className="novo-cliente-toggle-symbol" aria-hidden="true">{enderecoAberto ? '−' : '+'}</span>
            </button>
            {enderecoAberto && <fieldset id="novo-endereco-campos" className="novo-cliente-fields novo-cliente-address-fields" disabled={salvando}>
              <legend className="novo-cliente-sr">Endereço e referência do cliente</legend>
              <div className="novo-cliente-address-line">
                <div className="campo"><label htmlFor="novo-endereco">Endereço</label><CampoEnderecoAutocomplete id="novo-endereco" value={dados.endereco} numero={dados.numero} onChange={valor => set('endereco', valor)} onSelecionar={selecionarEndereco}/></div>
                <div className="campo"><label htmlFor="novo-numero">Nº</label><input id="novo-numero" placeholder="Nº / S/N" value={dados.numero} onChange={e => set('numero', e.target.value)}/></div>
              </div>
              <div className="novo-cliente-address-line detalhes"><div className="campo"><label htmlFor="novo-bairro">Bairro</label><input id="novo-bairro" autoComplete="address-level3" value={dados.bairro} onChange={e => set('bairro', e.target.value)}/></div><div className="campo"><label htmlFor="novo-complemento">Complemento</label><input id="novo-complemento" placeholder="Apartamento, bloco, casa…" value={dados.complemento} onChange={e => set('complemento', e.target.value)}/></div></div>
              <div className="campo"><label htmlFor="novo-referencia">Referência</label><textarea id="novo-referencia" rows="2" placeholder="O que ajuda a encontrar o endereço?" value={dados.referencia} onChange={e => set('referencia', e.target.value)}/></div>
              <p className="novo-cliente-address-help">As sugestões de rua são de Uberaba/MG. Você também pode digitar qualquer endereço.</p>
            </fieldset>}
          </section>

          <footer className="novo-cliente-savebar">
            <div role="status"><strong>{salvando ? fase : revisando ? 'Confira os cadastros encontrados' : confirmado ? 'Pronto para confirmar' : nome ? 'Pronto para cadastrar' : 'Comece pelo nome do cliente'}</strong><span>{salvando ? 'Aguarde a conclusão para continuar.' : 'Os demais dados podem ser completados depois.'}</span></div>
            <div><button type="button" className="btn secundario" disabled={salvando} onClick={cancelar}>Cancelar</button><button type="submit" className="btn" disabled={salvando || revisando}>{salvando ? 'Aguarde…' : confirmado ? 'Confirmar e salvar' : 'Salvar cliente'}</button></div>
          </footer>
        </div>

        <aside className="novo-cliente-aside" aria-label="Prévia e orientações do cadastro">
          <section className="novo-cliente-preview" aria-labelledby="novo-previa-titulo">
            <div className="novo-cliente-preview-top"><h2 id="novo-previa-titulo">Prévia da ficha</h2><span>Novo cadastro</span></div>
            <div className="novo-cliente-preview-person"><span className="novo-cliente-avatar" aria-hidden="true">{iniciais || <Icone tipo="cliente"/>}</span><div><h3>{nome || 'Nome do cliente'}</h3><p>{dados.nascimento ? `Nascimento · ${dados.nascimento}` : 'Aniversário ainda não informado'}</p></div></div>
            <dl className="novo-cliente-preview-info">{[['WhatsApp', dados.whatsapp], ['Celular', dados.celular], ['Telefone fixo', dados.fixo]].map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd className={valor ? '' : 'vazio'}>{valor || 'Não informado'}</dd></div>)}</dl>
            <div className="novo-cliente-preview-address"><Icone tipo="endereco"/><div><strong>{endereco || 'Endereço a completar'}</strong>{dados.bairro && <span>{dados.bairro}</span>}{dados.complemento && <span>{dados.complemento}</span>}{dados.referencia && <p>{dados.referencia}</p>}</div></div>
          </section>
          <section className="novo-cliente-checklist"><h2>Antes de salvar</h2><ul><li className={nome ? 'completo' : ''}><Icone tipo={nome ? 'salvo' : 'cliente'}/><span><strong>{nome ? 'Cliente identificado' : 'Informe o nome'}</strong><small>Essencial para criar a ficha.</small></span></li><li className={temContato ? 'completo' : ''}><Icone tipo={temContato ? 'salvo' : 'contato'}/><span><strong>{temContato ? 'Contato adicionado' : 'Adicione um contato, se tiver'}</strong><small>Facilita encontrar e falar com o cliente.</small></span></li><li className={enderecoPreenchido ? 'completo' : ''}><Icone tipo={enderecoPreenchido ? 'salvo' : 'endereco'}/><span><strong>{enderecoPreenchido ? 'Endereço adicionado' : 'Endereço é opcional'}</strong><small>Útil para entregas e cobranças.</small></span></li></ul></section>
          <div className="novo-cliente-draft-note"><Icone tipo="pasta"/><p>Pode ir a outra tela e retomar este preenchimento pelo rascunho no menu.</p></div>
        </aside>
      </div>
    </form>
  );
}
