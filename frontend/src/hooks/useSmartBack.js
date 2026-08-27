import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Retorna pela pilha real do navegador. `returnTo` e `fallback` só são
// usados quando a tela foi aberta diretamente e não existe entrada anterior.
// O fallback usa replace para não criar um ciclo entre origem e detalhe.
export function useSmartBack(fallback) {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const indice = Number(window.history.state?.idx);
    if (Number.isFinite(indice) && indice > 0) {
      navigate(-1);
      return;
    }

    const retornoInformado = location.state?.returnTo;
    const destino = typeof retornoInformado === 'string' && retornoInformado.startsWith('/')
      ? retornoInformado
      : fallback;
    navigate(destino, { replace: true });
  }, [fallback, location.state, navigate]);
}
