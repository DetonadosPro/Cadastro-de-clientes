const express = require('express');
const { db } = require('../db/database');
const { normalizarTexto, ehTemaAniversario, chavePessoa, nomePessoaValido, dataBrParaIso } = require('../utils/recall');
const { hojeIsoBrasilia } = require('../utils/dataHora');

const router = express.Router();
const STATUS = new Set(['PENDENTE', 'NAO_ATENDEU', 'RETORNAR', 'SEM_INTERESSE', 'INTERESSADO', 'PEDIDO_CRIADO']);

function sqlMensagens(filtro1, filtro2) {
  return `
    SELECT f.id pedido_id, f.cliente_id, f.senha_os, f.nome_comprador cliente_nome, COALESCE(c.bloqueado,FALSE) cliente_bloqueado,
      COALESCE(NULLIF(c.whatsapp,''), NULLIF(c.celular,''), NULLIF(c.fixo,''), NULLIF(f.comprador_whatsapp,''), NULLIF(f.comprador_celular,''), f.comprador_fixo) telefone,
      f.p1_para aniversariante, EXISTS(SELECT 1 FROM clientes d WHERE d.excluido_em IS NULL AND d.bloqueado=TRUE AND LOWER(TRIM(d.nome))=LOWER(TRIM(f.p1_para))) aniversariante_bloqueado,
      f.p1_tema tema, f.p1_mensagem mensagem_texto, f.p1_dia dia_mensagem, 1 numero_mensagem
    FROM fonadas f LEFT JOIN clientes c ON c.id=f.cliente_id
    WHERE f.excluido_em IS NULL AND COALESCE(f.p1_para,'')<>'' AND ${filtro1}
    UNION ALL
    SELECT f.id, f.cliente_id, f.senha_os, f.nome_comprador, COALESCE(c.bloqueado,FALSE),
      COALESCE(NULLIF(c.whatsapp,''), NULLIF(c.celular,''), NULLIF(c.fixo,''), NULLIF(f.comprador_whatsapp,''), NULLIF(f.comprador_celular,''), f.comprador_fixo),
      f.p2_para, EXISTS(SELECT 1 FROM clientes d WHERE d.excluido_em IS NULL AND d.bloqueado=TRUE AND LOWER(TRIM(d.nome))=LOWER(TRIM(f.p2_para))),
      f.p2_tema, f.p2_mensagem, f.p2_dia, 2
    FROM fonadas f LEFT JOIN clientes c ON c.id=f.cliente_id
    WHERE f.excluido_em IS NULL AND COALESCE(f.p2_para,'')<>'' AND ${filtro2}`;
}

function agrupar(linhas, dataLimite = null, exigirTemaAniversario = true) {
  const grupos = new Map();
  for (const linha of linhas) {
    if (!nomePessoaValido(linha.cliente_nome) || !nomePessoaValido(linha.aniversariante)) continue;
    if (exigirTemaAniversario && !ehTemaAniversario(linha.tema)) continue;
    const isoMensagem = dataBrParaIso(linha.dia_mensagem);
    if (dataLimite && (!isoMensagem || isoMensagem >= dataLimite)) continue;
    // Nos destinatários do aniversariante, Mensagem 1 e Mensagem 2 podem
    // guardar telefones diferentes para a mesma pessoa. Quando não houver
    // cliente vinculado, o nome normalizado é a melhor chave para empilhar
    // essas ocorrências sem mostrar a pessoa duas vezes.
    const identidadeCliente = linha.cliente_id
      ? `ID:${linha.cliente_id}`
      : linha.agrupar_por_nome
        ? `NOME:${chavePessoa(linha.cliente_nome)}`
        : `NOME:${chavePessoa(linha.cliente_nome)}:${String(linha.telefone || '').replace(/\D/g, '')}`;
    const relacaoChave = `${identidadeCliente}|PARA:${chavePessoa(linha.aniversariante)}`;
    if (!grupos.has(relacaoChave)) grupos.set(relacaoChave, { relacaoChave, clienteId: linha.cliente_id, clienteNome: linha.cliente_nome, clienteBloqueado: Boolean(linha.cliente_bloqueado), telefone: linha.telefone, aniversariante: linha.aniversariante, aniversarianteBloqueado: Boolean(linha.aniversariante_bloqueado), aniversarianteNascimento: linha.aniversariante_nascimento || null, historico: [] });
    const grupo = grupos.get(relacaoChave);
    grupo.clienteBloqueado = grupo.clienteBloqueado || Boolean(linha.cliente_bloqueado);
    grupo.aniversarianteBloqueado = grupo.aniversarianteBloqueado || Boolean(linha.aniversariante_bloqueado);
    grupo.historico.push({ pedidoId: linha.pedido_id, os: linha.senha_os, mensagem: linha.numero_mensagem, data: linha.dia_mensagem, tema: linha.tema, texto: linha.mensagem_texto });
  }
  return [...grupos.values()].map((g) => {
    g.historico.sort((a, b) => String(dataBrParaIso(b.data) || '').localeCompare(String(dataBrParaIso(a.data) || '')) || b.pedidoId - a.pedidoId);
    return { ...g, quantidade: g.historico.length, ultimoPedido: g.historico[0] };
  });
}

