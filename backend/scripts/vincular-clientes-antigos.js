// scripts/vincular-clientes-antigos.js
//
// ⚠️ AVISO IMPORTANTE (migração para PostgreSQL/Railway):
// Este script ainda usa a sintaxe antiga do SQLite (node:sqlite,
// db.prepare com "?"). Precisa ser adaptado (placeholders $1/$2... e
// await) antes de rodar contra o banco novo — combinado que migramos
// junto com importar-planilha.js quando você tiver a planilha
// atualizada em mãos.
//
// Organiza o histórico de pedidos antigos (de antes do cadastro de
// clientes existir) em clientes de verdade, e vincula cada pedido ao
// cliente correspondente.
//
// Critério para considerar "mesma pessoa":
//   (nome compartilha pelo menos 1 palavra significativa idêntica ou
//    muito parecida — erro de digitação pequeno, tipo "LUIZ"/"LUIS")
//   E
//   (mesmo nascimento OU mesmo celular)
//
// Palavras como DA/DE/DO/DAS/DOS/E não contam como "palavra
// significativa" — não bastam sozinhas para considerar mesma pessoa.
//
// Usa uma técnica chamada "union-find": se o pedido A liga com o B
// por nascimento, e o B liga com o C por celular, os três acabam no
// mesmo cliente — mesmo que A e C nunca tenham batido diretamente.
//
// Como usar:
//   node scripts/vincular-clientes-antigos.js --simular   → só mostra o relatório, não muda nada
//   node scripts/vincular-clientes-antigos.js             → aplica de verdade
//   node scripts/vincular-clientes-antigos.js --desfazer  → apaga TODOS os clientes e desvincula
//                                                             todos os pedidos (cliente_id = NULL),
//                                                             para poder rodar do zero com regras novas

const { db, iniciarBanco } = require('../src/db/database');

const MODO_SIMULACAO = process.argv.includes('--simular');
const MODO_DESFAZER = process.argv.includes('--desfazer');

const PREPOSICOES = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);

function normalizarNome(nome) {
  return String(nome || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarData(data) {
  const s = String(data || '').trim();
  return (!s || s === '0') ? '' : s;
}

function normalizarTelefone(tel) {
  return String(tel || '').replace(/\D/g, '');
}

function vazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function palavrasSignificativas(nomeNorm) {
  return nomeNorm.split(' ').filter((p) => p.length > 1 && !PREPOSICOES.has(p));
}

function distanciaEdicao(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function palavrasParecidas(p1, p2) {
  if (p1 === p2) return true;
  const tolerancia = p1.length >= 6 || p2.length >= 6 ? 2 : 1;
  return distanciaEdicao(p1, p2) <= tolerancia;
}

function nomesCompativeis(nomeA, nomeB) {
  const palavrasA = palavrasSignificativas(normalizarNome(nomeA));
  const palavrasB = palavrasSignificativas(normalizarNome(nomeB));
  for (const pa of palavrasA) {
    for (const pb of palavrasB) {
      if (palavrasParecidas(pa, pb)) return true;
    }
  }
  return false;
}

class UniaoConjuntos {
  constructor(n) {
    this.pai = Array.from({ length: n }, (_, i) => i);
  }
  encontrar(i) {
    if (this.pai[i] !== i) this.pai[i] = this.encontrar(this.pai[i]);
    return this.pai[i];
  }
  unir(i, j) {
    const ri = this.encontrar(i), rj = this.encontrar(j);
    if (ri !== rj) this.pai[ri] = rj;
  }
}

function carregarPedidosSemCliente() {
  const fonadas = db.prepare(`
    SELECT id, 'fonada' as sistema, nome_comprador as nome, nascimento,
           comprador_celular as celular, comprador_fixo as fixo,
           comprador_endereco as endereco, comprador_complemento as complemento,
           comprador_bairro as bairro, comprador_referencia as referencia,
           data_pedido
    FROM fonadas
    WHERE cliente_id IS NULL AND nome_comprador IS NOT NULL AND nome_comprador != ''
  `).all();

  const aoVivo = db.prepare(`
    SELECT id, 'aovivo' as sistema, comprador as nome, aniversario as nascimento,
           celular, NULL as fixo,
           NULL as endereco, NULL as complemento, NULL as bairro, NULL as referencia,
           data_pedido
    FROM ao_vivo
    WHERE cliente_id IS NULL AND comprador IS NOT NULL AND comprador != ''
  `).all();

  return [...fonadas, ...aoVivo];
}

function agruparPedidos(pedidos) {
  const uf = new UniaoConjuntos(pedidos.length);

  const porNascimento = new Map();
  const porCelular = new Map();

  pedidos.forEach((p, i) => {
    const nasc = normalizarData(p.nascimento);
    if (nasc) {
      if (!porNascimento.has(nasc)) porNascimento.set(nasc, []);
      porNascimento.get(nasc).push(i);
    }
    const tel = normalizarTelefone(p.celular);
    if (tel && tel.length >= 8) {
      if (!porCelular.has(tel)) porCelular.set(tel, []);
      porCelular.get(tel).push(i);
    }
  });

  for (const indices of porNascimento.values()) {
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        if (nomesCompativeis(pedidos[indices[a]].nome, pedidos[indices[b]].nome)) {
          uf.unir(indices[a], indices[b]);
        }
      }
    }
  }

  for (const indices of porCelular.values()) {
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        if (nomesCompativeis(pedidos[indices[a]].nome, pedidos[indices[b]].nome)) {
          uf.unir(indices[a], indices[b]);
        }
      }
    }
  }

  const grupos = new Map();
  const semGrupo = [];
  const temNascimentoOuCelular = new Set([...porNascimento.values(), ...porCelular.values()].flat());

  pedidos.forEach((p, i) => {
    if (!temNascimentoOuCelular.has(i)) {
      semGrupo.push(p);
      return;
    }
    const raiz = uf.encontrar(i);
    if (!grupos.has(raiz)) grupos.set(raiz, []);
    grupos.get(raiz).push(p);
  });

  return { grupos, semGrupo };
}

