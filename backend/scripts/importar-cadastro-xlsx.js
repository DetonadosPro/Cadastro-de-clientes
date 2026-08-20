// scripts/importar-cadastro-xlsx.js
//
// Importa a planilha NOVA (cadastro.xlsx, abas "Fonadas" e "Ao vivo")
// para o banco de PRODUÇÃO no Railway, e já cria os clientes agrupados
// em seguida — tudo em um único script, numa única transação por etapa.
//
// ⚠️ ATENÇÃO — ESTE SCRIPT NÃO APAGA NADA SOZINHO.
// Rode a limpeza manual (TRUNCATE de fonadas, ao_vivo, clientes,
// tentativas_contato) ANTES de rodar este script, se for o caso — este
// script assume que as tabelas já estão vazias e prontas para receber
// os dados novos. Ele não faz DELETE/TRUNCATE em nada.
//
// REGRA DE AGRUPAMENTO EM CLIENTES (nesta ordem de prioridade):
//   1. Nome IDÊNTICO (comparação exata, sem normalizar acentos/caixa,
//      só removendo espaços sobrando no início/fim) E nascimento
//      (dia/mês, ignorando ano) IGUAL  →  mesmo cliente.
//   2. Nome idêntico, mas nascimento diferente ou algum dos dois sem
//      nascimento  →  só é mesmo cliente se o celular/telefone bater
//      (comparando só os dígitos).
//   3. Nome diferente  →  nunca é o mesmo cliente, mesmo que
//      nascimento ou celular batam.
//
// O pedido mais "completo" (mais campos preenchidos) de cada grupo é
// usado como base para os dados principais do cadastro do cliente.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a planilha em mãos):
//   1. Coloque cadastro.xlsx dentro de backend/scripts/ (ou passe o
//      caminho: node scripts/importar-cadastro-xlsx.js "C:\caminho\cadastro.xlsx")
//   2. Defina a DATABASE_URL pública do Postgres do Railway:
//        $env:DATABASE_URL="postgresql://..."
//   3. Rode: node scripts/importar-cadastro-xlsx.js --simular   (só relatório)
//      ou:   node scripts/importar-cadastro-xlsx.js             (aplica de verdade)

const path = require('path');
const xlsx = require('xlsx');
const { pool, iniciarBanco } = require('../src/db/database');

if (!process.env.DATABASE_URL) {
  console.error('❌ Defina a variável DATABASE_URL antes de rodar este script.');
  console.error('   Exemplo (PowerShell): $env:DATABASE_URL="postgresql://..."');
  process.exit(1);
}

const CAMINHO_PLANILHA = process.argv.find((a) => a.endsWith('.xlsx')) || path.join(__dirname, 'cadastro.xlsx');
const MODO_SIMULACAO = process.argv.includes('--simular');

function vazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function txt(v) {
  if (vazio(v)) return null;
  return String(v).trim();
}

function limparValorMonetario(v) {
  if (vazio(v)) return null;
  const texto = String(v).replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(texto);
  return isNaN(n) ? null : n;
}

// ------------------------------------------------------------------
// FONADAS (aba "Fonadas")
// ------------------------------------------------------------------
const COLUNAS_FONADA_XLSX = [
  'senha_os', 'nome_comprador', 'data_pedido', 'nascimento',
  'p1_dia', 'p1_para', 'p2_dia', 'p2_para', 'tipo', 'recall',
  'p1_tema', 'p1_mensagem', 'p1_fixo', 'p1_celular', 'p1_horario', 'p1_quem_oferece', 'p1_resultado',
  'p2_tema', 'p2_mensagem', 'p2_fixo', 'p2_celular', 'p2_horario', 'p2_quem_oferece', 'p2_resultado',
  '_mv', 'comprador_horario', 'comprador_fixo', 'comprador_celular',
  'comprador_endereco', 'comprador_complemento', 'comprador_bairro', 'comprador_referencia',
  'valor', 'cobranca', 'periodo', 'pagou', 'recebi',
  'vender', 'status', 'impresso',
];

