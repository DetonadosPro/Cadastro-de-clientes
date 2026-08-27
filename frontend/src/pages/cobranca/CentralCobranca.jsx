import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ListaCobranca from './ListaCobranca.jsx';
import CobrancaAoVivo from './CobrancaAoVivo.jsx';

export default function CentralCobranca() {
  const [params, setParams] = useSearchParams();
  const sistema = params.get('sistema') === 'AOVIVO' ? 'AOVIVO' : 'FONADA';
  function mudarSistema(novoSistema) {
    setParams((atuais) => { const novos = new URLSearchParams(atuais); novos.set('sistema', novoSistema); return novos; }, { replace: true });
  }

  return (
    <div>
      <div className="abas-cliente cobranca-abas-sistema nao-imprimir">
        <button type="button" className={`aba-cliente-botao ${sistema === 'FONADA' ? 'ativa' : ''}`} onClick={() => mudarSistema('FONADA')}>Fonada</button>
        <button type="button" className={`aba-cliente-botao ${sistema === 'AOVIVO' ? 'ativa' : ''}`} onClick={() => mudarSistema('AOVIVO')}>Ao Vivo</button>
      </div>
      {sistema === 'FONADA' ? <ListaCobranca /> : <CobrancaAoVivo />}
    </div>
  );
}
