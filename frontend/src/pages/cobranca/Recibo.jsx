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
          <div className="recibo-telefone-empresa">
            <svg
              className="recibo-whatsapp-icone"
              viewBox="0 0 24 24"
              aria-label="WhatsApp"
              role="img"
            >
              <path d="M12 2a9.84 9.84 0 0 0-8.45 14.88L2 22l5.27-1.5A9.93 9.93 0 1 0 12 2Zm0 17.83a7.8 7.8 0 0 1-3.98-1.09l-.29-.17-3.13.89.92-3.04-.19-.31A7.76 7.76 0 1 1 12 19.83Zm4.27-5.82c-.23-.12-1.38-.68-1.59-.76-.22-.08-.37-.12-.53.12-.16.23-.61.76-.75.92-.14.16-.27.18-.51.06-.23-.12-.99-.36-1.88-1.16a7.07 7.07 0 0 1-1.3-1.61c-.14-.24-.01-.36.1-.48.1-.1.23-.27.35-.41.12-.13.15-.23.23-.39.08-.16.04-.29-.02-.41-.06-.12-.53-1.27-.72-1.74-.19-.46-.38-.39-.53-.4h-.45c-.16 0-.41.06-.63.29-.21.24-.82.8-.82 1.95s.84 2.26.96 2.42c.12.15 1.65 2.51 3.99 3.52.56.24.99.38 1.33.49.56.18 1.07.15 1.47.09.45-.07 1.38-.57 1.57-1.11.2-.55.2-1.02.14-1.11-.06-.1-.22-.16-.45-.28Z" />
            </svg>
            <span>3312-0015</span>
          </div>
        </div>

        <div className="recibo-linha">
          <div className="recibo-campo-grupo recibo-campo-valor">
            <span className="recibo-rotulo recibo-rotulo-valor">Valor R$:</span>
            <span className="recibo-campo">{formatarReais(pedido.valor)}</span>
          </div>
        </div>

        <div className="recibo-linha">
          <Campo label="Transm.:" valor={pedido.transmissao} larguraCampo="9ch" />
          <Campo label="Fixo:" valor={pedido.fixo} larguraCampo="14ch" />
          <Campo label="Celular:" valor={pedido.celular} larguraCampo="16ch" />
        </div>

        <div className="recibo-linha">
          <Campo label="Recebemos de:" valor={pedido.nome} grow={1.8} />
          <Campo label="Whats:" valor={pedido.whatsapp} larguraCampo="16ch" />
        </div>

        <div className="recibo-linha">
          <Campo
            label="Endereço:"
            valor={pedido.complemento ? `${pedido.endereco || ''} - ${pedido.complemento}` : pedido.endereco}
            grow={1}
          />
        </div>

        <div className="recibo-linha">
          <Campo label="Bairro:" valor={pedido.bairro} grow={0.96} />
          <Campo label="Ref.:" valor={pedido.referencia} grow={1.64} />
        </div>

        <div className="recibo-linha">
          <Campo label="Cobrança:" valor={pedido.cobranca} grow={0.8} />
          {pedido.cobrancaReagendada && <Campo label="Reagendada:" valor={pedido.cobrancaReagendada} grow={0.8} />}
          <Campo label="Forma:" valor={pedido.formaPagamento} grow={0.8} />
          <Campo label="Período:" valor={pedido.periodo} grow={1.4} />
        </div>

        <div className="recibo-os">O.S.: {pedido.senha_os || pedido.id || ''}</div>
      </div>
    </div>
  );
}

function Campo({ label, valor, destaque, grow, larguraCampo }) {
  return (
    <div
      className="recibo-campo-grupo"
      style={larguraCampo ? { flex: '0 0 auto' } : { flexGrow: grow, flexBasis: 0 }}
    >
      <span className={`recibo-rotulo ${destaque ? 'recibo-rotulo-valor' : ''}`}>{label}</span>
      <span className="recibo-campo" style={larguraCampo ? { flex: '0 0 auto', width: larguraCampo } : undefined}>
        {valor || ''}
      </span>
    </div>
  );
}
