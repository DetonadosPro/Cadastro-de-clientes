# Revisão de produto e desempenho — Pombo-Correio

Revisão local de 9 de setembro de 2026. Implementação na branch `codex/revisao-produto-clientes`, a partir de `dcda954` de `origin/main`. O checkout inicial de `main` estava 20 commits atrás dessa referência; a revisão partiu da versão mais recente disponível no repositório local. Não houve publicação nem alteração dos dados de negócio.

## Resultado

A lista de clientes passou a priorizar busca, contatos e ações. Cadastro e ficha têm agrupamentos mais claros. As páginas carregam seu código sob demanda, mantendo o menu durante a navegação. A consulta comum de clientes ficou aproximadamente 73% mais rápida nas amostras locais. A entrada nessa tela deixou de disparar automaticamente a comparação de duplicatas de toda a base.

Também foi encontrado um defeito funcional: a ordenação antiga não desempata clientes com o mesmo nome. Na varredura paginada, três IDs se repetiram e três ficaram ausentes. O desempate por ID tornou a paginação estável.

## Exploração e decisões por área

Foram examinados o roteamento, componentes compartilhados, estilos, contextos, APIs, consultas e fluxos de clientes e pedidos antes da implementação. A base usa React 18, React Router 6 e Vite no frontend, Express e PostgreSQL no backend. A documentação antiga que cita SQLite não descreve o armazenamento atual.

| Área | Diagnóstico | Decisão e resultado |
|---|---|---|
| Navegação e estrutura | Todas as páginas eram importadas na entrada; largura muito ampla e capitalização global prejudicavam leitura | Divisão por página; estrutura permanece visível durante carregamento; largura e tipografia globais ajustadas; recuperação de erro de renderização |
| Clientes | Paginação e filtros já eram feitos no servidor, com 30 registros e debounce de 350 ms; a varredura automática de duplicatas disputava atenção e recursos | Preservada a paginação existente; duplicatas sob demanda; busca e filtros reorganizados; status localizado, cancelamento de consultas anteriores e tentativa novamente |
| Linhas da lista | Ações dependiam de áreas pouco explícitas; comparação também dependia de arrastar | Nome virou botão; ordenação acessível por teclado; seleção de dois clientes oferece comparação; arrastar continua disponível |
| Celular | A tabela exigia outra hierarquia; cabeçalhos escondidos removiam acesso à ordenação | Registros exibem nome, contato e indicadores em sequência compacta; ordenação tem controle próprio; menu fechado sai da navegação por foco |
| Novo cliente | Formulário largo, associação incompleta entre rótulos e campos, verificação de duplicatas podia falhar silenciosamente | Largura limitada, envio por formulário, nome obrigatório, teclado telefônico e preenchimento automático; falha na verificação exige nova tentativa |
| Ficha e edição | Contatos e localização pouco separados; informações ausentes geravam ruído | Identificação/contato e endereço/referência agrupados; aviso apenas quando nenhum contato está disponível; rótulos associados aos campos |
| Resumo lateral | O efeito dependia de uma função recriada pelo componente pai, causando novas consultas sem trocar cliente | Consulta depende do cliente; fechamento usa referência atual; foco volta à origem |
| Busca global | Buscava estatísticas e contagem da listagem completa para mostrar até seis contatos | Modo de API com sete campos, até seis resultados pedidos pela interface, uma consulta e sem agregações de pedidos |
| Fonada e Ao Vivo | Formulários buscavam o histórico completo do cliente, embora precisassem apenas do cadastro; buscas podiam terminar fora de ordem | Cadastro sem histórico nos formulários; cancelamento e proteção contra respostas antigas nas duas listas |
| Agenda | Já havia compartilhamento da consulta diária e tratamento de atualizações em tempo real na base mais recente | Preservados agrupamento, filtros e regras operacionais; aplicação dos ajustes globais |
| Cobrança | Separação por sistema e ações contextualizadas já atendiam ao fluxo operacional | Preservadas regras, agrupamentos, pagamentos, reagendamento e impressão; conferidas as duas abas |
| Relatórios | Carregamento condicionado ao período e tabelas/gráficos específicos por aba | Preservado; conferidos estado sem período, período vazio e recebimentos/desempenho com dados históricos |
| Recall | A lista da fila é integral e mantém contexto da seleção | Preservado comportamento; não introduzida paginação ou virtualização sem evidência de necessidade |
| Lixeira, login, usuários e impressão | Fluxos separados, com consequências próprias de restauração, acesso e emissão | Código inspecionado; lixeira e acesso local conferidos; limitações dos fluxos de escrita descritas abaixo |

## Gargalos confirmados

