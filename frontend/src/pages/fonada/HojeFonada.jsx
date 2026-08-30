import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';

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
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 4 }}>Fonada — mensagens de hoje</h1>
        <p className="fs-sm" style={{ color: '#4b5563' }}>{dataRef}</p>
      </div>

      {erro && <p style={{ color: '#dc3545' }}>{erro}</p>}

      {carregando ? (
        <p style={{ color: '#4b5563' }}>Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="painel" style={{ textAlign: 'center', color: '#4b5563' }}>
          Nenhuma mensagem fonada marcada para hoje.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {lista.itensVisiveis.map((p) => {
            const ehHoje1 = p.p1_dia === dataRef;
            return (
              <div key={p.id} className="painel" style={{ cursor: 'pointer' }} onClick={() => navigate(`/fonada/${p.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="carimbo-os">O.S. {p.senha_os || p.id}</span>
                  <span className="fs-lg" style={{ fontWeight: 700, color: '#004085' }}>
                    {ehHoje1 ? p.p1_horario : p.p2_horario}
                  </span>
                </div>
                <div className="grade grade-3" style={{ marginTop: 12 }}>
                  <Info label="Cliente" valor={p.nome_comprador} />
                  <Info label="Para" valor={ehHoje1 ? p.p1_para : p.p2_para} />
                  <Info label="Tema" valor={ehHoje1 ? p.p1_tema : p.p2_tema} />
                  <Info label="Telefone" valor={ehHoje1 ? p.p1_celular : p.p2_celular} />
                  <Info label="Quem oferece" valor={ehHoje1 ? p.p1_quem_oferece : p.p2_quem_oferece} />
                  <Info label="Qual mensagem" valor={ehHoje1 ? '1ª mensagem' : '2ª mensagem'} />
                </div>
              </div>
            );
          })}
          <BotaoMostrarMais temMais={lista.temMais} restantes={lista.restantes} onClick={lista.mostrarMais} />
        </div>
      )}
    </div>
  );
}

function Info({ label, valor }) {
  return (
    <div>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: '#4b5563', marginBottom: 2 }}>
        {label}
      </div>
      <div className="fs-md">{valor || '—'}</div>
    </div>
  );
}