const CAMPOS_FONADA = [
  'senha_os', 'nome_comprador', 'data_pedido', 'horario_pedido', 'nascimento', 'tipo', 'recall',
  'p1_dia', 'p1_para', 'p1_tema', 'p1_mensagem', 'p1_fixo', 'p1_celular', 'p1_horario', 'p1_quem_oferece', 'p1_resultado',
  'p2_dia', 'p2_para', 'p2_tema', 'p2_mensagem', 'p2_fixo', 'p2_celular', 'p2_horario', 'p2_quem_oferece', 'p2_resultado',
  'comprador_fixo', 'comprador_celular', 'comprador_endereco', 'comprador_complemento', 'comprador_bairro', 'comprador_referencia',
  'valor', 'cobranca', 'periodo', 'pagou', 'recebi', 'vender', 'status', 'impresso',
];

async function importarFonadas(planilha) {
  const aba = planilha.Sheets['Fonadas'];
  if (!aba) throw new Error('Aba "Fonadas" não encontrada na planilha.');

  const linhas = xlsx.utils.sheet_to_json(aba, { header: 1, defval: null, raw: false });
  const linhasDados = linhas.slice(1);

  const placeholders = CAMPOS_FONADA.map((_, i) => `$${i + 1}`).join(', ');
  const sqlInserir = `INSERT INTO fonadas (${CAMPOS_FONADA.join(', ')}) VALUES (${placeholders}) RETURNING id`;

  const idsImportados = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const linha of linhasDados) {
      const bloco = {};
      COLUNAS_FONADA_XLSX.forEach((campo, i) => { bloco[campo] = linha[i]; });

      if (vazio(bloco.nome_comprador)) continue;

      const valores = {
        senha_os: txt(bloco.senha_os),
        nome_comprador: txt(bloco.nome_comprador),
        data_pedido: txt(bloco.data_pedido),
        horario_pedido: txt(bloco.comprador_horario),
        nascimento: txt(bloco.nascimento),
        tipo: txt(bloco.tipo),
        recall: txt(bloco.recall),
        p1_dia: txt(bloco.p1_dia),
        p1_para: txt(bloco.p1_para),
        p1_tema: txt(bloco.p1_tema),
        p1_mensagem: txt(bloco.p1_mensagem),
        p1_fixo: txt(bloco.p1_fixo),
        p1_celular: txt(bloco.p1_celular),
        p1_horario: txt(bloco.p1_horario),
        p1_quem_oferece: txt(bloco.p1_quem_oferece),
        p1_resultado: txt(bloco.p1_resultado),
        p2_dia: txt(bloco.p2_dia),
        p2_para: txt(bloco.p2_para),
        p2_tema: txt(bloco.p2_tema),
        p2_mensagem: txt(bloco.p2_mensagem),
        p2_fixo: txt(bloco.p2_fixo),
        p2_celular: txt(bloco.p2_celular),
        p2_horario: txt(bloco.p2_horario),
        p2_quem_oferece: txt(bloco.p2_quem_oferece),
        p2_resultado: txt(bloco.p2_resultado),
        comprador_fixo: txt(bloco.comprador_fixo),
        comprador_celular: txt(bloco.comprador_celular),
        comprador_endereco: txt(bloco.comprador_endereco),
        comprador_complemento: txt(bloco.comprador_complemento),
        comprador_bairro: txt(bloco.comprador_bairro),
        comprador_referencia: txt(bloco.comprador_referencia),
        valor: limparValorMonetario(bloco.valor),
        cobranca: txt(bloco.cobranca),
        periodo: txt(bloco.periodo),
        pagou: txt(bloco.pagou),
        recebi: txt(bloco.recebi),
        vender: txt(bloco.vender),
        status: txt(bloco.status),
        impresso: txt(bloco.impresso),
      };

      const params = CAMPOS_FONADA.map((campo) => valores[campo]);
      const resultado = await client.query(sqlInserir, params);
      idsImportados.push(resultado.rows[0].id);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`✅ ${idsImportados.length} pacote(s) de mensagem fonada importado(s) da aba "Fonadas".`);
  return idsImportados;
}

// ------------------------------------------------------------------
// AO VIVO (aba "Ao vivo")
// ------------------------------------------------------------------
const COLUNAS_AOVIVO_XLSX = [
  'numero_os', 'data_pedido', 'horario_pedido', 'dia_entrega', 'horario_entrega',
  'para', 'endereco', 'bairro', 'referencia', 'fixo_local', 'celular_local',
  'tema_1', 'mensagem_codigo_1', 'tema_2', 'mensagem_codigo_2', 'tema_3', 'mensagem_codigo_3',
  'musica_1', 'musica_2', 'musica_3', 'musica_4', 'musica_5', 'musica_6',
  'oferecimento', 'comprador', '_fixo_comprador', 'celular', 'celular2',
  'aniversario', 'valor', 'pagamento',
  '_dia_dvd', '_periodo_dvd', '_cobranca_dvd', '_bairro_dvd', '_referencia_dvd',
  '_entrega_dvd', '_bairro_dvd2', '_referencia_dvd2', null,
  'brinde',
];

