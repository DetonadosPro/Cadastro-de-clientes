import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { formatarData } from '../mascaras.js';
import CampoData from '../components/CampoData.jsx';
import { AvisoInline, Dialogo, EstadoCarregando, EstadoVazio } from '../components/Interface.jsx';
import { CampoSenha, IconeAcesso, MarcaAcesso, MolduraAcesso } from '../components/Acesso.jsx';
import { normalizarBuscaAcesso } from '../utils/acesso.js';
import './administracao.css';

const VAZIO = { nome: '', usuario: '', data_nascimento: '', senha: '', confirmacao: '' };
const iniciais = nome => String(nome || '').trim().split(/\s+/).filter(Boolean).map((p, i, lista) => i === 0 || i === lista.length - 1 ? p[0] : '').join('').slice(0, 2).toUpperCase();
const data = valor => valor && !Number.isNaN(new Date(valor).getTime()) ? new Date(valor).toLocaleDateString('pt-BR') : 'Não informada';

export default function GerenciarUsuarios() {
  const [senhaMestra, setSenhaMestra] = useState(''), [autenticado, setAutenticado] = useState(false), [verificando, setVerificando] = useState(false), [erro, setErro] = useState(''), [mensagem, setMensagem] = useState('');
  const ocupado = useRef(false);
  async function verificarSenha(e) {
    e.preventDefault(); if (ocupado.current) return;
    ocupado.current = true; setErro(''); setMensagem(''); setVerificando(true);
    try { await api.usuarios.verificarSenha(senhaMestra); setAutenticado(true); }
    catch (err) { setErro(err.message); }
    finally { ocupado.current = false; setVerificando(false); }
  }
  function encerrar(motivo = 'Administração encerrada. Informe a senha mestra para acessar novamente.') {
    setAutenticado(false); setSenhaMestra(''); setErro(''); setMensagem(motivo);
  }
  if (autenticado) return <PainelUsuarios senhaMestra={senhaMestra} onEncerrar={encerrar}/>;
  return <MolduraAcesso administracao>
    <div className="acesso-form-heading"><span className="acesso-etiqueta"><IconeAcesso tipo="chave"/>Acesso administrativo</span><h1>Gerenciar usuários</h1><p>Use a senha mestra para cuidar das contas da equipe.</p></div>
    {mensagem && <AvisoInline tom="info" titulo="Acesso administrativo fechado">{mensagem}</AvisoInline>}
    <form className="acesso-form" onSubmit={verificarSenha}>
      <CampoSenha id="senha-mestra" label="Senha mestra" value={senhaMestra} onChange={e => {setSenhaMestra(e.target.value); setErro('');}} disabled={verificando} autoComplete="off" autoFocus hint="A senha mestra é diferente da senha usada para entrar na sua conta."/>
      {erro && <AvisoInline titulo="Não foi possível autorizar o acesso">{erro}</AvisoInline>}
      <button className="btn acesso-submit" disabled={verificando} aria-busy={verificando} type="submit">{verificando ? 'Verificando…' : 'Entrar'}<IconeAcesso tipo="seta"/></button>
    </form>
    <p className="acesso-restrito-note">A senha mestra não fica salva neste dispositivo. Ao encerrar a administração, será preciso informá-la novamente.</p>
    <Link className="acesso-voltar" to="/login">← Voltar ao login</Link>
  </MolduraAcesso>;
}

