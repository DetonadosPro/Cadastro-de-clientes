// scripts/importar-planilha.js
//
// ⚠️ AVISO IMPORTANTE (migração para PostgreSQL/Railway):
// Este script ainda usa a sintaxe antiga do SQLite (node:sqlite,
// db.prepare com "?"). O restante do backend já foi migrado para
// PostgreSQL, mas este script de importação ainda NÃO — ele precisa
// ser adaptado (mesma lógica de placeholders $1/$2... e await nas
// consultas) antes de rodar contra o banco novo. Combinado: quando
// você tiver a planilha atualizada em mãos, migramos este script
// junto, na mesma sessão.
//
// Lê o arquivo cadastro.XLSM (planilha antiga) e importa os dados
// para o banco novo (SQLite), respeitando os dois sistemas separados
// do negócio: mensagem FONADA (telefone) e mensagem AO VIVO (carro
// de som).
//
// Como usar:
//   1. Coloque o arquivo cadastro.XLSM dentro da pasta backend/scripts/
//      (ou passe o caminho: node scripts/importar-planilha.js "C:\caminho\cadastro.xlsm")
//   2. Rode: npm run importar
//
// O que esse script faz:
//   - Lê a aba "usuario" e cria um login para cada usuário antigo
//   - Lê a aba "BD" (fonadas) e importa os pacotes de mensagem por
//     telefone. IMPORTANTE: a aba BD tem uma área lateral (colunas
//     131 em diante) que é apenas resultado temporário de uma busca
//     (a macro de pesquisa copia o registro encontrado pra lá) —
//     esses dados são cópias do bloco principal e são IGNORADOS aqui
//     para não duplicar registros.
//   - Lê a aba "aovivo" e importa os pedidos de carro de som.

const path = require('path');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const { db, iniciarBanco } = require('../src/db/database');

const CAMINHO_PLANILHA = process.argv[2] || path.join(__dirname, 'cadastro.XLSM');

function limparValorMonetario(v) {
  if (v === null || v === undefined || v === '') return null;
  const texto = String(v).replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(texto);
  return isNaN(n) ? null : n;
}

function vazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function txt(v) {
  return v === null || v === undefined ? null : String(v);
}

// ------------------------------------------------------------------
// USUÁRIOS
// ------------------------------------------------------------------
function importarUsuarios(planilha) {
  const aba = planilha.Sheets['usuario'];
  if (!aba) {
    console.log('⚠️  Aba "usuario" não encontrada — pulando importação de logins.');
    return;
  }
  const linhas = xlsx.utils.sheet_to_json(aba, { header: 1 });

  const inserir = db.prepare('INSERT OR IGNORE INTO usuarios (usuario, senha_hash) VALUES (?, ?)');
  let count = 0;

  for (let i = 1; i < linhas.length; i++) {
    const [usuario, senha] = linhas[i];
    if (vazio(usuario)) continue;
    const senhaOriginal = vazio(senha) ? 'trocar123' : String(senha);
    const hash = bcrypt.hashSync(senhaOriginal, 10);
    const resultado = inserir.run(String(usuario).trim(), hash);
    if (resultado.changes > 0) count++;
  }
  console.log(`✅ ${count} usuário(s) importado(s) da aba "usuario".`);
}

// ------------------------------------------------------------------
// FONADAS (aba "BD") — apenas o bloco principal (colunas 0-38).
// O bloco das colunas 131+ é resultado de busca (duplicata), ignorado.
// ------------------------------------------------------------------
const COLUNAS_BD = [
  'senha_os', 'nome_comprador', 'data_pedido', 'nascimento',
  'p1_dia', 'p1_para', 'p2_dia', 'p2_para', 'tipo', 'recall',
  'p1_tema', 'p1_mensagem', 'p1_fixo', 'p1_celular', 'p1_horario', 'p1_quem_oferece', 'p1_resultado',
  'p2_tema', 'p2_mensagem', 'p2_fixo', 'p2_celular', 'p2_horario', 'p2_quem_oferece', 'p2_resultado',
  '_mv', 'comprador_horario', 'comprador_fixo', 'comprador_celular',
  'comprador_endereco', 'comprador_complemento', 'comprador_bairro', 'comprador_referencia',
  'valor', 'cobranca', 'periodo', 'pagou', 'recebi',
  'vender', 'status', 'impresso',
];
// Nota: a coluna 'comprador_horario' (antiga "Horário" ao lado de "MV") é o
// horário em que o pedido foi feito/atendido — mapeada para "horario_pedido"
// no banco novo.

