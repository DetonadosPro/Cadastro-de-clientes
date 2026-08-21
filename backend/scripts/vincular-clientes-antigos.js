// scripts/vincular-clientes-antigos.js
//
// Migrado para PostgreSQL. Organiza o histórico de pedidos antigos (de
// antes do cadastro de clientes existir) em clientes de verdade, e
// vincula cada pedido ao cliente correspondente.
//
// NOVO CRITÉRIO (revisado após conferência manual do resultado
// anterior, que estava juntando pessoas diferentes por engano):
//
//   Etapa 1 — Fonada entre si:
//     nome 80% parecido (similaridade de texto do nome inteiro,
//     via distância de edição) E nascimento idêntico (só dd/mm,
//     ignorando o ano — pedidos antigos às vezes têm ano, às vezes
//     não, para o mesmo aniversário).
//
//   Etapa 2 — Ao Vivo entre si:
//     nome 80% parecido E celular idêntico (só dígitos).
//
//   Etapa 3 — Junta os clientes resultantes da Etapa 1 com os da
//     Etapa 2, quando forem a mesma pessoa:
//     nome 80% parecido E (celular idêntico OU fixo idêntico).
//     Ao juntar, os dados de cadastro do lado Fonada prevalecem.
//
// "Nome 80% parecido" = similaridade híbrida do nome inteiro
// normalizado (maiúsculas, sem acento, espaços colapsados):
//   - se um nome é extensão literal do outro (mesmas palavras, na
//     ordem, com palavras extras — ex: "Maria Silva" → "Maria Silva
//     Santos"), conta como parecido direto;
//   - senão, o PRIMEIRO nome precisa ser muito parecido (85%+) antes
//     de considerar o resto — evita juntar "Maria Silva" com "Marta
//     Silva" (pessoas diferentes) só por coincidência do sobrenome;
//   - aí sim, aplica o limiar de 80% de similaridade de texto
//     (distância de edição / Levenshtein) no nome inteiro.
// Ajustado após conferência manual da primeira versão (que usava só
// Levenshtein puro), que juntou algumas pessoas diferentes por
// engano.
//
// Como usar (rode isso NO SEU COMPUTADOR, com a DATABASE_URL definida):
//   node scripts/vincular-clientes-antigos.js --simular   → só mostra o relatório, não muda nada
//   node scripts/vincular-clientes-antigos.js             → aplica de verdade
//   node scripts/vincular-clientes-antigos.js --desfazer  → apaga TODOS os clientes e desvincula
//                                                             todos os pedidos (cliente_id = NULL),
//                                                             para poder rodar do zero com regras novas

const { pool, iniciarBanco } = require('../src/db/database');

if (!process.env.DATABASE_URL) {
  console.error('❌ Defina a variável DATABASE_URL antes de rodar este script.');
  console.error('   Exemplo (PowerShell): $env:DATABASE_URL="postgresql://..."');
  process.exit(1);
}

const MODO_SIMULACAO = process.argv.includes('--simular');
const MODO_DESFAZER = process.argv.includes('--desfazer');

const LIMIAR_SIMILARIDADE_NOME = 0.8;

