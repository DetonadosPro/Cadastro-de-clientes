import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Lembretes() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.lembretes.aniversarios()
      .then((resp) => setDados(resp))
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 2 }}>Lembretes</h1>
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)', margin: 0 }}>
          Mensagens de Fonada que fizeram aniversário {dados ? `em ${dados.dia}` : 'amanhã'} — bom momento
          para oferecer recompra a esses clientes.
        </p>
      </div>

      {erro && <p className="fs-sm" style={{ color: 'var(--selo)' }}>{erro}</p>}

      {carregando ? (
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : !dados || dados.lembretes.length === 0 ? (
        <div className="painel" style={{ textAlign: 'center', color: 'var(--tinta-suave)' }}>
          Nenhum lembrete para amanhã.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dados.lembretes.map((l) => (
            <div
              key={`${l.pedidoId}-${l.mensagem}`}
              className="painel"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/fonada/${l.pedidoId}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <span className="fs-lg" style={{ fontWeight: 700 }}>{l.nome_comprador || '—'}</span>
                <span className="tag neutro">
                  {l.anosAtras === 1 ? 'Há 1 ano' : `Há ${l.anosAtras} anos`}
                </span>
              </div>
              <div className="grade grade-2" style={{ marginTop: 10 }}>
                <div>
                  <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
                    Para
                  </div>
                  <div className="fs-md">{l.para || '—'}</div>
                </div>
                <div>
                  <div className="fs-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tinta-suave)', marginBottom: 2 }}>
                    Tema
                  </div>
                  <div className="fs-md">{l.tema || '—'}</div>
                </div>
              </div>
              <div className="fs-xs" style={{ marginTop: 8, color: 'var(--tinta-suave)' }}>
                O.S. {l.senha_os || l.pedidoId} · Enviada em {l.dataOriginal}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
