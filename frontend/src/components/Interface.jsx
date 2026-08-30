import React from 'react';

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
      <button className="btn secundario" disabled={pagina <= 1} onClick={onAnterior}>← <span>Anterior</span></button>
      <div className="paginacao-interface-status">
        <strong>{pagina}</strong><span>de {totalPaginas}</span><small>{total} {rotulo}</small>
      </div>
      <button className="btn secundario" disabled={pagina >= totalPaginas} onClick={onProxima}><span>Próxima</span> →</button>
    </nav>
  );
}
