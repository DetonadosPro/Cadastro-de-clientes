import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';
import { AvisoInline, CabecalhoPagina, EstadoCarregando, EstadoVazio } from '../../components/Interface.jsx';

export default function HojeAoVivo() {
  const [dataRef, setDataRef] = useState('');
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();
  const lista = useListaIncremental(itens, dataRef);

  useEffect(() => {
    api.aoVivo.hoje()
      .then((resp) => {
        setDataRef(resp.data);
        setItens(resp.pedidos);
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="operacao-dia-pagina">
      <CabecalhoPagina contexto="Operação diária" titulo="Ao vivo de hoje" descricao="Entregas organizadas por horário, destino e localização." meta={dataRef || null} />

      {erro && <AvisoInline tom="erro" titulo="Não foi possível montar a lista">{erro}</AvisoInline>}

      {carregando ? (
        <EstadoCarregando rotulo="Organizando as entregas de hoje…" linhas={6} />
      ) : itens.length === 0 ? (
        <EstadoVazio icone="✓" titulo="Nenhuma entrega marcada para hoje" descricao="A agenda de Ao Vivo está livre para esta data." />
      ) : (
        <div className="operacao-dia-lista">
          {lista.itensVisiveis.map((p) => {
            const musicas = [1, 2, 3, 4, 5, 6].map((n) => p[`musica_${n}`]).filter(Boolean);
            return (
              <button key={p.id} type="button" className="operacao-dia-item" onClick={() => navigate(`/ao-vivo/${p.id}`)}>
                <span className="operacao-dia-horario"><strong>{p.horario_entrega || '—'}</strong><small>Entrega</small></span>
                <span className="operacao-dia-corpo">
                  <span className="operacao-dia-topo"><span className="carimbo-os carimbo-os-lista">O.S. {p.numero_os || p.id}</span><strong>{p.comprador || 'Cliente não informado'}</strong></span>
                  <span className="operacao-dia-infos">
                    <InfoCompacto label="Para" valor={p.para} />
                    <InfoCompacto label="Local" valor={[p.endereco, p.bairro].filter(Boolean).join(' · ')} />
                    <InfoCompacto label="Referência" valor={p.referencia} />
                    <InfoCompacto label="Celular" valor={p.celular} />
                  </span>
                  {musicas.length > 0 && <span className="operacao-dia-musicas"><small>{musicas.length} música{musicas.length === 1 ? '' : 's'}</small><strong>{musicas.join(' · ')}</strong></span>}
                </span>
                <span className="operacao-dia-abrir" aria-hidden="true">›</span>
              </button>
            );
          })}
          <BotaoMostrarMais temMais={lista.temMais} restantes={lista.restantes} onClick={lista.mostrarMais} />
        </div>
      )}
    </div>
  );
}

function InfoCompacto({ label, valor }) {
  return (
    <span className="operacao-dia-info"><small>{label}</small><strong>{valor || '—'}</strong></span>
  );
}
