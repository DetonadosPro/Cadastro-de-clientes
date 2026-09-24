# Auditoria Fase 3 — Resultado e gate de cobertura

**Execução:** 22 e 23/09/2026. **Sistema:** Pombo Correio. **Ambiente de escrita:** exclusivamente `pombo_correio_qa_auditoria`; restauração exclusivamente em `pombo_correio_qa_restore`. O banco `pombo_correio` foi consultado somente para conferir a proteção da produção.

## 1. Resultado executivo

A Fase 3 ampliou os testes para operações simultâneas de duas pessoas, todos os 72 manipuladores HTTP, caminhos de impressão, backup e restauração completos, estados financeiros e acessibilidade. O sistema protege alterações concorrentes de cliente e pedido com conflito HTTP 409, inclusive entrega, cobrança e tentativas. A conclusão integral depende do fechamento individual da matriz de controles e das condições de teste marcadas como abertas neste relatório. Nenhuma execução de um botão é inferida apenas porque ele aparece no código.

## 2. Baseline Fase 1/Fase 2

O relatório anterior registrou 20 defeitos (`BUG-001` a `BUG-020`), 33 testes de backend, 29 de frontend e 34 cenários de navegador. Também deixou lacunas explícitas em mesclagem, operações financeiras, impressão, teclado, zoom nativo, navegadores, volume, backup e restauração. Esta fase partiu desse inventário, sem alterar o banco principal.

## 3. Pendências recebidas

A checklist gerada a partir dos marcadores antigos está em `CHECKLIST_FASE3.md`: seus 25 IDs terminaram com 12 aprovações, 9 gates de cobertura reprovados e 4 bloqueios justificados. O código ativo foi reconciliado com 18 caminhos funcionais, 72 handlers, 265 ações JSX, 93 campos e 23 diálogos ou confirmações. Os dois tipos de pedido, suas páginas “Hoje” e seus fluxos de cobrança foram incluídos individualmente.

## 4. Pendências fechadas

Foram exercitados os 72 handlers com pelo menos um caminho de sucesso, 69 rotas protegidas sem credencial e com token inválido, mesclagem dos nove campos em ambas as direções, exclusão em lote e definitiva pela interface, operação Fonada/Ao Vivo das páginas “Hoje”, cobrança Fonada pela interface, desempenho com dois operadores, PDF real, ViaCEP real/controlado e backup/restauração das dez tabelas persistentes. As evidências permanentes estão nos testes `frontend/e2e/`, nas duas matrizes e em `evidencias/`.

## 5. Itens bloqueados

- **Firefox neste Windows:** a inicialização do navegador falhou com erro de montagem SideBySide (`mozglue`, evento 33), inclusive após reinstalação do binário Playwright. Edge e WebKit foram executados.
- **Zoom nativo:** o navegador controlável pelo ambiente não expôs mudança verificável de escala após atalhos de zoom; os níveis 80% a 400% não foram certificados como zoom nativo. O teste com `zoom` CSS a 200% permanece uma prova separada.
- **Leitor de tela, teclado virtual e aparelhos físicos:** não houve dispositivo físico nem canal de automação confiável para certificar a experiência real desses recursos. Viewports simulados não são prova física.
- **Envio externo de notificações e operação prolongada em hospedagem real:** o ambiente QA exercitou as tarefas sem enviar mensagens a terceiros; não reproduz operação contínua de produção.

## 6. Novos bugs

