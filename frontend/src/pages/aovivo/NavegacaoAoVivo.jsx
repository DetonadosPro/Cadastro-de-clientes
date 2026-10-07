import React from 'react';
import { NavLink } from 'react-router-dom';

export default function NavegacaoAoVivo({ meta, acoes }) {
  return <div className="aovivo-navegacao nao-imprimir">
    <nav className="aovivo-abas" aria-label="Visualizações de Ao Vivo">
      <NavLink to="/ao-vivo" end>Todos os pedidos</NavLink>
      <NavLink to="/ao-vivo/hoje">Eventos de hoje</NavLink>
    </nav>
    <div className="aovivo-navegacao-acoes"><span className="aovivo-navegacao-meta">{meta}</span>{acoes}</div>
  </div>;
}
