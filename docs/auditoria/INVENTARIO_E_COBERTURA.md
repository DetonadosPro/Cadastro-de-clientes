# Inventário e cobertura reconciliados na Fase 3

**Critério:** o estado de uma página atesta abertura e fluxo principal. Controles condicionais e entradas excepcionais têm linhas próprias nas matrizes de controles e HTTP. Uma falha de cobertura é falha da auditoria, sem presumir defeito da função.

## Páginas

| Caminho | Fluxo verificado | Estado | Prova principal |
| --- | --- | --- | --- |
| `/login` | Credencial, teclado e expiração | ✓ TESTADO E APROVADO | `navegacao.spec.js`, `fase3-sessao-expirada.spec.js` |
| `/gerenciar-usuarios` | Senha mestra e operadores QA | ✓ TESTADO E APROVADO | `administracao.spec.js` |
| `/agenda` | Lembretes, pedidos, baixa e tentativa | ✓ TESTADO E APROVADO | `agenda.spec.js`, `fase3-agenda-fonada-concorrencia.spec.js` |
| `/cobranca` | Fonada, Ao Vivo, lote e recibo | ✓ TESTADO E APROVADO | `cobranca.spec.js`, `fase3-cobranca-fonada-ui.spec.js` |
| `/relatorios` | Vendas, recebimentos e desempenho | ✓ TESTADO E APROVADO | `relatorios.spec.js`, `fase3-desempenho.spec.js` |
| `/recall` | Fila, status, histórico e pedido | ✓ TESTADO E APROVADO | `recall.spec.js`, `fase3-recall.spec.js` |
| `/clientes` | Busca, seleção, duplicatas, mesclagem | ✓ TESTADO E APROVADO | `busca.spec.js`, `fase3-mesclagem.spec.js` |
| `/clientes/novo` | Cadastro, validações e ViaCEP | ✓ TESTADO E APROVADO | `clientes.spec.js`, `evidencias/viacep-qa.json` |
| `/clientes/lixeira` | Restaurar e excluir definitivamente | ✓ TESTADO E APROVADO | `lixeira.spec.js`, `fase3-lixeira-lote.spec.js` |
| `/clientes/:id` | Edição, bloqueio e conflito | ✓ TESTADO E APROVADO | `clientes.spec.js`, `concorrencia.spec.js` |
| `/fonada` | Lista, busca, filtro e volume | ✓ TESTADO E APROVADO | `pedidos.spec.js`, `evidencias/volume-ui-qa.json` |
| `/fonada/novo` | Criação e O.S. concorrentes | ✓ TESTADO E APROVADO | `pedidos.spec.js`, `fase3-os-carga.spec.js` |
| `/fonada/hoje` | Abrir pedido e operar | ✓ TESTADO E APROVADO | `fase3-hoje-fluxos.spec.js` |
| `/fonada/:id` | Editar, baixar, desfazer, tentar | ✓ TESTADO E APROVADO | `concorrencia.spec.js`, `fase3-hoje-fluxos.spec.js` |
| `/ao-vivo` | Lista, busca, filtro e volume | ✓ TESTADO E APROVADO | `pedidos.spec.js`, `evidencias/volume-ui-qa.json` |
| `/ao-vivo/novo` | Criação e O.S. concorrentes | ✓ TESTADO E APROVADO | `pedidos.spec.js`, `fase3-os-carga.spec.js` |
| `/ao-vivo/hoje` | Abrir pedido, entregar e remarcar | ✓ TESTADO E APROVADO | `fase3-hoje-fluxos.spec.js` |
| `/ao-vivo/:id` | Editar, entregar, receber, imprimir | ✓ TESTADO E APROVADO | `fase3-entrega-aovivo-concorrencia.spec.js`, `fase3-impressao-pdf.spec.js` |

**Total:** 18 caminhos funcionais encontrados e 18 com fluxo principal executado. A raiz redirecionada e o curinga 404 também passaram em `navegacao.spec.js`. Impressões usam componentes próprios, sem rota declarada.

## Superfície HTTP

| Módulo | Handlers | Estado |
| --- | ---: | --- |
| Autenticação | 5 | ✓ TESTADO E APROVADO |
| Clientes | 16 | ✓ TESTADO E APROVADO |
| Fonada | 7 | ✓ TESTADO E APROVADO |
| Ao Vivo | 13 | ✓ TESTADO E APROVADO |
| Agenda | 9 | ✓ TESTADO E APROVADO |
| Cobrança | 9 | ✓ TESTADO E APROVADO |
| Recall | 5 | ✓ TESTADO E APROVADO |
| Relatórios | 3 | ✓ TESTADO E APROVADO |
| Infraestrutura | 5 | ✓ TESTADO E APROVADO |

