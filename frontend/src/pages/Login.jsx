import React, { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { CampoSenha, IconeAcesso, MolduraAcesso } from '../components/Acesso.jsx';
import { AvisoInline, Dialogo } from '../components/Interface.jsx';
import { destinoSeguro } from '../utils/acesso.js';

const CHAVE_USUARIO = 'pombo_usuario_lembrado';
export default function Login() {
  const [usuario, setUsuario] = useState(() => localStorage.getItem(CHAVE_USUARIO) || '');
  const [lembrar, setLembrar] = useState(() => Boolean(localStorage.getItem(CHAVE_USUARIO)));
  const [senha, setSenha] = useState(''), [erro, setErro] = useState(''), [carregando, setCarregando] = useState(false), [ajuda, setAjuda] = useState(false);
  const ocupado = useRef(false), usuarioRef = useRef(null);
  const navigate = useNavigate(), location = useLocation(), [params] = useSearchParams();
  const retorno = destinoSeguro(params.get('retorno') || location.state?.retorno);

  async function entrar(e) {
    e.preventDefault();
    if (ocupado.current) return;
    setErro('');
    if (!usuario.trim()) { setErro('Informe seu usuário de acesso.'); usuarioRef.current?.focus(); return; }
    ocupado.current = true; setCarregando(true);
    try {
      const resposta = await api.login(usuario.trim(), senha);
      if (lembrar) localStorage.setItem(CHAVE_USUARIO, usuario.trim()); else localStorage.removeItem(CHAVE_USUARIO);
      setToken(resposta.token, resposta.usuario, resposta.nome);
      navigate(retorno, { replace: true });
    } catch (err) { setErro(err.message); }
    finally { ocupado.current = false; setCarregando(false); }
  }

  return <MolduraAcesso>
    <div className="acesso-form-heading"><span className="acesso-etiqueta">Bem-vindo de volta</span><h1>Entre na sua conta</h1><p>Acesse sua área de trabalho e continue o dia.</p></div>
    {params.get('motivo') === 'sessao-expirada' && <AvisoInline tom="info" titulo="Entre novamente para continuar">Sua sessão terminou. Depois do login, você voltará à página que estava acessando.</AvisoInline>}
    <form className="acesso-form" onSubmit={entrar}>
      <div className="campo"><label htmlFor="usuario">Usuário</label><input id="usuario" ref={usuarioRef} value={usuario} onChange={e => { setUsuario(e.target.value); setErro(''); }} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Seu usuário de acesso" autoFocus required disabled={carregando}/></div>
      <CampoSenha id="senha" label="Senha" value={senha} onChange={e => {setSenha(e.target.value); setErro('');}} disabled={carregando}/>
      <div className="acesso-opcoes"><label><input type="checkbox" checked={lembrar} disabled={carregando} onChange={e => {setLembrar(e.target.checked); if (!e.target.checked) localStorage.removeItem(CHAVE_USUARIO);}}/>Lembrar meu usuário</label><button type="button" className="acesso-text-link" onClick={() => setAjuda(true)}>Precisa de acesso?</button></div>
      {erro && <AvisoInline titulo="Não foi possível entrar">{erro}</AvisoInline>}
      <button className="btn acesso-submit" type="submit" disabled={carregando} aria-busy={carregando}>{carregando ? 'Entrando…' : 'Entrar'}<IconeAcesso tipo="seta"/></button>
    </form>
    <div className="acesso-admin-link"><span>Administração da equipe</span><Link to="/gerenciar-usuarios">Gerenciar usuários <IconeAcesso tipo="seta"/></Link></div>
    {ajuda && <Dialogo titulo="Vamos ajudar com o acesso" descricao="Cada pessoa entra com o usuário e a senha cadastrados pela administração." onClose={() => setAjuda(false)} className="acesso-dialog"><div className="acesso-ajuda"><h3>É seu primeiro acesso?</h3><p>Peça à pessoa responsável pelo sistema para criar sua conta e informar seu usuário e sua senha.</p><h3>Esqueceu a senha?</h3><p>A administração pode redefinir sua senha em Gerenciar usuários. Não é preciso excluir sua conta.</p><h3>O login não funciona?</h3><p>Use o usuário de acesso, que pode ser diferente do seu nome completo. Confira o Caps Lock e os espaços ao copiar a senha.</p></div><div className="acesso-dialog-actions"><button className="btn" onClick={() => setAjuda(false)}>Entendi</button></div></Dialogo>}
  </MolduraAcesso>;
}