| ID | Falha observada | Situação |
| --- | --- | --- |
| F3-01 | Backup anterior incluía somente três das dez tabelas persistentes. | Corrigida e restaurada em banco descartável. |
| F3-02 | Ações auxiliares de Agenda e Ao Vivo podiam aceitar uma versão antiga do pedido. | Corrigida com guarda de versão e conflito 409. |
| F3-03 | Baixa simultânea das duas mensagens Fonada podia gravar a primeira antes de rejeitar a segunda. | Corrigida com atualização atômica. |
| F3-04 | “Não recebeu” podia remarcar um pedido Ao Vivo já pago. | Corrigida com rejeição 409. |
| F3-05 | Rótulos de campos e textos pequenos tinham falhas sérias de acessibilidade em rotas ainda não varridas. | Corrigida e reavaliada com axe. |
| F3-06 | Rótulos da Agenda com pedidos reais tinham contraste inferior a 4,5:1. | Corrigida e reavaliada. |
| F3-07 | A busca global omitia destinos ativos de Recall, Fonada e Ao Vivo. | Corrigida e testada pela navegação. |
| F3-08 | Após um operador enviar um cliente à lixeira, outro ainda podia criar pedido para ele. | Reproduzida em QA, corrigida nos dois sistemas com trava transacional e reavaliada. |
| F3-09 | Cinco endpoints de Agenda/Cobrança devolviam 500 para ID textual inválido. | Corrigida; 31 endpoints com `:id` foram reavaliados. |

## 7. Bugs corrigidos

As mudanças estão em `backend/src/routes/agenda.js`, `backend/src/routes/cobranca.js`, `backend/src/routes/aoVivo.js`, `backend/src/routes/fonadas.js`, `backend/src/tarefas/backupSemanal.js`, nos formulários, na busca global e na folha `frontend/src/interface-v3.css`. Os testes permanentes que reproduzem as condições incluem `fase3-agenda-fonada-concorrencia.spec.js`, `fase3-entrega-aovivo-concorrencia.spec.js`, `fase3-cliente-excluido-concorrencia.spec.js`, `fase3-http-ids-invalidos.spec.js`, `fase3-axe-rotas-restantes.spec.js` e `fase3-alturas.spec.js`.

## 8. Matriz HTTP completa

`MATRIZ_HTTP_COMPLETA.md` contém uma linha por handler, com método, rota, autenticação e códigos observados. Os 72 tiveram execução de sucesso. Os 31 endpoints com `:id` receberam texto inválido: 30 retornaram 400 e a exclusão de usuário retornou 401 por exigir senha mestra. Com ID numérico inexistente, houve 17 respostas 404, 10 respostas 400 por validação anterior do payload, três respostas 200 de coleções filhas vazias e uma resposta 401. Não houve 500. Restam **93 células `A EXECUTAR`** de outras condições excepcionais sem prova individual; o sucesso do handler não certifica automaticamente toda entrada inválida possível.

## 9. Matriz de botões

`MATRIZ_CONTROLES_FASE3.md` enumera 265 ações. O registro `evidencias/interacoes-controles-qa.ndjson` guarda cliques reais de testes aprovados e identifica a origem JSX. **109 ações tiveram evento observado; 156 não tiveram prova individual.** Um clique observado não comprova sozinho todos os efeitos da ação.

## 10. Matriz de campos

A mesma matriz enumera 93 campos, com tipo, condição e validação estática encontrada. **55 tiveram evento real de entrada ou seleção; 38 não tiveram prova individual.** Máscaras, limites e entradas inválidas foram testados prioritariamente em nome, datas, valores e telefones.

## 11. Matriz de modais

Há 23 entradas, incluindo confirmações nativas e diálogos React. O diálogo de lembrete teve Tab, Shift+Tab, Enter, Escape e devolução de foco; os modais de mesclagem, exclusão, pagamento e remarcação foram atravessados nos testes de fluxo. **Nenhum dos 23 tem ainda a combinação inteira de abrir, confirmar, cancelar/X/Escape, foco e zoom/mobile certificada na matriz individual.** Isso não apaga os fluxos que passaram, mas impede declarar os 23 integralmente aprovados.

## 12. Clientes

Cadastro, edição, busca, bloqueio, lixeira, restauração, exclusão definitiva e seleção em lote foram executados com dados fictícios. Nome vazio, datas inválidas, clique duplo, formulário antigo e dados legados foram tratados por testes específicos. O banco QA confirmou os estados finais.

## 13. Mesclagem

