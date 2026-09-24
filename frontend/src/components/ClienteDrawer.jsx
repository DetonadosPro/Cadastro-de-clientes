import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';

function valorUtil(valor) { const texto = String(valor || '').trim(); return texto && texto !== '-' ? texto : ''; }
function formatarReais(valor) { return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function ClienteDrawer({ clienteId, onFechar, onNavegar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const fecharRef = useRef(null);
  const drawerRef = useRef(null);
  const onFecharRef = useRef(onFechar);
  onFecharRef.current = onFechar;

  useEffect(() => {
    if (!clienteId) return undefined;
    let ativo = true;
    setDados(null); setErro('');
    api.clientes.buscarResumo(clienteId).then((resposta) => { if (ativo) setDados(resposta); }).catch((err) => { if (ativo) setErro(err.message); });
    const aoTeclar = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onFecharRef.current(); return; }
      if (e.key !== 'Tab') return;
      const focaveis = Array.from(drawerRef.current?.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])') || [])
        .filter((elemento) => !elemento.disabled && elemento.getClientRects().length > 0);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.body.classList.add('sobreposicao-aberta');
    document.addEventListener('keydown', aoTeclar);
    const focoAnterior = document.activeElement;
    const quadro = requestAnimationFrame(() => fecharRef.current?.focus());
    return () => { ativo = false; cancelAnimationFrame(quadro); document.body.classList.remove('sobreposicao-aberta'); document.removeEventListener('keydown', aoTeclar); requestAnimationFrame(() => focoAnterior?.isConnected && focoAnterior.focus()); };
  }, [clienteId]);

  if (!clienteId) return null;
  const cliente = dados?.cliente;
  const resumo = dados?.resumo || {};
  const ultimasCompras = dados?.ultimasCompras || [];
  const mensagensEmHaver = dados?.mensagensEmHaver || [];
  const valorPendente = Number(resumo.valor_pendente || 0);

  return createPortal(
    <div className="drawer-cliente-overlay" onMouseDown={onFechar} role="presentation">
      <aside ref={drawerRef} className="drawer-cliente" role="dialog" aria-modal="true" aria-label="Resumo do cliente" onMouseDown={(e) => e.stopPropagation()}>
        <button ref={fecharRef} type="button" className="drawer-cliente-fechar" onClick={onFechar} aria-label="Fechar painel">×</button>
        {!dados && !erro && <DrawerSkeleton />}
        {erro && <div className="drawer-cliente-erro"><strong>Não foi possível abrir o cliente</strong><span>{erro}</span><button className="btn secundario" onClick={onFechar}>Fechar</button></div>}
        {cliente && (
          <>
            <header className="drawer-cliente-header">
              <div className="drawer-cliente-avatar">{cliente.nome?.slice(0, 1).toUpperCase() || 'C'}</div>
              <div><span className="drawer-kicker">Visão rápida</span><h2>{cliente.nome}</h2><p>Cliente desde {cliente.criado_em ? new Date(cliente.criado_em).toLocaleDateString('pt-BR') : '—'}</p></div>
            </header>
            <div className="drawer-cliente-acoes">
              <button className="btn" onClick={() => onNavegar(`/fonada/novo?clienteId=${cliente.id}`)}>+ Fonada</button>
              <button className="btn secundario" onClick={() => onNavegar(`/ao-vivo/novo?clienteId=${cliente.id}`)}>+ Ao vivo</button>
              <button className="btn secundario" onClick={() => onNavegar(`/clientes/${cliente.id}`)}>Ficha completa</button>
            </div>
            <section className="drawer-resumo-grid">
              <div><span>Pedidos</span><strong>{resumo.total_pedidos || 0}</strong><small>{resumo.total_fonada || 0} fonada · {resumo.total_aovivo || 0} ao vivo</small></div>
              <div className={valorPendente > 0 ? 'alerta' : ''}><span>Pendente</span><strong>{formatarReais(valorPendente)}</strong><small>{valorPendente > 0 ? 'Requer atenção' : 'Tudo em dia'}</small></div>
            </section>
            <section className="drawer-bloco">
              <div className="drawer-bloco-titulo">Contato</div>
              <div className="drawer-info"><span>WhatsApp</span><strong>{valorUtil(cliente.whatsapp) || 'Não informado'}</strong></div>
              <div className="drawer-info"><span>Celular</span><strong>{valorUtil(cliente.celular) || 'Não informado'}</strong></div>
              <div className="drawer-info"><span>Telefone fixo</span><strong>{valorUtil(cliente.fixo) || 'Não informado'}</strong></div>
            </section>
            <section className="drawer-bloco">
              <div className="drawer-bloco-titulo">Localização</div>
              <p className="drawer-endereco">{[valorUtil(cliente.endereco), valorUtil(cliente.complemento), valorUtil(cliente.bairro)].filter(Boolean).join(' · ') || 'Endereço não informado'}</p>
              {valorUtil(cliente.referencia) && <small>Referência: {cliente.referencia}</small>}
            </section>
            <section className="drawer-bloco drawer-atividade">
              <div className="drawer-bloco-titulo drawer-titulo-com-contagem">Mensagens em haver <span>{mensagensEmHaver.length}</span></div>
              {mensagensEmHaver.slice(0, 4).map((mensagem) => (
                <button type="button" key={mensagem.id} onClick={() => onNavegar(mensagem.rota)}>
                  <span className="atividade-ponto haver"/>
                  <span><strong>Fonada · O.S. {mensagem.os || mensagem.id}</strong><small>Compra: {mensagem.dataCompra || 'não informada'} · válida até {mensagem.dataExpiracao}</small>{(mensagem.tema || mensagem.destinatario) && <small>{[mensagem.tema, mensagem.destinatario].filter(Boolean).join(' · ')}</small>}</span>
                  <b>›</b>
                </button>
              ))}
              {mensagensEmHaver.length === 0 && <div className="drawer-sem-atividade">Nenhuma mensagem em haver.</div>}
              {mensagensEmHaver.length > 4 && <small className="drawer-mais-itens">Mais {mensagensEmHaver.length - 4} disponível(is) na ficha completa.</small>}
            </section>
            <section className="drawer-bloco drawer-atividade">
              <div className="drawer-bloco-titulo">Últimas compras</div>
              {ultimasCompras.map((pedido) => (
                <button type="button" key={`${pedido.tipo}-${pedido.id}`} onClick={() => onNavegar(pedido.rota)}><span className="atividade-ponto"/><span><strong>{pedido.tipo} · O.S. {pedido.os || pedido.id}</strong><small>{pedido.data_pedido || 'Data não informada'} · {formatarReais(pedido.valor)}</small></span><b>›</b></button>
              ))}
              {ultimasCompras.length === 0 && <div className="drawer-sem-atividade">Nenhum pedido registrado ainda.</div>}
            </section>
          </>
        )}
      </aside>
    </div>,
    document.body
  );
}

function DrawerSkeleton() {
  return <div className="drawer-skeleton" aria-label="Carregando cliente"><div className="skeleton-avatar"/><div className="skeleton-linha larga"/><div className="skeleton-linha curta"/><div className="skeleton-cards"><i/><i/></div><div className="skeleton-bloco"/><div className="skeleton-bloco"/></div>;
}
