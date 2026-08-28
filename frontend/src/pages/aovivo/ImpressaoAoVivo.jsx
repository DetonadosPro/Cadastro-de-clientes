import React, { useRef, useEffect, useState } from 'react';

function formatarReais(v) {
  if (v == null || String(v).trim() === '') return '—';
  const texto = String(v).trim();
  const numero = typeof v === 'number'
    ? v
    : (texto.includes(',') ? Number(texto.replace(/\./g, '').replace(',', '.')) : Number(texto));
  return Number.isFinite(numero)
    ? numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

function juntarTemaEMensagem(tema, mensagem) {
  return [tema, mensagem].filter((t) => t && String(t).trim()).join(' ');
}

function pagamentoConfirmado(valor) {
  if (valor === true || valor === 1) return true;
  return ['SIM', 'S', '1', 'TRUE', 'PAGO', 'PAGA', 'RECEBIDO', 'RECEBIDA']
    .includes(String(valor || '').trim().toUpperCase());
}

function obterPagamento(pedido) {
  const campos = [pedido.pagou, pedido.pago, pedido.status_pagamento, pedido.statusPagamento];
  const informado = campos.find((valor) => (
    valor !== null && valor !== undefined && String(valor).trim() !== ''
  ));
  return pagamentoConfirmado(informado);
}

function TextoMultilinha({ texto, tamanhoMaximo, tamanhoMinimo, maxLinhas, className }) {
  const referenciaTexto = useRef(null);
  const [tamanhoFonte, setTamanhoFonte] = useState(tamanhoMaximo);

  useEffect(() => {
    const elemento = referenciaTexto.current;
    if (!elemento || !elemento.parentElement) return;
    let tamanho = tamanhoMaximo;
    elemento.style.fontSize = `${tamanho}px`;
    while (elemento.scrollHeight > elemento.parentElement.clientHeight && tamanho > tamanhoMinimo) {
      tamanho -= 1;
      elemento.style.fontSize = `${tamanho}px`;
    }
    setTamanhoFonte(tamanho);
  }, [texto, tamanhoMaximo, tamanhoMinimo]);

  return (
    <span
      ref={referenciaTexto}
      className={className}
      style={{
        fontSize: tamanhoFonte,
        whiteSpace: 'normal',
        display: '-webkit-box',
        WebkitLineClamp: maxLinhas,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      {texto}
    </span>
  );
}

export default function ImpressaoAoVivo({ pedido }) {
  const pago = obterPagamento(pedido);
  const formaPagamento = pedido.forma_recebimento || pedido.formaRecebimento || pedido.pagamento || '—';
  const dataPagamento = pedido.data_pagou || pedido.dataPagamento || '—';
  const valorRecebido = pedido.valor_recebido ?? pedido.valorRecebido ?? pedido.valor;
  const mensagem2 = juntarTemaEMensagem(pedido.tema2, pedido.msg2);

  return (
    <div className="impresso-aovivo">
      <div className="impresso-cabecalho">
        <div className="impresso-os-header impresso-os-header-fantasma" aria-hidden="true">
          O.S.: {pedido.numero_os || pedido.id}
        </div>
        <div className="impresso-secao-titulo" style={{ margin: 0 }}>HOMENAGEADO</div>
        <div className="impresso-os-header">O.S.: {pedido.numero_os || pedido.id}</div>
      </div>

      <div className="impresso-linha">
        <Campo label="Evento:" valor={pedido.dia_entrega} largura={26} />
        <Campo label="Horário:" valor={pedido.horario_entrega} largura={24} />
        <Campo label="Brinde:" valor={pedido.brinde} grow={1} />
      </div>
      <div className="impresso-linha"><Campo label="Para:" valor={pedido.para} grow={1} /></div>
      <div className="impresso-linha"><Campo label="Endereço:" valor={pedido.endereco} grow={1} /></div>
      <div className="impresso-linha">
        <Campo label="Bairro:" valor={pedido.bairro} grow={0.75} />
        <Campo label="Referência:" valor={pedido.referencia} grow={1.75} />
      </div>

      <div className="impresso-divisor-secao"><span>MENSAGENS</span></div>
      <div className="impresso-linha"><Campo label="Mensagem 1:" valor={juntarTemaEMensagem(pedido.tema1, pedido.msg1)} largura={40} classe="impresso-campo-mensagem" /></div>
      {mensagem2 && (
        <div className="impresso-linha"><Campo label="Mensagem 2:" valor={mensagem2} largura={40} classe="impresso-campo-mensagem" /></div>
      )}
      <div className="impresso-linha"><Campo label="Música 1:" valor={pedido.musicas[0]} largura={70} /></div>
      <div className="impresso-linha"><Campo label="Música 2:" valor={pedido.musicas[1]} largura={70} /></div>
      <div className="impresso-linha"><Campo label="Música 3:" valor={pedido.musicas[2]} largura={70} /></div>
      <div className="impresso-linha"><Campo label="Música 4:" valor={pedido.musicas[3]} largura={70} /></div>

      <div className="impresso-rotulo impresso-rotulo-oferecimento">Oferecimento:</div>
      <div className="impresso-caixa-dedicatoria">
        <TextoMultilinha
          texto={pedido.oferecimento || ''}
          tamanhoMaximo={14}
          tamanhoMinimo={8}
          maxLinhas={3}
          className="impresso-caixa-dedicatoria-texto"
        />
      </div>

      <div className="impresso-divisor-secao"><span>DADOS SOLICITANTE</span></div>
      <div className="impresso-linha">
        <Campo label="Cliente:" valor={pedido.nomeComprador} grow={1.6} />
        <Campo label="Telefone:" valor={pedido.telefoneComprador} grow={1} />
      </div>
      <div className="impresso-linha">
        <Campo label="Endereço:" valor={pedido.enderecoCobranca} grow={1.5} />
        <Campo label="Bairro:" valor={pedido.bairroCobranca} grow={1} />
      </div>

      <div className={`impresso-resumo-financeiro ${pago ? 'pago' : 'pendente'}`}>
        <div className="impresso-resumo-status">
          <span className="impresso-resumo-label">Pagamento</span>
          <span className="impresso-pagamento-badge">{pago ? 'PAGO' : 'PENDENTE'}</span>
          <small>Emissão: {pedido.data_pedido || '—'}</small>
        </div>
        <div className="impresso-resumo-dado">
          <span>{pago ? 'Pago em' : 'Data do pagamento'}</span>
          <strong>{pago ? dataPagamento : '—'}</strong>
        </div>
        <div className="impresso-resumo-dado">
          <span>{pago ? 'Forma recebida' : 'Forma prevista'}</span>
          <strong>{formaPagamento}</strong>
        </div>
        <div className="impresso-resumo-valor">
          <span>{pago ? 'Valor recebido' : 'Valor a receber'}</span>
          <strong>{formatarReais(pago ? valorRecebido : pedido.valor)}</strong>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, valor, grow, largura, classe = '' }) {
  const estiloFlex = largura
    ? { flex: `0 0 ${largura}%`, maxWidth: `${largura}%` }
    : { flexGrow: grow, flexBasis: 0 };
  return (
    <div className={`impresso-campo-grupo ${classe}`} style={estiloFlex}>
      <span className="impresso-rotulo">{label}</span>
      <span className="impresso-campo">{valor || ''}</span>
    </div>
  );
}
