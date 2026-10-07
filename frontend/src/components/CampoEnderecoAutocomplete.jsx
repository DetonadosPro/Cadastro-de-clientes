import React, { useEffect, useId, useRef, useState } from 'react';
import { enderecoComNumero, filtrarSugestoesPorNumero, numeroDoEnderecoDigitado, termoDeBuscaEndereco } from '../enderecoAutocomplete.js';

const UF_PADRAO = 'MG';
const CIDADE_PADRAO = 'Uberaba';
const MINIMO_CARACTERES = 3;
const LIMITE_SUGESTOES = 8;

function normalizarSugestoes(resposta) {
  if (!Array.isArray(resposta)) return [];
  const vistos = new Set();
  const sugestoes = [];

  for (const item of resposta) {
    const logradouro = String(item?.logradouro || '').trim();
    const bairro = String(item?.bairro || '').trim();
    if (!logradouro) continue;
    const cep = String(item?.cep || '').trim();
    const complemento = String(item?.complemento || '').trim();
    const chave = `${logradouro.toLocaleLowerCase('pt-BR')}|${bairro.toLocaleLowerCase('pt-BR')}|${cep}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    sugestoes.push({ logradouro, bairro, cep, complemento });
  }

  return sugestoes;
}

export default function CampoEnderecoAutocomplete({ value, numero, onChange, onSelecionar, className = '', id }) {
  const listaId = useId();
  const valorSelecionado = useRef('');
  const valorDigitado = useRef(null);
  const focado = useRef(false);
  const [sugestoes, setSugestoes] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  useEffect(() => {
    const termo = termoDeBuscaEndereco(value);
    if (value !== valorDigitado.current || termo.length < MINIMO_CARACTERES || value === valorSelecionado.current) {
      setSugestoes([]);
      setAberto(false);
      setBuscando(false);
      return undefined;
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(async () => {
      setBuscando(true);
      try {
        const url = `https://viacep.com.br/ws/${UF_PADRAO}/${encodeURIComponent(CIDADE_PADRAO)}/${encodeURIComponent(termo)}/json/`;
        const resposta = await fetch(url, { signal: controlador.signal });
        if (!resposta.ok) throw new Error('Consulta de endereço indisponível.');
        const encontradas = normalizarSugestoes(await resposta.json());
        if (controlador.signal.aborted) return;
        setSugestoes(encontradas);
        setIndiceAtivo(-1);
        setAberto(focado.current && encontradas.length > 0);
      } catch (erro) {
        if (erro.name !== 'AbortError') {
          setSugestoes([]);
          setAberto(false);
        }
      } finally {
        if (!controlador.signal.aborted) setBuscando(false);
      }
    }, 350);

    return () => {
      clearTimeout(temporizador);
      controlador.abort();
    };
  }, [value]);

  const numeroInformado = numero === undefined ? numeroDoEnderecoDigitado(value) : String(numero || '').trim();
  const sugestoesExibidas = filtrarSugestoesPorNumero(sugestoes, numeroInformado).slice(0, LIMITE_SUGESTOES);

  function selecionar(sugestao) {
    const logradouroCompleto = enderecoComNumero(sugestao.logradouro, numeroInformado);
    valorSelecionado.current = numero === undefined ? logradouroCompleto : sugestao.logradouro;
    onSelecionar({ ...sugestao, logradouroCompleto });
    setSugestoes([]);
    setAberto(false);
    setIndiceAtivo(-1);
  }

  function aoDigitar(evento) {
    valorSelecionado.current = '';
    valorDigitado.current = evento.target.value;
    setSugestoes([]);
    setAberto(false);
    onChange(evento.target.value);
  }

  function aoPressionarTecla(evento) {
    if (!aberto || sugestoesExibidas.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setIndiceAtivo((atual) => (atual + 1) % sugestoesExibidas.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndiceAtivo((atual) => (atual <= 0 ? sugestoesExibidas.length - 1 : atual - 1));
    } else if (evento.key === 'Enter' && indiceAtivo >= 0) {
      evento.preventDefault();
      selecionar(sugestoesExibidas[indiceAtivo]);
    } else if (evento.key === 'Escape') {
      setAberto(false);
    }
  }

  return (
    <div className="endereco-autocomplete">
      <input
        id={id}
        aria-label={id ? undefined : 'Endereço'}
        value={value || ''}
        onChange={aoDigitar}
        onKeyDown={aoPressionarTecla}
        onFocus={() => { focado.current = true; if (sugestoes.length > 0) setAberto(true); }}
        onBlur={() => { focado.current = false; setAberto(false); }}
        className={className}
        placeholder="Digite pelo menos 3 letras da rua"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-activedescendant={indiceAtivo >= 0 ? `${listaId}-${indiceAtivo}` : undefined}
      />
      {buscando && <span className="endereco-autocomplete-buscando">Buscando em Uberaba…</span>}
      {aberto && (
        <div className="endereco-autocomplete-lista" id={listaId} role="listbox">
          {sugestoesExibidas.map((sugestao, indice) => (
            <button
              type="button"
              role="option"
              aria-selected={indice === indiceAtivo}
              id={`${listaId}-${indice}`}
              className={indice === indiceAtivo ? 'ativo' : ''}
              key={`${sugestao.logradouro}-${sugestao.bairro}`}
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => selecionar(sugestao)}
            >
              <strong>{enderecoComNumero(sugestao.logradouro, numeroInformado)}</strong>
              <small>{[sugestao.bairro, sugestao.cep, sugestao.complemento].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
          <span className="endereco-autocomplete-fonte">Endereços de Uberaba/MG · ViaCEP</span>
        </div>
      )}
    </div>
  );
}
