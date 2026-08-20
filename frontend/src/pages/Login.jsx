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
    background: 'linear-gradient(165deg, #1D4E89 0%, #12314F 100%)',
    padding: 16,
  },
  cartao: {
    background: '#ffffff',
    borderRadius: 16,
    padding: '40px 36px',
    width: 400,
    maxWidth: '100%',
    boxShadow: '0 24px 60px rgba(18, 49, 79, 0.35)',
    textAlign: 'center',
  },
  carimbo: {
    width: 58,
    height: 58,
    margin: '0 auto 18px',
    borderRadius: '50%',
    border: '1.5px dashed var(--carimbo)',
    background: 'var(--carimbo-suave)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: '0.02em',
    color: 'var(--carimbo)',
  },
  titulo: { marginBottom: 4, textAlign: 'center' },
  subtitulo: { color: 'var(--tinta-suave)', marginBottom: 26, textAlign: 'center' },
  erro: {
    color: 'var(--selo)',
    background: 'var(--selo-suave)',
    padding: '9px 12px',
    borderRadius: 8,
    marginBottom: 14,
    textAlign: 'left',
  },
  linkDiscreto: {
    display: 'block',
    marginTop: 22,
    color: 'var(--tinta-suave)',
    textDecoration: 'none',
    opacity: 0.75,
  },
};