function combinarGrupos(...listas) {
  const mapa = new Map();
  for (const grupo of listas.flat()) {
    if (!mapa.has(grupo.relacaoChave)) {
      mapa.set(grupo.relacaoChave, { ...grupo, historico: [...grupo.historico] });
      continue;
    }
    const existente = mapa.get(grupo.relacaoChave);
    existente.historico.push(...grupo.historico);
    existente.quantidade = existente.historico.length;
    existente.historico.sort((a, b) => String(dataBrParaIso(b.data) || '').localeCompare(String(dataBrParaIso(a.data) || '')) || b.pedidoId - a.pedidoId);
    existente.ultimoPedido = existente.historico[0];
  }
  return [...mapa.values()];
}

function sqlDestinatariosDoAniversariante(filtroCliente) {
  const telefoneDestino = (prefixo) => `COALESCE(NULLIF(f.${prefixo}_celular,''), NULLIF(f.${prefixo}_fixo,''))`;
  return `
    SELECT f.id pedido_id, NULL::INTEGER cliente_id, f.senha_os, f.p1_para cliente_nome,
      EXISTS(SELECT 1 FROM clientes d WHERE d.excluido_em IS NULL AND d.bloqueado=TRUE AND LOWER(TRIM(d.nome))=LOWER(TRIM(f.p1_para))) cliente_bloqueado,
      ${telefoneDestino('p1')} telefone, COALESCE(NULLIF(c.nome,''),f.nome_comprador) aniversariante,
      COALESCE(c.bloqueado,FALSE) aniversariante_bloqueado, COALESCE(NULLIF(c.nascimento,''),f.nascimento) aniversariante_nascimento, f.p1_tema tema, f.p1_mensagem mensagem_texto,
      f.p1_dia dia_mensagem, 1 numero_mensagem, TRUE agrupar_por_nome
    FROM fonadas f LEFT JOIN clientes c ON c.id=f.cliente_id
    WHERE f.excluido_em IS NULL AND COALESCE(f.p1_para,'')<>'' AND ${filtroCliente}
    UNION ALL
    SELECT f.id, NULL::INTEGER, f.senha_os, f.p2_para,
      EXISTS(SELECT 1 FROM clientes d WHERE d.excluido_em IS NULL AND d.bloqueado=TRUE AND LOWER(TRIM(d.nome))=LOWER(TRIM(f.p2_para))), ${telefoneDestino('p2')},
      COALESCE(NULLIF(c.nome,''),f.nome_comprador), COALESCE(c.bloqueado,FALSE), COALESCE(NULLIF(c.nascimento,''),f.nascimento), f.p2_tema, f.p2_mensagem,
      f.p2_dia, 2, TRUE
    FROM fonadas f LEFT JOIN clientes c ON c.id=f.cliente_id
    WHERE f.excluido_em IS NULL AND COALESCE(f.p2_para,'')<>'' AND ${filtroCliente}`;
}

// Vincula todos os destinatários aos cadastros em uma única consulta.
// A versão anterior executava uma subconsulta por mensagem, custo que
// crescia muito com o histórico e deixava a fila parada em "Montando".
async function vincularClientesPorTelefone(linhas) {
  const normalizarTelefone = (valor) => String(valor || '').replace(/\D/g, '');
  const telefones = [...new Set(linhas.map((l) => normalizarTelefone(l.telefone)).filter(Boolean))];
  if (!telefones.length) return linhas;
  const resultado = await db.query(`
    SELECT id, nome, whatsapp, celular, fixo, bloqueado
    FROM clientes
    WHERE excluido_em IS NULL
      AND (
        regexp_replace(COALESCE(whatsapp,''), '\\D', '', 'g') = ANY($1::text[])
        OR regexp_replace(COALESCE(celular,''), '\\D', '', 'g') = ANY($1::text[])
        OR regexp_replace(COALESCE(fixo,''), '\\D', '', 'g') = ANY($1::text[])
      )
  `, [telefones]);
  const porTelefone = new Map();
  for (const cliente of resultado.rows) {
    for (const telefone of [cliente.whatsapp, cliente.celular, cliente.fixo]) {
      const chave = normalizarTelefone(telefone);
      if (chave && !porTelefone.has(chave)) porTelefone.set(chave, cliente);
    }
  }
  return linhas.map((linha) => {
    const cliente = porTelefone.get(normalizarTelefone(linha.telefone));
    return cliente ? { ...linha, cliente_id: cliente.id, cliente_bloqueado: Boolean(cliente.bloqueado) } : linha;
  });
}

