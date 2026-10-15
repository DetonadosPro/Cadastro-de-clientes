import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// A cobrança precisa retornar à consulta explícita, mesmo após navegações
// dentro do pedido. Nas demais origens, preserva a pilha real do navegador.
export function useSmartBack(fallback) {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const retornoInformado = location.state?.returnTo;
    if (typeof retornoInformado === 'string' && /^\/cobranca(?:[?#]|$)/.test(retornoInformado)) {
      navigate(retornoInformado, { replace: true });
      return;
    }
    const indice = Number(window.history.state?.idx);
    if (Number.isFinite(indice) && indice > 0) {
      navigate(-1);
      return;
    }

    const destino = typeof retornoInformado === 'string' && retornoInformado.startsWith('/') && !retornoInformado.startsWith('//')
      ? retornoInformado : fallback;
    navigate(destino, { replace: true });
  }, [fallback, location.state, navigate]);
}