**Total:** 72 handlers encontrados e 72 com sucesso real no banco QA. As 69 rotas protegidas rejeitaram ausência de login e token inválido. Cada handler tem uma linha em `MATRIZ_HTTP_COMPLETA.md`. A verificação de fechamento de todas as combinações excepcionais **✗ TESTADO E FALHOU** como gate de cobertura; a matriz identifica as condições sem prova específica.

## Condições transversais

| Condição | Estado | Evidência ou razão |
| --- | --- | --- |
| Dois operadores na mesma lista, ficha e pedido | ✓ TESTADO E APROVADO | `tempo-real.spec.js`, `concorrencia.spec.js`, testes Fase 3 de Agenda, entrega e Cobrança. |
| Criação simultânea e O.S. única | ✓ TESTADO E APROVADO | 20 Fonadas e 20 Ao Vivo em `fase3-os-carga.spec.js`. |
| Cliente excluído por um operador enquanto outro cria pedido | ✓ TESTADO E APROVADO | Falha 201 reproduzida; Fonada e Ao Vivo agora rejeitam 409 em `fase3-cliente-excluido-concorrencia.spec.js`. |
| Duplo clique ao salvar | ✓ TESTADO E APROVADO | Cliente, Fonada e Ao Vivo em E2E. |
| Busca, URL e recarga direta | ✓ TESTADO E APROVADO | `busca.spec.js` e 18 rotas no build QA. |
| Larguras de 320 a 2.560 px | ✓ TESTADO E APROVADO | 16 larguras em seis páginas. |
| Cinco alturas pequenas e modal 320×480 | ✓ TESTADO E APROVADO | 40 combinações em `fase3-alturas.spec.js`. |
| Login, menu e entrada das rotas pelo teclado | ✓ TESTADO E APROVADO | `fase3-teclado-rotas.spec.js`, `teclado-e-zoom.spec.js`. |
| Axe nas 18 rotas funcionais | ✓ TESTADO E APROVADO | Sem violações sérias/críticas nos estados examinados. |
| Persistência após recarga | ✓ TESTADO E APROVADO | Cliente, pedidos, pagamentos, Recall e relatórios. |
| HTTP 422/429/500/502/503 e offline simulados | ✓ TESTADO E APROVADO | `evidencias/rede-build-qa.json`. |
| IDs textuais inválidos nos 31 endpoints com `:id` | ✓ TESTADO E APROVADO | Cinco erros 500 corrigidos; 30 respostas 400 e uma resposta 401 por senha mestra em `evidencias/ids-invalidos-qa.json`. |
| IDs numéricos inexistentes nos 31 endpoints com `:id` | ✓ TESTADO E APROVADO | Sem erro interno: 17×404, 10×400 antes da consulta por payload vazio, 3×200 em coleções filhas e 1×401 por senha mestra; `evidencias/ids-inexistentes-qa.json`. |
| Volume e métricas locais | ✓ TESTADO E APROVADO | 1.000 clientes, 5.000 pedidos por sistema. |
| Backup e restauração integral em QA | ✓ TESTADO E APROVADO | Dez tabelas comparadas em `evidencias/restauracao-qa.json`. |
| Edge e WebKit automatizados | ✓ TESTADO E APROVADO | 32 verificações do build QA. |
| Firefox neste computador | BLOQUEADO: falha técnica de inicialização | Erro SideBySide `mozglue`, mesmo após reinstalação Playwright. |
| Zoom nativo 80% a 400% | BLOQUEADO: sem escala verificável | O navegador controlável ignorou os atalhos. CSS 200% é prova separada. |
| Leitor de tela e teclado virtual real | BLOQUEADO: sem canal confiável | Axe e viewport emulado não substituem esses recursos. |
| Aparelhos físicos | BLOQUEADO: dispositivos indisponíveis | Nenhum teste físico foi declarado. |
| Envio externo de notificações a terceiros | BLOQUEADO: ambiente QA sem destinatários autorizados | Tarefas foram exercitadas sem envio externo. |
| Operação contínua por múltiplas horas na hospedagem real | BLOQUEADO: ambiente local QA | Concorrência e carga foram medidas localmente; não representam uptime da hospedagem. |
| Exportação CSV/XLSX na interface | N/A: NÃO APLICÁVEL | Não há ação de exportar; PDF pertence à impressão. |
| Certificação individual de todos os controles condicionais | ✗ TESTADO E FALHOU | O gate encontrou IDs sem execução/prova individual. É uma lacuna de auditoria, não defeito presumido. |

## Artefatos de rastreio

IDs `BTN`, `FIELD` e `MODAL`: `MATRIZ_CONTROLES_FASE3.md`. IDs `API`: `MATRIZ_HTTP_COMPLETA.md`. Testes: `frontend/e2e/`, `frontend/test/`, `backend/test/`. O relatório de 40 seções consolida riscos, contagens e o gate final.
