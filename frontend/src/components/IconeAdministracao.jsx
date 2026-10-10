import React from 'react';
export default function IconeAdministracao({tipo,...props}) {
  const caminhos={
    ajustes:<><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></>,
    simulador:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h2M14 18h2"/></>,
    sistema:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h4M7 12h8"/></>,
    pasta:<path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>,
    restaurar:<><path d="M3 10a9 9 0 1 1 2 9M3 4v6h6M12 7v5l3 2"/></>,
    pedido:<><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6M9 16h4"/></>,
    busca:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    excluir:<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
    salvo:<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    cliente:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    contato:<><path d="M4 4h16v12H8l-4 4zM8 8h8M8 12h5"/></>,
    endereco:<><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  };
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{caminhos[tipo]}</svg>;
}