function montarDadosCliente(pedidosDoGrupo) {
  function chaveOrdenacao(dataStr) {
    if (!dataStr) return '';
    const partes = String(dataStr).split('/');
    if (partes.length !== 3) return dataStr;
    const [dd, mm, aa] = partes;
    return `${aa}${mm}${dd}`;
  }

  const ordenados = [...pedidosDoGrupo].sort((a, b) =>
    chaveOrdenacao(b.data_pedido).localeCompare(chaveOrdenacao(a.data_pedido))
  );

  const contagemNomes = new Map();
  for (const p of pedidosDoGrupo) {
    const n = String(p.nome).trim();
    contagemNomes.set(n, (contagemNomes.get(n) || 0) + 1);
  }
  const nomeMaisComum = [...contagemNomes.entries()].sort((a, b) => b[1] - a[1])[0][0];

  function primeiroPreenchido(campo) {
    for (const p of ordenados) {
      const valor = p[campo];
      if (campo === 'nascimento' && normalizarData(valor) === '') continue;
      if (!vazio(valor)) return valor;
    }
    return null;
  }

  return {
    nome: nomeMaisComum,
    nascimento: primeiroPreenchido('nascimento'),
    fixo: primeiroPreenchido('fixo'),
    celular: primeiroPreenchido('celular'),
    endereco: primeiroPreenchido('endereco'),
    complemento: primeiroPreenchido('complemento'),
    bairro: primeiroPreenchido('bairro'),
    referencia: primeiroPreenchido('referencia'),
  };
}

