import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ListaCobranca from './ListaCobranca.jsx';
import CobrancaAoVivo from './CobrancaAoVivo.jsx';
import { CabecalhoPagina } from '../../components/Interface.jsx';

export default function CentralCobranca() {
  const [params, setParams] = useSearchParams();
  const sistema = params.get('sistema') === 'AOVIVO' ? 'AOVIVO' : 'FONADA';
  function mudarSistema(novoSistema) {
    setParams((atuais) => { const novos = new URLSearchParams(atuais); novos.set('sistema', novoSistema); return novos; }, { replace: true });
  }

  return (
    <div className="central-cobranca">
      <CabecalhoPagina contexto="Financeiro" titulo="Cobrança" descricao="Priorize recebimentos, organize a rota e registre pagamentos sem perder o contexto do pedido." />
      <div className="central-cobranca-navegacao nao-imprimir">
        <span>Tipo de pedido</span>
        <div className="abas-cliente cobranca-abas-sistema">
        <button type="button" className={`aba-cliente-botao ${sistema === 'FONADA' ? 'ativa' : ''}`} onClick={() => mudarSistema('FONADA')}>Fonada</button>
        <button type="button" className={`aba-cliente-botao ${sistema === 'AOVIVO' ? 'ativa' : ''}`} onClick={() => mudarSistema('AOVIVO')}>Ao Vivo</button>
        </div>
      </div>
      <div key={sistema} className="central-cobranca-conteudo">
        {sistema === 'FONADA' ? <ListaCobranca mostrarCabecalho={false} /> : <CobrancaAoVivo mostrarCabecalho={false} />}
      </div>
    </div>
  );
}
