# Auditoria Fase 4 — Fechamento Individual Final

Data: 23/09/2026. Escopo: código e ambiente QA local isolado do Pombo Correio. As matrizes finais registram a decisão de cada ID inventariado; **zero pendências significa que cada elemento recebeu decisão respaldada por evidência ou justificativa, e não que o software esteja livre de bugs**.

## 1. Resultado executivo

Foram encerradas as lacunas individuais recebidas da Fase 3: 265 ações BTN, 93 campos FIELD, 23 modais MODAL e 360 condições da matriz HTTP têm estado final explícito. Permanecem riscos de desempenho, dependências e ensaios externos indisponíveis, discriminados adiante. O banco principal local foi consultado apenas com `SELECT`; suas contagens antes e depois permaneceram em 2 usuários, 6.476 clientes, 20.359 Fonadas e 2.527 Ao Vivo. O banco QA descartável foi removido ao fim da validação, e sua ausência foi confirmada.

## 2. Estado recebido da Fase 3

A Fase 3 havia executado os fluxos principais de 18/18 rotas, o sucesso de 72/72 handlers e quatro componentes de impressão. Isso não fechava a evidência por elemento: 109/265 BTN tinham evento observado, 55/93 FIELD tinham evento observado, nenhum dos 23 MODAL tinha a checklist integral, e havia 93 condições `A EXECUTAR` em 60 handlers. Os nove achados F3-01 a F3-09 correspondem aqui, na ordem, a BUG-021 a BUG-029; BUG-001 a BUG-020 conservam os IDs da primeira auditoria.

## 3. Contagem inicial de pendências

A recontagem programática dos arquivos da Fase 3 foi gravada em [FASE4_PENDENCIAS_INICIAIS.md](FASE4_PENDENCIAS_INICIAIS.md), com a lista exata de IDs e células: 156 BTN (312 células), 38 FIELD (76 células), 23 MODAL (138 células) e 93 células HTTP em 60 APIs. A Fase 4 tratou esses itens individualmente; não usou a aprovação genérica da página ou do módulo para fechá-los.

## 4. Ações BTN resolvidas

A [matriz final de controles](MATRIZ_CONTROLES_FINAL.md) preserva BTN-001 a BTN-265: 254 ações aprovadas com efeito observado, 11 N/A por ausência de controle independente ou código não alcançável, zero falhas e zero pendências. A evidência de clique/interação inclui ID, instante, rota, locator, texto, evento, efeito e teste responsável em [interacoes-fase4-qa.ndjson](evidencias/interacoes-fase4-qa.ndjson). Os cenários Fase 4 cobrem controles condicionais de erro, vazio, paginação, limite, listas extensas, agenda, cobrança, fonada, recall, relatórios e administração. Para abstrações compartilhadas, a matriz indica os consumidores concretos executados; o componente morto de remarcação foi classificado N/A após exame de uso.

## 5. Campos FIELD resolvidos

FIELD-001 a FIELD-093 estão aprovados. Os 38 recebidos sem prova individual tiveram foco e interação adequada ao tipo de entrada, verificação do efeito e persistência quando houve gravação. Foram alcançados campos condicionais, incluindo Recall com status RETORNAR, edição financeira, selects, checkboxes, datas, busca e sugestões. Os limites concretos de HTML/API/banco foram exercidos onde existiam; não se atribuíram limites inexistentes. Cenários e registro por ID constam da matriz e do arquivo de interações.

## 6. Modais MODAL resolvidos

MODAL-001 a MODAL-023 foram decididos individualmente: 22 aprovados, um N/A. MODAL-003 é a abstração `Dialogo`, sem instância independente; seus consumidores concretos foram testados. Os testes distinguiram diálogos React de confirmações nativas, com aceitar/cancelar e efeitos conferidos. Para diálogos próprios foram verificados abertura, conteúdo, confirmação, reabertura, cancelamento, Escape, clique externo quando oferecido, Tab/Shift+Tab, contenção e devolução de foco, além de 390×844 e 320×480 e conteúdo rolável. X inexistente, backdrop intencionalmente sem fechamento e foco de `window.confirm` receberam N/A no item correspondente da checklist, sem converter ausência de recurso em falha. A correção de devolução de foco após clique no backdrop ficou em `Interface.jsx` e foi coberta por regressão.