function PainelUsuarios({ senhaMestra, onEncerrar }) {
  const [usuarios, setUsuarios] = useState(null), [carregando, setCarregando] = useState(true), [erro, setErro] = useState('');
  const [busca, setBusca] = useState(''), [ordem, setOrdem] = useState('nome'), [acao, setAcao] = useState(null), [dados, setDados] = useState(VAZIO);
  const [processando, setProcessando] = useState(false), [erroForm, setErroForm] = useState('');
  const ocupado = useRef(false), consulta = useRef(0);
  const { mostrarToast } = useToast();
  function tratarAutorizacao(err) {
    if (err.status !== 401) return false;
    onEncerrar('A autorização precisa ser renovada. Informe a senha mestra atual para continuar.');
    return true;
  }
  async function carregar() {
    const numero = ++consulta.current; setCarregando(true); setErro('');
    try { const resp = await api.usuarios.listar(senhaMestra); if (numero === consulta.current) setUsuarios(resp.usuarios); }
    catch (err) { if (numero === consulta.current && !tratarAutorizacao(err)) setErro(err.message); }
    finally { if (numero === consulta.current) setCarregando(false); }
  }
  useEffect(() => { carregar(); return () => {consulta.current++;}; }, [senhaMestra]);
  function abrir(tipo, alvo) { setDados(VAZIO); setErroForm(''); setAcao({ tipo, alvo }); }
  function fechar() { if (!ocupado.current) {setAcao(null); setDados(VAZIO); setErroForm('');} }
  function set(campo, valor) {setDados(atuais => ({...atuais, [campo]: valor})); setErroForm('');}

  async function salvar(e) {
    e.preventDefault(); if (ocupado.current || !acao) return;
    setErroForm('');
    if (acao.tipo === 'criar' && !dados.usuario.trim()) { setErroForm('Informe o usuário de acesso.'); return; }
    if (dados.senha.length < 12 || !dados.senha.trim()) { setErroForm('A senha deve ter pelo menos 12 caracteres.'); return; }
    if (dados.senha !== dados.confirmacao) { setErroForm('As senhas não coincidem. Confira a confirmação.'); return; }
    ocupado.current = true; setProcessando(true);
    try {
      if (acao.tipo === 'criar') await api.usuarios.criar(senhaMestra, { usuario: dados.usuario.trim(), senha: dados.senha, nome: dados.nome.trim() || null, data_nascimento: dados.data_nascimento || null });
      else await api.usuarios.redefinirSenha(senhaMestra, acao.alvo.id, dados.senha);
      mostrarToast(acao.tipo === 'criar' ? 'Usuário criado. A conta já pode acessar o sistema.' : `Senha de ${acao.alvo.usuario} redefinida.`);
      setAcao(null); setDados(VAZIO); await carregar();
    } catch (err) { if (!tratarAutorizacao(err)) setErroForm(err.message); }
    finally { ocupado.current = false; setProcessando(false); }
  }
  async function remover() {
    if (ocupado.current || !acao?.alvo) return;
    ocupado.current = true; setProcessando(true); setErroForm('');
    try { await api.usuarios.remover(senhaMestra, acao.alvo.id); mostrarToast(`Conta de ${acao.alvo.usuario} removida.`); setAcao(null); await carregar(); }
    catch (err) { if (!tratarAutorizacao(err)) setErroForm(err.message); }
    finally { ocupado.current = false; setProcessando(false); }
  }
  const termo = normalizarBuscaAcesso(busca);
  const lista = (usuarios || []).filter(u => normalizarBuscaAcesso(`${u.nome || ''} ${u.usuario}`).includes(termo)).sort((a, b) => ordem === 'recentes' ? (new Date(b.criado_em).getTime() || 0) - (new Date(a.criado_em).getTime() || 0) || b.id - a.id : String(a.nome || a.usuario).localeCompare(String(b.nome || b.usuario), 'pt-BR') || a.id - b.id);

  return <div className="acesso-equipe-pagina"><header className="acesso-equipe-topbar"><MarcaAcesso/><span>Administração da equipe</span><button className="btn secundario" disabled={processando} onClick={() => onEncerrar()}><IconeAcesso tipo="sair"/>Encerrar administração</button></header>
    <main className="admin-workspace acesso-equipe-conteudo">
      <header className="admin-header"><div><span className="admin-eyebrow">Pessoas e acesso</span><h1>Usuários do sistema</h1><p>Organize a equipe e resolva o acesso sem perder a conta de ninguém.</p></div><button className="btn" onClick={() => abrir('criar')} disabled={processando || carregando || !!erro}>+ Novo usuário</button></header>
      <section className="acesso-equipe-resumo" aria-label="Resumo das contas"><div><span className="admin-icon"><IconeAcesso tipo="equipe"/></span><span>Contas cadastradas<strong>{carregando && !usuarios ? '—' : usuarios?.length ?? '—'}</strong></span></div><div><span className="admin-icon"><IconeAcesso tipo="marca"/></span><span>Com nome completo<strong>{usuarios ? usuarios.filter(u => u.nome?.trim()).length : '—'}</strong></span></div><div className="acesso-equipe-resumo-ajuda"><IconeAcesso tipo="chave"/><p><strong>Alguém esqueceu a senha?</strong>Use “Redefinir senha” na conta da pessoa para preparar o próximo acesso.</p></div></section>
      <section className="admin-card acesso-equipe-filtros"><div className="campo"><label htmlFor="busca-equipe">Encontrar pessoa ou usuário</label><input id="busca-equipe" type="search" placeholder="Busque pelo nome ou pelo usuário de acesso" value={busca} onChange={e => setBusca(e.target.value)}/></div><div className="campo"><label htmlFor="ordem-equipe">Ordenar por</label><select id="ordem-equipe" value={ordem} onChange={e => setOrdem(e.target.value)}><option value="nome">Nome da pessoa</option><option value="recentes">Contas mais recentes</option></select></div><button className="btn secundario" disabled={carregando || processando} onClick={carregar}>Atualizar</button></section>
      <h2 className="acesso-sr">Contas de acesso</h2>
      {erro && <AvisoInline titulo="Não foi possível carregar os usuários" acao={<button className="btn secundario" onClick={carregar}>Tentar novamente</button>}>{erro}</AvisoInline>}
      {carregando && !usuarios ? <EstadoCarregando rotulo="Carregando usuários…"/> : usuarios && <>
        <div className="acesso-equipe-list-status" role="status">{carregando ? 'Atualizando contas…' : `${lista.length} de ${usuarios.length} contas`}{busca && <button className="btn-small" onClick={() => setBusca('')}>Limpar busca</button>}</div>
        {!lista.length && !erro ? <EstadoVazio icone="＋" titulo={termo ? 'Nenhuma conta encontrada' : 'Nenhum usuário cadastrado'} descricao={termo ? 'Tente outro nome ou usuário de acesso.' : 'Crie a primeira conta para a equipe começar a usar o sistema.'} acao={<button className="btn" onClick={() => termo ? setBusca('') : abrir('criar')}>{termo ? 'Limpar busca' : 'Criar usuário'}</button>}/> : <div className="acesso-equipe-lista" aria-busy={carregando}>{lista.map(u => <article key={u.id} className="acesso-equipe-pessoa">
          <div className="acesso-equipe-pessoa-nome"><span className="acesso-equipe-avatar" aria-hidden="true">{iniciais(u.nome || u.usuario)}</span><div><h2>{u.nome || u.usuario}</h2><span className="acesso-equipe-username">@{u.usuario}</span>{!u.nome && <small>Nome completo a preencher</small>}</div></div>
          <dl><div><dt>Nascimento</dt><dd>{u.data_nascimento || 'Não informado'}</dd></div><div><dt>Conta criada em</dt><dd>{data(u.criado_em)}</dd></div></dl>
          <div className="acesso-equipe-pessoa-acoes"><button className="btn-small" disabled={processando || carregando || !!erro} onClick={() => abrir('senha', u)}>Redefinir senha<span className="acesso-sr"> de {u.usuario}</span></button><button className="btn-small perigo" disabled={processando || carregando || !!erro} onClick={() => abrir('remover', u)}>Remover<span className="acesso-sr"> {u.usuario}</span></button></div>
        </article>)}</div>}
      </>}
      <footer className="acesso-equipe-footer"><span>Contas individuais ajudam a identificar quem realiza cada ação.</span><Link to="/login">Voltar ao login</Link></footer>
    </main>
    {acao && <Dialogo key={`${acao.tipo}-${acao.alvo?.id || 'novo'}`} titulo={acao.tipo === 'criar' ? 'Novo usuário' : acao.tipo === 'senha' ? 'Redefinir senha' : 'Remover conta?'} descricao={acao.tipo === 'criar' ? 'Prepare uma conta individual para a pessoa entrar no sistema.' : acao.tipo === 'senha' ? `Uma nova senha para ${acao.alvo.usuario}. Ela será usada nos próximos acessos.` : 'A conta será removida. Os registros da operação continuam no sistema.'} onClose={fechar} className="acesso-dialog acesso-usuario-dialog">
      {acao.tipo === 'remover' ? <><div className="acesso-usuario-alvo"><IconeAcesso tipo="equipe"/><div><strong>{acao.alvo.nome || acao.alvo.usuario}</strong><span>@{acao.alvo.usuario}</span></div></div>{erroForm && <AvisoInline titulo="Não foi possível remover">{erroForm}</AvisoInline>}<div className="acesso-dialog-actions"><button className="btn secundario" disabled={processando} onClick={fechar}>Cancelar</button><button className="btn perigo" disabled={processando} onClick={remover}>{processando ? 'Removendo…' : 'Remover conta'}</button></div></> : <form onSubmit={salvar}>
        <fieldset className="acesso-usuario-fields" disabled={processando}><legend className="acesso-sr">{acao.tipo === 'criar' ? 'Dados da conta' : 'Nova senha da conta'}</legend>
          {acao.tipo === 'criar' && <><div className="campo"><label htmlFor="usuario-nome">Nome completo</label><input id="usuario-nome" value={dados.nome} onChange={e => set('nome', e.target.value)} autoComplete="name" placeholder="Nome da pessoa" autoFocus/></div><div className="acesso-usuario-pair"><div className="campo"><label htmlFor="usuario-login">Usuário (login) *</label><input id="usuario-login" required value={dados.usuario} onChange={e => set('usuario', e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Usuário para entrar"/></div><div className="campo"><label htmlFor="usuario-nascimento">Data de nascimento</label><CampoData id="usuario-nascimento" value={dados.data_nascimento} onChange={valor => set('data_nascimento', formatarData(valor))} placeholder="dd/mm/aa" disabled={processando}/></div></div></>}
          <CampoSenha id="usuario-senha" label={acao.tipo === 'senha' ? 'Nova senha *' : 'Senha *'} value={dados.senha} onChange={e => set('senha', e.target.value)} autoComplete="new-password" minLength={12} disabled={processando} hint="Use pelo menos 12 caracteres." autoFocus={acao.tipo === 'senha'}/>
          <CampoSenha id="usuario-confirmacao" label="Confirmar senha *" value={dados.confirmacao} onChange={e => set('confirmacao', e.target.value)} autoComplete="new-password" disabled={processando}/>
          <div className="acesso-senha-requisitos"><span className={dados.senha.length >= 12 ? 'ok' : ''}>{dados.senha.length >= 12 ? '✓' : '○'} 12 ou mais caracteres</span><span className={dados.confirmacao && dados.confirmacao === dados.senha ? 'ok' : ''}>{dados.confirmacao && dados.confirmacao === dados.senha ? '✓' : '○'} Confirmação igual à senha</span></div>
        </fieldset>
        {erroForm && <AvisoInline titulo="Revise os dados">{erroForm}</AvisoInline>}
        <div className="acesso-dialog-actions"><button type="button" className="btn secundario" disabled={processando} onClick={fechar}>Cancelar</button><button type="submit" className="btn" disabled={processando}>{processando ? 'Salvando…' : acao.tipo === 'criar' ? 'Criar usuário' : 'Salvar nova senha'}</button></div>
      </form>}
    </Dialogo>}
  </div>;
}
