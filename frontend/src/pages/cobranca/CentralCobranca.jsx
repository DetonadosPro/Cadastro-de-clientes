import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ListaCobranca from './ListaCobranca.jsx';
import CobrancaAoVivo from './CobrancaAoVivo.jsx';
import { CabecalhoPagina } from '../../components/Interface.jsx';
import { IconeCobranca } from './InterfaceCobranca.jsx';
import './cobranca.css';

export default function CentralCobranca() {
  const [params, setParams] = useSearchParams();
  const sistema = params.get('sistema') === 'AOVIVO' ? 'AOVIVO' : 'FONADA';
  function mudarSistema(novoSistema) {
    setParams((atuais) => { const novos = new URLSearchParams(atuais); novos.set('sistema', novoSistema); return novos; }, { replace: true });
  }

  return (
    <div className="central-cobranca cobranca-moderna">
      <div className="nao-imprimir">
        <CabecalhoPagina contexto="Financeiro" titulo="Cobrança" descricao="Acompanhe os vencimentos e organize seus recebimentos." />
      </div>
      <div className="central-cobranca-navegacao nao-imprimir">
        <div className="abas-cliente cobranca-abas-sistema" role="group" aria-label="Modalidade da cobrança">
        <button type="button" className={`aba-cliente-botao ${sistema === 'FONADA' ? 'ativa' : ''}`} aria-pressed={sistema === 'FONADA'} onClick={() => mudarSistema('FONADA')}><IconeCobranca tipo="fonada" />Fonada</button>
        <button type="button" className={`aba-cliente-botao ${sistema === 'AOVIVO' ? 'ativa' : ''}`} aria-pressed={sistema === 'AOVIVO'} onClick={() => mudarSistema('AOVIVO')}><IconeCobranca tipo="aovivo" />Ao Vivo</button>
        </div>
        <span>Gestão de recebimentos</span>
      </div>
      <div key={sistema} className="central-cobranca-conteudo">
        {sistema === 'FONADA' ? <ListaCobranca mostrarCabecalho={false} /> : <CobrancaAoVivo mostrarCabecalho={false} />}
      </div>
    </div>
  );
}
