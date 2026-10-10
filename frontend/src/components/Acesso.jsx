import React, { useState } from 'react';
import '../pages/acesso.css';

export function IconeAcesso({ tipo, ...props }) {
  const desenhos = {
    marca: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6M4 17l5-5M20 17l-5-5"/></>,
    chave: <><circle cx="8" cy="9" r="5"/><path d="m12 13 8 8M16 17l3-3M18 19l3-3"/></>,
    olho: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    oculto: <><path d="m3 3 18 18M9 5.5A11 11 0 0 1 12 5c7 0 10 7 10 7a18 18 0 0 1-3 4M6 6A18 18 0 0 0 2 12s3 7 10 7a11 11 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/></>,
    equipe: <><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 3a4 4 0 0 1 0 8M22 21v-2a6 6 0 0 0-4-5"/></>,
    agenda: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M7 15h4M7 18h8"/></>,
    seta: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    sair: <><path d="M10 4H4v16h6M9 12h12m-5-5 5 5-5 5"/></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{desenhos[tipo]}</svg>;
}

export function MarcaAcesso() {
  return <div className="acesso-marca"><span><IconeAcesso tipo="marca"/></span><div><strong>Pombo-Correio</strong><small>Gestão operacional</small></div></div>;
}

export function MolduraAcesso({ children, administracao = false }) {
  return <div className={`acesso-pagina ${administracao ? 'acesso-restrito' : ''}`}><main className="acesso-moldura">
    <section className="acesso-form-area"><MarcaAcesso/>{children}</section>
    <aside className="acesso-hero"><div className="acesso-hero-kicker">{administracao ? 'Acesso da equipe' : 'Sua operação começa aqui'}</div>
      <h2>{administracao ? <>Uma equipe.<br/>Cada pessoa com seu acesso.</> : <>Seu dia,<br/>bem organizado.</>}</h2>
      <p>{administracao ? 'Crie contas, encontre usuários e atualize senhas em um único lugar.' : 'Clientes, mensagens e vendas conectados para você acompanhar cada detalhe da operação.'}</p>
      <div className="acesso-ilustracao" aria-hidden="true"><div className="acesso-envelope"><IconeAcesso tipo="marca"/><span>Pombo-Correio</span></div><div className="acesso-orbita primeira"><IconeAcesso tipo="agenda"/><span>{administracao ? 'Organização' : 'Agenda'}</span></div><div className="acesso-orbita segunda"><IconeAcesso tipo="equipe"/><span>{administracao ? 'Equipe' : 'Clientes'}</span></div><div className="acesso-orbita terceira"><IconeAcesso tipo="chave"/><span>{administracao ? 'Acessos' : 'Sua área'}</span></div></div>
      <div className="acesso-hero-rodape"><span/><p>{administracao ? 'Administração protegida por senha mestra.' : 'Tudo pronto para o próximo atendimento.'}</p></div>
    </aside>
  </main><footer className="acesso-rodape">Pombo-Correio · Gestão que acompanha o seu dia.</footer></div>;
}

export function CampoSenha({ id, label, value, onChange, disabled, autoComplete = 'current-password', minLength, hint, autoFocus = false }) {
  const [mostrar, setMostrar] = useState(false);
  const [caps, setCaps] = useState(false);
  const verificarCaps = e => setCaps(Boolean(e.getModifierState?.('CapsLock')));
  return <div className="campo acesso-campo-senha"><label htmlFor={id}>{label}</label><div className="acesso-input-senha">
    <input id={id} type={mostrar ? 'text' : 'password'} value={value} onChange={onChange} required minLength={minLength} disabled={disabled} autoComplete={autoComplete} autoFocus={autoFocus} autoCapitalize="none" spellCheck={false} onKeyDown={verificarCaps} onKeyUp={verificarCaps} onBlur={() => setCaps(false)} aria-describedby={hint || caps ? `${id}-ajuda` : undefined}/>
    <button type="button" disabled={disabled} aria-label={`${mostrar ? 'Ocultar' : 'Mostrar'} ${label.replace(' *', '').toLocaleLowerCase('pt-BR')}`} aria-pressed={mostrar} onClick={() => setMostrar(v => !v)}><IconeAcesso tipo={mostrar ? 'oculto' : 'olho'}/></button>
  </div>{(hint || caps) && <small id={`${id}-ajuda`} className={caps ? 'acesso-caps' : ''}>{caps ? 'Caps Lock está ativado.' : hint}</small>}</div>;
}