async function anexarStatus(grupos, dataReferencia) {
  if (!grupos.length) return grupos;
  const chaves = grupos.map((g) => g.relacaoChave);
  const atual = await db.query('SELECT * FROM recall_registros WHERE data_referencia=$1 AND relacao_chave=ANY($2)', [dataReferencia, chaves]);
  const anteriores = await db.query(`SELECT DISTINCT ON (relacao_chave) * FROM recall_registros WHERE data_referencia<$1 AND relacao_chave=ANY($2) ORDER BY relacao_chave,data_referencia DESC,atualizado_em DESC`, [dataReferencia, chaves]);
  const porChave = new Map(atual.rows.map((r) => [r.relacao_chave, r]));
  const previas = new Map(anteriores.rows.map((r) => [r.relacao_chave, r]));
  return grupos.map((g) => ({ ...g, registro: porChave.get(g.relacaoChave) || null, ultimoRecall: previas.get(g.relacaoChave) || null }));
}

router.get('/fila', async (req, res) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : hojeIsoBrasilia();
    const [ano, mes, dia] = data.split('-');
    const dm = `${dia}/${mes}`;
    const [porDiaMensagem, porNascimento] = await Promise.all([
      db.query(sqlMensagens('LEFT(f.p1_dia,5)=$1', 'LEFT(f.p2_dia,5)=$1'), [dm]),
      db.query(sqlDestinatariosDoAniversariante("LEFT(COALESCE(NULLIF(c.nascimento,''),f.nascimento),5)=$1"), [dm]),
    ]);
    const ordenar = (itens) => itens.sort((a, b) => (a.registro?.status === 'PENDENTE' ? 0 : a.registro ? 1 : 0) - (b.registro?.status === 'PENDENTE' ? 0 : b.registro ? 1 : 0) || a.aniversariante.localeCompare(b.aniversariante) || a.clienteNome.localeCompare(b.clienteNome));
    const linhasNascimento = await vincularClientesPorTelefone(porNascimento.rows);
    const porDia = ordenar(await anexarStatus(agrupar(porDiaMensagem.rows, data, true), data));
    // Pesquisa 2 parte do aniversário do COMPRADOR e usa todos os pedidos
    // dele para descobrir os destinatários 1 e 2 a contatar. Não limita pela
    // data/tema da mensagem: o histórico inteiro comprova a relação.
    const porAniversario = ordenar(await anexarStatus(agrupar(linhasNascimento, null, false), data));
    // Mantém "itens" por compatibilidade, mas a interface usa as duas
    // coleções separadas para nunca misturar os conceitos operacionais.
    const itens = combinarGrupos(porDia, porAniversario);
    const foiTrabalhado = (item) => Boolean(item.registro?.status && item.registro.status !== 'PENDENTE');
    const concluidos = itens.filter(foiTrabalhado).length;
    const resumir = (lista) => { const feitos=lista.filter(foiTrabalhado).length; return { oportunidades:lista.length, aniversariantes:new Set(lista.map((i)=>chavePessoa(i.aniversariante))).size, pendentes:lista.length-feitos, concluidos:feitos, interessados:lista.filter((i)=>['INTERESSADO','PEDIDO_CRIADO'].includes(i.registro?.status)).length }; };
    res.json({ data, itens, porDiaMensagem: porDia, porAniversario, resumo: { oportunidades: itens.length, aniversariantes: new Set(itens.map((i) => chavePessoa(i.aniversariante))).size, pendentes: itens.length - concluidos, concluidos, interessados: itens.filter((i) => ['INTERESSADO','PEDIDO_CRIADO'].includes(i.registro?.status)).length }, resumos: { porDiaMensagem: resumir(porDia), porAniversario: resumir(porAniversario) } });
  } catch (erro) { console.error('Erro fila recall:', erro); res.status(500).json({ erro: 'Não foi possível montar a fila de Recall.' }); }
});