## 7. Condições HTTP resolvidas

A [matriz HTTP final](MATRIZ_HTTP_FINAL.md) preserva API-001 a API-072, com 360 condições: 265 aprovadas por resposta observada e 95 N/A com motivo ligado ao handler. Todas as 93 células inicialmente `A EXECUTAR` receberam decisão. As entradas aplicáveis foram exercidas no banco QA, incluindo validação, recurso relacionado inexistente, autenticação/permissão e conflito 409. Coleções sem recurso por ID, leituras sem estado concorrente e endpoints públicos receberam N/A específico. Respostas e cenários constam de `http-excecoes-fase4-qa.json`, `http-conflitos-fase4-qa.json` e `http-consultas-invalidas-fase4-qa.json`.

## 8. Novos bugs encontrados

| ID | Achado reproduzido | Correção e verificação |
| --- | --- | --- |
| BUG-030 | ID textual em `/api/ao-vivo/imprimir` produzia 500. | Validação prévia; resposta 400 nos testes HTTP Fase 4. |
| BUG-031 | `porPagina` negativo em listas podia causar erro interno. | Limite mínimo de 1 em Clientes/Lixeira, Fonada e Ao Vivo; resposta válida nos testes de consulta. |
| BUG-032 | Exclusão de usuário com ID textual produzia 500. | Validação de ID; resposta 400 observada. |
| BUG-033 | Descarte de duplicata com clientes inexistentes podia criar registro órfão. | Verificação dos clientes relacionados; 404 e ausência de gravação. |
| BUG-034 | Criação de Fonada/Ao Vivo com `cliente_id` textual produzia 500. | Validação antes da consulta; 400 observado nos dois endpoints. |
| BUG-035 | Falha ao buscar usuários deixava a administração em branco. | Tratamento do estado ainda sem lista; erro exibido sem queda da página, retestado em navegador. |
| BUG-036 | Fechar diálogo pelo backdrop podia devolver foco antes do fim do clique. | Devolução no próximo quadro; testes de foco por teclado e fechamento. |

Nenhum desses bugs permaneceu aberto após a correção no ambiente QA. A configuração ausente de segredo administrativo durante uma rodada de teste foi um erro do servidor QA reiniciado, corrigido antes da execução final; não foi classificada como defeito do produto.

## 9. Regressão BUG-001 a BUG-029

BUG-001 a BUG-020 foram revalidados pelas suítes de autenticação/administração, concorrência, formulários, validações, navegação, acessibilidade, lixeira e O.S. Os nove achados da Fase 3 mantêm o mapeamento F3-01=BUG-021 até F3-09=BUG-029. As verificações específicas incluem backup/restauração das dez tabelas, 409 em gravações concorrentes e pedido já pago, baixa Fonada atômica, axe nas rotas, contraste da Agenda, busca global, exclusão concorrente de cliente e IDs textuais nos endpoints. A repetição dirigida após as correções da Fase 4 passou; o resultado da suíte completa está na seção 14.

| Fase 3 → ID consolidado | Regressão nesta auditoria |
| --- | --- |
| F3-01 → BUG-021 | `fase3-infra.spec.js`: backup QA de dez tabelas, arquivos gzip lidos e pedidos conferidos; restauração integral permanece documentada em `restauracao-qa.json`. |
| F3-02 → BUG-022 | `fase3-agenda-fonada-concorrencia.spec.js` e `fase3-entrega-aovivo-concorrencia.spec.js`: versão antiga rejeitada. |
| F3-03 → BUG-023 | `fase3-agenda-fonada-concorrencia.spec.js`: baixa agrupada atômica. |
| F3-04 → BUG-024 | `fase3-entrega-aovivo-concorrencia.spec.js`: pedido Ao Vivo pago rejeita remarcação com 409. |
| F3-05 → BUG-025 | `fase3-axe-rotas-restantes.spec.js`: varredura de acessibilidade das rotas antes faltantes. |
| F3-06 → BUG-026 | `fase3-axe-rotas-restantes.spec.js`: Agenda com pedidos reais e contraste reavaliado. |
| F3-07 → BUG-027 | `fase3-controles-operacionais.spec.js`: busca global abre Recall, Fonada e Ao Vivo. |
| F3-08 → BUG-028 | `fase3-cliente-excluido-concorrencia.spec.js`: cliente excluído não aceita pedido criado por outro operador. |
| F3-09 → BUG-029 | `fase3-http-ids-invalidos.spec.js` e cenários HTTP Fase 4: IDs textuais rejeitados sem 500. |