Os nove campos selecionáveis foram testados em ambas as direções pela interface. Os pedidos associados foram preservados no cadastro destino. Uma sessão tentou mesclar com versão antiga após outra editar: recebeu 409 e não sobrescreveu a edição mais recente.

## 14. Fonada

Criação, edição, segunda mensagem, tentativas, baixa, desfazer, remarcação e conflito entre dois operadores foram exercitados. A baixa agrupada agora é uma operação única. A página “Hoje” abriu o pedido para baixa e tentativa, com conferência no banco. Vinte criações simultâneas adicionais receberam O.S. não nulas e distintas.

## 15. Ao Vivo

Criação, edição, entrega, desfazer entrega, pagamento, “não recebeu” e histórico de prazo foram percorridos. Dois operadores com o mesmo pedido aberto não conseguiram sobrescrever a entrega ou a remarcação feita pelo outro; a tentativa desatualizada recebeu 409. Vinte criações simultâneas adicionais receberam O.S. não nulas e distintas.

## 16. Agenda

Lembretes tiveram criação, conclusão, reabertura, edição e exclusão. Os cartões Fonada/Ao Vivo e as ações operacionais foram testados com pedidos QA. Os pedidos da Agenda agora carregam versão para baixa, desfazer e tentativa, evitando que uma sessão antiga altere o estado novo.

## 17. Cobrança

As abas Fonada e Ao Vivo foram testadas pela interface. Baixa, desfazer, reagendamento e lotes foram verificados com versões antigas, item excluído, cliente bloqueado e escrita concorrente. O lote rejeitado não alterou os outros pedidos; o recibo foi conferido em PDF real.

## 18. Recall

Estados, histórico, pedido criado e nomes de comprador/aniversariante foram conferidos por API e interface. Mensagens WhatsApp foram conferidas sem abrir conversa externa.

## 19. Relatórios

Vendas, recebimentos e desempenho foram comparados com um conjunto QA conhecido. O desempenho distinguiu operadores, sistemas, valores, períodos e período vazio. O teste de vendas/recebimentos usa o delta de seus próprios pedidos, pois outros dados QA podem existir no mesmo dia.

## 20. Impressão

Quatro componentes de apresentação formam dois documentos: `Recibo`/`PaginaImpressaoRecibos` e `ImpressaoAoVivo`/`PaginaImpressaoAoVivo`. O fluxo de interface gerou `recibo-fonada-qa.pdf` e `formulario-ao-vivo-qa.pdf`; os PDFs foram abertos e renderizados em PNG na pasta `evidencias/impressao-qa/`. Isso valida o conteúdo impresso, não uma impressora física.

## 21. Exportação

Não há ação de exportação CSV/XLSX declarada na interface ativa. PDF é produzido pelo recurso de impressão do navegador e está contabilizado na seção anterior. Exportação de dados por arquivo: **N/A — NÃO APLICÁVEL** ao produto atual.

## 22. WhatsApp

Telefones brasileiros válidos geraram URL codificada corretamente; números incompletos, zerados ou com DDI estranho não geraram destino. A mensagem de cobrança preservou acentos, pontuação e valores. O envio real a terceiros não fez parte do QA.

## 23. ViaCEP

Uma consulta real retornou 19 sugestões e preencheu endereço/bairro, persistidos no cliente QA. Falha HTTP 503 controlada preservou o preenchimento manual e permitiu salvar. Entradas antigas e separação de número têm testes de unidade.

## 24. Concorrência

Foram usados dois logins e dois navegadores simultâneos para o mesmo cliente e pedido. Cliente, Fonada, Ao Vivo, Agenda, entrega, pagamento e remarcação rejeitaram a segunda escrita desatualizada com 409. Criação simultânea gerou IDs e O.S. distintos. Na exploração final, a criação de pedido por outro operador após a exclusão do cliente falhou inicialmente (201); a correção faz Fonada e Ao Vivo rejeitarem a criação com 409, inclusive protegendo a corrida transacional. Cinco abas SSE abertas juntas encerraram suas conexões no logout e reconectaram após login.

## 25. SSE

