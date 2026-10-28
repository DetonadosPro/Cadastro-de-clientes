import React, { useEffect, useState } from 'react';

// Uma chave por pedido preserva a marcação mesmo quando o agrupamento muda.
export default function WhatsAppCobranca({ tipo, pedidos, href, nome, children }) {
  const usuario = localStorage.getItem('pombo_usuario') || '';
  const chaves = pedidos.map(p => `pombo_cobranca_whatsapp:${encodeURIComponent(usuario)}:${tipo}:${p.id}`);
  const ler = () => chaves.map(chave => {
    try { return localStorage.getItem(chave); } catch { return null; }
  });
  const [marcas, setMarcas] = useState(ler);
  const [erro, setErro] = useState('');
  const assinatura = JSON.stringify(chaves);
  useEffect(() => {
    const atualizar = () => setMarcas(ler());
    atualizar();
    window.addEventListener('storage', atualizar);
    window.addEventListener('cobranca-whatsapp', atualizar);
    return () => {
      window.removeEventListener('storage', atualizar);
      window.removeEventListener('cobranca-whatsapp', atualizar);
    };
  }, [assinatura]);

  function atualizar(marcar) {
    const data = new Date().toISOString();
    try {
      chaves.forEach(chave => marcar ? localStorage.setItem(chave, data) : localStorage.removeItem(chave));
      setErro('');
    } catch {
      setErro('Não foi possível salvar a marcação neste navegador.');
    }
    setMarcas(ler());
    window.dispatchEvent(new Event('cobranca-whatsapp'));
  }

  const quantidade = marcas.filter(Boolean).length;
  const completo = quantidade === pedidos.length;
  return <div className={`cb-whatsapp-controle${completo ? ' marcado' : ''}`}>
    <div className="cb-whatsapp-linha">
      <a className="btn-small cobranca-whatsapp" href={href} target="_blank" rel="noreferrer" onClick={() => atualizar(true)} aria-label={`Abrir WhatsApp${nome ? ` de ${nome}` : ''}`} title="Abrir WhatsApp e marcar os pedidos">{children}</a>
      {quantidade > 0 && <button type="button" className="cb-whatsapp-desfazer" onClick={() => atualizar(false)} aria-label={`Desfazer marcação do WhatsApp${nome ? ` de ${nome}` : ''}`}>Desfazer</button>}
    </div>
    <small className="cb-whatsapp-status" aria-live="polite" title="Registra a abertura do WhatsApp neste navegador; o envio é concluído no WhatsApp.">{completo ? '✓ WhatsApp aberto' : quantidade ? `${quantidade}/${pedidos.length} já abertos` : 'Ainda não aberto'}</small>
    {erro && <small role="alert">{erro}</small>}
  </div>;
}