## 10. Performance da Cobrança

Com massa QA de 1.000 clientes, 5.000 Fonadas e 5.000 Ao Vivo, a consulta de Cobrança retornou 5.000 pedidos, 23 campos por pedido e **2.241.906 bytes** sem compressão (**75.200 bytes gzip**). Não há paginação no endpoint. O maior custo individual veio de `senha_os` (~194 kB), nome repetido (~170 kB), `formaPagamento` (~145 kB), `cobrancaReagendada` nulo (~125 kB) e WhatsApp repetido (~120 kB). A interface usa os dados para filtros, seleção, detalhes e impressão; retirar campos sem contrato claro arriscaria esses fluxos. O custo cresce com o total de pedidos e pede paginação/consulta específica como mudança arquitetural. Classificação: **RISK/PERF-01**, aberta, com medição em [cobranca-payload-fase4-qa.json](evidencias/cobranca-payload-fase4-qa.json). A massa de 11.000 registros foi removida do banco QA após a medição.

## 11. Dependências

`npm audit` apontou sete ocorrências por pacote (três no backend, quatro no frontend), preservadas nos arquivos [backend](evidencias/npm-audit-backend-fase4.json) e [frontend](evidencias/npm-audit-frontend-fase4.json). São riscos abertos de dependência, separados dos bugs reproduzidos da aplicação.

| Pacote | Advisory, versão atual → corrigida | Origem/uso e risco prático | Mudança/recomendação |
| --- | --- | --- | --- |
| `node-cron` | Via `uuid` [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq); 3.0.3 → 4.6.0 sugerida pelo audit | Direta, produção; agendador ativo. A chamada observada usa `uuid.v4()` sem buffer do chamador, fora do caminho descrito pelo advisory. | Atualização major e regressão do agendador; risco prático baixo no uso atual. |
| `uuid` | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq); 8.3.2 → 11.1.1 | Transitiva de `node-cron`, produção. Vulnerabilidade exige APIs v3/v5/v6 com buffer fornecido; não há essa entrada no uso visto. | Resolvida junto à atualização major de `node-cron`. |
| `xlsx` | [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) e [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9); 0.18.5 → 0.20.2 ou superior | Direta declarada de produção, mas importada somente pelos scripts CLI legados `importar-planilha.js` e `importar-cadastro-xlsx.js`. A origem é `cadastro.XLSM`/`cadastro.xlsx` local ou caminho passado ao CLI, sem upload HTTP na aplicação ativa. Uma planilha não confiável fornecida ao operador alcançaria `readFile` vulnerável. | Versão corrigida não está no npm audit; avaliar distribuição oficial da SheetJS, origem das planilhas e migração. Não executar importação com arquivo não confiável. A importação de planilha antiga pode truncar tabelas e exige procedimento próprio. |
| `esbuild` | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99); 0.21.5 → 0.25.0 | Transitiva de Vite, desenvolvimento. O advisory depende de servidor de desenvolvimento exposto; não é código do build distribuído. | Atualizar Vite e validar ferramentas locais; major sugerida pelo audit. |
| `vite` | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff); 5.4.21 → linha corrigida 6.4.3+ (audit sugere 8.3.0) | Direta, desenvolvimento; `server.host: true` permite acesso pela LAN, então tráfego local não confiável pode alcançar o dev server. O caso UNC depende de ação no editor; travessia/arquivos dependem de requisição ao servidor. | Restringir acesso ao servidor de desenvolvimento e planejar upgrade major com smoke/build. |
| `react-router` | [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg); 6.30.6 → 7.18.0+ | Transitiva, produção. Redirecionamento requer destino controlado por atacante; navegação observada monta rotas internas, com uma rota de mensagem vinda da API interna. O vetor SSR/hidratação não é usado pelo `BrowserRouter` desta aplicação. | Migração major 7.x com regressão de navegação e sanitização de destinos se surgir entrada externa. |
| `react-router-dom` | Mesmos advisories transitivos de `react-router`; 6.30.6 → 7.18.0+ (audit sugere 7.18.4) | Direta, produção; usado nas rotas do navegador. O risco prático segue os caminhos descritos acima. | Atualizar junto com `react-router`; migração major. |