function importarFonadas(planilha) {
  const aba = planilha.Sheets['BD'];
  if (!aba) throw new Error('Aba "BD" não encontrada na planilha.');

  const linhas = xlsx.utils.sheet_to_json(aba, { header: 1, defval: null });

  const inserir = db.prepare(`
    INSERT INTO fonadas (
      senha_os, nome_comprador, data_pedido, horario_pedido, nascimento, tipo, recall,
      p1_dia, p1_para, p1_tema, p1_mensagem, p1_fixo, p1_celular, p1_horario, p1_quem_oferece, p1_resultado,
      p2_dia, p2_para, p2_tema, p2_mensagem, p2_fixo, p2_celular, p2_horario, p2_quem_oferece, p2_resultado,
      comprador_fixo, comprador_celular, comprador_endereco, comprador_complemento, comprador_bairro, comprador_referencia,
      valor, cobranca, periodo, pagou, recebi, vender, status, impresso
    ) VALUES (
      @senha_os, @nome_comprador, @data_pedido, @horario_pedido, @nascimento, @tipo, @recall,
      @p1_dia, @p1_para, @p1_tema, @p1_mensagem, @p1_fixo, @p1_celular, @p1_horario, @p1_quem_oferece, @p1_resultado,
      @p2_dia, @p2_para, @p2_tema, @p2_mensagem, @p2_fixo, @p2_celular, @p2_horario, @p2_quem_oferece, @p2_resultado,
      @comprador_fixo, @comprador_celular, @comprador_endereco, @comprador_complemento, @comprador_bairro, @comprador_referencia,
      @valor, @cobranca, @periodo, @pagou, @recebi, @vender, @status, @impresso
    )
  `);

  let totalImportado = 0;
  const linhasDados = linhas.slice(1); // pula cabeçalho

  db.exec('BEGIN');
  try {
    for (const linha of linhasDados) {
      // Apenas o bloco principal (colunas 0-38). Blocos em outras
      // posições da mesma linha são resultado de busca — ignorados.
      const bloco = {};
      COLUNAS_BD.forEach((campo, i) => { bloco[campo] = linha[i]; });

      if (vazio(bloco.nome_comprador)) continue;

      inserir.run({
        senha_os: txt(bloco.senha_os),
        nome_comprador: String(bloco.nome_comprador).trim(),
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
      });
      totalImportado++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(`✅ ${totalImportado} pacote(s) de mensagem fonada importado(s) da aba "BD".`);
}

// ------------------------------------------------------------------
// AO VIVO (aba "aovivo")
// ------------------------------------------------------------------
const COLUNAS_AOVIVO = [
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
// Nota 1: campos prefixados com "_" são do antigo fluxo de gravação em
// DVD (endereço/prazo repetido) e não são mais usados — ignorados na
// importação, conforme confirmado.
// Nota 2: o telefone perto do endereço/local (fixo_local/celular_local)
// quase nunca é preenchido na planilha antiga — o telefone principal
// de contato é sempre o que fica perto do campo "comprador" (celular),
// conforme confirmado com o dono do negócio.

function importarAoVivo(planilha) {
  const aba = planilha.Sheets['aovivo'];
  if (!aba) {
    console.log('⚠️  Aba "aovivo" não encontrada — pulando importação de mensagens ao vivo.');
    return;
  }

  const linhas = xlsx.utils.sheet_to_json(aba, { header: 1, defval: null });

  const inserir = db.prepare(`
    INSERT INTO ao_vivo (
      numero_os, data_pedido, horario_pedido, dia_entrega, horario_entrega,
      comprador, para, oferecimento,
      endereco, bairro, referencia,
      fixo_local, celular_local, celular, celular2,
      tema_1, mensagem_codigo_1, tema_2, mensagem_codigo_2, tema_3, mensagem_codigo_3,
      musica_1, musica_2, musica_3, musica_4, musica_5, musica_6,
      aniversario, valor, pagamento, brinde
    ) VALUES (
      @numero_os, @data_pedido, @horario_pedido, @dia_entrega, @horario_entrega,
      @comprador, @para, @oferecimento,
      @endereco, @bairro, @referencia,
      @fixo_local, @celular_local, @celular, @celular2,
      @tema_1, @mensagem_codigo_1, @tema_2, @mensagem_codigo_2, @tema_3, @mensagem_codigo_3,
      @musica_1, @musica_2, @musica_3, @musica_4, @musica_5, @musica_6,
      @aniversario, @valor, @pagamento, @brinde
    )
  `);

  let totalImportado = 0;
  const linhasDados = linhas.slice(1); // pula cabeçalho

  db.exec('BEGIN');
  try {
    for (const linha of linhasDados) {
      const bloco = {};
      COLUNAS_AOVIVO.forEach((campo, i) => {
        if (campo) bloco[campo] = linha[i];
      });

      if (vazio(bloco.comprador)) continue; // comprador é obrigatório

      inserir.run({
        numero_os: txt(bloco.numero_os),
        data_pedido: txt(bloco.data_pedido),
        horario_pedido: txt(bloco.horario_pedido),
        dia_entrega: txt(bloco.dia_entrega),
        horario_entrega: txt(bloco.horario_entrega),

        comprador: String(bloco.comprador).trim(),
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
      });
      totalImportado++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(`✅ ${totalImportado} pedido(s) de mensagem ao vivo importado(s) da aba "aovivo".`);
}

// ------------------------------------------------------------------
function main() {
  console.log(`\n📂 Lendo planilha: ${CAMINHO_PLANILHA}\n`);

  iniciarBanco();

  const planilha = xlsx.readFile(CAMINHO_PLANILHA, { cellDates: false });

  importarUsuarios(planilha);
  importarFonadas(planilha);
  importarAoVivo(planilha);

  console.log(`\n⚠️  IMPORTANTE: os usuários importados da planilha antiga ficaram`);
  console.log(`   com a mesma senha que tinham antes (ou "trocar123" se não tinham).`);
  console.log(`   Por segurança, troque essas senhas assim que possível.\n`);
  console.log('🎉 Importação concluída!\n');
}

main();
