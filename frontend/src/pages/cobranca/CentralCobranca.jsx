import React, { useState } from 'react';
import ListaCobranca from './ListaCobranca.jsx';
import CobrancaAoVivo from './CobrancaAoVivo.jsx';

export default function CentralCobranca() {
  const [sistema, setSistema] = useState('FONADA');

  return (
    <div>
      <div className="abas-cliente cobranca-abas-sistema nao-imprimir">
        <button type="button" className={`aba-cliente-botao ${sistema === 'FONADA' ? 'ativa' : ''}`} onClick={() => setSistema('FONADA')}>Fonada</button>
        <button type="button" className={`aba-cliente-botao ${sistema === 'AOVIVO' ? 'ativa' : ''}`} onClick={() => setSistema('AOVIVO')}>Ao Vivo</button>
      </div>
      {sistema === 'FONADA' ? <ListaCobranca /> : <CobrancaAoVivo />}
    </div>
  );
}
