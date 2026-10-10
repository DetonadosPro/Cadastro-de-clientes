import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { dataPedidoNumero, textoInformado } from '../utils/fichaCliente.js';
import { dataHoraBrasilia } from '../utils/dataHoraBrasilia.js';
import { numeroWhatsAppBrasil } from '../utils/telefoneWhatsApp.js';
import './cliente-rapido.css';

const reais = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Icone({ tipo }) {
  const linhas = {
    fechar: <path d="m6 6 12 12M6 18 18 6" />,
    seta: <path d="M5 12h14m-5-5 5 5-5 5" />,
    telefone: <path d="m6 3 3 5-2 2a15 15 0 0 0 7 7l2-2 5 3c-1 5-5 4-8 2C7 17 3 12 3 7c0-2 1-4 3-4Z" />,
    mensagem: <path d="M21 11a9 9 0 0 1-13 8l-6 2 2-6a9 9 0 1 1 17-4Z" />,
    copiar: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    local: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    tempo: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    mais: <path d="M12 5v14M5 12h14" />,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{linhas[tipo]}</svg>;
}

function Metrica({ titulo, valor, detalhe, alerta, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag className={`cr-metrica${alerta ? ' cr-metrica-alerta' : ''}`} {...(onClick ? { type: 'button', onClick } : {})}>
    <span>{titulo}{onClick && <Icone tipo="seta" />}</span><strong>{valor}</strong><small>{detalhe}</small>
  </Tag>;
}

function Prazo({ data, hoje }) {
  const vencimento = dataPedidoNumero(data);
  const dias = vencimento == null ? null : Math.round((vencimento - hoje) / 86400000);
  const texto = dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : dias > 1 ? `Faltam ${dias} dias` : 'Confira o prazo';
  return <span className={`cr-prazo${dias != null && dias <= 7 ? ' cr-prazo-urgente' : ''}`}>{texto}</span>;
}

export default function ClienteDrawer({ clienteId, onFechar, onNavegar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [mostrarHaver, setMostrarHaver] = useState(false);
  const [avisoCopia, setAvisoCopia] = useState('');
  const fecharRef = useRef(null);
  const drawerRef = useRef(null);
  const onFecharRef = useRef(onFechar);
  onFecharRef.current = onFechar;

  useEffect(() => {
    if (!clienteId) return undefined;
    let ativo = true;
    setDados(null); setErro(''); setMostrarHaver(false); setAvisoCopia('');
    api.clientes.buscarResumo(clienteId)
      .then(resposta => { if (ativo) setDados(resposta); })
      .catch(err => { if (ativo) setErro(err.message); });
    return () => { ativo = false; };
  }, [clienteId, tentativa]);

  useEffect(() => {
    if (!clienteId) return undefined;
    const aoTeclar = e => {
      if (e.key === 'Escape') { e.preventDefault(); onFecharRef.current(); return; }
      if (e.key !== 'Tab') return;
      const focaveis = Array.from(drawerRef.current?.querySelectorAll('button, input, select, textarea, summary, [href], [tabindex]:not([tabindex="-1"])') || [])
        .filter(elemento => !elemento.disabled && elemento.getClientRects().length > 0);
      if (!focaveis.length) return;
      const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      const fora = !drawerRef.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === primeiro || fora)) { e.preventDefault(); ultimo.focus(); }
      if (!e.shiftKey && (document.activeElement === ultimo || fora)) { e.preventDefault(); primeiro.focus(); }
    };
    document.body.classList.add('sobreposicao-aberta');
    document.addEventListener('keydown', aoTeclar);
    const focoAnterior = document.activeElement;
    const quadro = requestAnimationFrame(() => fecharRef.current?.focus());
    return () => {
      cancelAnimationFrame(quadro);
      document.body.classList.remove('sobreposicao-aberta');
      document.removeEventListener('keydown', aoTeclar);
      requestAnimationFrame(() => focoAnterior?.isConnected && focoAnterior.focus());
    };
  }, [clienteId]);

  if (!clienteId) return null;
  const cliente = dados?.cliente;
  const resumo = dados?.resumo || {};
  const compras = dados?.ultimasCompras || [];
  const haver = [...(dados?.mensagensEmHaver || [])].sort((a, b) => (dataPedidoNumero(a.dataExpiracao) ?? Infinity) - (dataPedidoNumero(b.dataExpiracao) ?? Infinity));
  const hoje = dataPedidoNumero(dataHoraBrasilia().data);
  const pendente = Number(resumo.valor_pendente || 0);
  const quantidade = Number(resumo.total_pedidos || 0);
  const total = resumo.total_comprado == null ? null : Number(resumo.total_comprado);
  const contatos = cliente ? [['WhatsApp', cliente.whatsapp], ['Celular', cliente.celular], ['Telefone fixo', cliente.fixo]] : [];
  const principal = contatos.find(([, valor]) => numeroWhatsAppBrasil(valor));
  const whatsapp = numeroWhatsAppBrasil(cliente?.whatsapp);
  const criado = cliente?.criado_em ? new Date(cliente.criado_em) : null;
  const cadastro = criado && !Number.isNaN(criado.getTime()) ? criado.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
  const nascimento = textoInformado(cliente?.nascimento);
  const aniversario = nascimento && dataPedidoNumero(`${nascimento.slice(0, 5)}/2024`) != null ? nascimento : '';
  const bloqueado = Boolean(cliente?.bloqueado);
  const ultima = compras.find(compra => dataPedidoNumero(compra.data_pedido) != null);
  const iniciais = cliente?.nome?.trim().split(/\s+/).slice(0, 2).map(parte => parte[0]).join('') || 'C';
  const abrirFicha = () => onNavegar(`/clientes/${clienteId}`);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(principal[1]); setAvisoCopia('Telefone copiado.'); }
    catch { setAvisoCopia('Não foi possível copiar. Selecione o telefone para copiar.'); }
  };

  return createPortal(
    <div className="drawer-cliente-overlay cliente-rapido-overlay" onMouseDown={onFechar} role="presentation">
      <aside ref={drawerRef} className="drawer-cliente cliente-rapido" role="dialog" aria-modal="true" aria-label="Resumo do cliente" onMouseDown={e => e.stopPropagation()}>
        <header className="cr-topo"><span><span className="cr-topo-ponto" />Visão rápida do cliente</span>
          <button ref={fecharRef} type="button" className="cr-fechar" onClick={onFechar} aria-label="Fechar painel"><Icone tipo="fechar" /></button>
        </header>
        <div className="cr-corpo">
          {!dados && !erro && <div className="cr-carregando" role="status"><span>Carregando cliente…</span><i /><i /><div><i /><i /><i /><i /></div><i /><i /></div>}
          {erro && <div className="cr-erro" role="alert"><Icone tipo="tempo" /><h2>Não foi possível abrir o cliente</h2><p>{erro}</p><button type="button" className="cr-botao cr-primario" onClick={() => setTentativa(valor => valor + 1)}>Tentar novamente</button></div>}
          {cliente && <>
            <section className="cr-identidade">
              <div className="cr-avatar" aria-hidden="true">{iniciais}</div>
              <div><span className={`cr-badge ${bloqueado ? 'cr-bloqueado' : 'cr-ativo'}`}>{bloqueado ? 'Cadastro bloqueado' : 'Cadastro ativo'}</span>
                <h2>{cliente.nome}</h2><p>{aniversario ? `Aniversário: ${aniversario.slice(0, 5)}` : 'Aniversário não informado'}{cadastro && <span>No sistema desde {cadastro}</span>}</p>
              </div>
            </section>
            {bloqueado && <div className="cr-alerta" role="status"><strong>Novos pedidos indisponíveis</strong><span>{textoInformado(cliente.bloqueio_motivo) || 'Consulte a ficha para revisar o bloqueio.'}</span></div>}
            <section className="cr-contato" aria-label="Contato do cliente">
              <div className="cr-contato-principal"><div><span>{principal?.[0] || 'Contato'}</span>{principal ? <a href={`tel:+${numeroWhatsAppBrasil(principal[1])}`} aria-label={`Ligar para ${principal[1]}`}>{principal[1]}</a> : <strong>Nenhum telefone válido</strong>}</div>
                {principal && <button type="button" className="cr-icone-botao" aria-label="Copiar telefone" onClick={copiar}><Icone tipo="copiar" /></button>}
              </div>
              <div className="cr-contato-acoes">
                {whatsapp && <a className="cr-botao cr-whatsapp" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp"><Icone tipo="mensagem" />WhatsApp</a>}
                {principal && <a className="cr-botao" href={`tel:+${numeroWhatsAppBrasil(principal[1])}`}><Icone tipo="telefone" />Ligar</a>}
                {!principal && <button type="button" className="cr-botao" onClick={abrirFicha}>Completar contato<Icone tipo="seta" /></button>}
              </div>
              <span className="cr-copia-status" role="status">{avisoCopia}</span>
              <details className="cr-contatos-detalhes"><summary>Todos os contatos</summary><dl>{contatos.map(([label, valor]) => <div key={label}><dt>{label}</dt><dd>{numeroWhatsAppBrasil(valor) ? <a href={`tel:+${numeroWhatsAppBrasil(valor)}`}>{valor}</a> : textoInformado(valor) || 'Não informado'}</dd></div>)}</dl></details>
            </section>
            <section className="cr-metricas" aria-label="Resumo de todo o histórico">
              <Metrica titulo="Total comprado" valor={total == null ? '—' : reais(total)} detalhe={total == null ? 'Total indisponível' : `Média por pedido: ${reais(quantidade ? total / quantidade : 0)}`} />
              <Metrica titulo="Pedidos" valor={quantidade} detalhe={`${resumo.total_fonada || 0} fonada · ${resumo.total_aovivo || 0} ao vivo`} />
              <Metrica titulo="Saldo pendente" valor={reais(pendente)} alerta={pendente > 0} detalhe={Number(resumo.pedidos_pendentes) > 0 ? `${resumo.pedidos_pendentes} pedido(s) · Ver cobrança` : pendente > 0 ? 'Ver cobrança' : 'Tudo em dia'} onClick={pendente > 0 || Number(resumo.pedidos_pendentes) > 0 ? () => onNavegar(`/cobranca?nome=${encodeURIComponent(cliente.nome)}&avNome=${encodeURIComponent(cliente.nome)}`) : undefined} />
              <Metrica titulo="Última compra" valor={ultima?.data_pedido || '—'} detalhe={ultima ? `${ultima.tipo} · O.S. ${ultima.os || ultima.id}` : quantidade ? 'Data não informada' : 'Sem pedidos ainda'} onClick={ultima ? () => onNavegar(ultima.rota) : undefined} />
            </section>
            <section className="cr-secao cr-haver" aria-labelledby="cr-haver-titulo">
              <div className="cr-secao-topo"><h3 id="cr-haver-titulo"><Icone tipo="mensagem" />Mensagens em haver<span className="cr-contagem">{haver.length}</span></h3></div>
              {haver.length ? <><p className="cr-secao-legenda">Use primeiro a que está mais perto de vencer.</p><div id="cr-haver-lista" className="cr-haver-lista">{(mostrarHaver ? haver : haver.slice(0, 3)).map((mensagem, index) => <button type="button" key={mensagem.id} className={index === 0 ? 'cr-haver-primeira' : ''} aria-label={`Abrir 2ª mensagem da O.S. ${mensagem.os || mensagem.id}`} onClick={() => onNavegar(mensagem.rota)}>
                <div><span className="cr-haver-linha"><strong>O.S. {mensagem.os || mensagem.id}</strong><Prazo data={mensagem.dataExpiracao} hoje={hoje} /></span><small>2ª mensagem · Válida até {mensagem.dataExpiracao || 'data a confirmar'}</small>{(textoInformado(mensagem.tema) || textoInformado(mensagem.destinatario)) && <small>{[textoInformado(mensagem.tema), textoInformado(mensagem.destinatario)].filter(Boolean).join(' · ')}</small>}</div><Icone tipo="seta" />
              </button>)}</div>{haver.length > 3 && <button type="button" className="cr-ver-mais" aria-expanded={mostrarHaver} aria-controls="cr-haver-lista" onClick={() => setMostrarHaver(valor => !valor)}>{mostrarHaver ? 'Mostrar menos' : `Ver todas as ${haver.length} mensagens`}</button>}</> : <p className="cr-vazio">Nenhuma segunda mensagem disponível para agendar.</p>}
            </section>
            <section className="cr-secao" aria-labelledby="cr-compras-titulo"><div className="cr-secao-topo"><h3 id="cr-compras-titulo"><Icone tipo="tempo" />Últimas compras</h3><span>Até 5 mais recentes</span></div>
              <div className="cr-compras">{compras.map(pedido => <button type="button" key={`${pedido.tipo}-${pedido.id}`} aria-label={`Abrir ${pedido.tipo.toLowerCase()} O.S. ${pedido.os || pedido.id}`} onClick={() => onNavegar(pedido.rota)}>
                <span className="cr-compra-tipo" aria-hidden="true"><Icone tipo={pedido.tipo === 'Fonada' ? 'telefone' : 'mensagem'} /></span>
                <span className="cr-compra-descricao"><strong>{pedido.tipo} · O.S. {pedido.os || pedido.id}</strong><small>{pedido.data_pedido || 'Data não informada'}</small></span>
                <span className="cr-compra-valor"><strong>{reais(pedido.valor)}</strong><span className={`cr-pagamento ${pedido.pagou === 'SIM' ? 'cr-pago' : ''}`}>{pedido.pagou === 'SIM' ? 'Recebido' : pedido.pagou == null ? 'A confirmar' : 'Pendente'}</span></span><Icone tipo="seta" />
              </button>)}</div>{!compras.length && <p className="cr-vazio">O histórico começa com o primeiro pedido.</p>}
            </section>
            <details className="cr-cadastro"><summary><span><Icone tipo="local" /><span>Endereço e cadastro<small>{textoInformado(cliente.bairro) || 'Confira os dados de localização'}</small></span></span></summary><dl>{[['Endereço', cliente.endereco], ['Complemento', cliente.complemento], ['Bairro', cliente.bairro], ['Referência', cliente.referencia], ['Nascimento', aniversario]].map(([label, valor]) => <div key={label}><dt>{label}</dt><dd>{textoInformado(valor) || 'Não informado'}</dd></div>)}</dl><button type="button" className="cr-ver-mais" onClick={abrirFicha}>Revisar cadastro na ficha<Icone tipo="seta" /></button></details>
          </>}
        </div>
        {(cliente || erro) && <footer className="cr-rodape"><button type="button" className="cr-botao cr-primario cr-ficha" onClick={abrirFicha}>Ficha completa<Icone tipo="seta" /></button>
          {cliente && <div className="cr-novos"><button type="button" className="cr-botao" disabled={bloqueado} onClick={() => onNavegar(`/fonada/novo?clienteId=${cliente.id}`)}><Icone tipo="mais" />Nova fonada</button><button type="button" className="cr-botao" disabled={bloqueado} onClick={() => onNavegar(`/ao-vivo/novo?clienteId=${cliente.id}`)}><Icone tipo="mais" />Novo ao vivo</button></div>}
        </footer>}
      </aside>
    </div>, document.body
  );
}
