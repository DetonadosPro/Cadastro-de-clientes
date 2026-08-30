// src/ToastContext.jsx
//
// Sistema simples de notificação (toast) no rodapé da tela — usado
// para confirmar ações como "Pedido salvo com sucesso".

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const fecharToast = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setToast(null);
  }, []);

  const mostrarToast = useCallback((mensagem, tipo = 'sucesso') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Toasts de sucesso (ex: "Pedido salvo") são confirmações rápidas de
    // algo que já deu certo — não precisam ficar tanto tempo na tela.
    // Os demais (erro, avisos) ficam mais tempo, já que costumam pedir
    // mais atenção da pessoa.
    const duracaoMs = tipo === 'sucesso' ? 3500 : 4500;
    setToast({ mensagem, tipo, chave: Date.now(), duracaoMs });
    timeoutRef.current = setTimeout(() => setToast(null), duracaoMs);
  }, []);

  const apresentacao = {
    sucesso: { titulo: 'Concluído', icone: '✓' },
    erro: { titulo: 'Não foi possível concluir', icone: '!' },
    aviso: { titulo: 'Atenção', icone: '!' },
    info: { titulo: 'Informação', icone: 'i' },
  };
  const detalhes = toast ? (apresentacao[toast.tipo] || apresentacao.info) : null;

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <ToastContext.Provider value={{ mostrarToast }}>
      {children}
      {toast && (
        <div className="toast-regiao" aria-live="polite" aria-atomic="true">
          <div
            className={`toast toast-${toast.tipo}`}
            key={toast.chave}
            role={toast.tipo === 'erro' ? 'alert' : 'status'}
            style={{ '--toast-duracao': `${toast.duracaoMs}ms` }}
          >
            <span className="toast-icone" aria-hidden="true">{detalhes.icone}</span>
            <span className="toast-conteudo"><strong>{detalhes.titulo}</strong><span>{toast.mensagem}</span></span>
            <button type="button" className="toast-fechar" onClick={fecharToast} aria-label="Fechar notificação">×</button>
            <i className="toast-progresso" aria-hidden="true" />
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de ToastProvider');
  return ctx;
}