1. **Agregação anterior à paginação.** A ordenação comum por nome agregava pedidos de toda a base. Agora os clientes da página são selecionados primeiro, e somente seus pedidos são agregados usando os relacionamentos por `cliente_id`. Ordenações por indicadores continuam globais para preservar o resultado correto.
2. **Consulta secundária automática.** A entrada em Clientes também executava a detecção de duplicatas. Essa operação continua disponível em “Revisar duplicatas”, com loading, erro e resultado vazio próprios.
3. **Código de páginas não visitadas.** O arquivo inicial incluía páginas operacionais, formulários e relatórios. Os imports agora são sob demanda.
4. **Dados e consultas dispensáveis.** A busca global deixou de obter estatísticas; formulários deixaram de carregar históricos; o resumo lateral não refaz a consulta apenas por uma nova renderização do pai.
5. **Concorrência de buscas.** Clientes, Fonada e Ao Vivo cancelam a requisição anterior e ignoram respostas canceladas. Isso evita que uma resposta lenta faça a tela voltar a uma pesquisa ultrapassada.

São causas concretas de trabalho e espera desnecessários. Não foi reproduzido um congelamento completo, portanto não há evidência para atribuir todos os travamentos relatados a uma única causa.

## Medição antes e depois

Ambiente: PostgreSQL local, HTTP em loopback, cinco amostras por cenário, mediana do tempo total da resposta. Base: 6.476 clientes, 20.359 Fonadas e 2.527 pedidos Ao Vivo; 6.407 clientes ativos. Não representa latência da hospedagem nem do celular do usuário. Evidências brutas: [antes](performance-antes.json) e [depois](performance-depois.json).

| Consulta | Antes | Depois | Leitura |
|---|---:|---:|---|
| Primeira página de clientes | 24,81 ms | 6,79 ms | 73% menor |
| Segunda página | 22,72 ms | 6,96 ms | 69% menor |
| Busca por nome “ana” | 21,65 ms | 9,56 ms | 56% menor |
| Clientes com pendência | 36,76 ms | 20,74 ms | 44% menor |
| Ordenação por total de pedidos | 89,89 ms | 86,17 ms | Sem ganho relevante comprovado |
| Ordenação por último pedido | 82,74 ms | 83,92 ms | Sem ganho; variação pequena |
| Detecção de duplicatas | 55,44 ms | 58,06 ms | A consulta em si não melhorou; saiu da entrada automática |

Na primeira página, o JSON principal manteve 14.635 bytes e duas consultas SQL. O que diminuiu foi o trabalho dentro da consulta. Somando o JSON de duplicatas que antes era automático, os dados específicos da entrada em Clientes caíram de 48.717 para 14.635 bytes, cerca de 70%. As requisições específicas dessa entrada passaram de duas para uma. Isso exclui recursos estáticos, SSE, consulta global da Agenda e verificação de versão.

O JavaScript inicial anterior tinha 466,62 kB (133,50 kB gzip). A versão revisada tem entrada de 213,54 kB e página Clientes de 25,87 kB: aproximadamente 239,41 kB combinados, redução de 49% sem compressão; 76,44 kB gzip combinados, redução de 43%. É redução do código necessário para a entrada direta em Clientes, não do total de todos os arquivos de todas as rotas. O CSS passou de 250,25 para aproximadamente 255,45 kB, cerca de 0,9 kB gzip adicional. Não foi adicionada biblioteca de interface ou animação.

### Requisições e atualizações

Inventário por fluxo, baseado no código e conferência local; não é uma captura HAR completa de cada tela:

| Fluxo | Comportamento |
|---|---|
| Clientes | Uma consulta de página; uma por alteração estabilizada dos filtros; duplicatas apenas quando solicitadas |
| Abrir resumo | Uma chamada de resumo; não há chamada por linha na listagem |
| Abrir ficha | Uma chamada que inclui cadastro e históricos de ambos os tipos |
| Busca global | Uma chamada após debounce, até seis contatos; sem contagem ou estatísticas |
| Pedidos | Uma consulta por página/busca; edição busca pedido e cadastro vinculado; novo pedido também reserva O.S. |
| Agenda | Consulta diária e contagens do intervalo; contagens já carregadas são reutilizadas; contexto compartilha chamadas diárias em curso |
| Cobrança | Consulta da aba ativa; filtros e indicadores usam os dados previstos pelo fluxo existente |
| Relatórios | Consulta do relatório ativo quando há período; dados secundários não bloqueiam a entrada sem período |
| Recall | Uma consulta da fila por data; filtros locais sobre a fila retornada |
| Globais | SSE contínuo, verificação de versão a cada 15 segundos e atualização periódica da Agenda a cada 120 segundos, além de eventos relevantes |

Não foi introduzido cache persistente para dados financeiros ou de clientes. Sua invalidação precisaria contemplar criação, edição, exclusão, mesclagem e atualizações de outras telas. A lista de 30 clientes também não justifica adicionar virtualização. Busca textual por trecho e ordenações calculadas permanecem candidatas a medição em bases maiores.

## Validação realizada