Testes de unidade e navegador cobriram evento inicial, publicação após mutação, ausência de publicação após erro/leitura e fechamento de conexões. A prova de cinco abas registrou `conectadasAntes=5`, `conectadasDepoisLogout=0` e `conectadasDepoisLogin=5`.

## 26. Performance

Massa sintética: 1.000 clientes, 5.000 Fonadas e 5.000 Ao Vivo. Em 20 leituras locais, p95: Clientes 27,6 ms, Fonada 88,7 ms, Ao Vivo 82,4 ms, Cobrança 170,4 ms e Relatórios 12,3 ms. Cobrança transferiu 2.246.526 bytes por resposta nessa massa; esse volume é o risco de escala mais visível. Não foi definido SLA nem extrapolação para a hospedagem real.

## 27. Banco e SQL

As transações de baixa, tentativa e pagamento usam bloqueio de linha/controle de versão onde necessário. A massa de performance foi removida após a medição. O diagnóstico SQL e a conferência de contagens são restritos ao banco QA.

## 28. Backup e restauração

O backup agora lê dez tabelas em snapshot repetível. Um backup QA com dados não vazios em todas elas foi restaurado no banco descartável `pombo_correio_qa_restore`; contagens e conteúdo integral foram comparados. `evidencias/restauracao-qa.json` registra `tabelasNaoIncluidas: []`.

## 29. Segurança

O banco principal foi mantido sem escrita. A suíte destrutiva exige `QA_E2E_ISOLATED_DB=1`, banco com nome QA e ambiente de teste; as rotas protegidas rejeitaram ausência de credencial e token inválido. Sessão realmente expirada impediu salvar o formulário preenchido. Um pentest externo completo não é inferido desses testes.

## 30. Dependências

`npm audit` registrou três apontamentos no backend (um alto em `xlsx`, dois moderados associados a `node-cron`/`uuid`) e quatro no frontend (um alto em `vite`, três moderados em `esbuild` e React Router). Não houve atualização major cega durante a auditoria; o risco e a necessidade de migração permanecem.

## 31. Acessibilidade

Axe foi executado nas 18 rotas funcionais, e o diálogo novo de remarcação foi incluído. Os rótulos e contrastes encontrados foram corrigidos e reavaliados. Essa aprovação significa ausência de violações `serious` ou `critical` detectadas por axe nos estados examinados; não equivale a prova com leitor de tela.

## 32. Teclado

Login e sete destinos da navegação principal foram operados sem mouse. Tab e Shift+Tab alcançaram controles com foco visível em 14 rotas; Escape e devolução de foco passaram no diálogo de lembrete. A certificação de cada controle condicional depende da matriz individual.

## 33. Zoom

`zoom` CSS a 200% preservou ação em Clientes. O zoom nativo 80%, 100%, 125%, 150%, 175%, 200%, 250% e 400% está **BLOQUEADO** neste ambiente pela ausência de mecanismo de controle verificável do navegador disponível; não foi contado como aprovado.

## 34. Navegadores

Edge e WebKit passaram em 32 verificações do build QA, combinando oito rotas e duas dimensões. Firefox permanece **BLOQUEADO** pela falha de inicialização SideBySide neste Windows. O teste principal de fluxo usa Edge.

## 35. Responsividade

Foram exercitadas **21 configurações de viewport distintas**: 16 larguras da Fase 2 e cinco dimensões adicionais de altura da Fase 3. O teste novo verifica 40 combinações rota/tamanho, rolagem até a última ação e diálogo de lembrete em 320×480. O painel da Agenda recebeu limite de altura e rolagem interna para telas baixas.

## 36. Rede e falhas HTTP

No build QA, respostas controladas 422, 429, 500, 502 e 503 mostraram mensagem e recuperação. Offline e atraso de 1,2 s também foram exercitados. A interface não exibiu erro JavaScript bruto nos casos verificados. Redes móveis físicas e atrasos de 3 s/5 s permanecem fora dessa evidência.

## 37. Build de produção

