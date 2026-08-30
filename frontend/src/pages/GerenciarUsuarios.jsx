import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatarData } from '../mascaras.js';
import CampoData from '../components/CampoData.jsx';
import { AvisoInline, CabecalhoPagina, EstadoCarregando, EstadoVazio } from '../components/Interface.jsx';

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
        <CabecalhoPagina
          contexto="Administração"
          titulo="Usuários do sistema"
          descricao="Crie contas de acesso e mantenha a identificação da equipe organizada."
          acoes={<>
            <button type="button" className="btn" onClick={() => setMostrandoForm((v) => !v)}>
              {mostrandoForm ? 'Cancelar' : '+ Novo usuário'}
            </button>
            <Link to="/login" className="btn secundario" style={{ textDecoration: 'none' }}>
              Voltar ao login
            </Link>
          </>}
        />

        {mostrandoForm && (
          <form onSubmit={criar} className="painel usuario-formulario">
            <div className="section-title">Dados do novo usuário</div>
            <div className="grade grade-2">
              <div className="campo">
                <label>Nome completo</label>
                <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome da pessoa" />
              </div>
              <div className="campo">
                <label>Data de nascimento</label>
                <CampoData placeholder="dd/mm/aa" value={novaDataNascimento} onChange={(valor) => setNovaDataNascimento(formatarData(valor))} />
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
            {erroForm && <AvisoInline tom="erro" titulo="Revise os dados do usuário">{erroForm}</AvisoInline>}
            <div className="usuario-formulario-acoes">
              <button type="submit" className="btn" disabled={salvando}>
                {salvando ? 'Criando...' : 'Criar usuário'}
              </button>
            </div>
          </form>
        )}

        {erro && <AvisoInline tom="erro" titulo="Não foi possível carregar os usuários" acao={<button type="button" className="btn secundario" onClick={carregar}>Tentar novamente</button>}>{erro}</AvisoInline>}

        {carregando ? (
          <EstadoCarregando rotulo="Carregando usuários…" linhas={4} />
        ) : usuarios.length === 0 ? (
          <EstadoVazio icone="＋" titulo="Nenhum usuário cadastrado" descricao="Crie a primeira conta para liberar o acesso da equipe ao sistema." acao={<button type="button" className="btn" onClick={() => setMostrandoForm(true)}>Criar usuário</button>} />
        ) : (
          <div className="painel usuarios-tabela-painel">
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
