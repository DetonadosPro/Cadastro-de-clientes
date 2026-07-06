import React from 'react';
import Recibo from './Recibo.jsx';

// Agrupa os pedidos em folhas de 3, empilhados verticalmente (como um
// talão), com quebra de página a cada folha — para impressão em A4 retrato.
export default function PaginaImpressaoRecibos({ pedidos }) {
  const folhas = [];
  for (let i = 0; i < pedidos.length; i += 3) {
    folhas.push(pedidos.slice(i, i + 3));
  }

  return (
    <div className="folhas-recibo">
      {folhas.map((folha, indiceFolha) => (
        <div className="folha-a4" key={indiceFolha}>
          {folha.map((pedido, indiceRecibo) => (
            <React.Fragment key={pedido.id}>
              <Recibo pedido={pedido} />
              {indiceRecibo < folha.length - 1 && <div className="linha-corte" />}
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
