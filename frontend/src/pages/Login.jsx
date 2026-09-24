import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api.js';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  async function entrar(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const resposta = await api.login(usuario, senha);
      setToken(resposta.token, resposta.usuario, resposta.nome);
      navigate('/agenda');
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-pagina">
      <div className="login-decoracao" aria-hidden="true" />
      <main className="login-cartao">
        <div className="login-marca">
          <div className="login-carimbo">PC</div>
          <div>
            <span className="login-kicker">Gestão operacional</span>
            <h1>Pombo-Correio</h1>
          </div>
        </div>
        <p className="login-subtitulo">Entre para acessar sua área de trabalho</p>

        <form onSubmit={entrar}>
          <div className="campo">
            <label htmlFor="usuario">Usuário</label>
            <input
              id="usuario"
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>

          {erro && <p className="login-erro">{erro}</p>}

          <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <Link to="/gerenciar-usuarios" className="login-link-discreto">
          Gerenciar usuários
        </Link>
      </main>
    </div>
  );
}
