import React, { useRef, useEffect, useState } from 'react';

function formatarReais(v) {
  if (v == null) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Texto que reduz o próprio tamanho de fonte até caber inteiro numa
// única linha, dentro da largura disponível — evita quebra de linha
// mesmo quando ainda há espaço vertical de sobra na página.
function TextoNumaLinha({ texto, tamanhoMaximo, tamanhoMinimo, className }) {
  const referenciaTexto = useRef(null);
  const [tamanhoFonte, setTamanhoFonte] = useState(tamanhoMaximo);

  useEffect(() => {
    const elemento = referenciaTexto.current;
    if (!elemento) return;

    let tamanho = tamanhoMaximo;
    elemento.style.fontSize = `${tamanho}px`;

    // Reduz 1px por vez até o texto caber na largura do contêiner pai,
    // ou até atingir o tamanho mínimo permitido.
    while (elemento.scrollWidth > elemento.parentElement.clientWidth && tamanho > tamanhoMinimo) {
      tamanho -= 1;
      elemento.style.fontSize = `${tamanho}px`;
    }
    setTamanhoFonte(tamanho);
  }, [texto, tamanhoMaximo, tamanhoMinimo]);

  return (
    <span ref={referenciaTexto} className={className} style={{ fontSize: tamanhoFonte, whiteSpace: 'nowrap' }}>
      {texto}
    </span>
  );
}

export default function ImpressaoAoVivo({ pedido }) {
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
        <Campo label="Evento:" valor={pedido.dia_entrega} grow={1} />
        <Campo label="Horário:" valor={pedido.horario_entrega} grow={1} />
        <Campo label="Brinde:" valor={pedido.brinde} grow={1.4} />
      </div>

      <div className="impresso-linha">
        <Campo label="Para:" valor={pedido.para} grow={1} />
      </div>

      <div className="impresso-linha">
        <Campo label="Endereço:" valor={pedido.endereco} grow={1} />
      </div>

      <div className="impresso-linha">
        <Campo label="Bairro:" valor={pedido.bairro} grow={1.5} />
        <Campo label="Referência:" valor={pedido.referencia} grow={1} />
      </div>

      <div className="impresso-linha">
        <Campo label="Tel. fixo:" valor={pedido.fixoLocal} grow={1} />
        <Campo label="Celular:" valor={pedido.celularLocal} grow={1} />
      </div>

      <div className="impresso-secao-titulo">MENSAGENS</div>

      <div className="impresso-linha">
        <Campo label="Tema 1:" valor={pedido.tema1} grow={1} />
        <Campo label="Msg 1:" valor={pedido.msg1} grow={1} />
      </div>
      <div className="impresso-linha">
        <Campo label="Tema 2:" valor={pedido.tema2} grow={1} />
        <Campo label="Msg 2:" valor={pedido.msg2} grow={1} />
      </div>
      <div className="impresso-linha">
        <Campo label="Tema 3:" valor={pedido.tema3} grow={1} />
        <Campo label="Msg 3:" valor={pedido.msg3} grow={1} />
      </div>
      <div className="impresso-linha">
        <Campo label="Tema 4:" valor={pedido.tema4} grow={1} />
        <Campo label="Msg 4:" valor={pedido.msg4} grow={1} />
      </div>

      <div className="impresso-linha">
        <Campo label="M1:" valor={pedido.musicas[0]} grow={1} />
        <Campo label="M2:" valor={pedido.musicas[1]} grow={1} />
        <Campo label="M3:" valor={pedido.musicas[2]} grow={1} />
      </div>
      <div className="impresso-linha">
        <Campo label="M4:" valor={pedido.musicas[3]} grow={1} />
        <Campo label="M5:" valor={pedido.musicas[4]} grow={1} />
        <Campo label="M6:" valor={pedido.musicas[5]} grow={1} />
      </div>

      <div className="impresso-rotulo impresso-rotulo-oferecimento">Oferecimento:</div>
      <div className="impresso-caixa-dedicatoria">
        <TextoNumaLinha
          texto={pedido.oferecimento || ''}
          tamanhoMaximo={16}
          tamanhoMinimo={9}
          className="impresso-caixa-dedicatoria-texto"
        />
      </div>

      <div className="impresso-secao-titulo">DADOS SOLICITANTE</div>

      <div className="impresso-linha">
        <Campo label="Cliente:" valor={pedido.nomeComprador} grow={1.6} />
        <Campo label="Telefone:" valor={pedido.telefoneComprador} grow={1} />
      </div>
      <div className="impresso-linha">
        <Campo label="Endereço:" valor={pedido.enderecoCobranca} grow={1.5} />
        <Campo label="Bairro:" valor={pedido.bairroCobranca} grow={1} />
      </div>

      <div className="impresso-valor-destaque">
        <div>
          <span className="impresso-valor-destaque-label">Valor a receber</span>
          <div className="impresso-valor-destaque-emissao">Emissão: {pedido.data_pedido || '—'}</div>
        </div>
        <span className="impresso-valor-destaque-numero">
          {formatarReais(pedido.valor)}{pedido.pagamento ? ` — ${pedido.pagamento}` : ''}
        </span>
      </div>
    </div>
  );
}

function Campo({ label, valor, grow, destaque }) {
  return (
    <div className="impresso-campo-grupo" style={{ flexGrow: grow, flexBasis: 0 }}>
      <span className={`impresso-rotulo ${destaque ? 'impresso-rotulo-destaque' : ''}`}>{label}</span>
      <span className="impresso-campo">{valor || ''}</span>
    </div>
  );
}
