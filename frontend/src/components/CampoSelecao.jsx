import React, { useEffect, useRef, useState } from 'react';

// Campo somente-clicável com um drawer de opções — mesmo visual do
// CampoComSugestoes, mas sem digitação livre: a pessoa só pode
// escolher uma das opções da lista, nunca digitar outra coisa. Usado
// quando as opções são um conjunto fixo e fechado (ex: forma de
// pagamento), diferente de um campo como "Brinde" que aceita texto
// livre além das sugestões.
export default function CampoSelecao({ value, onChange, opcoes, placeholder, style, disabled, className }) {
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

  function escolher(opcao) {
    onChange(opcao);
    setAberto(false);
  }

  return (
    <div ref={raizRef} className={`campo-sugestoes-raiz ${className || ''}`} style={style}>
      <input
        placeholder={placeholder}
        value={value}
        readOnly
        onClick={() => !disabled && setAberto((v) => !v)}
        disabled={disabled}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      {aberto && opcoes.length > 0 && (
        <div className="sugestoes-popover">
          {opcoes.map((o) => (
            <button
              type="button"
              key={o}
              className={`sugestoes-item ${value === o ? 'selecionado' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); escolher(o); }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
