import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';
import { AvisoInline, CabecalhoPagina, EstadoCarregando, EstadoVazio } from '../../components/Interface.jsx';

export default function HojeFonada() {
  const [dataRef, setDataRef] = useState('');
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();
  const lista = useListaIncremental(itens, dataRef);

  useEffect(() => {
    api.fonada.hoje()
      .then((resp) => {
        setDataRef(resp.data);
        setItens(resp.fonadas);
      })
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="operacao-dia-pagina">
      <CabecalhoPagina contexto="Operação diária" titulo="Fonada de hoje" descricao="Mensagens organizadas por horário para uma leitura operacional rápida." meta={dataRef || null} />

      {erro && <AvisoInline tom="erro" titulo="Não foi possível montar a lista">{erro}</AvisoInline>}

      {carregando ? (
        <EstadoCarregando rotulo="Organizando as mensagens de hoje…" linhas={6} />
      ) : itens.length === 0 ? (
        <EstadoVazio icone="✓" titulo="Nenhuma mensagem marcada para hoje" descricao="A agenda de Fonada está livre para esta data." />
      ) : (
        <div className="operacao-dia-lista">
          {lista.itensVisiveis.map((p) => {
            const ehHoje1 = p.p1_dia === dataRef;
            return (
              <button key={p.id} type="button" className="operacao-dia-item" onClick={() => navigate(`/fonada/${p.id}`)}>
                <span className="operacao-dia-horario"><strong>{ehHoje1 ? p.p1_horario : p.p2_horario || '—'}</strong><small>{ehHoje1 ? '1ª mensagem' : '2ª mensagem'}</small></span>
                <span className="operacao-dia-corpo">
                  <span className="operacao-dia-topo"><span className="carimbo-os carimbo-os-lista">O.S. {p.senha_os || p.id}</span><strong>{p.nome_comprador || 'Cliente não informado'}</strong></span>
                  <span className="operacao-dia-infos">
                    <InfoCompacto label="Para" valor={ehHoje1 ? p.p1_para : p.p2_para} />
                    <InfoCompacto label="Tema" valor={ehHoje1 ? p.p1_tema : p.p2_tema} />
                    <InfoCompacto label="Telefone" valor={ehHoje1 ? p.p1_celular : p.p2_celular} />
                    <InfoCompacto label="Oferece" valor={ehHoje1 ? p.p1_quem_oferece : p.p2_quem_oferece} />
                  </span>
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
