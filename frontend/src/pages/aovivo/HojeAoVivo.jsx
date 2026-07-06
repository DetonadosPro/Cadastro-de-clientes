import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function HojeAoVivo() {
  const [dataRef, setDataRef] = useState('');
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

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
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 4 }}>Ao vivo — entregas de hoje</h1>
        <p className="fs-sm" style={{ color: '#6c757d' }}>{dataRef}</p>
      </div>

      {erro && <p style={{ color: '#dc3545' }}>{erro}</p>}

      {carregando ? (
        <p style={{ color: '#6c757d' }}>Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="painel" style={{ textAlign: 'center', color: '#6c757d' }}>
          Nenhuma entrega marcada para hoje.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {itens.map((p) => {
            const musicas = [1, 2, 3, 4, 5, 6].map((n) => p[`musica_${n}`]).filter(Boolean);
            return (
              <div key={p.id} className="painel" style={{ cursor: 'pointer' }} onClick={() => navigate(`/ao-vivo/${p.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="carimbo-os">O.S. {p.numero_os || p.id}</span>
                  <span className="fs-lg" style={{ fontWeight: 700, color: '#004085' }}>
                    {p.horario_entrega || '—'}
                  </span>
                </div>
                <div className="grade grade-3" style={{ marginTop: 12 }}>
                  <Info label="Comprador" valor={p.comprador} />
                  <Info label="Para" valor={p.para} />
                  <Info label="Endereço" valor={p.endereco} />
                  <Info label="Bairro" valor={p.bairro} />
                  <Info label="Referência" valor={p.referencia} />
                  <Info label="Celular" valor={p.celular} />
                </div>
                {musicas.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #dddddd' }}>
                    <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6c757d', marginBottom: 4 }}>
                      Músicas
                    </div>
                    <ol className="fs-sm" style={{ margin: 0, paddingLeft: 18 }}>
                      {musicas.map((m, i) => <li key={i}>{m}</li>)}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Info({ label, valor }) {
  return (
    <div>
      <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6c757d', marginBottom: 2 }}>
        {label}
      </div>
      <div className="fs-md">{valor || '—'}</div>
    </div>
  );
}
