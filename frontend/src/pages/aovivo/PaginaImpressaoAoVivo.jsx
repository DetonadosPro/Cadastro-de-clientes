import React from 'react';
import ImpressaoAoVivo from './ImpressaoAoVivo.jsx';

export default function PaginaImpressaoAoVivo({ pedidos }) {
  return (
    <div className="folhas-aovivo">
      {pedidos.map((pedido) => (
        <div className="folha-a4 folha-a4-aovivo" key={pedido.id}>
          <ImpressaoAoVivo pedido={pedido} />
        </div>
      ))}
    </div>
  );
}
