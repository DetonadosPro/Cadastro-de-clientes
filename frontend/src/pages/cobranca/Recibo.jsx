import React from 'react';

// Réplica do layout da aba "recibo" da planilha original, mas usando
// linhas flexbox (rótulo colado na caixa) em vez de posições fixas de
// grade — assim o rótulo azul sempre fica junto da caixa, sem distância,
// e a fonte pode crescer sem descolar nada.
//
// "Recebemos de" é o nome do COMPRADOR (não do cobrador). "Fixo" e
// "Celular" são do comprador também. "Transm." é sempre p1_dia (a
// primeira mensagem do pacote, fixo).

function formatarReais(v) {
  if (v == null) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Recibo({ pedido }) {
  return (
    <div className="recibo">
      <div className="recibo-corpo">
        <div className="recibo-cabecalho">
          <div className="recibo-titulo">RECIBO</div>
          <div className="recibo-nome-empresa">Pombo-Correio</div>
          <div className="recibo-telefone-empresa">3312-0015</div>
        </div>

        <div className="recibo-linha">
          <div className="recibo-campo-grupo recibo-campo-valor">
            <span className="recibo-rotulo recibo-rotulo-valor">Valor R$:</span>
            <span className="recibo-campo">{formatarReais(pedido.valor)}</span>
          </div>
        </div>

        <div className="recibo-linha">
          <Campo label="Transm.:" valor={pedido.transmissao} grow={1} />
          <Campo label="Fixo:" valor={pedido.fixo} grow={1} />
          <Campo label="Celular:" valor={pedido.celular} grow={1} />
        </div>

        <div className="recibo-linha">
          <Campo label="Recebemos de:" valor={pedido.nome} grow={2.2} />
          <Campo label="Whats:" valor={pedido.whatsapp} grow={1} />
        </div>

        <div className="recibo-linha">
          <Campo
            label="Endereço:"
            valor={pedido.complemento ? `${pedido.endereco || ''} - ${pedido.complemento}` : pedido.endereco}
            grow={1}
          />
        </div>

        <div className="recibo-linha">
          <Campo label="Bairro:" valor={pedido.bairro} grow={1.6} />
          <Campo label="Ref.:" valor={pedido.referencia} grow={1} />
        </div>

        <div className="recibo-linha">
          <Campo label="Cobrança:" valor={pedido.cobranca} grow={0.8} />
          <Campo label="Forma:" valor={pedido.formaPagamento} grow={0.8} />
          <Campo label="Período:" valor={pedido.periodo} grow={1.4} />
        </div>
      </div>

      <div className="recibo-os">O.S.: {pedido.senha_os || pedido.id || ''}</div>
    </div>
  );
}

function Campo({ label, valor, destaque, grow }) {
  return (
    <div className="recibo-campo-grupo" style={{ flexGrow: grow, flexBasis: 0 }}>
      <span className={`recibo-rotulo ${destaque ? 'recibo-rotulo-valor' : ''}`}>{label}</span>
      <span className="recibo-campo">{valor || ''}</span>
    </div>
  );
}