function aplicar(grupos) {
  const inserirCliente = db.prepare(`
    INSERT INTO clientes (nome, nascimento, fixo, celular, endereco, complemento, bairro, referencia)
    VALUES (@nome, @nascimento, @fixo, @celular, @endereco, @complemento, @bairro, @referencia)
  `);
  const vincularFonada = db.prepare('UPDATE fonadas SET cliente_id = ? WHERE id = ?');
  const vincularAoVivo = db.prepare('UPDATE ao_vivo SET cliente_id = ? WHERE id = ?');

  let totalClientes = 0;
  let totalVinculados = 0;

  db.exec('BEGIN');
  try {
    for (const pedidosDoGrupo of grupos.values()) {
      const dadosCliente = montarDadosCliente(pedidosDoGrupo);
      const resultado = inserirCliente.run(dadosCliente);
      const clienteId = resultado.lastInsertRowid;
      totalClientes++;

      for (const p of pedidosDoGrupo) {
        if (p.sistema === 'fonada') vincularFonada.run(clienteId, p.id);
        else vincularAoVivo.run(clienteId, p.id);
        totalVinculados++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { totalClientes, totalVinculados };
}

function casosParaConferir(grupos) {
  const casos = [];
  for (const pedidosDoGrupo of grupos.values()) {
    const nomesUnicos = [...new Set(pedidosDoGrupo.map((p) => normalizarNome(p.nome)))];
    if (nomesUnicos.length <= 1) continue;
    let temVariacao = false;
    for (let i = 0; i < nomesUnicos.length; i++) {
      for (let j = i + 1; j < nomesUnicos.length; j++) {
        if (nomesUnicos[i] !== nomesUnicos[j]) temVariacao = true;
      }
    }
    if (temVariacao) casos.push(nomesUnicos);
  }
  return casos;
}

function desfazer() {
  console.log('\n🗑️  Desfazendo vínculos e apagando clientes...\n');
  db.exec('BEGIN');
  try {
    db.exec('UPDATE fonadas SET cliente_id = NULL');
    db.exec('UPDATE ao_vivo SET cliente_id = NULL');
    db.exec('DELETE FROM clientes');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log('✅ Todos os clientes foram apagados e os pedidos desvinculados.\n');
  console.log('Rode o script novamente (com ou sem --simular) para vincular do zero.\n');
}

function main() {
  iniciarBanco();

  if (MODO_DESFAZER) {
    desfazer();
    return;
  }

  console.log(`\n${MODO_SIMULACAO ? '🔍 MODO SIMULAÇÃO (nada será alterado)' : '⚙️  APLICANDO DE VERDADE'}\n`);

  const pedidos = carregarPedidosSemCliente();
  console.log(`Pedidos sem cliente vinculado encontrados: ${pedidos.length}`);

  const { grupos, semGrupo } = agruparPedidos(pedidos);

  const totalCobertos = [...grupos.values()].reduce((s, g) => s + g.length, 0);

  console.log(`\n--- Agrupamento (nome compatível + nascimento OU celular) ---`);
  console.log(`  Grupos (clientes): ${grupos.size}`);
  console.log(`  Pedidos cobertos: ${totalCobertos}`);

  console.log(`\n--- Sem grupo (ficam sem cliente vinculado) ---`);
  console.log(`  Pedidos: ${semGrupo.length}`);

  console.log(`\n=== RESUMO ===`);
  console.log(`Clientes que ${MODO_SIMULACAO ? 'seriam' : 'serão'} criados: ${grupos.size}`);
  console.log(`Pedidos vinculados: ${totalCobertos} de ${pedidos.length} (${(100 * totalCobertos / pedidos.length).toFixed(1)}%)`);
  console.log(`Pedidos sem vínculo: ${semGrupo.length} (${(100 * semGrupo.length / pedidos.length).toFixed(1)}%)`);

  const casos = casosParaConferir(grupos);
  console.log(`\n--- Grupos com variação de nome (para conferência) ---`);
  console.log(`  Total: ${casos.length} grupo(s) juntaram nomes escritos de forma diferente.`);
  console.log(`  Amostra (até 30):`);
  for (const nomes of casos.slice(0, 30)) {
    console.log(`    ${nomes.join(' | ')}`);
  }

  if (MODO_SIMULACAO) {
    console.log(`\nNada foi alterado no banco. Rode sem --simular para aplicar de verdade.\n`);
    return;
  }

  console.log(`\nAplicando...`);
  const { totalClientes, totalVinculados } = aplicar(grupos);
  console.log(`\n✅ ${totalClientes} cliente(s) criado(s).`);
  console.log(`✅ ${totalVinculados} pedido(s) vinculado(s).`);
  console.log(`\n🎉 Concluído!\n`);
}

main();
