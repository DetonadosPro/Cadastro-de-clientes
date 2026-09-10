// Compara a rota otimizada à base indicada, sem alterar dados.
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Exige banco local');
process.env.PGOPTIONS = '-c default_transaction_read_only=on';
const { pool } = require('../src/db/database');
const express = require('express');
const app = express();
const arquivo = path.join(__dirname, '../src/routes/clientes.js');
const anterior = new Module(arquivo, module);
anterior.filename = arquivo;
anterior.paths = Module._nodeModulePaths(path.dirname(arquivo));
// O legado não desempata nomes iguais: uma varredura de todas as páginas
// repetiu 3 IDs. Estabilizar apenas o desempate permite comparar os dados
// e cálculos antigos sem confundir esse defeito de paginação com a otimização.
const fonteAnterior = execFileSync('git', ['show', `${process.argv[2] || 'dcda954'}:backend/src/routes/clientes.js`], { encoding: 'utf8' })
  .replace('ORDER BY ${colunaOrdenacao} ${direcao}, c.nome ASC', 'ORDER BY ${colunaOrdenacao} ${direcao}, c.nome ASC, c.id ASC');
anterior._compile(fonteAnterior, arquivo);
app.use('/antes', anterior.exports);
app.use('/depois', require(arquivo));
async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  async function get(prefix, params) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${prefix}?${new URLSearchParams(params)}`);
    assert.equal(response.status, 200);
    return response.json();
  }
  try {
    const todos = [];
    // Percorre toda a base paginada; desempates por ID podem mudar de página.
    for (const prefix of ['antes', 'depois']) {
      const itens = [];
      let pagina = 1, total = Infinity;
      while (itens.length < total) {
        const dados = await get(prefix, { pagina: pagina++, porPagina: 200 });
        total = dados.total; itens.push(...dados.clientes);
        assert.ok(dados.clientes.length > 0 || total === 0);
      }
      assert.equal(new Set(itens.map(i => i.id)).size, total, 'Paginação não pode repetir ou omitir clientes');
      todos.push(itens.sort((a,b) => a.id-b.id));
    }
    assert.deepEqual(todos[1], todos[0], 'Todos os campos e indicadores devem ser preservados');
    for (const situacao of ['pendencia', 'bloqueados', 'recentes', 'sem_pedidos', 'aniversariantes']) {
      const antes = await get('antes', { situacao });
      const depois = await get('depois', { situacao });
      assert.equal(depois.total, antes.total);
      for (const item of depois.clientes) assert.deepEqual(item, todos[0].find(c => c.id === item.id));
    }
    for (const ordenarPor of ['nome','total_fonada','total_aovivo','total_pedidos','valor_pendente','ultimo_pedido']) {
      for (const direcao of ['asc','desc']) {
        const antes = await get('antes', { ordenarPor, direcao });
        const depois = await get('depois', { ordenarPor, direcao });
        const campo = ordenarPor === 'ultimo_pedido' ? 'ultimo_pedido_em' : ordenarPor;
        assert.deepEqual(depois.clientes.map(c => c[campo]), antes.clientes.map(c => c[campo]));
      }
    }
    const busca = await get('depois', { busca: 'ana', modo: 'contatos', porPagina: 6 });
    assert.ok(busca.clientes.length <= 6);
    assert.ok(busca.clientes.every(c => !('valor_pendente' in c)));
    const id = todos[1][0].id;
    const cadastro = await (await fetch(`http://127.0.0.1:${server.address().port}/depois/${id}?historico=nao`)).json();
    assert.ok(cadastro.cliente && !cadastro.pedidosFonada);
    console.log(`Validado: ${todos[1].length} clientes, todos os campos, 5 filtros, 12 ordenações, busca leve e cadastro sem histórico.`);
  } finally { server.close(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
