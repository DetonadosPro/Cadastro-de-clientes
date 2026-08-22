import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';

function IconeAviso() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.3 18a1.8 1.8 0 0 0 1.5 2.7h16.4a1.8 1.8 0 0 0 1.5-2.7l-8-14.1a1.8 1.8 0 0 0-3.1 0Z" />
    </svg>
  );
}
function IconeOk() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const VAZIO = {
  nome: '', nascimento: '', fixo: '', whatsapp: '', celular: '',
  endereco: '', complemento: '', bairro: '', referencia: '',
};

export default function FormNovoCliente() {
  const navigate = useNavigate();
  const { mostrarToast } = useToast();

  const [dados, setDados] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [duplicados, setDuplicados] = useState(null);

  function set(campo, valor) {
    setDados((d) => ({ ...d, [campo]: valor }));
    setDuplicados(null);
  }

  function setComMascara(campo, valorBruto, tipoMascara) {
    const formatadores = { celular: formatarCelular, fixo: formatarFixo, data: formatarData };
    set(campo, formatadores[tipoMascara](valorBruto));
  }

  async function salvarDeVerdade() {
    setSalvando(true);
    try {
      const novo = await api.clientes.criar(dados);
      mostrarToast('Cliente cadastrado com sucesso.');
      navigate(`/clientes/${novo.id}`, { replace: true });
    } catch (err) {
      setErro(err.message);
      mostrarToast('Não foi possível salvar. Tente novamente.', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  async function salvar() {
    setErro('');
    if (!dados.nome.trim()) {
      setErro('O nome é obrigatório.');
      return;
    }

    if (duplicados === null && dados.nascimento.trim()) {
      setSalvando(true);
      try {
        const resp = await api.clientes.verificarDuplicidade(dados.nome, dados.nascimento);
        setSalvando(false);
        if (resp.possiveisDuplicados.length > 0) {
          setDuplicados(resp.possiveisDuplicados);
          return;
        }
      } catch (err) {
        setSalvando(false);
      }
    }

    await salvarDeVerdade();
  }

  function cancelar() {
    navigate('/clientes');
  }

  return (
    <div className="form-pagina">
      <div style={estilos.barraTopo}>
        <h1 style={{ marginBottom: 0 }}>Novo cliente</h1>
      </div>

      {erro && <p className="fs-sm" style={{ color: 'var(--selo)', marginBottom: 12 }}>{erro}</p>}

      {duplicados && duplicados.length > 0 && (
        <div className="painel" style={estilos.avisoDuplicado}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--aviso)' }}>
            <IconeAviso /> Já existe cliente parecido com o mesmo aniversário
          </div>
          <p className="fs-sm" style={{ marginBottom: 12, color: 'var(--tinta-suave)' }}>
            Confira se não é a mesma pessoa antes de cadastrar de novo:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {duplicados.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  background: '#ffffff', border: '1px solid var(--borda)', borderRadius: 8, padding: '10px 14px',
                }}
              >
                <div>
                  <strong>{c.nome}</strong>
                  <span className="fs-sm" style={{ color: 'var(--tinta-suave)', marginLeft: 8 }}>
                    nascimento {c.nascimento}{c.celular && ` · ${c.celular}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn secundario"
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  style={{ flexShrink: 0 }}
                >
                  Abrir
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn secundario" onClick={() => setDuplicados([])}>
              É pessoa diferente, cadastrar assim mesmo
            </button>
          </div>
        </div>
      )}

      {!duplicados && (
        <div className="painel" style={{ maxWidth: 720, padding: 28 }}>
          <div className="section-title" style={{ marginBottom: 20 }}>Dados do cliente</div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div className="campo" style={{ flex: '1 1 280px', minWidth: 200, marginBottom: 0, gap: 6 }}>
              <label>Nome *</label>
              <input value={dados.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
            </div>
            <div className="campo" style={{ flex: '0 0 auto', width: 130, marginBottom: 0, gap: 6 }}>
              <label>Nascimento</label>
              <input placeholder="dd/mm/aa" value={dados.nascimento} onChange={(e) => setComMascara('nascimento', e.target.value, 'data')} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingBottom: 20, marginBottom: 20, borderBottom: '1px solid var(--papel-alt)' }}>
            <div className="campo" style={{ flex: '0 0 auto', width: 150, marginBottom: 0, gap: 6 }}>
              <label>Telefone fixo</label>
              <input value={dados.fixo} onChange={(e) => setComMascara('fixo', e.target.value, 'fixo')} />
            </div>
            <div className="campo" style={{ flex: '0 0 auto', width: 165, marginBottom: 0, gap: 6 }}>
              <label>WhatsApp</label>
              <input value={dados.whatsapp} onChange={(e) => setComMascara('whatsapp', e.target.value, 'celular')} />
            </div>
            <div className="campo" style={{ flex: '0 0 auto', width: 165, marginBottom: 0, gap: 6 }}>
              <label>Celular</label>
              <input value={dados.celular} onChange={(e) => setComMascara('celular', e.target.value, 'celular')} />
            </div>
          </div>

          <div className="campo" style={{ gap: 6, marginBottom: 18 }}>
            <label>Endereço</label>
            <input value={dados.endereco} onChange={(e) => set('endereco', e.target.value)} style={{ maxWidth: 420 }} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div className="campo" style={{ flex: '0 0 auto', width: 180, marginBottom: 0, gap: 6 }}>
              <label>Complemento</label>
              <input value={dados.complemento} onChange={(e) => set('complemento', e.target.value)} />
            </div>
            <div className="campo" style={{ flex: '0 0 auto', width: 180, marginBottom: 0, gap: 6 }}>
              <label>Bairro</label>
              <input value={dados.bairro} onChange={(e) => set('bairro', e.target.value)} />
            </div>
            <div className="campo" style={{ flex: '1 1 200px', minWidth: 160, marginBottom: 0, gap: 6 }}>
              <label>Referência</label>
              <input value={dados.referencia} onChange={(e) => set('referencia', e.target.value)} />
            </div>
          </div>

          <div style={estilos.rodapeBotoes}>
            <button type="button" className="btn secundario" onClick={cancelar}>Cancelar</button>
            <button type="button" className="btn" onClick={salvar} disabled={salvando}>
              {salvando ? 'Verificando...' : 'Salvar cliente'}
            </button>
          </div>
        </div>
      )}

      {duplicados && duplicados.length === 0 && (
        <div className="painel">
          <p className="fs-sm" style={{ color: 'var(--ok)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconeOk /> Nenhuma duplicidade encontrada. Pode confirmar o cadastro.
          </p>
          <div style={estilos.rodapeBotoes}>
            <button type="button" className="btn secundario" onClick={cancelar}>Cancelar</button>
            <button type="button" className="btn" onClick={salvarDeVerdade} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Confirmar e salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const estilos = {
  barraTopo: { marginBottom: 18 },
  rodapeBotoes: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  avisoDuplicado: {
    borderLeft: '4px solid var(--aviso)',
    background: 'var(--aviso-suave)',
    marginBottom: 16,
  },
};
