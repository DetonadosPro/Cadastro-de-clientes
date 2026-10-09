import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const NOMES_DIA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// Converte "dd/mm/aa" para um objeto Date, ou null se o texto ainda
// estiver incompleto ou for uma data inválida (ex: 31/02).
function textoParaData(texto) {
  const m = String(texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, aa] = m;
  const data = new Date(2000 + parseInt(aa, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  if (data.getDate() !== parseInt(dd, 10) || data.getMonth() !== parseInt(mm, 10) - 1) return null;
  return data;
}

// Converte um objeto Date de volta para "dd/mm/aa" — o mesmo formato
// que a digitação manual (formatarData) já produz.
function dataParaTexto(data) {
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  const aa = String(data.getFullYear()).slice(-2);
  return `${dd}/${mm}/${aa}`;
}

function IconeCalendario() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

// Campo de data com botão de calendário embutido. Digitar continua
// funcionando exatamente como um <input> normal (o formulário decide a
// máscara via onChange, igual antes); clicar no ícone abre um mini
// calendário para escolher o dia sem digitar. As duas formas escrevem
// no mesmo campo de texto, no mesmo formato dd/mm/aa.
//
// O prop opcional `minimo` (objeto Date) impede, no calendário visual,
// selecionar qualquer dia anterior a ele — usado para não deixar
// marcar eventos/cobranças no passado ao criar um pedido novo. Dias
// anteriores ficam acinzentados e não clicáveis; a navegação entre
// meses continua livre para consulta, mas o mês atual nunca fica
// "preso" antes do mínimo.
export default function CampoData({ value, onChange, placeholder, style, disabled, className, minimo, ...resto }) {
  const [aberto, setAberto] = useState(false);
  const [mesVisivel, setMesVisivel] = useState(() => textoParaData(value) || new Date());
  const raizRef = useRef(null);
  const calendarioRef = useRef(null);

  useLayoutEffect(() => {
    if (!aberto) return;
    const raiz = raizRef.current;
    const calendario = calendarioRef.current;
    function posicionar() {
      const origem = raiz.getBoundingClientRect().left + raiz.clientLeft;
      const margem = 12;
      const limite = document.documentElement.clientWidth - calendario.offsetWidth - margem;
      const esquerda = Math.min(Math.max(origem, margem), Math.max(margem, limite));
      calendario.style.left = `${esquerda - origem}px`;
    }
    // Ajusta antes de exibir, preservando o alinhamento com o campo
    // enquanto houver espaço e recuando quando chegar à borda da tela.
    posicionar();
    const observador = new ResizeObserver(posicionar);
    observador.observe(raiz);
    observador.observe(calendario);
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      observador.disconnect();
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e) {
      if (raizRef.current && !raizRef.current.contains(e.target)) setAberto(false);
    }
    function aoTeclarEsc(e) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclarEsc);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclarEsc);
    };
  }, [aberto]);

  function alternarAbertura() {
    if (disabled) return;
    setMesVisivel(textoParaData(value) || new Date());
    setAberto((v) => !v);
  }

  function escolherDia(dia) {
    if (minimo && dia.getTime() < minimo.getTime()) return;
    onChange(dataParaTexto(dia));
    setAberto(false);
  }

  const dataSelecionada = textoParaData(value);
  const primeiroDiaMes = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth(), 1);
  const diasNoMes = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 0).getDate();
  const offsetInicio = primeiroDiaMes.getDay();
  const celulas = [
    ...Array.from({ length: offsetInicio }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return (
    <div ref={raizRef} className={`campo-data-raiz ${disabled ? 'campo-data-desabilitado' : ''} ${className || ''}`} style={style}>
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        {...resto}
      />
      <button
        type="button"
        className="campo-data-botao-icone"
        onClick={alternarAbertura}
        title="Escolher no calendário"
        disabled={disabled}
        aria-label="Escolher no calendário"
      >
        <IconeCalendario />
      </button>

      {aberto && (
        <div ref={calendarioRef} className="calendario-popover">
          <div className="calendario-cabecalho">
            <button type="button" onClick={() => setMesVisivel(new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() - 1, 1))} aria-label="Mês anterior">‹</button>
            <span>{NOMES_MES[mesVisivel.getMonth()]} de {mesVisivel.getFullYear()}</span>
            <button type="button" onClick={() => setMesVisivel(new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 1))} aria-label="Próximo mês">›</button>
          </div>
          <div className="calendario-grade calendario-dias-semana">
            {NOMES_DIA_SEMANA.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="calendario-grade">
            {celulas.map((dia, i) => {
              if (!dia) return <span key={i} />;
              const dataCelula = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth(), dia);
              const ehHoje = dataCelula.getTime() === hoje.getTime();
              const ehSelecionado = dataSelecionada
                && dataCelula.getFullYear() === dataSelecionada.getFullYear()
                && dataCelula.getMonth() === dataSelecionada.getMonth()
                && dataCelula.getDate() === dataSelecionada.getDate();
              const ehDesabilitado = minimo && dataCelula.getTime() < minimo.getTime();
              return (
                <button
                  type="button"
                  key={i}
                  className={`calendario-dia ${ehSelecionado ? 'selecionado' : ''} ${ehHoje && !ehSelecionado ? 'hoje' : ''} ${ehDesabilitado ? 'desabilitado' : ''}`}
                  onClick={() => escolherDia(dataCelula)}
                  disabled={ehDesabilitado}
                >
                  {dia}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
