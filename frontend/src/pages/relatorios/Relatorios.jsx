import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { formatarData } from '../../mascaras.js';
import CampoData from '../../components/CampoData.jsx';
import { BotaoMostrarMais, useListaIncremental } from '../../components/ListaIncremental.jsx';
import {
  GraficoBarrasCategorias,
  GraficoEvolucaoVendas,
  GraficoQuantidadeTicket,
  GraficoRankingEquipe,
  GraficoVendasPorSistema,
  GraficoVendidoRecebido,
} from './GraficosRelatorio.jsx';

export default function Relatorios() {
  // Aba e filtro de sistema ficam na URL — assim, ao abrir um pedido a
  // partir de algum resultado e depois voltar, a tela é restaurada na
  // mesma aba/filtro em que a pessoa estava, em vez de resetar.
  const [searchParams, setSearchParams] = useSearchParams();
  const aba = searchParams.get('aba') || 'vendas';
  const sistema = searchParams.get('sistema') || 'TODOS';
  const intervalo = useIntervaloData(searchParams, setSearchParams);

  function irParaAba(novaAba) {
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('aba', novaAba);
      return novo;
    }, { replace: true });
  }

  function mudarSistema(novoSistema) {
    setSearchParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.set('sistema', novoSistema);
      return novo;
    }, { replace: true });
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 2 }}>Relatórios</h1>
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)', margin: 0 }}>
          Valores por período — vendas realizadas e pagamentos recebidos
        </p>
      </div>

      <div className="section-box secao-relatorios">
        <div className="abas-cliente abas-relatorio">
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'vendas' ? 'ativa' : ''}`}
            onClick={() => irParaAba('vendas')}
          >
            Vendas
          </button>
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'recebimentos' ? 'ativa' : ''}`}
            onClick={() => irParaAba('recebimentos')}
          >
            Recebimentos
          </button>
          <button
            type="button"
            className={`aba-cliente-botao ${aba === 'desempenho' ? 'ativa' : ''}`}
            onClick={() => irParaAba('desempenho')}
          >
            Desempenho
          </button>
          <div className="filtro-sistema-relatorio">
            <select value={sistema} onChange={(e) => mudarSistema(e.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="FONADA">Fonada</option>
              <option value="AOVIVO">Ao vivo</option>
            </select>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {/* Ambas as abas ficam sempre montadas (só uma é exibida por vez).
              Isso preserva período, dados buscados e estado de cada uma ao
              navegar entre elas, em vez de resetar tudo a cada troca. */}
          <div style={{ display: aba === 'vendas' ? 'block' : 'none' }}>
            <AbaVendas sistema={sistema} intervalo={intervalo} ativa={aba === 'vendas'} />
          </div>
          <div style={{ display: aba === 'recebimentos' ? 'block' : 'none' }}>
            <AbaRecebimentos sistema={sistema} intervalo={intervalo} ativa={aba === 'recebimentos'} />
          </div>
          <div style={{ display: aba === 'desempenho' ? 'block' : 'none' }}>
            <AbaDesempenho sistema={sistema} intervalo={intervalo} ativa={aba === 'desempenho'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function useIntervaloData(searchParams, setSearchParams) {
  const inicio = searchParams.get('inicio') || '';
  const fim = searchParams.get('fim') || '';
  function definir(campo, valor) {
    const formatado = formatarData(valor);
    setSearchParams((atuais) => {
      const novos = new URLSearchParams(atuais);
      if (formatado) novos.set(campo, formatado);
      else novos.delete(campo);
      return novos;
    }, { replace: true });
  }
  return {
    inicio, fim,
    setInicio: (v) => definir('inicio', v),
    setFim: (v) => definir('fim', v),
    setIntervalo: (novoInicio, novoFim) => {
      const inicioFormatado = formatarData(novoInicio);
      const fimFormatado = formatarData(novoFim);
      setSearchParams((atuais) => {
        const novos = new URLSearchParams(atuais);
        if (inicioFormatado) novos.set('inicio', inicioFormatado);
        else novos.delete('inicio');
        if (fimFormatado) novos.set('fim', fimFormatado);
        else novos.delete('fim');
        return novos;
      }, { replace: true });
    },
  };
}

function formatarReais(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataCompleta(valor) {
  const partes = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!partes) return false;
  const [, dia, mes, ano] = partes.map(Number);
  const data = new Date(2000 + ano, mes - 1, dia);
  return data.getFullYear() === 2000 + ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

function inicioDepoisDoFim(inicio, fim) {
  if (!dataCompleta(inicio) || !dataCompleta(fim)) return false;
  const chave = (valor) => {
    const [dia, mes, ano] = valor.split('/');
    return `${ano}${mes}${dia}`;
  };
  return chave(inicio) > chave(fim);
}

// Compatibilidade com um backend que ainda esteja terminando de reiniciar
// após o deploy. As séries oficiais vêm em `graficos` e consideram todos os
// registros; enquanto esse campo não existe, usamos os itens do relatório
// para que o card não apareça vazio sem necessidade.
function serieDosItens(itens = []) {
  const mapa = new Map();
  for (const item of itens) {
    if (!item.data) continue;
    const atual = mapa.get(item.data) || { data: item.data, valor: 0, quantidade: 0, fonada: 0, aoVivo: 0 };
    const valor = Number(item.valor || 0);
    atual.valor += valor;
    atual.quantidade += 1;
    if (item.sistema === 'FONADA') atual.fonada += valor;
    if (item.sistema === 'AOVIVO') atual.aoVivo += valor;
    mapa.set(item.data, atual);
  }
  const chaveData = (data) => String(data).split('/').reverse().join('');
  return [...mapa.values()].sort((a, b) => chaveData(a.data).localeCompare(chaveData(b.data)));
}

function formasDosItens(itens = []) {
  const mapa = new Map();
  for (const item of itens) {
    const categoria = String(item.forma || 'NÃO INFORMADO').trim().toUpperCase();
    const atual = mapa.get(categoria) || { categoria, valor: 0, quantidade: 0 };
    atual.valor += Number(item.valor || 0);
    atual.quantidade += 1;
    mapa.set(categoria, atual);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

function graficosVendas(dados) {
  const fallback = serieDosItens(dados?.itens);
  return {
    vendasPorDia: dados?.graficos?.vendasPorDia?.length ? dados.graficos.vendasPorDia : fallback,
    periodoAnterior: dados?.graficos?.periodoAnterior || [],
  };
}

function graficosRecebimentos(dados) {
  const fallback = serieDosItens(dados?.itens);
  return {
    vendidoPorDia: dados?.graficos?.vendidoPorDia || [],
    recebidoPorDia: dados?.graficos?.recebidoPorDia?.length ? dados.graficos.recebidoPorDia : fallback,
    recebimentosPorForma: dados?.graficos?.recebimentosPorForma?.length
      ? dados.graficos.recebimentosPorForma
      : formasDosItens(dados?.itens),
  };
}

function AbaVendas({ sistema, intervalo, ativa }) {
  const { inicio, fim, setInicio, setFim, setIntervalo } = intervalo;
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [jaBuscou, setJaBuscou] = useState(false);
  const series = graficosVendas(dados);

  async function buscar(e, sistemaAtual = sistema) {
    if (e) e.preventDefault();
    if (!inicio) {
      setErro('Informe pelo menos a data inicial.');
      return;
    }
    setCarregando(true);
    setErro('');
    setJaBuscou(true);
    try {
      const resp = await api.relatorios.vendas(inicio, fim, sistemaAtual);
      setDados(resp);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    if (!ativa || !dataCompleta(inicio) || (fim && !dataCompleta(fim))) return undefined;
    if (fim && inicioDepoisDoFim(inicio, fim)) {
      setErro('A data inicial não pode ser posterior à data final.');
      setDados(null);
      setJaBuscou(true);
      return undefined;
    }
    const temporizador = setTimeout(() => buscar(null, sistema), 300);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, sistema, ativa]);

  return (
    <div>
      <FormularioPeriodo
        inicio={inicio} fim={fim} setInicio={setInicio} setFim={setFim} setIntervalo={setIntervalo}
      />

      {erro && <p className="fs-sm" style={{ color: 'var(--selo)' }}>{erro}</p>}

      {!jaBuscou ? (
        <EstadoVazio texto="Preencha o período para visualizar o relatório." />
      ) : carregando ? (
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : dados && (
        <>
          <div className="grade grade-relatorio grade-3 resumo-principal-relatorio">
            <CartaoValor label="Vendido no período" valor={formatarReais(dados.geral.valorTotal)} destaque />
            <CartaoValor label="Pedidos" valor={dados.geral.quantidade} />
            <CartaoValor label="Ticket médio" valor={formatarReais(dados.geral.ticketMedio)} />
          </div>
          <ComparacaoPeriodo dados={dados.comparacao} metrica="Vendas" />
          <div className="grade-graficos-relatorio">
            <GraficoEvolucaoVendas atual={series.vendasPorDia} anterior={series.periodoAnterior} />
            <GraficoVendasPorSistema dados={series.vendasPorDia} />
          </div>

          {dados.fonada && (
            <BlocoSistema titulo="Fonada" cor="azul">
              <div className="grade grade-relatorio grade-4">
                <CartaoValor label="Total de pedidos" valor={dados.fonada.quantidade} />
                <CartaoValor label="PIX" valor={dados.fonada.totalPix} sub={`${dados.fonada.percentualPix}%`} />
                <CartaoValor label="Outros" valor={dados.fonada.totalRecibo} sub={`${dados.fonada.percentualRecibo}%`} />
                <CartaoValor label="Valor total" valor={formatarReais(dados.fonada.valorTotal)} />
              </div>
              <div className="grade grade-relatorio grade-3" style={{ marginTop: 10 }}>
                <CartaoValor label="Recall" valor={dados.fonada.totalRecall} sub={`${dados.fonada.percentualRecall}%`} />
                <CartaoValor label="Clientes" valor={dados.fonada.totalOutros} sub={`${dados.fonada.percentualOutros}%`} />
                <CartaoValor label="Ticket médio" valor={formatarReais(dados.fonada.ticketMedio)} />
              </div>
            </BlocoSistema>
          )}

          {dados.aoVivo && (
            <BlocoSistema titulo="Ao vivo" cor="vermelho">
              <div className="grade grade-relatorio grade-2">
                <CartaoValor label="Total de pedidos" valor={dados.aoVivo.quantidade} />
                <CartaoValor label="Valor total" valor={formatarReais(dados.aoVivo.valorTotal)} />
              </div>
              <div className="grade grade-relatorio grade-2" style={{ marginTop: 10 }}>
                <CartaoValor label="Ticket médio" valor={formatarReais(dados.aoVivo.ticketMedio)} />
              </div>
            </BlocoSistema>
          )}

          <TabelaDetalhada itens={dados.itens || []} tituloColunaValor="Venda" limitado={dados.itensLimitados} />
        </>
      )}
    </div>
  );
}

function AbaRecebimentos({ sistema, intervalo, ativa }) {
  const { inicio, fim, setInicio, setFim, setIntervalo } = intervalo;
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [jaBuscou, setJaBuscou] = useState(false);
  const series = graficosRecebimentos(dados);

  async function buscar(e, sistemaAtual = sistema) {
    if (e) e.preventDefault();
    if (!inicio) {
      setErro('Informe pelo menos a data inicial.');
      return;
    }
    setCarregando(true);
    setErro('');
    setJaBuscou(true);
    try {
      const resp = await api.relatorios.recebimentos(inicio, fim, sistemaAtual);
      setDados(resp);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    if (!ativa || !dataCompleta(inicio) || (fim && !dataCompleta(fim))) return undefined;
    if (fim && inicioDepoisDoFim(inicio, fim)) {
      setErro('A data inicial não pode ser posterior à data final.');
      setDados(null);
      setJaBuscou(true);
      return undefined;
    }
    const temporizador = setTimeout(() => buscar(null, sistema), 300);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, sistema, ativa]);

  return (
    <div>
      <FormularioPeriodo
        inicio={inicio} fim={fim} setInicio={setInicio} setFim={setFim} setIntervalo={setIntervalo}
      />

      {erro && <p className="fs-sm" style={{ color: 'var(--selo)' }}>{erro}</p>}

      {!jaBuscou ? (
        <EstadoVazio texto="Preencha o período para visualizar o relatório." />
      ) : carregando ? (
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : dados && (
        <>
          <div className="grade grade-relatorio grade-3 resumo-principal-relatorio">
            <CartaoValor label="Recebido no período" valor={formatarReais(dados.valorTotal)} sub={`${dados.quantidade} registro(s)`} destaque />
            <CartaoValor label="Vendido no período" valor={formatarReais(dados.valorVendido)} sub="Pedidos criados nessas datas" />
            <CartaoValor label="Ainda a receber" valor={formatarReais(dados.valorAReceberVendasPeriodo)} sub="Dos pedidos vendidos nessas datas" />
          </div>
          <ComparacaoPeriodo dados={dados.comparacao} metrica="Recebimentos" />
          <div className="grade-graficos-relatorio grade-graficos-recebimentos">
            <GraficoVendidoRecebido vendido={series.vendidoPorDia} recebido={series.recebidoPorDia} />
            <GraficoBarrasCategorias
              titulo="Formas de recebimento"
              subtitulo="Valor efetivamente recebido em cada forma"
              dados={series.recebimentosPorForma}
            />
          </div>

          {dados.fonada && (
            <BlocoSistema titulo="Fonada" cor="azul">
              <div className="grade grade-relatorio grade-4">
                <CartaoValor label="Total de pedidos" valor={dados.fonada.quantidade} />
                <CartaoValor label="PIX" valor={dados.fonada.totalPix} sub={`${dados.fonada.percentualPix}%`} />
                <CartaoValor label="Outros" valor={dados.fonada.totalRecibo} sub={`${dados.fonada.percentualRecibo}%`} />
                <CartaoValor label="Valor total" valor={formatarReais(dados.fonada.valorTotal)} />
              </div>
            </BlocoSistema>
          )}

          {dados.aoVivo && (
            <BlocoSistema titulo="Ao vivo" cor="vermelho">
              <div className="grade grade-relatorio grade-2">
                <CartaoValor label="Total de pedidos" valor={dados.aoVivo.quantidade} />
                <CartaoValor label="Valor total" valor={formatarReais(dados.aoVivo.valorTotal)} />
              </div>
              <div className="grade grade-relatorio grade-2" style={{ marginTop: 10 }}>
                <CartaoValor label="Na entrega" valor={formatarReais(dados.aoVivo.valorAVista)} sub={`${dados.aoVivo.quantidadeAVista} pedido(s)`} />
                <CartaoValor label="A prazo recebido" valor={formatarReais(dados.aoVivo.valorPrazo)} sub={`${dados.aoVivo.quantidadePrazo} pedido(s)`} />
              </div>
            </BlocoSistema>
          )}

          <TabelaDetalhada itens={dados.itens || []} tituloColunaValor="Recebido" limitado={dados.itensLimitados} />
        </>
      )}
    </div>
  );
}

function AbaDesempenho({ sistema, intervalo, ativa }) {
  const { inicio, fim, setInicio, setFim, setIntervalo } = intervalo;
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [jaBuscou, setJaBuscou] = useState(false);

  async function buscar(e, sistemaAtual = sistema) {
    if (e) e.preventDefault();
    if (!inicio) {
      setErro('Informe pelo menos a data inicial.');
      return;
    }
    setCarregando(true);
    setErro('');
    setJaBuscou(true);
    try {
      const resp = await api.relatorios.desempenho(inicio, fim, sistemaAtual);
      setDados(resp);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    if (!ativa || !dataCompleta(inicio) || (fim && !dataCompleta(fim))) return undefined;
    if (fim && inicioDepoisDoFim(inicio, fim)) {
      setErro('A data inicial não pode ser posterior à data final.');
      setDados(null);
      setJaBuscou(true);
      return undefined;
    }
    const temporizador = setTimeout(() => buscar(null, sistema), 300);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, sistema, ativa]);

  return (
    <div>
      <FormularioPeriodo
        inicio={inicio} fim={fim} setInicio={setInicio} setFim={setFim} setIntervalo={setIntervalo}
      />

      {erro && <p className="fs-sm" style={{ color: 'var(--selo)' }}>{erro}</p>}

      {!jaBuscou ? (
        <EstadoVazio texto="Preencha o período para visualizar o relatório." />
      ) : carregando ? (
        <p className="fs-sm" style={{ color: 'var(--tinta-suave)' }}>Carregando...</p>
      ) : dados && (
        <>
          <ComparacaoPeriodo dados={dados.comparacao} metrica="Vendas da equipe" />
          <div className="grade-graficos-relatorio">
            <GraficoRankingEquipe funcionarios={dados.funcionarios} />
            <GraficoQuantidadeTicket funcionarios={dados.funcionarios} />
          </div>
          {dados.funcionarios.length === 0 ? (
          <div className="painel" style={{ marginTop: 16, textAlign: 'center', color: 'var(--tinta-suave)' }}>
            Nenhuma venda com vendedor registrado nesse período. Pedidos antigos, de antes desse
            registro existir, não aparecem aqui.
          </div>
        ) : (
          <TabelaDesempenho funcionarios={dados.funcionarios} valorEquipe={dados.valorEquipe} />
          )}
        </>
      )}
    </div>
  );
}

function TabelaDesempenho({ funcionarios, valorEquipe }) {
  const lista = useListaIncremental(funcionarios, funcionarios.map((f) => f.usuario).join('|'));
  return (
    <div className="painel tabela-desempenho-wrap">
      <div className="cabecalho-desempenho">
        <div>
          <strong>Comparativo da equipe</strong>
          <div className="fs-xs" style={{ color: 'var(--tinta-suave)' }}>Vendas registradas por funcionário no período</div>
        </div>
        <strong>{formatarReais(valorEquipe)}</strong>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tabela-lista tabela-desempenho">
          <thead><tr>
            <th>Funcionário</th><th>Vendas</th><th>Valor</th><th>Ticket médio</th>
            <th>Participação</th><th>Fonadas vendidas</th><th>Ao vivo vendidos</th>
          </tr></thead>
          <tbody>
            {lista.itensVisiveis.map((f) => (
              <tr key={f.usuario}>
                <td data-label="Funcionário"><strong>{f.usuario}</strong></td>
                <td data-label="Vendas"><strong>{f.vendasTotal}</strong></td>
                <td data-label="Valor" className="valor-tabela">{formatarReais(f.valorVendidoTotal)}</td>
                <td data-label="Ticket médio">{formatarReais(f.ticketMedio)}</td>
                <td data-label="Participação"><strong>{f.participacaoPercentual}%</strong></td>
                <td data-label="Fonadas vendidas">{f.vendasFonada}</td>
                <td data-label="Ao vivo vendidos">{f.vendasAoVivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BotaoMostrarMais temMais={lista.temMais} restantes={lista.restantes} onClick={lista.mostrarMais} />
    </div>
  );
}

function FormularioPeriodo({ inicio, fim, setInicio, setFim, setIntervalo }) {
  function aplicarAtalho(tipo) {
    const hoje = new Date();
    let primeiro = new Date(hoje);
    let ultimo = new Date(hoje);
    if (tipo === 'ontem') {
      primeiro.setDate(hoje.getDate() - 1);
      ultimo = new Date(primeiro);
    } else if (tipo === 'semana') {
      const dia = hoje.getDay() || 7;
      primeiro.setDate(hoje.getDate() - dia + 1);
    } else if (tipo === 'mes') {
      primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    } else if (tipo === 'mes-anterior') {
      primeiro = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      ultimo = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    }
    const paraCampo = (data) => {
      const dd = String(data.getDate()).padStart(2, '0');
      const mm = String(data.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${String(data.getFullYear()).slice(-2)}`;
    };
    setIntervalo(paraCampo(primeiro), paraCampo(ultimo));
  }

  return (
    <div className="form-periodo-relatorio-wrap">
      <div className="atalhos-periodo">
        <span className="fs-xs texto-suave">Período rápido</span>
        <button type="button" onClick={() => aplicarAtalho('hoje')}>Hoje</button>
        <button type="button" onClick={() => aplicarAtalho('ontem')}>Ontem</button>
        <button type="button" onClick={() => aplicarAtalho('semana')}>Esta semana</button>
        <button type="button" onClick={() => aplicarAtalho('mes')}>Este mês</button>
        <button type="button" onClick={() => aplicarAtalho('mes-anterior')}>Mês anterior</button>
      </div>
      <div className="form-periodo-relatorio">
        <div className="campo">
          <label>Data inicial</label>
          <CampoData placeholder="dd/mm/aa" value={inicio} onChange={setInicio} />
        </div>
        <div className="campo">
          <label>Data final</label>
          <CampoData placeholder="dd/mm/aa" value={fim} onChange={setFim} />
        </div>
      </div>
    </div>
  );
}

function BlocoSistema({ titulo, cor, children }) {
  return (
    <div className={`bloco-sistema bloco-sistema-${cor}`}>
      <div className="bloco-sistema-titulo">{titulo}</div>
      {children}
    </div>
  );
}

function EstadoVazio({ texto }) {
  return (
    <p className="fs-sm" style={{ color: 'var(--tinta-suave)', textAlign: 'center', padding: '28px 0' }}>
      {texto}
    </p>
  );
}

function CartaoValor({ label, valor, sub, destaque }) {
  return (
    <div className={`cartao-valor ${destaque ? 'destaque' : ''}`}>
      <div className="cartao-valor-label">{label}</div>
      <div className="cartao-valor-numero">{valor}</div>
      {sub && <div className="fs-xs" style={{ marginTop: 4, opacity: 0.8 }}>{sub}</div>}
    </div>
  );
}

function ComparacaoPeriodo({ dados, metrica }) {
  if (!dados) return null;
  const classe = dados.direcao === 'ALTA' ? 'alta' : dados.direcao === 'QUEDA' ? 'queda' : 'estavel';
  const titulo = dados.direcao === 'ALTA' ? 'Evolução' : dados.direcao === 'QUEDA' ? 'Queda' : 'Estável';
  const simbolo = dados.direcao === 'ALTA' ? '↑' : dados.direcao === 'QUEDA' ? '↓' : '→';
  const diferenca = Math.abs(dados.diferenca || 0);

  return (
    <div className={`comparacao-periodo ${classe}`}>
      <div>
        <div className="comparacao-periodo-titulo">{metrica}: {titulo}</div>
        <div className="fs-xs texto-suave">
          Período anterior: {dados.inicio} a {dados.fim} · {formatarReais(dados.valorAnterior)}
        </div>
      </div>
      <div className="comparacao-periodo-resultado">
        <strong>{simbolo} {dados.percentual == null ? 'Sem base anterior' : `${Math.abs(dados.percentual)}%`}</strong>
        <span>{formatarReais(diferenca)} {dados.direcao === 'QUEDA' ? 'a menos' : dados.direcao === 'ALTA' ? 'a mais' : 'de diferença'}</span>
      </div>
    </div>
  );
}

// Tabela com um pedido por linha (comprador, O.S., forma, valor).
// Clicar na linha abre o pedido, igual às listas de Fonada/Ao Vivo.
function TabelaDetalhada({ itens, tituloColunaValor, limitado }) {
  const navigate = useNavigate();
  const lista = useListaIncremental(itens, `${tituloColunaValor}:${itens[0]?.data || ''}:${itens.length}`);

  if (itens.length === 0) {
    return (
      <div className="painel" style={{ marginTop: 16, textAlign: 'center', color: 'var(--tinta-suave)' }}>
        Nenhum pedido nesse período.
      </div>
    );
  }

  return (
    <div className="painel" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
      <div className="cabecalho-lista-relatorio">
        <strong>Pedidos do período</strong>
        <span className="fs-xs texto-suave">{limitado ? 'Exibindo os primeiros 200 registros' : `${itens.length} registro(s)`}</span>
      </div>
      <div className="lista-relatorio-scroll">
        <table className="tabela-lista">
          <thead>
            <tr>
              <th>Data</th>
              <th>O.S.</th>
              <th>Comprador</th>
              <th>Sistema</th>
              <th>Forma</th>
              <th>{tituloColunaValor}</th>
              <th>Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {lista.itensVisiveis.map((item) => (
              <tr
                key={`${item.sistema}-${item.id}`}
                onClick={() => navigate(item.sistema === 'FONADA' ? `/fonada/${item.id}` : `/ao-vivo/${item.id}`)}
              >
                <td data-label="Data">{item.data || '—'}</td>
                <td data-label="O.S.">
                  <span className="carimbo-os carimbo-os-lista">{item.os}</span>
                </td>
                <td data-label="Comprador">{item.nome}</td>
                <td data-label="Sistema">{item.sistema === 'FONADA' ? 'Fonada' : 'Ao vivo'}</td>
                <td data-label="Forma">{item.forma}</td>
                <td data-label={tituloColunaValor} style={{ fontFamily: 'var(--fonte-mono)', fontWeight: 700 }}>
                  {formatarReais(item.valor)}
                </td>
                <td data-label="Pagamento">
                  <span className={`tag ${String(item.statusPagamento || '').trim().toUpperCase() === 'SIM' ? 'ok' : 'pendente'}`}>
                    {String(item.statusPagamento || '').trim().toUpperCase() === 'SIM' ? 'Pago' : 'Pendente'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BotaoMostrarMais temMais={lista.temMais} restantes={lista.restantes} onClick={lista.mostrarMais} />
    </div>
  );
}