- Build de produção concluído.
- 17 testes do frontend e 30 do backend aprovados.
- Comparação local da rota antiga com a nova: todos os campos dos 6.407 clientes ativos, cinco filtros, 12 combinações de ordenação, busca leve e cadastro sem histórico. Para comparar os campos, o teste estabiliza somente o desempate por ID na referência antiga; o problema original é documentado no próprio script.
- Revisão visual em 1440 × 960 e 390 × 844, incluindo lista, formulário e navegação móvel. Na lista móvel, largura do documento de 380 px dentro do viewport de 390 px, sem transbordamento horizontal.
- Lista: busca, vazio, limpeza, seleção, abertura/cancelamento de comparação, resumo lateral, ficha e consulta explícita de duplicatas.
- Formulário novo: nome obrigatório e foco no campo vazio; expansão de endereço. Ficha: edição e cancelamento.
- Agenda, listas de pedidos, edição Fonada, cobranças, Recall, lixeira e relatórios visitados na prévia local. Relatórios também conferidos com dados históricos.
- Simulação local de HTTP 503: mensagem de falha, nova tentativa disponível e resultados anteriores mantidos.
- Simulação de resposta atrasada em 1,8 s: tabela preservada com estado ocupado; busca posterior por “ABADIA” permaneceu correta após a busca lenta por “ANA”.
- Verificação de espaços/conflitos do diff aprovada.

Scripts reproduzíveis, executados a partir da raiz:

```powershell
npm --prefix frontend test
npm --prefix backend test
npm --prefix frontend run build
node backend/scripts/validar-listagem-clientes.js
node backend/scripts/auditar-performance.js docs/revisao/nova-medicao.json
```

Os dois scripts de auditoria exigem banco local e ativam transações somente leitura. O comparador usa a referência Git `dcda954` por padrão e aceita outra como argumento. Os arquivos de métricas armazenam contagens, tempos, tamanhos e hashes, sem nomes ou telefones.

## Limites e pontos de atenção

- A prévia visual usou autenticação simulada e banco somente leitura. Não comprova o login real, gravação de cadastro/pedido, mesclagem, exclusão/restauração, pagamentos, envio de mensagens ou impressão física ponta a ponta. Esses fluxos não foram executados sobre os registros reais. A reserva de O.S. foi simulada na prévia porque o GET existente altera a sequência.
- Os testes existentes cobrem regras específicas; não constituem uma suíte completa de navegador. Também não há certificação integral de acessibilidade, nem contagem sistemática de renders, LCP, INP ou waterfall de todas as rotas. A ausência de instrumentação comparável do navegador impede atribuir um percentual de ganho a essas métricas.
- A simulação de espera valida concorrência e feedback da busca; não substitui um ensaio de rede móvel com perda de pacotes, servidor remoto e CPU limitada.
- Ordenações por último pedido e total continuam mais caras. Se os volumes crescerem, medir planos reais antes de considerar estatísticas materializadas ou índices de busca textual.
- Os quatro arquivos de estilos ainda têm sobreposições históricas. Consolidá-los exige uma revisão visual dedicada de todas as variações, especialmente impressão. Não foi feita uma remoção ampla de CSS sem essa garantia.
- A ficha continua recebendo o histórico integral, necessário aos filtros e totais atuais. Paginar esse histórico exige transferir as agregações correspondentes ao servidor, preservando os resultados.
- O cancelamento no navegador evita resultados antigos; não garante interrupção instantânea da consulta já iniciada no PostgreSQL.
- A divisão de código exige publicar frontend e backend compatíveis. Em especial, os formulários agora pedem cadastro sem histórico. O servidor novo mantém o contrato antigo para consumidores que não usam o parâmetro.
- Nenhuma alteração foi publicada. A branch permanece disponível para revisão e testes de gravação em uma base de homologação isolada.

## Funcionalidades recomendadas — não implementadas

| Sugestão | Problema resolvido | Funcionamento | Onde | Impacto | Complexidade |
|---|---|---|---|---|---|
| Filtros salvos | Repetição das mesmas pesquisas operacionais | Salvar combinações de nome, situação e ordenação por usuário | Próximo aos filtros de Clientes | Menos digitação e configuração recorrente | Baixa a média |
| Atividades do cliente | Dificuldade de entender o que mudou e quem fez | Linha do tempo de alterações, pedidos e pagamentos, com autor e horário | Ficha do cliente | Rastreabilidade e atendimento mais contextualizado | Média a alta; requer registro consistente no backend |
| Central de revisão de duplicatas | Comparações longas interrompem a lista e reaparecem sem contexto | Fila dedicada, justificativa da sugestão e registro das decisões; mesclagem sempre explícita | Ação Revisar duplicatas | Melhor qualidade cadastral e menos decisões repetidas | Média |
| Pendências de contato | Cliente sem contato válido só é percebido na hora do atendimento | Filtro de contatos ausentes/inválidos e revisão orientada, sem alterar dados automaticamente | Clientes e ficha | Menos tentativas de contato frustradas | Baixa a média |
| Indicadores de desempenho reais | Lentidão intermitente difícil de reproduzir | Medir duração por rota, consultas lentas e interações, sem registrar conteúdo pessoal | Área técnica restrita | Diagnóstico de lentidão em produção com evidência | Média |

As sugestões maiores dependem de definição do fluxo e do armazenamento antes de implementação. Nenhuma automação de mensagens ou mudança de regra financeira foi adicionada nesta revisão.