const CAMPOS_AOVIVO = [
  'numero_os', 'data_pedido', 'horario_pedido', 'dia_entrega', 'horario_entrega',
  'comprador', 'para', 'oferecimento',
  'endereco', 'bairro', 'referencia',
  'fixo_local', 'celular_local', 'celular', 'celular2',
  'tema_1', 'mensagem_codigo_1', 'tema_2', 'mensagem_codigo_2', 'tema_3', 'mensagem_codigo_3',
  'musica_1', 'musica_2', 'musica_3', 'musica_4', 'musica_5', 'musica_6',
  'aniversario', 'valor', 'pagamento', 'brinde',
];

async function importarAoVivo(planilha) {
  const aba = planilha.Sheets['Ao vivo'];
  if (!aba) throw new Error('Aba "Ao vivo" não encontrada na planilha.');

  const linhas = xlsx.utils.sheet_to_json(aba, { header: 1, defval: null, raw: false });
  const linhasDados = linhas.slice(1);

  const placeholders = CAMPOS_AOVIVO.map((_, i) => `$${i + 1}`).join(', ');
  const sqlInserir = `INSERT INTO ao_vivo (${CAMPOS_AOVIVO.join(', ')}) VALUES (${placeholders}) RETURNING id`;

  const idsImportados = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const linha of linhasDados) {
      const bloco = {};
      COLUNAS_AOVIVO_XLSX.forEach((campo, i) => {
        if (campo) bloco[campo] = linha[i];
      });

      if (vazio(bloco.comprador)) continue;

      const valores = {
        numero_os: txt(bloco.numero_os),
        data_pedido: txt(bloco.data_pedido),
        horario_pedido: txt(bloco.horario_pedido),
        dia_entrega: txt(bloco.dia_entrega),
        horario_entrega: txt(bloco.horario_entrega),
        comprador: txt(bloco.comprador),
        para: txt(bloco.para),
        oferecimento: txt(bloco.oferecimento),
        endereco: txt(bloco.endereco),
        bairro: txt(bloco.bairro),
        referencia: txt(bloco.referencia),
        fixo_local: txt(bloco.fixo_local),
        celular_local: txt(bloco.celular_local),
        celular: txt(bloco.celular),
        celular2: txt(bloco.celular2),
        tema_1: txt(bloco.tema_1),
        mensagem_codigo_1: txt(bloco.mensagem_codigo_1),
        tema_2: txt(bloco.tema_2),
        mensagem_codigo_2: txt(bloco.mensagem_codigo_2),
        tema_3: txt(bloco.tema_3),
        mensagem_codigo_3: txt(bloco.mensagem_codigo_3),
        musica_1: txt(bloco.musica_1),
        musica_2: txt(bloco.musica_2),
        musica_3: txt(bloco.musica_3),
        musica_4: txt(bloco.musica_4),
        musica_5: txt(bloco.musica_5),
        musica_6: txt(bloco.musica_6),
        aniversario: txt(bloco.aniversario),
        valor: limparValorMonetario(bloco.valor),
        pagamento: txt(bloco.pagamento),
        brinde: txt(bloco.brinde),
      };

      const params = CAMPOS_AOVIVO.map((campo) => valores[campo]);
      const resultado = await client.query(sqlInserir, params);
      idsImportados.push(resultado.rows[0].id);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`✅ ${idsImportados.length} pedido(s) de mensagem ao vivo importado(s) da aba "Ao vivo".`);
  return idsImportados;
}

// ------------------------------------------------------------------
// AGRUPAMENTO EM CLIENTES
// ------------------------------------------------------------------

// Nome "idêntico" = idêntico byte a byte, exceto por espaços/tabs
// sobrando no início/fim (sujeira de digitação, não diferença real).
function normalizarNomeParaComparacao(nome) {
  return String(nome || '').trim();
}

