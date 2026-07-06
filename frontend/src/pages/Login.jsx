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
      navigate('/fonada');
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={estilos.pagina}>
      <div style={estilos.cartao}>
        <div style={estilos.carimbo}>PC</div>
        <h1 style={estilos.titulo}>Pombo-Correio</h1>
        <p className="fs-sm" style={estilos.subtitulo}>Entre para acessar o sistema</p>

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

          {erro && <p className="fs-sm" style={estilos.erro}>{erro}</p>}

          <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <Link to="/gerenciar-usuarios" className="fs-xs" style={estilos.linkDiscreto}>
          Gerenciar usuários
        </Link>
      </div>
    </div>
  );
}

const estilos = {
  pagina: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, #004085 0%, #002752 100%)',
  },
  cartao: {
    background: '#ffffff',
    borderRadius: 12,
    padding: '40px 36px',
    width: 400,
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    textAlign: 'center',
  },
  carimbo: {
    width: 56,
    height: 56,
    margin: '0 auto 16px',
    borderRadius: 12,
    background: '#e6f0fa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    color: '#004085',
  },
  titulo: { marginBottom: 4, textAlign: 'center' },
  subtitulo: { color: '#6c757d', marginBottom: 24, textAlign: 'center' },
  erro: {
    color: '#dc3545',
    background: '#f8d7da',
    padding: '8px 10px',
    borderRadius: 6,
    marginBottom: 12,
    textAlign: 'left',
  },
  linkDiscreto: {
    display: 'block',
    marginTop: 20,
    color: '#adb5bd',
    textDecoration: 'none',
  },
};
