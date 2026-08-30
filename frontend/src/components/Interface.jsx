import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export function Botao({
  variante = 'primaria', tamanho = 'medio', carregando = false, icone, children,
  className = '', disabled, type = 'button', ...props
}) {
  return (
    <button
      type={type}
      className={`botao botao-${variante} botao-${tamanho} ${className}`.trim()}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...props}
    >
      {carregando ? <span className="botao-spinner" aria-hidden="true" /> : icone}
      <span>{carregando ? 'Processando…' : children}</span>
    </button>
  );
}

export function BotaoIcone({ rotulo, children, className = '', ...props }) {
  return (
    <button type="button" className={`botao-icone ${className}`.trim()} aria-label={rotulo} title={rotulo} {...props}>
      {children}
    </button>
  );
}

export function Dialogo({ titulo, descricao, onClose, children, className = '' }) {
  const tituloId = useId();
  const descricaoId = useId();
  const painelRef = useRef(null);
  const fecharRef = useRef(onClose);
  fecharRef.current = onClose;

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        fecharRef.current?.();
        return;
      }
      if (evento.key !== 'Tab') return;
      const focaveis = Array.from(painelRef.current?.querySelectorAll(
        'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
      ) || []).filter((elemento) => !elemento.disabled && elemento.getClientRects().length > 0);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
      if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
    }
    document.body.classList.add('sobreposicao-aberta');
    document.addEventListener('keydown', aoTeclar);
    const focoAnterior = document.activeElement;
    requestAnimationFrame(() => painelRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.classList.remove('sobreposicao-aberta');
      focoAnterior?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="modal-fundo dialogo-fundo nao-imprimir" onMouseDown={onClose}>
      <section
        ref={painelRef}
        className={`modal-caixa dialogo-caixa ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descricaoId : undefined}
        tabIndex={-1}
        onMouseDown={(evento) => evento.stopPropagation()}
      >
        <header className="dialogo-cabecalho">
          <div><h2 id={tituloId}>{titulo}</h2>{descricao && <p id={descricaoId}>{descricao}</p>}</div>
          <BotaoIcone rotulo="Fechar" onClick={onClose}>×</BotaoIcone>
        </header>
        <div className="dialogo-conteudo">{children}</div>
      </section>
    </div>,
    document.body
  );
}

export function CabecalhoPagina({ contexto, titulo, descricao, acoes, meta, className = '' }) {
  return (
    <header className={`cabecalho-pagina ${className}`.trim()}>
      <div className="cabecalho-pagina-conteudo">
        {contexto && <span className="cabecalho-pagina-contexto">{contexto}</span>}
        <div className="cabecalho-pagina-titulo-linha">
          <h1>{titulo}</h1>
          {meta && <div className="cabecalho-pagina-meta">{meta}</div>}
        </div>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="cabecalho-pagina-acoes">{acoes}</div>}
    </header>
  );
}
export function AvisoInline({ tom = 'erro', titulo, children, acao, className = '' }) {
  const simbolos = { erro: '!', aviso: '!', sucesso: '✓', info: 'i' };
  return (
    <div className={`aviso-inline ${tom} ${className}`.trim()} role={tom === 'erro' ? 'alert' : 'status'}>
      <span className="aviso-inline-icone" aria-hidden="true">{simbolos[tom] || 'i'}</span>
      <div className="aviso-inline-conteudo">
        {titulo && <strong>{titulo}</strong>}
        {children && <span>{children}</span>}
      </div>
      {acao && <div className="aviso-inline-acao">{acao}</div>}
    </div>
  );
}

export function EstadoVazio({ icone = '⌕', titulo, descricao, acao, className = '' }) {
  return (
    <div className={`estado-vazio estado-vazio-v2 painel ${className}`.trim()}>
      <div className="estado-vazio-icone" aria-hidden="true">{icone}</div>
      <h3>{titulo}</h3>
      {descricao && <p>{descricao}</p>}
      {acao && <div className="estado-vazio-acao">{acao}</div>}
    </div>
  );
}

export function EstadoCarregando({ rotulo = 'Carregando informações…', linhas = 5, className = '' }) {
  return (
    <div className={`estado-carregando painel ${className}`.trim()} role="status" aria-live="polite">
      <div className="estado-carregando-topo"><span className="spinner-interface" aria-hidden="true" />{rotulo}</div>
      <div className="estado-carregando-linhas" aria-hidden="true">
        {Array.from({ length: linhas }, (_, indice) => <i key={indice} />)}
      </div>
    </div>
  );
}

export function Paginacao({ pagina, totalPaginas, total, rotulo = 'itens', onAnterior, onProxima, className = '' }) {
  return (
    <nav className={`paginacao-interface ${className}`.trim()} aria-label="Paginação">
      <Botao variante="secundaria" disabled={pagina <= 1} onClick={onAnterior}>← Anterior</Botao>
      <div className="paginacao-interface-status">
        <strong>{pagina}</strong><span>de {totalPaginas}</span><small>{total} {rotulo}</small>
      </div>
      <Botao variante="secundaria" disabled={pagina >= totalPaginas} onClick={onProxima}>Próxima →</Botao>
    </nav>
  );
}