## 12. Itens bloqueados

Firefox neste Windows permaneceu bloqueado: a única reconfirmação rápida falhou ao iniciar o processo (`spawn UNKNOWN`, associado ao erro SideBySide/mozglue da Fase 3). Zoom nativo 80%–400% não tem mecanismo de escala verificável neste ambiente; teste CSS a 200% permanece evidência separada. Leitor de tela, teclado virtual e aparelho físico reais não estavam disponíveis. Envio externo a terceiros não foi realizado em QA. Ensaio prolongado na hospedagem real não foi executado; métricas e carga são locais. Nenhum desses bloqueios foi convertido em aprovação.

## 13. Matriz final

| Categoria | Total | ✓ | ✗ | N/A | BLOQUEADO | PENDENTE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Rotas | 18 | 18 | 0 | 0 | 0 | 0 |
| Handlers | 72 | 72 | 0 | 0 | 0 | 0 |
| Ações | 265 | 254 | 0 | 11 | 0 | 0 |
| Campos | 93 | 93 | 0 | 0 | 0 | 0 |
| Modais | 23 | 22 | 0 | 1 | 0 | 0 |
| Condições HTTP | 360 | 265 | 0 | 95 | 0 | 0 |
| Impressões | 4 | 4 | 0 | 0 | 0 | 0 |

As seis classes de bloqueios externos da seção 12 são transversais ao inventário de IDs e não somam linhas artificiais às categorias acima. O detalhamento por ID está nas duas matrizes finais.

## 14. Build e regressão

Testes de backend: **33/33 passaram**. Testes de frontend: **29/29 passaram**. Build de frontend: **passou**. `git diff --check`: **passou** (somente avisos de conversão de fim de linha no Windows). A execução integrada final terminou com **116/116 E2E aprovados em 13,1 minutos**, um trabalhador e banco QA isolado. Após ampliar a regressão da busca global para os três destinos, o cenário dirigido adicional também passou (**1/1**). `npm audit` foi repetido: três pacotes apontados no backend e quatro no frontend, classificados na seção 11. [Resumo dos resultados finais](evidencias/regressao-final-fase4-qa.json).

## 15. Gate final automatizado

`qa/verificar-fechamento-fase4.mjs` lê as matrizes finais, valida os estados permitidos e os totais BTN/FIELD/MODAL/API e falha para célula vazia, `PENDENTE` ou `A EXECUTAR`. A última execução passou com 0 pendências. `qa/resumir-matrizes-fase4.mjs` produziu [contagens-fase4.json](evidencias/contagens-fase4.json). A matriz HTTP recebida da Fase 3 foi arquivada em [MATRIZ_HTTP_FASE3_ARQUIVO.md](MATRIZ_HTTP_FASE3_ARQUIVO.md); `MATRIZ_HTTP_COMPLETA.md` e o arquivo `_FINAL` agora contêm o fechamento sem células abertas.

## 16. Riscos residuais

RISK/PERF-01 (Cobrança sem paginação e resposta de 2,24 MB), sete ocorrências de dependência e os seis bloqueios externos descritos acima. Também permanece o limite inerente de testes locais e dados QA: eles não provam comportamento de impressora física, leitores de tela, dispositivo físico ou operação prolongada hospedada. Todos os bugs funcionais reproduzidos nesta fase foram corrigidos e reavaliados; novas mudanças após esta auditoria requerem regressão proporcional.
