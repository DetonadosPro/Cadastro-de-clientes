import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatarData } from '../mascaras.js';

export default function GerenciarUsuarios() {
  const [senhaMestra, setSenhaMestra] = useState('');
  const [autenticado, setAutenticado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [erroSenha, setErroSenha] = useState('');

  async function verificarSenha(e) {
    e.preventDefault();
    setErroSenha('');
    setVerificando(true);
    try {
      await api.usuarios.verificarSenha(senhaMestra);
      setAutenticado(true);
    } catch (err) {
      setErroSenha(err.message);
    } finally {
      setVerificando(false);
    }
  }

  if (!autenticado) {
    return (
      <div className="login-pagina">
        <div className="login-decoracao" aria-hidden="true" />
        <div className="login-cartao usuario-acesso-cartao">
          <div className="usuario-acesso-icone">⌁</div>
          <h1>Área restrita</h1>
          <p className="login-subtitulo">
            Digite a senha mestra para gerenciar usuários
          </p>
          <form onSubmit={verificarSenha}>
            <div className="campo">
              <label htmlFor="senha-mestra">Senha mestra</label>
              <input
                id="senha-mestra"
                type="password"
                value={senhaMestra}
                onChange={(e) => setSenhaMestra(e.target.value)}
                autoFocus
                required
              />
            </div>
            {erroSenha && (
              <p className="login-erro">
                {erroSenha}
              </p>
            )}
            <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={verificando}>
              {verificando ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
          <Link to="/login" className="login-link-discreto">
            ← Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  return <PainelUsuarios senhaMestra={senhaMestra} />;
}

function PainelUsuarios({ senhaMestra }) {
  const [usuarios, setUsuarios] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [mostrandoForm, setMostrandoForm] = useState(false);

  const [novoUsuario, setNovoUsuario] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novaDataNascimento, setNovaDataNascimento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');

  function carregar() {
    setCarregando(true);
    setErro('');
    api.usuarios.listar(senhaMestra)
      .then((resp) => setUsuarios(resp.usuarios))
      .catch((err) => setErro(err.message))
      .finally(() => setCarregando(false));
  }

  React.useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criar(e) {
    e.preventDefault();
    setErroForm('');
    if (!novoUsuario.trim() || !novaSenha.trim()) {
      setErroForm('Informe usuário e senha.');
      return;
    }
    setSalvando(true);
    try {
      await api.usuarios.criar(senhaMestra, {
        usuario: novoUsuario.trim(),
        senha: novaSenha,
        nome: novoNome.trim() || null,
        data_nascimento: novaDataNascimento || null,
      });
      setNovoUsuario('');
      setNovaSenha('');
      setNovoNome('');
      setNovaDataNascimento('');
      setMostrandoForm(false);
      carregar();
    } catch (err) {
      setErroForm(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function remover(usuario) {
    const confirmar = confirm(`Remover o usuário "${usuario.usuario}"? Essa ação não pode ser desfeita.`);
    if (!confirmar) return;
    try {
      await api.usuarios.remover(senhaMestra, usuario.id);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="usuarios-pagina">
      <div className="usuarios-conteudo">
        <div className="usuarios-cabecalho">
          <div>
            <h1 style={{ marginBottom: 2 }}>Usuários do sistema</h1>
            <p className="fs-sm texto-suave" style={{ margin: 0 }}>Criar e remover contas de login</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setMostrandoForm((v) => !v)}>
              {mostrandoForm ? 'Cancelar' : '+ Novo usuário'}
            </button>
            <Link to="/login" className="btn secundario" style={{ textDecoration: 'none' }}>
              Voltar ao login
            </Link>
          </div>
        </div>

        {mostrandoForm && (
          <form onSubmit={criar} className="painel" style={{ marginBottom: 20 }}>
            <div className="grade grade-2">
              <div className="campo">
                <label>Nome completo</label>
                <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome da pessoa" />
              </div>
              <div className="campo">
                <label>Data de nascimento</label>
                <input placeholder="dd/mm/aa" value={novaDataNascimento} onChange={(e) => setNovaDataNascimento(formatarData(e.target.value))} />
              </div>
            </div>
            <div className="grade grade-2">
              <div className="campo">
                <label>Usuário (login) *</label>
                <input value={novoUsuario} onChange={(e) => setNovoUsuario(e.target.value)} placeholder="nome de usuário" />
              </div>
              <div className="campo">
                <label>Senha *</label>
                <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="mínimo 3 caracteres" />
              </div>
            </div>
            {erroForm && <p className="login-erro">{erroForm}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn" disabled={salvando}>
                {salvando ? 'Criando...' : 'Criar usuário'}
              </button>
            </div>
          </form>
        )}

        {erro && <p className="login-erro">{erro}</p>}

        {carregando ? (
          <p className="texto-suave">Carregando...</p>
        ) : usuarios.length === 0 ? (
          <div className="painel estado-cobranca">
            Nenhum usuário cadastrado ainda.
          </div>
        ) : (
          <div className="painel" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tabela-lista tabela-usuarios">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Nascimento</th>
                  <th>Criado em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.nome || '—'}</td>
                    <td>{u.usuario}</td>
                    <td>{u.data_nascimento || '—'}</td>
                    <td>{u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-small perigo"
                        onClick={() => remover(u)}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