// Extrai só "dd/mm" de qualquer formato de data encontrado na planilha
// (dd/mm, dd/mm/aa, dd/mm/aaaa). Retorna null se não for uma data
// reconhecível ou se for um valor "vazio" disfarçado (0, 00/00/00).
function diaMes(dataStr) {
  const s = String(dataStr || '').trim();
  if (!s || s === '0') return null;
  const m = s.match(/^(\d{2})\/(\d{2})(?:\/\d{2,4})?$/);
  if (!m) return null;
  const [, dd, mm] = m;
  if (dd === '00' || mm === '00') return null;
  return `${dd}/${mm}`;
}

function normalizarTelefone(tel) {
  return String(tel || '').replace(/\D/g, '');
}

async function carregarPedidosSemCliente() {
  const fonadasResultado = await pool.query(`
    SELECT id, 'fonada' as sistema, nome_comprador as nome, nascimento,
           comprador_celular as celular, comprador_fixo as fixo,
           comprador_endereco as endereco, comprador_complemento as complemento,
           comprador_bairro as bairro, comprador_referencia as referencia,
           data_pedido
    FROM fonadas
    WHERE cliente_id IS NULL AND nome_comprador IS NOT NULL AND nome_comprador != ''
  `);

  const aoVivoResultado = await pool.query(`
    SELECT id, 'aovivo' as sistema, comprador as nome, aniversario as nascimento,
           celular, NULL as fixo,
           endereco, NULL as complemento, bairro, referencia,
           data_pedido
    FROM ao_vivo
    WHERE cliente_id IS NULL AND comprador IS NOT NULL AND comprador != ''
  `);

  return [...fonadasResultado.rows, ...aoVivoResultado.rows];
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

// Agrupa pedidos em clientes seguindo, para cada par de pedidos com o
// MESMO nome (idêntico após trim):
//   - se ambos têm dia/mês de nascimento reconhecível: só une se
//     baterem;
//   - senão (falta nascimento em algum dos dois, ou não bate): só une
//     se o celular (dígitos) bater.
function agruparPedidos(pedidos) {
  const uf = new UniaoConjuntos(pedidos.length);

  const porNome = new Map();
  pedidos.forEach((p, i) => {
    const nome = normalizarNomeParaComparacao(p.nome);
    if (!nome) return;
    if (!porNome.has(nome)) porNome.set(nome, []);
    porNome.get(nome).push(i);
  });

  for (const indices of porNome.values()) {
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const ia = indices[a], ib = indices[b];
        const dmA = diaMes(pedidos[ia].nascimento);
        const dmB = diaMes(pedidos[ib].nascimento);

        if (dmA && dmB) {
          if (dmA === dmB) uf.unir(ia, ib);
          continue; // ambos têm nascimento e não bateram: não une por aqui
        }

        // Nascimento ausente em algum dos dois (ou nos dois) — cai
        // para comparação por telefone do comprador (celular OU fixo,
        // qualquer um dos dois batendo já é considerado a mesma pessoa).
        const celA = normalizarTelefone(pedidos[ia].celular);
        const celB = normalizarTelefone(pedidos[ib].celular);
        const fixoA = normalizarTelefone(pedidos[ia].fixo);
        const fixoB = normalizarTelefone(pedidos[ib].fixo);

        const celularBate = celA && celB && celA.length >= 8 && celA === celB;
        const fixoBate = fixoA && fixoB && fixoA.length >= 8 && fixoA === fixoB;

        if (celularBate || fixoBate) {
          uf.unir(ia, ib);
        }
      }
    }
  }

  const grupos = new Map();
  const semGrupo = [];
  pedidos.forEach((p, i) => {
    const nome = normalizarNomeParaComparacao(p.nome);
    const raiz = uf.encontrar(i);
    const chave = porNome.has(nome) && porNome.get(nome).length > 1 ? raiz : `solo-${i}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  });

  return grupos;
}

function vaziosContadosComo(p) {
  const campos = ['nascimento', 'celular', 'fixo', 'endereco', 'complemento', 'bairro', 'referencia'];
  return campos.filter((c) => !vazio(p[c])).length;
}

// Usa como base o pedido MAIS COMPLETO do grupo (mais campos
// preenchidos); em caso de empate, o mais recente por data_pedido.
function montarDadosCliente(pedidosDoGrupo) {
  function chaveOrdenacao(dataStr) {
    if (!dataStr) return '';
    const partes = String(dataStr).split('/');
    if (partes.length !== 3) return dataStr;
    const [dd, mm, aa] = partes;
    return `${aa}${mm}${dd}`;
  }

  const ordenados = [...pedidosDoGrupo].sort((a, b) => {
    const completudeA = vaziosContadosComo(a);
    const completudeB = vaziosContadosComo(b);
    if (completudeA !== completudeB) return completudeB - completudeA;
    return chaveOrdenacao(b.data_pedido).localeCompare(chaveOrdenacao(a.data_pedido));
  });

  const base = ordenados[0];

  // Nascimento: usa o dia/mês do pedido base se reconhecível; senão
  // procura no restante do grupo.
  let nascimento = diaMes(base.nascimento) ? base.nascimento : null;
  if (!nascimento) {
    for (const p of ordenados) {
      if (diaMes(p.nascimento)) { nascimento = p.nascimento; break; }
    }
  }

  function primeiroPreenchido(campo) {
    for (const p of ordenados) {
      if (!vazio(p[campo])) return p[campo];
    }
    return null;
  }

  return {
    nome: base.nome.trim(),
    nascimento,
    fixo: primeiroPreenchido('fixo'),
    celular: primeiroPreenchido('celular'),
    endereco: primeiroPreenchido('endereco'),
    complemento: primeiroPreenchido('complemento'),
    bairro: primeiroPreenchido('bairro'),
    referencia: primeiroPreenchido('referencia'),
  };
}

const CAMPOS_CLIENTE = ['nome', 'nascimento', 'fixo', 'celular', 'endereco', 'complemento', 'bairro', 'referencia'];

async function criarClientesEVincular(grupos) {
  let totalClientes = 0;
  let totalVinculados = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const pedidosDoGrupo of grupos.values()) {
      const dadosCliente = montarDadosCliente(pedidosDoGrupo);
      const valores = CAMPOS_CLIENTE.map((campo) => dadosCliente[campo]);
      const placeholders = CAMPOS_CLIENTE.map((_, i) => `$${i + 1}`).join(', ');

      const resultadoInsercao = await client.query(
        `INSERT INTO clientes (${CAMPOS_CLIENTE.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        valores
      );
      const clienteId = resultadoInsercao.rows[0].id;
      totalClientes++;

      for (const p of pedidosDoGrupo) {
        const tabela = p.sistema === 'fonada' ? 'fonadas' : 'ao_vivo';
        await client.query(`UPDATE ${tabela} SET cliente_id = $1 WHERE id = $2`, [clienteId, p.id]);
        totalVinculados++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { totalClientes, totalVinculados };
}

// ------------------------------------------------------------------
async function main() {
  console.log(`\n📂 Lendo planilha: ${CAMINHO_PLANILHA}\n`);

  await iniciarBanco();

  const planilha = xlsx.readFile(CAMINHO_PLANILHA, { cellDates: false });

  console.log(`${MODO_SIMULACAO ? '🔍 MODO SIMULAÇÃO' : '⚙️  IMPORTANDO DE VERDADE'}\n`);

  if (MODO_SIMULACAO) {
    console.log('Modo simulação ainda não faz leitura de contagem sem importar —');
    console.log('rode sem --simular para importar; a importação em si já é o');
    console.log('primeiro passo necessário antes do agrupamento.\n');
    await pool.end();
    return;
  }

  await importarFonadas(planilha);
  await importarAoVivo(planilha);

  console.log('\n🔗 Agrupando pedidos em clientes...\n');
  const pedidos = await carregarPedidosSemCliente();
  console.log(`Pedidos sem cliente vinculado: ${pedidos.length}`);

  const grupos = agruparPedidos(pedidos);
  const totalCobertos = [...grupos.values()].reduce((s, g) => s + g.length, 0);
  console.log(`Grupos (clientes) formados: ${grupos.size}`);
  console.log(`Pedidos cobertos: ${totalCobertos}`);

  const { totalClientes, totalVinculados } = await criarClientesEVincular(grupos);
  console.log(`\n✅ ${totalClientes} cliente(s) criado(s).`);
  console.log(`✅ ${totalVinculados} pedido(s) vinculado(s).`);
  console.log(`\n🎉 Importação e agrupamento concluídos!\n`);

  await pool.end();
}

main().catch((erro) => {
  console.error('\n❌ Erro durante a importação:', erro.message);
  process.exit(1);
});
