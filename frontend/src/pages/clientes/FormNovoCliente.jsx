import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { formatarCelular, formatarFixo, formatarData } from '../../mascaras.js';

const VAZIO = {
  nome: '', nascimento: '', fixo: '', celular: '',
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

      {erro && <p className="fs-sm" style={{ color: '#dc3545', marginBottom: 12 }}>{erro}</p>}

      {duplicados && duplicados.length > 0 && (
        <div className="painel" style={estilos.avisoDuplicado}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            ⚠ Já existe cliente parecido com o mesmo aniversário
          </div>
          <p className="fs-sm" style={{ marginBottom: 12 }}>
            Confira se não é a mesma pessoa antes de cadastrar de novo:
          </p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
            {duplicados.map((c) => (
              <li key={c.id} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  style={{ marginRight: 8 }}
                >
                  Abrir
                </button>
                <strong>{c.nome}</strong> — nascimento {c.nascimento}
                {c.celular && ` — ${c.celular}`}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn secundario" onClick={() => setDuplicados([])}>
              É pessoa diferente, cadastrar assim mesmo
            </button>
          </div>
        </div>
      )}

      {!duplicados && (
        <div className="painel">
          <div className="section-title">Dados do cliente</div>
          <div className="grade grade-2">
            <div className="campo">
              <label>Nome *</label>
              <input value={dados.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
            </div>
            <div className="campo">
              <label>Nascimento</label>
              <input className="campo-nascimento" placeholder="dd/mm/aa" value={dados.nascimento} onChange={(e) => setComMascara('nascimento', e.target.value, 'data')} />
            </div>
          </div>
          <div className="grade grade-2">
            <div className="campo">
              <label>Telefone fixo</label>
              <input className="campo-fixo" value={dados.fixo} onChange={(e) => setComMascara('fixo', e.target.value, 'fixo')} />
            </div>
            <div className="campo">
              <label>Celular</label>
              <input className="campo-celular" value={dados.celular} onChange={(e) => setComMascara('celular', e.target.value, 'celular')} />
            </div>
          </div>
          <div className="campo">
            <label>Endereço</label>
            <input value={dados.endereco} onChange={(e) => set('endereco', e.target.value)} />
          </div>
          <div className="grade grade-3">
            <div className="campo">
              <label>Complemento</label>
              <input value={dados.complemento} onChange={(e) => set('complemento', e.target.value)} />
            </div>
            <div className="campo">
              <label>Bairro</label>
              <input className="campo-bairro" value={dados.bairro} onChange={(e) => set('bairro', e.target.value)} />
            </div>
            <div className="campo">
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
          <p className="fs-sm" style={{ color: '#2f6844', marginBottom: 12 }}>
            Nenhuma duplicidade encontrada. Pode confirmar o cadastro.
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
    borderLeft: '4px solid #d97706',
    background: '#fff8e1',
    marginBottom: 16,
  },
};