O build Vite concluiu. Dezoito rotas foram abertas diretamente e recarregadas no preview QA, sem erro de roteamento. Os recursos estão separados por página. O artefato de produção não foi publicado.

## 38. Inventário final

`INVENTARIO_E_COBERTURA.md` registra a cobertura por página e condição; `MATRIZ_HTTP_COMPLETA.md` e `MATRIZ_CONTROLES_FASE3.md` guardam a granularidade individual. Contagens verificadas: **18/18 rotas funcionais com fluxo principal; 72/72 handlers com sucesso; 109/265 ações com evento observado; 55/93 campos com evento observado; 0/23 modais com a checklist integral certificada; 4/4 componentes de impressão exercitados em dois PDFs; 0 ações de exportação encontradas (N/A); 2 navegadores aprovados (Edge e WebKit); 21 viewports; 33 testes backend; 29 frontend; 66 E2E; 20 bugs históricos; 9 bugs novos; 0 bugs funcionais conhecidos ainda abertos após as correções; 6 condições bloqueadas no inventário.** As sete ocorrências de dependência e as lacunas de cobertura são riscos abertos separados de bugs funcionais reproduzidos.

| Categoria | Encontrados | ✓ comprovados no escopo indicado | ✗ gate de certificação sem prova completa | N/A | BLOQUEADO |
| --- | ---: | ---: | ---: | ---: | ---: |
| Páginas, fluxo principal | 18 | 18 | 0 | 0 | 0 |
| Endpoints, caminho de sucesso | 72 | 72 | 0 | 0 | 0 |
| Botões, evento observado | 265 | 109 | 156 | 0 | 0 |
| Campos, evento observado | 93 | 55 | 38 | 0 | 0 |
| Modais, checklist integral | 23 | 0 | 23 | 0 | 0 |
| Componentes de impressão | 4 | 4 | 0 | 0 | 0 |
| Exportações por arquivo | 0 | 0 | 0 | 0 | 0 |

Os valores ✗ de botões, campos e modais são **falhas do gate de evidência**, não bugs funcionais demonstrados. Mesmo os 109/55 marcados com evento observado não equivalem à validação individual de todos os efeitos, limites e estados. A exportação é N/A como funcionalidade ausente; não há item físico a contar. As 93 células `A EXECUTAR` da matriz HTTP são combinações excepcionais ainda não certificadas e não estão ocultas na aprovação dos 72 caminhos de sucesso.

## 39. Riscos residuais

Permanecem: payload de Cobrança de 2,25 MB na massa QA; sete apontamentos de dependência; as seis condições bloqueadas do inventário; 93 células excepcionais HTTP sem prova individual; 156 ações e 38 campos sem evento identificado; 23 modais sem checklist integral; e ausência de ensaio de múltiplas horas na hospedagem online. Nenhum desses limites é convertido em aprovação presumida.

## 40. Gate final

| Verificação | Resultado |
| --- | --- |
| Testes backend | 33/33 passaram |
| Testes frontend | 29/29 passaram |
| E2E | 66/66 passaram na regressão final instrumentalizada |
| Build de produção | Passou |
| `git diff --check` | Passou, apenas avisos de fim de linha no Windows |
| `npm audit` | 7 apontamentos abertos, descritos na seção 30 |
| Banco principal | Leitura apenas; 2 usuários, 6.476 clientes, 20.359 Fonadas, 2.527 Ao Vivo antes e depois |
| Bancos QA e restauração | Ambos removidos; ausência confirmada em `pg_database` |
| Matriz de controles individual | Gate falhou: 156 ações, 38 campos e 23 modais sem certificação completa |
| Matriz HTTP excepcional | Gate falhou: 93 condições ainda sem prova específica |
| Inventário: status `◐` ou `—` | Nenhum status remanescente |

**Critério de saída:** este relatório só pode ser chamado de fechamento integral quando a matriz individual não tiver ações, campos e modais sem prova ou um status permitido com justificativa técnica específica. O resultado atual preserva as lacunas em vez de atribuir sucesso por inferência.
