import React from 'react';
import { BotaoMostrarMais } from '../../components/ListaIncremental.jsx';
import { MESES, mensagensDoPedidoNoMes } from '../../utils/filtroMesMensagens.js';
import { dataPedidoNumero, textoInformado, valorPedido, somarValores, dataCobrancaPedido } from '../../utils/fichaCliente.js';
import { numeroWhatsAppBrasil } from '../../utils/telefoneWhatsApp.js';
import './ficha-cliente.css';

const reais = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Icone({ tipo, ...props }) {
  const linhas = {
    voltar: <path d="M19 12H5m7 7-7-7 7-7" />,
    telefone: <path d="m6 3 3 5-2 2a15 15 0 0 0 7 7l2-2 5 3c-1 5-5 4-8 2C7 17 3 12 3 7c0-2 1-4 3-4Z" />,
    pessoa: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
    dinheiro: <><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M5 12h1m12 0h1" /></>,
    busca: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    seta: <path d="M5 12h14m-5-5 5 5-5 5" />,
    local: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    editar: <><path d="M12 20h9M16 3l5 5L7 22H2v-5Z" /></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{linhas[tipo] || linhas.pessoa}</svg>;
}

function Metrica({ label, valor, detalhe, icone, tom = '', acao }) {
  const Tag = acao ? 'button' : 'div';
  return <Tag className={`fc-metrica ${tom}`} {...(acao ? { type: 'button', onClick: acao } : {})}>
    <span className="fc-metrica-topo">{label}<Icone tipo={icone} /></span><strong>{valor}</strong><small>{detalhe}</small>
  </Tag>;
}

function Badge({ children, tom = 'neutro' }) { return <span className={`fc-badge ${tom}`}>{children}</span>; }

function MensagemEmHaver({ pedido, bloqueado, onAbrir }) {
  return <button type="button" onClick={() => onAbrir('fonada', pedido.id)} disabled={Boolean(bloqueado)} aria-label={`Abrir 2ª mensagem da O.S. ${pedido.senha_os || pedido.id}`}>
    <span><strong>O.S. {pedido.senha_os || pedido.id}</strong><small>Disponível até {pedido.mensagemEmHaver.dataExpiracao || 'data a confirmar'}</small></span><Icone tipo="seta" />
  </button>;
}

function Mensagem({ pedido, numero, mes }) {
  const dia = textoInformado(pedido[`p${numero}_dia`]);
  const passada = textoInformado(pedido[`p${numero}_resultado`]);
  const situacao = pedido.mensagemEmHaver;
  const noMes = mensagensDoPedidoNoMes(pedido, mes).includes(numero);
  let status = passada ? 'Transmitida' : dia ? 'Agendada' : 'Sem data';
  if (numero === 2 && !passada && !dia) status = ({ DISPONIVEL: 'Em haver', EXPIRADA: 'Expirada', NAO_CONCEDIDA: 'Não disponível', INDETERMINADA: 'Verificar data' })[situacao?.status] || status;
  return <div className={`fc-mensagem ${noMes ? 'no-mes' : ''}`}>
    <span className="fc-numero-mensagem">{numero}ª</span>
    <div><strong>{textoInformado(pedido[`p${numero}_para`]) || (numero === 2 ? 'A definir' : 'Não informado')}</strong>
      <small>{dia ? `${dia}${pedido[`p${numero}_horario`] ? ` · ${pedido[`p${numero}_horario`]}` : ''}` : situacao?.dataExpiracao && numero === 2 ? `Prazo: ${situacao.dataExpiracao}` : 'Data não informada'}</small></div>
    <Badge tom={passada ? 'ok' : status === 'Expirada' ? 'neutro' : 'azul'}>{status}</Badge>
  </div>;
}

export default function FichaClienteVisao({ cliente, resumo, pedidosFonada, pedidosAoVivo, historico, acoes, nascimento, whatsappLink }) {
  const { aba, filtros, atualizarFiltro, mudarAba, lista, pedidos, selecionado, abrirPedido } = historico;
  const iniciais = cliente.nome?.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('') || '?';
  const criado = new Date(cliente.criado_em);
  const cadastrado = Number.isNaN(criado.getTime()) ? '' : criado.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const contatoAusente = ![cliente.whatsapp, cliente.celular, cliente.fixo].some(v => numeroWhatsAppBrasil(v));
  const temFiltros = filtros.busca || filtros.pagamento || (aba === 'fonada' && filtros.mes);
  const completar = [contatoAusente && 'um telefone válido', !nascimento && 'o aniversário', !textoInformado(cliente.endereco) && 'o endereço'].filter(Boolean);
  const telefone = cliente.whatsapp && numeroWhatsAppBrasil(cliente.whatsapp) ? cliente.whatsapp : cliente.celular && numeroWhatsAppBrasil(cliente.celular) ? cliente.celular : cliente.fixo;
  return <div className="ficha-renovada form-pagina">
    <header className="fc-hero">
      <div className="fc-identidade"><span className="fc-avatar" aria-hidden="true">{iniciais}</span><div><span className="fc-eyebrow">Ficha do cliente · #{cliente.id}</span><h1>{cliente.nome}</h1>
        <div className="fc-meta"><Badge tom={cliente.bloqueado ? 'perigo' : 'ok'}>{cliente.bloqueado ? 'Cliente bloqueado' : 'Cadastro ativo'}</Badge>{nascimento && <span>Aniversário · {nascimento}</span>}{cadastrado && <span>No sistema desde {cadastrado}</span>}</div>
        <div className="fc-atalhos-contato"><a href="#fc-dados-cliente">Dados e contato</a>{whatsappLink && <a href={whatsappLink} target="_blank" rel="noreferrer">Falar no WhatsApp</a>}</div>
      </div></div>
      <div className="fc-hero-acoes"><button type="button" className="btn" disabled={Boolean(cliente.bloqueado)} onClick={acoes.novaFonada}><Icone tipo="telefone" />Nova fonada</button><button type="button" className="btn btn-tonal" disabled={Boolean(cliente.bloqueado)} onClick={acoes.novoAoVivo}>Novo ao vivo</button><button type="button" className="fc-botao-voltar" onClick={acoes.voltar}><Icone tipo="voltar" />Voltar</button></div>
    </header>
    {cliente.bloqueado && <div className="fc-alerta" role="status"><strong>Atendimento bloqueado</strong><span>{cliente.bloqueio_motivo || 'Desbloqueie o cliente para criar ou editar pedidos.'}</span><button type="button" onClick={acoes.desbloquear}>Desbloquear</button></div>}
    <section className="fc-metricas" aria-label="Resumo do cliente">
      <Metrica label="Total comprado" valor={reais(resumo.totalComprado)} detalhe={`Ticket médio ${reais(resumo.ticketMedio)}`} icone="dinheiro" tom="principal" />
      <Metrica label="Pedidos registrados" valor={resumo.total} detalhe={`${pedidosFonada.length} fonada · ${pedidosAoVivo.length} ao vivo`} icone="pessoa" />
      <Metrica label="A receber" valor={reais(resumo.valorPendente)} detalhe={resumo.pendentes.length ? `${resumo.pendentes.length} pedido(s) sem baixa${resumo.atrasadas.length ? ` · ${resumo.atrasadas.length} em atraso` : ''}` : 'Todos os pedidos recebidos'} icone="dinheiro" tom={resumo.valorPendente > 0 ? 'atencao' : ''} acao={acoes.verCobranca} />
      <Metrica label="Última compra" valor={resumo.ultimoPedido?.data_pedido || 'Sem pedidos'} detalhe={resumo.ultimoPedido ? `${resumo.ultimoPedido.modalidade === 'fonada' ? 'Fonada' : 'Ao vivo'} · O.S. ${resumo.ultimoPedido.senha_os || resumo.ultimoPedido.numero_os || resumo.ultimoPedido.id}` : 'Pronto para o primeiro atendimento'} icone="agenda" />
    </section>
    <div className="fc-workspace">
      <div className="fc-conteudo">
        <section className="fc-atendimento fc-painel" aria-labelledby="fc-atendimento-titulo"><div className="fc-titulo-painel"><div><span className="fc-eyebrow">Agora, no atendimento</span><h2 id="fc-atendimento-titulo">O que precisa de atenção</h2></div><Badge tom={resumo.emHaver.length ? 'azul' : 'ok'}>{resumo.emHaver.length} em haver</Badge></div>
          <div className="fc-atendimento-grade">
            <div className="fc-haver"><h3>Mensagens em haver</h3>{resumo.emHaver.length ? <><p>A próxima a vencer aparece primeiro.</p><div className="fc-haver-itens">{resumo.emHaver.slice(0, 3).map(p => <MensagemEmHaver key={p.id} pedido={p} bloqueado={cliente.bloqueado} onAbrir={abrirPedido} />)}</div>{resumo.emHaver.length > 3 && <details className="fc-haver-mais"><summary>Ver mais {resumo.emHaver.length - 3} mensagem(ns)</summary><div className="fc-haver-itens">{resumo.emHaver.slice(3).map(p => <MensagemEmHaver key={p.id} pedido={p} bloqueado={cliente.bloqueado} onAbrir={abrirPedido} />)}</div></details>}</> : <p className="fc-vazio-curto">Nenhuma mensagem disponível em haver.</p>}</div>
            <div className="fc-agendamentos"><h3>Mensagens e entregas agendadas</h3>{resumo.agendamentos.length ? <ul>{resumo.agendamentos.slice(0, 3).map(p => <li key={`${p.modalidade}-${p.id}-${p.numero || 0}`}><button type="button" onClick={() => abrirPedido(p.modalidade, p.id)}><span><strong>{p.para || 'Destinatário a definir'}</strong><small>{p.modalidade === 'fonada' ? `${p.numero}ª mensagem` : 'Ao vivo'} · O.S. {p.os}</small></span><span className={`fc-agendamento-data ${dataPedidoNumero(p.data) < resumo.hoje ? 'atrasada' : ''}`}>{p.data}<small>{p.naoEntregue ? 'Não entregue' : dataPedidoNumero(p.data) < resumo.hoje ? 'Sem confirmação' : p.horario || 'Horário a definir'}</small></span></button></li>)}</ul> : <p className="fc-vazio-curto">Nenhum agendamento aguardando confirmação.</p>}</div>
          </div>
        </section>
        <section className="fc-historico fc-painel" aria-labelledby="fc-historico-titulo">
          <div className="fc-titulo-painel"><div><span className="fc-eyebrow">Relacionamento</span><h2 id="fc-historico-titulo">Histórico de pedidos</h2></div><span className="fc-historico-total">{resumo.total} no total</span></div>
          <div className="fc-abas" role="group" aria-label="Modalidade dos pedidos">{[['fonada', 'Fonada', pedidosFonada.length], ['aovivo', 'Ao vivo', pedidosAoVivo.length]].map(([tipo, label, total]) => <button type="button" key={tipo} aria-pressed={aba === tipo} onClick={() => mudarAba(tipo)}>{label}<span>{total}</span></button>)}</div>
          <div className="fc-filtros"><label className="fc-busca"><span>Buscar no histórico</span><div><Icone tipo="busca" /><input value={filtros.busca} onChange={e => atualizarFiltro('busca', e.target.value)} placeholder="O.S., destinatário ou data" /></div></label>
            <label><span>Pagamento</span><select aria-label="Pagamento" value={filtros.pagamento} onChange={e => atualizarFiltro('pagamento', e.target.value)}><option value="">Todos</option><option value="pendentes">A receber</option><option value="recebidos">Recebidos</option></select></label>
            {aba === 'fonada' && <label><span>Mês da mensagem</span><select aria-label="Mês da mensagem" value={filtros.mes} onChange={e => atualizarFiltro('mes', e.target.value)}><option value="">Todos os meses</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>}
            <label><span>Ordenar por</span><select aria-label="Ordenar por" value={filtros.ordem} onChange={e => atualizarFiltro('ordem', e.target.value)}><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option><option value="valor">Maior valor</option></select></label>
          </div>
          <div className="fc-resultados" role="status"><span><strong>{pedidos.length}</strong> pedido(s){temFiltros ? ' encontrados' : ''} · {reais(somarValores(pedidos))}</span>{temFiltros && <button type="button" className="fc-link" onClick={historico.limpar}>Limpar filtros</button>}</div>
          {pedidos.length ? <><div className="fc-tabela-scroll"><table className="fc-tabela"><caption className="sr-only">Pedidos de {aba === 'fonada' ? 'Fonada' : 'Ao vivo'} do cliente</caption><thead><tr><th>Pedido / compra</th><th>{aba === 'fonada' ? 'Mensagens' : 'Entrega'}</th><th>Pagamento</th><th>Valor</th></tr></thead><tbody>{lista.itensVisiveis.map(p => <tr key={p.id} data-pedido-id={p.id} className={String(selecionado) === String(p.id) ? 'selecionado' : ''}>
            <td className="fc-pedido"><button type="button" onClick={() => abrirPedido(aba, p.id)} aria-label={`Abrir pedido ${p.senha_os || p.numero_os || p.id}`}><strong>#{p.senha_os || p.numero_os || p.id}</strong><Icone tipo="seta" /></button><small>Compra · {p.data_pedido || 'Não informada'}</small></td>
            <td className="fc-mensagens">{aba === 'fonada' ? <><Mensagem pedido={p} numero={1} mes={filtros.mes} />{(textoInformado(p.p2_para) || textoInformado(p.p2_dia) || textoInformado(p.p2_resultado) || p.mensagemEmHaver?.concedida) && <Mensagem pedido={p} numero={2} mes={filtros.mes} />}</> : <div className="fc-entrega"><strong>{p.para || 'Não informado'}</strong><small>{p.dia_entrega || 'Data não informada'}{p.horario_entrega && ` · ${p.horario_entrega}`}</small><Badge tom={String(p.resultado_entrega || '').startsWith('ENTREGUE') ? 'ok' : 'azul'}>{p.resultado_entrega ? String(p.resultado_entrega).startsWith('ENTREGUE') ? 'Entregue' : 'Não entregue' : p.dia_entrega ? 'Agendado' : 'Sem data'}</Badge></div>}</td>
            <td className="fc-pagamento"><Badge tom={p.pagou === 'SIM' ? 'ok' : 'aviso'}>{p.pagou === 'SIM' ? 'Recebido' : 'A receber'}</Badge><small>{textoInformado(aba === 'fonada' ? p.periodo : p.pagamento) || 'Forma não informada'}</small>{p.pagou !== 'SIM' && dataPedidoNumero(dataCobrancaPedido(p, aba)) != null && <small>Cobrança · {dataCobrancaPedido(p, aba)}</small>}</td><td className="fc-valor"><strong>{reais(valorPedido(p))}</strong></td>
          </tr>)}</tbody></table></div><BotaoMostrarMais temMais={lista.temMais} restantes={lista.restantes} onClick={lista.mostrarMais} /></> : <div className="fc-estado-vazio"><Icone tipo="agenda" /><h3>{temFiltros ? 'Nenhum pedido com esses filtros' : 'O histórico começa aqui'}</h3><p>{temFiltros ? 'Tente outra busca ou veja todos os pedidos desta modalidade.' : `Este cliente ainda não tem pedidos de ${aba === 'fonada' ? 'Fonada' : 'Ao vivo'}.`}</p><button type="button" className="btn secundario" onClick={temFiltros ? historico.limpar : aba === 'fonada' ? acoes.novaFonada : acoes.novoAoVivo} disabled={!temFiltros && Boolean(cliente.bloqueado)}>{temFiltros ? 'Ver todos os pedidos' : 'Criar primeiro pedido'}</button></div>}
        </section>
      </div>
      <aside className="fc-lateral" aria-label="Dados e contatos do cliente">
        <section className="fc-painel fc-contatos" id="fc-dados-cliente"><div className="fc-titulo-painel"><h2>Dados do cliente</h2><button type="button" className="fc-link" onClick={acoes.editar}><Icone tipo="editar" />Editar</button></div>
          <h3><Icone tipo="telefone" />Contato</h3><dl className="fc-dados">{[['WhatsApp', cliente.whatsapp], ['Celular', cliente.celular], ['Telefone fixo', cliente.fixo]].map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{numeroWhatsAppBrasil(v) ? <a href={`tel:+${numeroWhatsAppBrasil(v)}`}>{v}</a> : textoInformado(v) || <span className="fc-nao-informado">Não informado</span>}</dd></div>)}<div><dt>Nascimento</dt><dd>{nascimento || <span className="fc-nao-informado">Não informado</span>}</dd></div></dl>
          <div className="fc-contato-acoes">{whatsappLink && <a href={whatsappLink} target="_blank" rel="noreferrer" className="fc-whatsapp"><Icone tipo="telefone" />Abrir WhatsApp</a>}{numeroWhatsAppBrasil(telefone) && <button type="button" className="fc-copiar" onClick={() => acoes.copiarContato(telefone)}>Copiar telefone</button>}</div>
          <div className="fc-endereco"><h3><Icone tipo="local" />Endereço e referência</h3><dl className="fc-dados">{[['Endereço', cliente.endereco], ['Bairro', cliente.bairro], ['Complemento', cliente.complemento], ['Referência', cliente.referencia]].map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{textoInformado(v) || <span className="fc-nao-informado">Não informado</span>}</dd></div>)}</dl></div>
          {completar.length > 0 && <div className="fc-completar"><strong>Deixe a ficha mais completa</strong><p>Falta informar {completar.join(', ')}.</p><button type="button" className="fc-link" onClick={acoes.editar}>Completar cadastro <Icone tipo="seta" /></button></div>}
        </section>
        <section className="fc-painel fc-cobranca"><h2>Cobrança</h2>{resumo.atrasadas.length > 0 && <p className="fc-cobranca-atrasada">{resumo.atrasadas.length} cobrança(s) com data em atraso.</p>}<span>Próxima cobrança não recebida</span><strong>{resumo.proximaCobranca?.dataCobranca || 'Sem data futura'}</strong><p>{resumo.proximaCobranca ? `O.S. ${resumo.proximaCobranca.senha_os || resumo.proximaCobranca.numero_os || resumo.proximaCobranca.id} · ${reais(valorPedido(resumo.proximaCobranca))}` : resumo.pendentes.length ? 'Há pedidos sem baixa. Confira a cobrança para acompanhar.' : 'Nenhum pagamento pendente.'}</p><button type="button" className="btn secundario" onClick={acoes.verCobranca}>Ver cobrança <Icone tipo="seta" /></button></section>
        <details className="fc-gerenciar fc-painel"><summary>Gerenciar cliente</summary><p>Bloqueio e envio para a lixeira.</p><div>{cliente.bloqueado ? <button type="button" className="btn-small" onClick={acoes.desbloquear}>Desbloquear</button> : <button type="button" className="btn-small" onClick={acoes.bloquear}>Bloquear</button>}<button type="button" className="btn-small perigo" onClick={acoes.excluir}>Excluir</button></div></details>
      </aside>
    </div>
  </div>;
}
