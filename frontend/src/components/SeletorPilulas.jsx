import React from 'react';

// Um grupo de opções clicáveis (pílulas) — usado no lugar de um
// <select> ou campo de texto livre quando as opções são poucas e
// fixas, e a pessoa deve escolher exatamente uma. Mais rápido de usar
// que abrir um dropdown: todas as opções já estão visíveis, um clique
// escolhe.
export default function SeletorPilulas({ opcoes, valor, onChange, disabled }) {
  return (
    <div className="seletor-pilulas" role="group" aria-label="Escolha uma opção">
      {opcoes.map((opcao) => (
        <button
          key={opcao}
          type="button"
          className={`pilula ${valor === opcao ? 'ativa' : ''}`}
          onClick={() => onChange(opcao)}
          disabled={disabled}
          aria-pressed={valor === opcao}
        >
          {opcao}
        </button>
      ))}
    </div>
  );
}