function normalizarNome(nome) {
  return String(nome || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrai só "dd/mm" de uma data no formato "dd/mm" ou "dd/mm/aa[aa]" —
// alguns pedidos antigos têm o nascimento salvo sem ano, outros com
// ano de 2 ou 4 dígitos. Duas pessoas com o mesmo dia/mês de
// aniversário devem ser tratadas como o mesmo aniversário aqui, com
// ou sem ano preenchido. Retorna '' se a data não for reconhecível.
function normalizarData(data) {
  const s = String(data || '').trim();
  if (!s || s === '0') return '';
  const m = s.match(/^(\d{2})\/(\d{2})(?:\/\d{2,4})?$/);
  return m ? `${m[1]}/${m[2]}` : '';
}

function normalizarTelefone(tel) {
  return String(tel || '').replace(/\D/g, '');
}

function vazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

// Distância de edição (Levenshtein) entre duas strings — quantos
// caracteres precisam ser inseridos/removidos/trocados para
// transformar uma na outra.
function distanciaEdicao(a, b) {
  const m = a.length, n = b.length;
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

// Similaridade de texto entre 0 e 1, baseada na distância de edição
// relativa ao tamanho do maior nome. 1 = idênticos, 0 = completamente
// diferentes.
function similaridadeBase(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maiorTamanho = Math.max(a.length, b.length);
  if (maiorTamanho === 0) return 1;
  const distancia = distanciaEdicao(a, b);
  return 1 - distancia / maiorTamanho;
}

// Verifica se todas as palavras de um dos nomes aparecem, na mesma
// ordem, dentro do outro nome (o mais longo pode ter palavras extras
// no meio/fim). Cobre o caso comum de "Maria da Silva" cadastrado
// mais completo depois como "Maria da Silva Santos" — mesma pessoa,
// mas a similaridade pura de texto cairia bastante só por causa do
// tamanho diferente.
function ehExtensaoDoOutro(nomeA, nomeB) {
  const [curto, longo] = nomeA.length <= nomeB.length ? [nomeA, nomeB] : [nomeB, nomeA];
  const palavrasCurto = curto.split(' ');
  const palavrasLongo = longo.split(' ');
  let idx = 0;
  for (const p of palavrasCurto) {
    idx = palavrasLongo.indexOf(p, idx);
    if (idx === -1) return false;
    idx++;
  }
  return true;
}

// Similaridade híbrida: combina a similaridade de texto do nome
// inteiro (Opção 1 original) com duas correções que apareceram em
// testes reais:
//   1. Nome "extensão" do outro (mesmas palavras, na ordem, com
//      palavras extras) sempre conta como parecido — mesmo se a
//      diferença de tamanho faria a similaridade pura cair abaixo do
//      limiar.
//   2. O PRIMEIRO nome precisa ser muito parecido (85%+, ou idêntico)
//      antes de sequer considerar o resto — sem isso, nomes como
//      "MARIA SILVA" e "MARTA SILVA" (pessoas diferentes) passavam
//      no critério de 80% do texto inteiro só por coincidência do
//      sobrenome ser igual e o restante da palavra ser curta.
function similaridade(nomeA, nomeB) {
  const a = normalizarNome(nomeA);
  const b = normalizarNome(nomeB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  if (ehExtensaoDoOutro(a, b)) return 1;

  const primeiroA = a.split(' ')[0];
  const primeiroB = b.split(' ')[0];
  if (primeiroA !== primeiroB && similaridadeBase(primeiroA, primeiroB) < 0.85) return 0;

  return similaridadeBase(a, b);
}

function nomesParecidos80(nomeA, nomeB) {
  return similaridade(nomeA, nomeB) >= LIMIAR_SIMILARIDADE_NOME;
}

// ---------- Carregamento dos pedidos ----------

async function carregarPedidosFonadaSemCliente() {
  const resultado = await pool.query(`
    SELECT id, nome_comprador as nome, nascimento,
           comprador_celular as celular, comprador_fixo as fixo,
           comprador_whatsapp as whatsapp,
           comprador_endereco as endereco, comprador_complemento as complemento,
           comprador_bairro as bairro, comprador_referencia as referencia,
           data_pedido
    FROM fonadas
    WHERE cliente_id IS NULL AND nome_comprador IS NOT NULL AND nome_comprador != ''
  `);
  return resultado.rows;
}

async function carregarPedidosAoVivoSemCliente() {
  const resultado = await pool.query(`
    SELECT id, comprador as nome, aniversario as nascimento,
           celular, whatsapp,
           NULL as fixo,
           endereco, NULL as complemento, bairro, NULL as referencia,
           data_pedido
    FROM ao_vivo
    WHERE cliente_id IS NULL AND comprador IS NOT NULL AND comprador != ''
  `);
  return resultado.rows;
}

// ---------- Etapa 1 e 2: agrupar pedidos de um mesmo sistema entre si ----------
//
// Critério: nome 80% parecido E o campo-chave (nascimento na Fonada,
// celular no Ao Vivo) idêntico.
//
// IMPORTANTE — clique completo, não union-find: um pedido só entra
// num grupo se for parecido com TODOS os membros já confirmados
// dele, não só com "algum" membro. "Nome parecido" não é uma relação
// transitiva (A parecido com B, B parecido com C, não implica A
// parecido com C) — usar union-find aqui permitia que um nome
// intermediário servisse de "ponte" e juntasse duas pessoas
// diferentes que nunca foram diretamente parecidas entre si (bug
// real encontrado: "LENI APARECIDA DE OLIVEIRA" e "APARECIDA ROCHA
// PEREIRA" se juntaram por causa de um terceiro nome parecido com os
// dois, mesmo a similaridade direta entre eles sendo 0).
function agruparPorChave(pedidos, extrairChave) {
  const porChave = new Map();

  pedidos.forEach((p, i) => {
    const chave = extrairChave(p);
    if (!chave) return;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave).push(i);
  });

  const grupos = [];
  const semGrupo = [];
  const temChave = new Set();

  for (const indices of porChave.values()) {
    // Cada `indices` já compartilha a mesma chave (nascimento ou
    // celular). Agora particiona esses índices em grupos onde,
    // dentro de cada grupo, todo par de nomes é parecido >= 80%.
    const gruposDaChave = []; // cada item: array de índices

    for (const i of indices) {
      let grupoEncontrado = null;
      for (const grupo of gruposDaChave) {
        const parecidoComTodos = grupo.every((j) => nomesParecidos80(pedidos[i].nome, pedidos[j].nome));
        if (parecidoComTodos) {
          grupoEncontrado = grupo;
          break;
        }
      }
      if (grupoEncontrado) {
        grupoEncontrado.push(i);
      } else {
        gruposDaChave.push([i]);
      }
    }

    for (const grupo of gruposDaChave) {
      grupo.forEach((i) => temChave.add(i));
      if (grupo.length > 1) {
        grupos.push(grupo.map((i) => pedidos[i]));
      } else {
        // Grupo de 1 pedido (não achou par parecido nessa chave) —
        // não vira "grupo" de cliente sozinho aqui; cai em semGrupo
        // como os pedidos que nunca tiveram chave.
        semGrupo.push(pedidos[grupo[0]]);
      }
    }
  }

  pedidos.forEach((p, i) => {
    if (!temChave.has(i)) semGrupo.push(p);
  });

  return { grupos, semGrupo };
}

function agruparFonada(pedidos) {
  return agruparPorChave(pedidos, (p) => normalizarData(p.nascimento));
}

function agruparAoVivo(pedidos) {
  return agruparPorChave(pedidos, (p) => {
    const tel = normalizarTelefone(p.celular);
    return tel.length >= 8 ? tel : '';
  });
}

// ---------- Montagem dos dados de um cliente a partir de um grupo ----------

function chaveOrdenacaoData(dataStr) {
  if (!dataStr) return '';
  const partes = String(dataStr).split('/');
  if (partes.length !== 3) return dataStr;
  const [dd, mm, aa] = partes;
  return `${aa}${mm}${dd}`;
}

function nomeMaisComum(pedidos) {
  const contagem = new Map();
  for (const p of pedidos) {
    const n = String(p.nome).trim();
    contagem.set(n, (contagem.get(n) || 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function primeiroPreenchido(ordenados, campo) {
  for (const p of ordenados) {
    const valor = p[campo];
    if (campo === 'nascimento' && normalizarData(valor) === '') continue;
    if (!vazio(valor)) return valor;
  }
  return null;
}

const CAMPOS_CLIENTE = ['nome', 'nascimento', 'fixo', 'whatsapp', 'celular', 'endereco', 'complemento', 'bairro', 'referencia'];

// Monta os dados de cliente de um grupo (pedidos do mesmo sistema),
// usando os dados do pedido mais recente como prioridade — mesmo
// espírito da regra "manter dados do último pedido de Fonada" que
// vale na Etapa 3, mas aqui aplicado dentro de um único sistema.
function montarDadosGrupo(pedidos) {
  const ordenados = [...pedidos].sort((a, b) =>
    chaveOrdenacaoData(b.data_pedido).localeCompare(chaveOrdenacaoData(a.data_pedido))
  );
  const dados = { nome: nomeMaisComum(pedidos) };
  for (const campo of CAMPOS_CLIENTE) {
    if (campo === 'nome') continue;
    dados[campo] = primeiroPreenchido(ordenados, campo);
  }
  return dados;
}

// ---------- Etapa 3: juntar os "clientes candidatos" de Fonada com os de Ao Vivo ----------
//
// Cada grupo da Etapa 1 (Fonada) e da Etapa 2 (Ao Vivo) vira um
// "candidato a cliente" com dados já resumidos. Aqui comparamos esses
// candidatos entre si: nome 80% parecido E (celular OU fixo
// idêntico). Quando batem, viram um cliente único — mantendo os
// dados do lado Fonada, conforme pedido.

function normalizarTelOuVazio(v) {
  const t = normalizarTelefone(v);
  return t.length >= 8 ? t : '';
}

function candidatosCompativeis(a, b) {
  if (!nomesParecidos80(a.dados.nome, b.dados.nome)) return false;
  const celA = normalizarTelOuVazio(a.dados.celular);
  const celB = normalizarTelOuVazio(b.dados.celular);
  const fixoA = normalizarTelOuVazio(a.dados.fixo);
  const fixoB = normalizarTelOuVazio(b.dados.fixo);
  if (celA && celB && celA === celB) return true;
  if (fixoA && fixoB && fixoA === fixoB) return true;
  // Também considera celular de um lado batendo com fixo do outro —
  // é comum um pedido registrar o mesmo número em campos diferentes.
  if (celA && fixoB && celA === fixoB) return true;
  if (fixoA && celB && fixoA === celB) return true;
  return false;
}

function unirEtapa3(candidatosFonada, candidatosAoVivo) {
  // Clique completo, igual às Etapas 1 e 2 — evita que um candidato
  // sirva de ponte e junte duas pessoas diferentes por transitividade
  // (ex: telefone de casa compartilhado por mais de uma pessoa).
  const grupos = candidatosFonada.map((c) => ({ fonada: [c], aovivo: [] }));

  for (const candAV of candidatosAoVivo) {
    let grupoEncontrado = null;
    for (const grupo of grupos) {
      const compativelComFonada = grupo.fonada.every((c) => candidatosCompativeis(candAV, c));
      const compativelComAoVivo = grupo.aovivo.every((c) => candidatosCompativeis(candAV, c));
      if (compativelComFonada && compativelComAoVivo && grupo.fonada.length > 0) {
        grupoEncontrado = grupo;
        break;
      }
    }
    if (grupoEncontrado) {
      grupoEncontrado.aovivo.push(candAV);
    } else {
      grupos.push({ fonada: [], aovivo: [candAV] });
    }
  }

  return grupos.map((g) => [...g.fonada, ...g.aovivo]);
}

// Monta os dados finais de um cliente a partir dos candidatos unidos
// na Etapa 3 — priorizando sempre os dados de um candidato de
// FONADA (o mais recente, se houver mais de um) sobre os de AO VIVO,
// conforme pedido. Se não houver nenhum candidato de Fonada no grupo
// (só Ao Vivo), usa os dados do Ao Vivo normalmente.
function montarDadosFinais(candidatosDoGrupo) {
  const candidatosFonada = candidatosDoGrupo.filter((c) => c.sistemaOrigem === 'fonada');
  const baseParaDados = candidatosFonada.length > 0
    ? candidatosFonada.sort((a, b) =>
        chaveOrdenacaoData(b.dataPedidoMaisRecente).localeCompare(chaveOrdenacaoData(a.dataPedidoMaisRecente))
      )[0]
    : [...candidatosDoGrupo].sort((a, b) =>
        chaveOrdenacaoData(b.dataPedidoMaisRecente).localeCompare(chaveOrdenacaoData(a.dataPedidoMaisRecente))
      )[0];

  // Complementa campos vazios da base com dados dos outros candidatos
  // do grupo, para não perder informação útil (ex: base sem endereço,
  // outro candidato com endereço preenchido).
  const dadosFinais = { ...baseParaDados.dados };
  for (const campo of CAMPOS_CLIENTE) {
    if (!vazio(dadosFinais[campo])) continue;
    for (const cand of candidatosDoGrupo) {
      if (cand === baseParaDados) continue;
      if (campo === 'nascimento' && normalizarData(cand.dados[campo]) === '') continue;
      if (!vazio(cand.dados[campo])) {
        dadosFinais[campo] = cand.dados[campo];
        break;
      }
    }
  }
  return dadosFinais;
}

// ---------- Aplicação no banco ----------

async function aplicar(gruposFinais) {
  let totalClientes = 0;
  let totalVinculados = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Otimização: em vez de um INSERT por cliente (6 mil+ idas e
    // vindas sequenciais pela rede até o Railway — esse era o
    // gargalo real, não os UPDATEs) monta os clientes em lotes de 500
    // com um único INSERT multi-linha por lote, usando "RETURNING id"
    // para pegar de volta os ids na mesma ordem em que foram
    // inseridos (o Postgres preserva a ordem de VALUES em
    // RETURNING). Os UPDATEs de fonadas/ao_vivo continuam via UNNEST,
    // como antes.
    const TAMANHO_LOTE = 500;
    const clienteIdPorGrupo = new Array(gruposFinais.length);
    const dadosPorGrupo = gruposFinais.map((candidatosDoGrupo) => montarDadosFinais(candidatosDoGrupo));

    for (let inicio = 0; inicio < dadosPorGrupo.length; inicio += TAMANHO_LOTE) {
      const lote = dadosPorGrupo.slice(inicio, inicio + TAMANHO_LOTE);
      const valores = [];
      const gruposDeLinhas = lote.map((dadosCliente, i) => {
        const base = i * CAMPOS_CLIENTE.length;
        CAMPOS_CLIENTE.forEach((campo) => valores.push(dadosCliente[campo]));
        const placeholders = CAMPOS_CLIENTE.map((_, j) => `$${base + j + 1}`).join(', ');
        return `(${placeholders})`;
      });

      const resultadoInsercao = await client.query(
        `INSERT INTO clientes (${CAMPOS_CLIENTE.join(', ')}) VALUES ${gruposDeLinhas.join(', ')} RETURNING id`,
        valores
      );

      resultadoInsercao.rows.forEach((linha, i) => {
        clienteIdPorGrupo[inicio + i] = linha.id;
      });
      totalClientes += lote.length;
    }

    const idsFonada = [];
    const clienteIdsFonada = [];
    const idsAoVivo = [];
    const clienteIdsAoVivo = [];

    gruposFinais.forEach((candidatosDoGrupo, i) => {
      const clienteId = clienteIdPorGrupo[i];
      for (const cand of candidatosDoGrupo) {
        const ehFonada = cand.sistemaOrigem === 'fonada';
        for (const p of cand.pedidos) {
          if (ehFonada) {
            idsFonada.push(p.id);
            clienteIdsFonada.push(clienteId);
          } else {
            idsAoVivo.push(p.id);
            clienteIdsAoVivo.push(clienteId);
          }
          totalVinculados++;
        }
      }
    });

    if (idsFonada.length > 0) {
      await client.query(
        `UPDATE fonadas AS f SET cliente_id = dados.cliente_id
         FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::int[]) AS cliente_id) AS dados
         WHERE f.id = dados.id`,
        [idsFonada, clienteIdsFonada]
      );
    }
    if (idsAoVivo.length > 0) {
      await client.query(
        `UPDATE ao_vivo AS a SET cliente_id = dados.cliente_id
         FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::int[]) AS cliente_id) AS dados
         WHERE a.id = dados.id`,
        [idsAoVivo, clienteIdsAoVivo]
      );
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

async function desfazer() {
  console.log('\n🗑️  Desfazendo vínculos e apagando clientes...\n');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE fonadas SET cliente_id = NULL');
    await client.query('UPDATE ao_vivo SET cliente_id = NULL');
    await client.query('DELETE FROM clientes');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log('✅ Todos os clientes foram apagados e os pedidos desvinculados.\n');
  console.log('Rode o script novamente (com ou sem --simular) para vincular do zero.\n');
}

// ---------- Relatório de conferência ----------

function casosParaConferir(gruposDeUmaEtapa) {
  const casos = [];
  for (const pedidosDoGrupo of gruposDeUmaEtapa) {
    const nomesUnicos = [...new Set(pedidosDoGrupo.map((p) => normalizarNome(p.nome)))];
    if (nomesUnicos.length > 1) casos.push(nomesUnicos);
  }
  return casos;
}

function candidatosParaConferirEtapa3(gruposFinais) {
  const casos = [];
  for (const candidatosDoGrupo of gruposFinais) {
    if (candidatosDoGrupo.length <= 1) continue;
    const nomesUnicos = [...new Set(candidatosDoGrupo.map((c) => normalizarNome(c.dados.nome)))];
    if (nomesUnicos.length > 1) casos.push(nomesUnicos);
  }
  return casos;
}

async function main() {
  await iniciarBanco();

  if (MODO_DESFAZER) {
    await desfazer();
    await pool.end();
    return;
  }

  console.log(`\n${MODO_SIMULACAO ? '🔍 MODO SIMULAÇÃO (nada será alterado)' : '⚙️  APLICANDO DE VERDADE'}\n`);
  console.log(`Critério: nome ${LIMIAR_SIMILARIDADE_NOME * 100}% parecido (Levenshtein) + chave exata por etapa.\n`);

  // --- Etapa 1: Fonada entre si (nome 80% + nascimento dd/mm) ---
  const pedidosFonada = await carregarPedidosFonadaSemCliente();
  const { grupos: gruposFonada, semGrupo: semGrupoFonada } = agruparFonada(pedidosFonada);
  console.log(`--- Etapa 1: Fonada entre si (nome 80% + nascimento) ---`);
  console.log(`  Pedidos de Fonada sem cliente: ${pedidosFonada.length}`);
  console.log(`  Grupos formados: ${gruposFonada.length}`);
  console.log(`  Pedidos sem grupo (nascimento vazio/único): ${semGrupoFonada.length}`);

  // --- Etapa 2: Ao Vivo entre si (nome 80% + celular) ---
  const pedidosAoVivo = await carregarPedidosAoVivoSemCliente();
  const { grupos: gruposAoVivo, semGrupo: semGrupoAoVivo } = agruparAoVivo(pedidosAoVivo);
  console.log(`\n--- Etapa 2: Ao Vivo entre si (nome 80% + celular) ---`);
  console.log(`  Pedidos de Ao Vivo sem cliente: ${pedidosAoVivo.length}`);
  console.log(`  Grupos formados: ${gruposAoVivo.length}`);
  console.log(`  Pedidos sem grupo (celular vazio/único): ${semGrupoAoVivo.length}`);

  // Candidatos: cada grupo formado (Etapa 1 e 2) vira um candidato a
  // cliente. Pedidos sem grupo (não bateram com ninguém) também viram
  // candidatos individuais — cada um é seu próprio "grupo de 1".
  function candidatosDe(grupos, semGrupo, sistemaOrigem) {
    const todosOsGrupos = [...grupos, ...semGrupo.map((p) => [p])];
    return todosOsGrupos.map((pedidos) => ({
      sistemaOrigem,
      pedidos,
      dados: montarDadosGrupo(pedidos),
      dataPedidoMaisRecente: [...pedidos].sort((a, b) =>
        chaveOrdenacaoData(b.data_pedido).localeCompare(chaveOrdenacaoData(a.data_pedido))
      )[0].data_pedido,
    }));
  }

  const candidatosFonada = candidatosDe(gruposFonada, semGrupoFonada, 'fonada');
  const candidatosAoVivo = candidatosDe(gruposAoVivo, semGrupoAoVivo, 'aovivo');

  // --- Etapa 3: junta candidatos de Fonada com os de Ao Vivo ---
  const gruposFinais = unirEtapa3(candidatosFonada, candidatosAoVivo);
  const gruposComJuncao = gruposFinais.filter((g) => g.length > 1);
  console.log(`\n--- Etapa 3: juntando Fonada com Ao Vivo (nome 80% + celular/fixo) ---`);
  console.log(`  Candidatos de Fonada: ${candidatosFonada.length}`);
  console.log(`  Candidatos de Ao Vivo: ${candidatosAoVivo.length}`);
  console.log(`  Clientes finais: ${gruposFinais.length}`);
  console.log(`  Casos onde Fonada e Ao Vivo se juntaram: ${gruposComJuncao.length}`);

  const totalPedidos = pedidosFonada.length + pedidosAoVivo.length;
  const totalVinculadosPrevisto = gruposFinais.reduce((s, g) => s + g.reduce((s2, c) => s2 + c.pedidos.length, 0), 0);

  console.log(`\n=== RESUMO ===`);
  console.log(`Clientes que ${MODO_SIMULACAO ? 'seriam' : 'serão'} criados: ${gruposFinais.length}`);
  console.log(`Pedidos vinculados: ${totalVinculadosPrevisto} de ${totalPedidos} (${totalPedidos > 0 ? (100 * totalVinculadosPrevisto / totalPedidos).toFixed(1) : '0'}%)`);

  const casosFonada = casosParaConferir(gruposFonada);
  console.log(`\n--- Etapa 1: grupos com variação de nome (para conferência) ---`);
  console.log(`  Total: ${casosFonada.length} grupo(s).`);
  for (const nomes of casosFonada.slice(0, 20)) {
    console.log(`    ${nomes.join(' | ')}`);
  }

  const casosAoVivo = casosParaConferir(gruposAoVivo);
  console.log(`\n--- Etapa 2: grupos com variação de nome (para conferência) ---`);
  console.log(`  Total: ${casosAoVivo.length} grupo(s).`);
  for (const nomes of casosAoVivo.slice(0, 20)) {
    console.log(`    ${nomes.join(' | ')}`);
  }

  const casosEtapa3 = candidatosParaConferirEtapa3(gruposFinais);
  console.log(`\n--- Etapa 3: junções Fonada+AoVivo com variação de nome (para conferência) ---`);
  console.log(`  Total: ${casosEtapa3.length} grupo(s).`);
  for (const nomes of casosEtapa3.slice(0, 20)) {
    console.log(`    ${nomes.join(' | ')}`);
  }

  if (MODO_SIMULACAO) {
    console.log(`\nNada foi alterado no banco. Rode sem --simular para aplicar de verdade.\n`);
    await pool.end();
    return;
  }

  console.log(`\nAplicando...`);
  const { totalClientes, totalVinculados } = await aplicar(gruposFinais);
  console.log(`\n✅ ${totalClientes} cliente(s) criado(s).`);
  console.log(`✅ ${totalVinculados} pedido(s) vinculado(s).`);
  console.log(`\n🎉 Concluído!\n`);

  await pool.end();
}

main().catch((erro) => {
  console.error('\n❌ Erro durante a vinculação:', erro.message);
  process.exit(1);
});
