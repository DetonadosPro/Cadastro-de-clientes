const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { Pool } = require('pg');
const express = require('express');
const { situacaoSegundaMensagem, validarDataUsoSegundaMensagem, dataBrParaDate } = require('../src/utils/mensagemEmHaver');

test('créditos nunca expiram e um crédito libera segunda mensagem sem vencimento', () => {
  const pedido = { valor: 0, creditos_usados: 2, data_pedido: '01/01/20' };
  assert.equal(situacaoSegundaMensagem(pedido, dataBrParaDate('13/10/2099')).semValidade, true);
  assert.equal(validarDataUsoSegundaMensagem(pedido, '31/12/99').ok, true);
  assert.equal(situacaoSegundaMensagem({ ...pedido, creditos_usados: 1 }).concedida, true);
  assert.equal(situacaoSegundaMensagem({ ...pedido, creditos_usados: 0 }).status, 'EXPIRADA');
});

test('PostgreSQL e APIs: compra, consumo por pedido e devolução, concorrência, repetição, relatórios e mesclagem', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'O teste exige banco local e cria somente um schema descartável.');
  const schema = `qa_creditos_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: url.toString(), options: '-c search_path=public' });
  let banco; let servidor;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    banco = require('../src/db/database');
    assert.equal((await banco.pool.query('SELECT current_schema() AS nome')).rows[0].nome, schema);
    await banco.iniciarBanco();
    await banco.iniciarBanco(); // Migração também precisa poder rodar novamente.
    const { carteira } = require('../src/utils/creditosFonada');
    const cliente = (await banco.pool.query("INSERT INTO clientes (nome) VALUES ('CLIENTE DOS CRÉDITOS') RETURNING *")).rows[0];
    const destino = (await banco.pool.query("INSERT INTO clientes (nome) VALUES ('DESTINO') RETURNING *")).rows[0];
    await banco.pool.query("INSERT INTO usuarios (usuario, senha_hash, nome) VALUES ('QA', 'teste', 'Operador QA')");
    const app = express(); app.use(express.json()); app.use((req, res, next) => { req.usuario = { usuario: 'QA', id: 1 }; next(); });
    app.use('/clientes', require('../src/routes/clientes'));
    app.use('/fonadas', require('../src/routes/fonadas'));
    app.use('/relatorios', require('../src/routes/relatorios'));
    app.use('/agenda', require('../src/routes/agenda'));
    app.use('/cobranca', require('../src/routes/cobranca'));
    servidor = app.listen(0, '127.0.0.1'); await once(servidor, 'listening');
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const enviar = async (rota, method, dados) => {
      const r = await fetch(base + rota, { method, headers: { 'Content-Type': 'application/json' }, ...(dados ? { body: JSON.stringify(dados) } : {}) });
      return { status: r.status, dados: await r.json() };
    };
    t.mock.method(console, 'error', () => {});

    const compra = { quantidade: 6, valor: 72, forma: 'PIX', operacao: randomUUID() };
    for (const dados of [{ ...compra, quantidade: 1.5 }, { ...compra, valor: -1 }, { ...compra, valor: 1.005 }, { ...compra, forma: 'PAGO' }]) {
      assert.equal((await enviar(`/clientes/${cliente.id}/creditos`, 'POST', dados)).status, 400);
    }
    const repetidas = await Promise.all([enviar(`/clientes/${cliente.id}/creditos`, 'POST', compra), enviar(`/clientes/${cliente.id}/creditos`, 'POST', compra)]);
    assert.ok(repetidas.every(r => r.status === 201));
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 6);
    assert.equal((await enviar(`/clientes/${cliente.id}/creditos`, 'POST', { ...compra, valor: 80 })).status, 409);

    const payload = { cliente_id: cliente.id, senha_os: 'QA-1', creditos_usados: 1, credito_operacao: randomUUID(), p1_dia: '13/10/99', p1_para: 'ANA', p2_dia: '14/10/99', p2_para: 'JOÃO', valor: 99, pagou: 'NÃO' };
    const criacoes = await Promise.all([enviar('/fonadas', 'POST', payload), enviar('/fonadas', 'POST', payload)]);
    assert.deepEqual(criacoes.map(r => r.status).sort(), [200, 201]);
    const pedido = criacoes[0].dados;
    assert.equal(pedido.valor, 0); assert.equal(pedido.pagou, 'SIM');
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 5);
    for (const dados of [{ versao: 1, creditos_usados: 0 }, { versao: 1, cliente_id: destino.id }]) assert.equal((await enviar(`/fonadas/${pedido.id}`, 'PUT', dados)).status, 409);
    const editado = await enviar(`/fonadas/${pedido.id}`, 'PUT', { versao: 1, p2_dia: '15/10/99', p2_horario: '10:00', valor: 88, pagou: 'NÃO' });
    assert.equal(editado.status, 200); assert.equal(editado.dados.valor, 0); assert.equal(editado.dados.mensagemEmHaver.semValidade, true);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 5);
    assert.equal((await enviar(`/cobranca/${pedido.id}/baixa`, 'PUT', { pagou: 'NÃO', versao: 2 })).status, 409);
    const remarcado = await enviar(`/agenda/fonada/${pedido.id}/nao-atendeu`, 'POST', { mensagem: 2, versao: 2, remarcadoDia: '20/10/99', remarcadoHorario: '11:00' });
    assert.equal(remarcado.status, 200);
    const agenda = await enviar('/agenda/hoje?data=20/10/99', 'GET');
    assert.equal(agenda.status, 200);
    assert.equal(agenda.dados.fonada[0].statusMensagemEmHaver, 'DISPONIVEL');
    assert.equal(agenda.dados.fonada[0].dataExpiracaoMensagem, null);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 5);
    const baixado = await enviar(`/agenda/fonada/${pedido.id}/baixa`, 'POST', { mensagem: 2, versao: remarcado.dados.versao });
    assert.equal(baixado.status, 200);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 5);

    const diaCompra = pedido.data_pedido;
    for (const rota of ['vendas', 'recebimentos']) {
      const r = await enviar(`/relatorios/${rota}?inicio=${diaCompra}&fim=${diaCompra}&sistema=FONADA`, 'GET');
      assert.equal(r.status, 200);
      const resumo = r.dados.fonada;
      assert.equal(resumo.quantidade, 1); assert.equal(resumo.valorTotal, 72);
      assert.equal(r.dados.itens[0].rota, `/clientes/${cliente.id}`);
    }
    const hoje = await enviar('/fonadas/hoje', 'GET');
    assert.equal(hoje.dados.fonadas.length, 1); assert.equal(hoje.dados.fonadas[0].tipo_registro, 'CREDITOS');
    const equipe = await enviar(`/relatorios/desempenho?inicio=${diaCompra}&fim=${diaCompra}&sistema=FONADA`, 'GET');
    assert.equal(equipe.status, 200); assert.equal(equipe.dados.valorEquipe, 72);
    assert.equal(equipe.dados.funcionarios[0].vendasFonada, 1);
    const resumoDiario = await require('../src/tarefas/resumoDiario').montarResumoDoDia();
    assert.equal(resumoDiario.fonada.quantidadeVendida, 1);
    assert.equal(resumoDiario.fonada.valorVendido, 72);
    assert.equal(resumoDiario.fonada.valorRecebido, 72);
    const rapido = await enviar(`/clientes/${cliente.id}/resumo`, 'GET');
    assert.equal(rapido.status, 200); assert.equal(rapido.dados.resumo.total_comprado, 72);
    assert.equal(rapido.dados.creditos.saldo, 5); assert.equal(rapido.dados.ultimasCompras[0].tipo, 'Créditos Fonada');
    await banco.pool.query('CREATE TABLE impedir_exclusao (pedido_id INTEGER REFERENCES fonadas(id))');
    await banco.pool.query('INSERT INTO impedir_exclusao VALUES ($1)', [pedido.id]);
    assert.equal((await enviar(`/fonadas/${pedido.id}`, 'DELETE')).status, 500);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 5);
    assert.equal((await banco.pool.query("SELECT COUNT(*)::int AS n FROM creditos_fonada WHERE tipo = 'ESTORNO'")).rows[0].n, 0);
    await banco.pool.query('DROP TABLE impedir_exclusao');

    const tentativas = await Promise.all(Array.from({ length: 6 }, (_, i) => enviar('/fonadas', 'POST', { ...payload, senha_os: `CONCORRENTE-${i}`, credito_operacao: randomUUID() })));
    assert.equal(tentativas.filter(r => r.status === 201).length, 5);
    assert.equal(tentativas.filter(r => r.status === 409).length, 1);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 0);
    const apenasUm = await enviar('/fonadas', 'POST', { ...payload, senha_os: 'SEM-SALDO', creditos_usados: 1, credito_operacao: randomUUID(), p2_dia: '', p2_para: '' });
    assert.equal(apenasUm.status, 409);
    assert.equal((await banco.pool.query('SELECT COUNT(*)::int AS n FROM fonadas')).rows[0].n, 6);
    const exclusoes = await Promise.all([enviar(`/fonadas/${pedido.id}`, 'DELETE'), enviar(`/fonadas/${pedido.id}`, 'DELETE')]);
    assert.equal(exclusoes.filter(r => r.status === 200).length, 1);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 1);
    assert.equal((await carteira(banco.pool, cliente.id)).usados, 5);
    assert.equal((await banco.pool.query("SELECT COUNT(*)::int AS n FROM creditos_fonada WHERE tipo = 'ESTORNO'")).rows[0].n, 1);
    const normal = await enviar('/fonadas', 'POST', { cliente_id: cliente.id, senha_os: 'NORMAL', valor: 20, cobranca: diaCompra, periodo: 'PIX' });
    assert.equal(normal.status, 201);
    assert.equal((await enviar(`/fonadas/${normal.dados.id}`, 'DELETE')).status, 200);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 1);

    const mais = await enviar(`/clientes/${cliente.id}/creditos`, 'POST', { ...compra, quantidade: 3, valor: 36, operacao: randomUUID() });
    assert.equal(mais.status, 201);
    assert.equal((await enviar(`/clientes/${cliente.id}`, 'DELETE')).status, 200);
    assert.equal((await enviar(`/clientes/${cliente.id}/definitivo`, 'DELETE')).status, 409);
    assert.equal((await enviar(`/clientes/${cliente.id}/restaurar`, 'POST')).status, 200);
    assert.equal((await enviar(`/clientes/${destino.id}/mesclar`, 'POST', { origemId: cliente.id })).status, 200);
    assert.equal((await carteira(banco.pool, destino.id)).saldo, 4);
    assert.equal((await carteira(banco.pool, destino.id)).valor_comprado, 108);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 0);
    const umCredito = await enviar('/fonadas', 'POST', { ...payload, cliente_id: destino.id, senha_os: 'UM-CREDITO', creditos_usados: 1, credito_operacao: randomUUID(), p2_dia: '', p2_para: '' });
    assert.equal(umCredito.status, 201);
    assert.equal((await carteira(banco.pool, destino.id)).saldo, 3);
    const tentativaBonus = await enviar(`/fonadas/${umCredito.dados.id}`, 'PUT', { versao: 1, p2_dia: '20/10/99', p2_para: 'BÔNUS' });
    assert.equal(tentativaBonus.status, 200);
    assert.equal(tentativaBonus.dados.mensagemEmHaver.semValidade, true);
    assert.equal((await carteira(banco.pool, destino.id)).saldo, 3);

    // Uma correção reduz a compra original sem criar uma devolução financeira no dia do ajuste.
    const corrigivel = (await banco.pool.query("INSERT INTO clientes (nome) VALUES ('CLIENTE DA CORREÇÃO') RETURNING id")).rows[0].id;
    const pacote = await enviar(`/clientes/${corrigivel}/creditos`, 'POST', { quantidade: 2, valor: 24, forma: 'PIX', operacao: randomUUID() });
    assert.equal(pacote.status, 201);
    const compraId = pacote.dados.comprasCorrigiveis[0].id;
    await banco.pool.query("UPDATE creditos_fonada SET data_pedido = '01/09/26' WHERE id = $1", [compraId]);
    const corrigir = `/clientes/${corrigivel}/creditos/${compraId}/corrigir`;
    const ajuste = { quantidade: 1, valor: 7, motivo: 'VALOR E QUANTIDADE DIGITADOS ERRADOS', operacao: randomUUID() };
    for (const invalido of [{ ...ajuste, quantidade: -1 }, { ...ajuste, quantidade: 0, valor: 0 }, { ...ajuste, valor: 1.005 }, { ...ajuste, motivo: '' }]) {
      assert.equal((await enviar(corrigir, 'POST', invalido)).status, 400);
    }
    assert.equal((await enviar(corrigir, 'POST', { ...ajuste, quantidade: 3 })).status, 409);
    assert.equal((await enviar(corrigir, 'POST', { ...ajuste, valor: 25 })).status, 409);
    assert.equal((await enviar(`/clientes/${destino.id}/creditos/${compraId}/corrigir`, 'POST', ajuste)).status, 404);
    const ajustes = await Promise.all([enviar(corrigir, 'POST', ajuste), enviar(corrigir, 'POST', ajuste)]);
    assert.ok(ajustes.every(r => r.status === 200));
    assert.equal(ajustes[0].dados.saldo, 1); assert.equal(ajustes[0].dados.valor_comprado, 17);
    assert.equal((await enviar(corrigir, 'POST', { ...ajuste, valor: 8 })).status, 409);
    for (const rota of ['vendas', 'recebimentos']) {
      const relatorio = await enviar(`/relatorios/${rota}?inicio=01/09/26&fim=01/09/26&sistema=FONADA`, 'GET');
      assert.equal(relatorio.status, 200); assert.equal(relatorio.dados.fonada.valorTotal, 17);
      assert.equal(relatorio.dados.itens[0].os, 'CRÉDITOS ×1');
    }
    assert.ok((await enviar('/fonadas/hoje', 'GET')).dados.fonadas.every(p => p.cliente_id !== corrigivel));
    const uso = await enviar('/fonadas', 'POST', { ...payload, cliente_id: corrigivel, senha_os: 'CORRIGIDO', credito_operacao: randomUUID() });
    assert.equal(uso.status, 201);
    assert.equal((await enviar(corrigir, 'POST', { ...ajuste, valor: 0, operacao: randomUUID() })).status, 409);
    const soValor = await enviar(corrigir, 'POST', { ...ajuste, quantidade: 0, valor: 3, operacao: randomUUID() });
    assert.equal(soValor.status, 200); assert.equal(soValor.dados.saldo, 0); assert.equal(soValor.dados.valor_comprado, 14);
    assert.equal((await enviar(`/fonadas/${uso.dados.id}`, 'DELETE')).status, 200);
    const cancelar = await enviar(corrigir, 'POST', { ...ajuste, quantidade: 1, valor: 14, operacao: randomUUID() });
    assert.equal(cancelar.status, 200); assert.equal(cancelar.dados.saldo, 0); assert.equal(cancelar.dados.valor_comprado, 0);
    assert.equal(cancelar.dados.compras, 0); assert.equal(cancelar.dados.comprasCorrigiveis.length, 0);
    const cancelado = await enviar('/relatorios/vendas?inicio=01/09/26&fim=01/09/26&sistema=FONADA', 'GET');
    assert.equal(cancelado.dados.fonada.quantidade, 0); assert.equal(cancelado.dados.fonada.valorTotal, 0);
    const auditoria = (await banco.pool.query('SELECT * FROM creditos_fonada WHERE id = $1', [compraId])).rows[0];
    assert.equal(auditoria.quantidade, 2); assert.equal(Number(auditoria.valor), 24);
    assert.equal((await banco.pool.query("SELECT COUNT(*)::int AS n FROM creditos_fonada WHERE compra_ajustada_id = $1", [compraId])).rows[0].n, 3);
    const ultimoPacote = await enviar(`/clientes/${corrigivel}/creditos`, 'POST', { quantidade: 1, valor: 12, forma: 'PIX', operacao: randomUUID() });
    const ultimoId = ultimoPacote.dados.comprasCorrigiveis[0].id;
    const corrida = await Promise.all(Array.from({ length: 2 }, () => enviar(`/clientes/${corrigivel}/creditos/${ultimoId}/corrigir`, 'POST', {
      quantidade: 1, valor: 12, motivo: 'CORREÇÃO SIMULTÂNEA', operacao: randomUUID(),
    })));
    assert.deepEqual(corrida.map(r => r.status).sort(), [200, 409]);
    assert.equal((await carteira(banco.pool, corrigivel)).valor_comprado, 0);
    await banco.iniciarBanco(); // Correções persistem após reinicialização e migração repetida.
    assert.equal((await carteira(banco.pool, corrigivel)).saldo, 0);
  } finally {
    if (servidor) await new Promise(resolve => servidor.close(resolve));
    if (banco) await banco.pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
