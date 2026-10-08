import React from 'react';
import { NavLink } from 'react-router-dom';

export default function NavegacaoFonada({ children }) {
  return <div className="fonada-navegacao">
    <nav className="fonada-abas" aria-label="Visualizações de Fonada">
      <NavLink to="/fonada" end>Todos os pedidos</NavLink>
      <NavLink to="/fonada/hoje">Vendas de hoje</NavLink>
    </nav>
    <span className="fonada-navegacao-meta">{children}</span>
  </div>;
}
