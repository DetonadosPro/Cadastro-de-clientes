// src/ToastContext.jsx
//
// Sistema simples de notificação (toast) no rodapé da tela — usado
// para confirmar ações como "Pedido salvo com sucesso".

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const mostrarToast = useCallback((mensagem, tipo = 'sucesso') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast({ mensagem, tipo, chave: Date.now() });
    // Toasts de sucesso (ex: "Pedido salvo") são confirmações rápidas de
    // algo que já deu certo — não precisam ficar tanto tempo na tela.
    // Os demais (erro, avisos) ficam mais tempo, já que costumam pedir
    // mais atenção da pessoa.
    const duracaoMs = tipo === 'sucesso' ? 3500 : 4500;
    timeoutRef.current = setTimeout(() => setToast(null), duracaoMs);
  }, []);

  return (
    <ToastContext.Provider value={{ mostrarToast }}>
      {children}
      {toast && (
        <div className={`toast toast-${toast.tipo}`} key={toast.chave}>
          {toast.mensagem}
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
