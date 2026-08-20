import React, { useEffect, useRef, useState } from 'react';

// Campo de texto livre com sugestões clicáveis, no mesmo espírito do
// <datalist> nativo do HTML, mas desenhado com a identidade visual do
// sistema (o <datalist> não pode ser estilizado via CSS — o navegador
// sempre desenha a lista do jeito dele). Digitar continua funcionando
// normalmente; as sugestões são só um atalho para preencher rápido.
export default function CampoComSugestoes({ value, onChange, sugestoes, placeholder, style, disabled, className, ...resto }) {
  const [aberto, setAberto] = useState(false);
  const raizRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e) {
      if (raizRef.current && !raizRef.current.contains(e.target)) setAberto(false);
    }
    function aoTeclarEsc(e) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclarEsc);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclarEsc);
    };
  }, [aberto]);

  function escolherSugestao(texto) {
    onChange(texto);
    setAberto(false);
  }

  return (
    <div ref={raizRef} className={`campo-sugestoes-raiz ${className || ''}`} style={style}>
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setAberto(true)}
        disabled={disabled}
        autoComplete="off"
        {...resto}
      />
      {aberto && sugestoes.length > 0 && (
        <div className="sugestoes-popover">
          {sugestoes.map((s) => (
            <button
              type="button"
              key={s}
              className="sugestoes-item"
              onMouseDown={(e) => { e.preventDefault(); escolherSugestao(s); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
