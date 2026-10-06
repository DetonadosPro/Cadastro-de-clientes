import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Um único retorno temporário: números e identificadores, sem pedidos ou arquivos.
let ultimoRetorno = null;
let validadeRetorno;
function limparRetorno() {
  ultimoRetorno = null;
  clearTimeout(validadeRetorno);
}

export function useRetornoCobranca({ consulta, pronto, lista, expandidos, setExpandidos }) {
  const [salvo, setSalvo] = useState(() => ultimoRetorno?.consulta === consulta ? ultimoRetorno : null);
  const [preparado, setPreparado] = useState(false);
  const [marcado, setMarcado] = useState(null);
  const restaurado = useRef(false);

  useLayoutEffect(() => {
    if (!salvo || restaurado.current || !pronto || salvo.consulta !== consulta) return undefined;
    if (!preparado) {
      lista.mostrarAte(salvo.limite);
      setExpandidos?.(new Set(salvo.expandidos));
      setPreparado(true);
      return undefined;
    }
    if (lista.limite < salvo.limite) return undefined;
    const frame = requestAnimationFrame(() => {
      const conteudo = document.querySelector('.layout-conteudo');
      if (conteudo) conteudo.scrollTop = salvo.topo;
      window.scrollTo({ top: salvo.janela, behavior: 'instant' });
      restaurado.current = true;
      setMarcado({ consulta, item: salvo.item });
      if (ultimoRetorno === salvo) limparRetorno();
      setSalvo(null);
    });
    return () => cancelAnimationFrame(frame);
    // A restauração espera os dados, a paginação e os grupos expandidos renderizarem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta, pronto, preparado, lista.limite, lista.itensVisiveis.length, salvo]);

  useEffect(() => {
    if (!marcado) return undefined;
    const temporizador = setTimeout(() => setMarcado(null), 8000);
    return () => clearTimeout(temporizador);
  }, [marcado]);

  function guardar(item) {
    limparRetorno();
    ultimoRetorno = {
      consulta, item, topo: document.querySelector('.layout-conteudo')?.scrollTop || 0,
      janela: window.scrollY,
      limite: lista.limite, expandidos: Array.from(expandidos || []).slice(0, 200),
    };
    validadeRetorno = setTimeout(limparRetorno, 15 * 60 * 1000);
  }

  return { guardar, itemMarcado: marcado?.consulta === consulta ? marcado.item : null };
}