router.get('/buscar', async (req, res) => {
  try {
    const termo = String(req.query.termo || '').trim();
    if (termo.length < 2) return res.json({ enviouPara: [], recebeuDe: [] });
    const parametro = `%${termo}%`;
    const [resultado, resultadoInverso] = await Promise.all([
      db.query(sqlMensagens('f.p1_para ILIKE $1', 'f.p2_para ILIKE $1'), [parametro]),
      db.query(sqlDestinatariosDoAniversariante('(f.nome_comprador ILIKE $1 OR c.nome ILIKE $1)'), [parametro]),
    ]);
    const relacoes = agrupar(resultado.rows);
    const mapa = new Map();
    for (const r of relacoes) {
      const chave = chavePessoa(r.aniversariante);
      if (!mapa.has(chave)) mapa.set(chave, { aniversariante: r.aniversariante, totalMensagens: 0, pessoas: [] });
      mapa.get(chave).totalMensagens += r.quantidade;
      mapa.get(chave).pessoas.push(r);
    }
    const mapaInverso = new Map();
    const linhasInversas = await vincularClientesPorTelefone(resultadoInverso.rows);
    for (const r of agrupar(linhasInversas, null, false)) {
      const chave = `${r.aniversariante}|${r.aniversarianteNascimento || ''}`;
      if (!mapaInverso.has(chave)) mapaInverso.set(chave, { aniversariante: r.aniversariante, nascimento: r.aniversarianteNascimento, totalMensagens: 0, pessoas: [] });
      mapaInverso.get(chave).totalMensagens += r.quantidade;
      mapaInverso.get(chave).pessoas.push(r);
    }
    res.json({
      enviouPara: [...mapaInverso.values()].sort((a,b) => b.totalMensagens-a.totalMensagens).slice(0,50),
      recebeuDe: [...mapa.values()].sort((a,b) => b.totalMensagens-a.totalMensagens).slice(0,50),
    });
  } catch (erro) { console.error('Erro busca recall:', erro); res.status(500).json({ erro: 'Não foi possível buscar o aniversariante.' }); }
});

router.get('/historico', async (_req, res) => {
  try { const r=await db.query('SELECT * FROM recall_registros ORDER BY atualizado_em DESC LIMIT 200'); res.json({ registros:r.rows }); }
  catch (erro) { res.status(500).json({ erro:'Não foi possível carregar o histórico.' }); }
});

router.put('/status', async (req, res) => {
  try {
    const { dataReferencia, relacaoChave, clienteId, clienteNome, aniversarianteNome, status, observacao, retornarEm, pedidoOrigemId } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataReferencia || '') || !relacaoChave || !STATUS.has(status)) return res.status(400).json({ erro:'Dados de Recall inválidos.' });
    const r=await db.query(`INSERT INTO recall_registros (data_referencia,relacao_chave,cliente_id,cliente_nome,aniversariante_nome,status,observacao,retornar_em,pedido_origem_id,atualizado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (data_referencia,relacao_chave) DO UPDATE SET status=EXCLUDED.status,observacao=EXCLUDED.observacao,retornar_em=EXCLUDED.retornar_em,pedido_origem_id=EXCLUDED.pedido_origem_id,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW() RETURNING *`,
      [dataReferencia,relacaoChave,clienteId||null,clienteNome,aniversarianteNome,status,observacao||null,retornarEm||null,pedidoOrigemId||null,req.usuario?.usuario||null]);
    res.json({ registro:r.rows[0] });
  } catch (erro) { console.error('Erro status recall:',erro); res.status(500).json({ erro:'Não foi possível salvar o resultado.' }); }
});

router.put('/pedido-criado', async (req,res) => {
  try {
    const { dataReferencia, relacaoChave, pedidoId } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataReferencia || '') || !relacaoChave || !Number.isInteger(Number(pedidoId))) {
      return res.status(400).json({ erro: 'Dados de vínculo do Recall inválidos.' });
    }
    const pedido = await db.query(`
      SELECT f.id, f.cliente_id, COALESCE(c.nome, f.nome_comprador) AS cliente_nome,
             COALESCE(NULLIF(f.p1_para, ''), NULLIF(f.p2_para, ''), 'Não informado') AS aniversariante_nome
      FROM fonadas f LEFT JOIN clientes c ON c.id = f.cliente_id WHERE f.id = $1 AND f.excluido_em IS NULL
    `, [pedidoId]);
    if (!pedido.rows.length) return res.status(404).json({ erro: 'Pedido de Recall não encontrado.' });
    const dados = pedido.rows[0];
    const r = await db.query(`
      INSERT INTO recall_registros
        (data_referencia, relacao_chave, cliente_id, cliente_nome, aniversariante_nome, status, pedido_novo_id, atualizado_por)
      VALUES ($1, $2, $3, $4, $5, 'PEDIDO_CRIADO', $6, $7)
      ON CONFLICT (data_referencia, relacao_chave) DO UPDATE
        SET status = 'PEDIDO_CRIADO', pedido_novo_id = EXCLUDED.pedido_novo_id,
            atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW()
      RETURNING *
    `, [dataReferencia, relacaoChave, dados.cliente_id, dados.cliente_nome, dados.aniversariante_nome, dados.id, req.usuario?.usuario || null]);
    res.json({ registro: r.rows[0] });
  } catch (erro) {
    console.error('Erro ao vincular pedido ao Recall:', erro);
    res.status(500).json({ erro: 'Pedido salvo, mas não foi possível atualizar o Recall.' });
  }
});

module.exports = router;
