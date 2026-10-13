const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { Pool } = require('pg');
const express = require('express');
const { situacaoSegundaMensagem, validarDataUsoSegundaMensagem, dataBrParaDate } = require('../src/utils/mensagemEmHaver');

test('créditos nunca expiram e um crédito não libera uma segunda mensagem gratuita', () => {
  const pedido = { valor: 0, creditos_usados: 2, data_pedido: '01/01/20' };
  assert.equal(situacaoSegundaMensagem(pedido, dataBrParaDate('13/10/2099')).semValidade, true);
  assert.equal(validarDataUsoSegundaMensagem(pedido, '31/12/99').ok, true);
  assert.equal(situacaoSegundaMensagem({ ...pedido, creditos_usados: 1 }).concedida, false);
  assert.equal(situacaoSegundaMensagem({ ...pedido, creditos_usados: 0 }).status, 'EXPIRADA');
});

test('PostgreSQL e APIs: compra, consumo definitivo, concorrência, repetição, relatórios e mesclagem', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async t => {
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

    const payload = { cliente_id: cliente.id, senha_os: 'QA-1', creditos_usados: 2, credito_operacao: randomUUID(), p1_dia: '13/10/99', p1_para: 'ANA', p2_dia: '14/10/99', p2_para: 'JOÃO', valor: 99, pagou: 'NÃO' };
    const criacoes = await Promise.all([enviar('/fonadas', 'POST', payload), enviar('/fonadas', 'POST', payload)]);
    assert.deepEqual(criacoes.map(r => r.status).sort(), [200, 201]);
    const pedido = criacoes[0].dados;
    assert.equal(pedido.valor, 0); assert.equal(pedido.pagou, 'SIM');
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 4);
    for (const dados of [{ versao: 1, creditos_usados: 1 }, { versao: 1, cliente_id: destino.id }]) assert.equal((await enviar(`/fonadas/${pedido.id}`, 'PUT', dados)).status, 409);
    const editado = await enviar(`/fonadas/${pedido.id}`, 'PUT', { versao: 1, p2_dia: '15/10/99', p2_horario: '10:00', valor: 88, pagou: 'NÃO' });
    assert.equal(editado.status, 200); assert.equal(editado.dados.valor, 0); assert.equal(editado.dados.mensagemEmHaver.semValidade, true);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 4);
    assert.equal((await enviar(`/cobranca/${pedido.id}/baixa`, 'PUT', { pagou: 'NÃO', versao: 2 })).status, 409);
    const remarcado = await enviar(`/agenda/fonada/${pedido.id}/nao-atendeu`, 'POST', { mensagem: 2, versao: 2, remarcadoDia: '20/10/99', remarcadoHorario: '11:00' });
    assert.equal(remarcado.status, 200);
    const agenda = await enviar('/agenda/hoje?data=20/10/99', 'GET');
    assert.equal(agenda.status, 200);
    assert.equal(agenda.dados.fonada[0].statusMensagemEmHaver, 'DISPONIVEL');
    assert.equal(agenda.dados.fonada[0].dataExpiracaoMensagem, null);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 4);
    const baixado = await enviar(`/agenda/fonada/${pedido.id}/baixa`, 'POST', { mensagem: 2, versao: remarcado.dados.versao });
    assert.equal(baixado.status, 200);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 4);

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
    assert.equal(rapido.dados.creditos.saldo, 4); assert.equal(rapido.dados.ultimasCompras[0].tipo, 'Créditos Fonada');

    const tentativas = await Promise.all(Array.from({ length: 3 }, (_, i) => enviar('/fonadas', 'POST', { ...payload, senha_os: `CONCORRENTE-${i}`, credito_operacao: randomUUID() })));
    assert.equal(tentativas.filter(r => r.status === 201).length, 2);
    assert.equal(tentativas.filter(r => r.status === 409).length, 1);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 0);
    const apenasUm = await enviar('/fonadas', 'POST', { ...payload, senha_os: 'SEM-SALDO', creditos_usados: 1, credito_operacao: randomUUID(), p2_dia: '', p2_para: '' });
    assert.equal(apenasUm.status, 409);
    assert.equal((await banco.pool.query('SELECT COUNT(*)::int AS n FROM fonadas')).rows[0].n, 3);
    assert.equal((await enviar(`/fonadas/${pedido.id}`, 'DELETE')).status, 200);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 0); // Desconto é definitivo.
    assert.equal((await carteira(banco.pool, cliente.id)).usados, 6); // O histórico sobrevive à exclusão.

    const mais = await enviar(`/clientes/${cliente.id}/creditos`, 'POST', { ...compra, quantidade: 3, valor: 36, operacao: randomUUID() });
    assert.equal(mais.status, 201);
    assert.equal((await enviar(`/clientes/${cliente.id}`, 'DELETE')).status, 200);
    assert.equal((await enviar(`/clientes/${cliente.id}/definitivo`, 'DELETE')).status, 409);
    assert.equal((await enviar(`/clientes/${cliente.id}/restaurar`, 'POST')).status, 200);
    assert.equal((await enviar(`/clientes/${destino.id}/mesclar`, 'POST', { origemId: cliente.id })).status, 200);
    assert.equal((await carteira(banco.pool, destino.id)).saldo, 3);
    assert.equal((await carteira(banco.pool, destino.id)).valor_comprado, 108);
    assert.equal((await carteira(banco.pool, cliente.id)).saldo, 0);
    const umCredito = await enviar('/fonadas', 'POST', { ...payload, cliente_id: destino.id, senha_os: 'UM-CREDITO', creditos_usados: 1, credito_operacao: randomUUID(), p2_dia: '', p2_para: '' });
    assert.equal(umCredito.status, 201);
    assert.equal((await carteira(banco.pool, destino.id)).saldo, 2);
    const tentativaBonus = await enviar(`/fonadas/${umCredito.dados.id}`, 'PUT', { versao: 1, p2_dia: '20/10/99', p2_para: 'BÔNUS' });
    assert.equal(tentativaBonus.status, 409);
  } finally {
    if (servidor) await new Promise(resolve => servidor.close(resolve));
    if (banco) await banco.pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
