# Auditoria funcional, técnica e visual — Pombo Correio

**Data:** 22/09/2026
**Ambiente:** Windows, Node.js, PostgreSQL local, Microsoft Edge via Playwright
**Escopo:** código desta pasta e execução local com bancos descartáveis de QA (`pombo_correio_qa_20260922` na primeira rodada e `pombo_correio_qa_auditoria` na ampliação).

## 1. Resultado executivo

A auditoria encontrou falhas de segurança, perda silenciosa de alterações entre operadores, validação insuficiente, duplicação por clique rápido e problemas de interface. Os achados e as correções estão na tabela abaixo. A bateria foi ampliada para **33 testes do backend, 29 testes do frontend e 34 cenários no navegador**, além da compilação de produção. Os cenários incluem dois usuários distintos em sessões independentes: criação simultânea de pedidos, edição simultânea de cliente, Fonada e Ao Vivo, envio realmente paralelo de duas gravações HTTP com a mesma versão e atualização da lista em tempo real.

**Limite importante:** o pedido original exige testar absolutamente todos os elementos, estados e combinações. Esta execução não certifica tal exaustividade. Não houve ensaio de carga sustentada, testes em aparelhos físicos, navegadores além do Edge, rede externa real nem inspeção pixel a pixel de todas as telas. A matriz abaixo distingue o que foi executado do que permanece aberto.

O banco principal `pombo_correio` foi apenas lido para dimensionar o ambiente (2 usuários, 6.476 clientes, 20.359 Fonadas, 2.527 Ao Vivo). Todos os testes que alteraram dados usaram exclusivamente bancos QA. Nenhum teste de escrita foi dirigido ao banco principal. Os dois bancos QA foram removidos após suas rodadas; a leitura final confirmou as mesmas quatro contagens e ausência do segundo banco QA.

## 2. Arquitetura e inventário

| Camada | Encontrado | Fluxo principal |
| --- | --- | --- |
| Interface | React 18, Vite, React Router | Página → formulário/ação → `frontend/src/api.js` |
| Servidor | Node.js e Express | Autenticação JWT → rota → validação → consulta PostgreSQL |
| Dados | PostgreSQL | Clientes, Fonadas, Ao Vivo, usuários, lembretes, tentativas e contadores de O.S. |
| Atualização | Eventos SSE e agendadores | Atualização entre telas; tarefas de entrega, backup e resumos |
| Externos | WhatsApp e ViaCEP | Links de contato e sugestão de endereço |

**Rotas visuais:** login, gestão de usuários, agenda, cobrança, relatórios, recall, lista/cadastro/ficha/lixeira de clientes, lista/novo/edição/hoje de Fonada, lista/novo/edição/hoje de Ao Vivo, rota desconhecida. A aplicação declara 18 caminhos funcionais, além da raiz e do curinga; formulários de novo e edição compartilham componentes. O servidor declara 67 manipuladores HTTP explícitos nos arquivos de rotas ativos e mais cinco no servidor. O inventário por página e API está em [INVENTARIO_E_COBERTURA.md](INVENTARIO_E_COBERTURA.md).

**Fluxos efetivamente percorridos:** login válido/inválido; abertura direta de 13 rotas protegidas; cadastro, edição, pesquisa, recarga, lixeira e remoção definitiva de cliente QA; pedidos Fonada e Ao Vivo; lembrete na Agenda; bloqueio de cliente; gestão de usuário; links WhatsApp; erro de rota/ID; dois operadores; acessibilidade automática; larguras de tela. A contagem de botões, campos e componentes individuais testados não foi certificada, portanto não é apresentada como cobertura total.

## 3. Preparação e método

1. Leitura de estrutura, scripts, rotas, componentes, estilos, esquema e testes existentes.
2. Criação de banco PostgreSQL separado, usuário QA e servidor apontando exclusivamente para esse banco.
3. Reprodução de falhas antes das alterações; implementação; repetição dos cenários afetados.
4. Playwright em Microsoft Edge, duas contas temporárias para os cenários de dois operadores, inspeção de respostas HTTP e leitura posterior da API/banco.
5. Análise axe em páginas selecionadas, 16 larguras entre **320 e 2.560 px** em seis áreas (96 pares página/largura), captura visual em 1.440 e 390 px.
6. `npm audit` nos dois pacotes, testes unitários, compilação e verificação do diff.

Os testes de escrita exigem `QA_E2E_ISOLATED_DB=1`; os de administração e concorrência entre contas exigem também `QA_E2E_MASTER_PASSWORD`. A suíte foi separada por área em `frontend/e2e/*.spec.js`. O banco local isolado pode ser preparado e removido com `npm run qa:prepare` e `npm run qa:cleanup` no backend. Não executar a suíte de escrita apontada para dados reais.

## 4. Falhas encontradas

| ID | Gravidade | Área | Problema | Status |
| --- | --- | --- | --- | --- |
| BUG-001 | P0 | Administração | Senha mestra fixa no código e citada na documentação | Corrigido; configurar novo segredo no ambiente |
| BUG-002 | P0 | Clientes | Duas edições simultâneas sobrescreviam dados silenciosamente | Corrigido e retestado com duas contas |
| BUG-003 | P0 | Fonada/Ao Vivo | Formulários de pedido permitiam sobrescrever edição de outro operador | Corrigido e retestado com duas contas |
| BUG-004 | P1 | Cadastro/pedidos | Clique duplo podia enviar criação duplicada | Corrigido e retestado com rede retardada |
| BUG-005 | P1 | Administração | Abertura direta podia ser desviada ao login por busca secundária sem sessão | Corrigido e retestado |
| BUG-006 | P2 | Clientes/API | Nome vazio ou só espaços era aceito em caminhos de cadastro/edição | Corrigido e retestado |
| BUG-007 | P2 | Pedidos | Datas impossíveis passavam pela interface/API | Corrigido e retestado |
| BUG-008 | P2 | API | IDs não numéricos podiam causar erro interno | Corrigido; resposta 400 validada |
| BUG-009 | P2 | WhatsApp | Números inválidos geravam links de contato | Corrigido e retestado |
| BUG-010 | P2 | Navegação | URL desconhecida mostrava tela vazia | Corrigido e retestado |
| BUG-011 | P2 | Acessibilidade | Rótulos/landmarks e contraste em páginas selecionadas | Corrigido; axe sem violações sérias/críticas nessas páginas |
| BUG-012 | P3 | Mobile | Campo de nascimento truncava a dica no cadastro a 390 px | Corrigido; screenshot e teste de largura |
| BUG-013 | P2 | Clientes vazios | Mensagem de estado vazio tinha contraste insuficiente | Corrigido; axe com banco vazio |
| BUG-014 | P2 | Cobrança | Cinco operações aceitavam datas de pagamento/reagendamento impossíveis | Corrigido e retestado com persistência |
| BUG-015 | P2 | Recall | Data padrão usava UTC e podia consultar o dia seguinte antes da meia-noite em Brasília | Corrigido e testado no limite de dia |
| BUG-016 | P2 | Rede/interface | Falha de conexão mostrava “Failed to fetch” ao usuário | Corrigido; mensagem clara e nova tentativa testadas |
| BUG-017 | P2 | Teclado/diálogo | Fechar diálogo da Agenda com Escape perdia o foco do botão de origem | Corrigido e retestado com teclado |
| BUG-018 | P2 | Lixeira | Expansão de pedidos era clicável apenas com mouse | Corrigido com botão acessível; Enter retestado |
| BUG-019 | P2 | Lixeira | Texto instrucional pequeno tinha contraste de 3,74:1 | Corrigido; axe aprovado |
| BUG-020 | P2 | Pedidos/API | Criação direta sem O.S. gravava pedido com número nulo | Corrigido; reserva atômica testada em quatro criações paralelas |
| RISK-001 | P2 | Dependências | 7 apontamentos de `npm audit` após correções compatíveis | Aberto: migrações maiores ou substituição exigidas |

### Evidência detalhada dos defeitos críticos

**BUG-001 — senha mestra exposta.** Em `backend/src/routes/auth.js` havia valor literal de fallback para o segredo administrativo e a documentação reproduzia esse valor. Qualquer pessoa com acesso ao repositório podia tentar administrar usuários. O teste direto aceitou a senha antiga antes da correção; depois, retornou 401. O segredo passou a vir de `SENHA_MESTRA`, com resposta 503 quando ausente. `JWT_SECRET` também passou a ser obrigatório. **Ação de implantação:** definir novos valores longos para ambos no ambiente de hospedagem; o valor antigo deve ser considerado comprometido.

**BUG-002 — cliente sobrescrito.** Reprodução: abrir a mesma ficha em duas sessões; A muda WhatsApp e salva; B muda o nome mantendo o formulário antigo e salva. Antes, o salvamento de B substituía os valores enviados por A sem aviso. A tabela `clientes` agora possui `versao`; a atualização só ocorre se a versão recebida ainda for atual, dentro de transação que também sincroniza o nome dos pedidos. B recebe HTTP 409 e aviso para recarregar. O teste confirmou que o WhatsApp de A ficou no banco e o nome antigo não foi substituído.

**BUG-003 — risco de pedido sobrescrito.** As rotas anteriores de Fonada e Ao Vivo atualizavam sem comparar a versão lida pelo operador, enquanto os formulários enviavam os dados completos. O risco foi identificado no código; não foi feita uma reprodução separada antes da correção para cada tipo de pedido. As tabelas receberam `versao`; os formulários enviam a versão lida, e a API rejeita a segunda escrita com HTTP 409. Operações auxiliares de Agenda, Cobrança, entrega, pagamento, mesclagem e lixeira incrementam a versão do pedido para invalidar um formulário antigo. Testes com dois logins distintos verificaram que o primeiro valor permanece após a tentativa concorrente.

Uma prova adicional enviou duas requisições HTTP no mesmo instante, com a mesma versão, para cada um dos três tipos de registro. Em cada par, exatamente uma retornou 200 e a outra 409; o banco terminou com uma única versão nova.

**BUG-004 — criação duplicada.** Sob resposta retardada, dois cliques síncronos podiam iniciar dois envios antes da atualização visual de `salvando`. Os formulários de cliente, Fonada e Ao Vivo agora usam bloqueio imediato por referência. O teste enviou dois cliques no mesmo ciclo e observou uma requisição. Em paralelo, duas pessoas criando pedidos válidos para o mesmo cliente receberam IDs e números de O.S. distintos nos dois sistemas de pedidos.

### Outros achados reproduzidos

- **BUG-005:** busca automática da Agenda sem token na entrada direta da administração recebia 401 e interferia na página. A consulta agora depende da sessão.
- **BUG-006/007:** a API e a interface validam nome obrigatório, valor requerido e datas reais; exemplos rejeitados: nome com espaços e 31/04/26. Há testes de ano bissexto.
- **BUG-008/010:** `/api/clientes/abc`, `/api/fonadas/abc`, `/api/ao-vivo/abc` retornam 400; uma rota visual desconhecida apresenta página 404 com retorno à Agenda.
- **BUG-009:** `00000000000` deixa de abrir WhatsApp; telefones brasileiros válidos são normalizados com DDI e caracteres da mensagem preservados na URL.
- **BUG-011/012:** correções de landmark, rótulos de diálogo, contraste e largura do campo de nascimento foram verificadas com axe, Edge e imagens. A inspeção visual mostrou o placeholder inteiro após a mudança.
- **BUG-013:** no banco QA recém-criado e vazio, axe detectou contraste de 3,85:1 no texto “Cadastre o primeiro cliente para começar.”. A cor foi escurecida; o mesmo teste passou novamente no estado vazio.
- **BUG-014:** cinco rotas de Cobrança retornavam sucesso para `31/04/26` ou `31/09/26`. A validação de calendário foi aplicada antes da gravação; cinco respostas 400 e ausência de pagamento indevido foram confirmadas.
- **BUG-015:** entre 21h e meia-noite em Brasília, a data UTC já pode ser a do dia seguinte. O Recall passou a usar a data de Brasília; teste de unidade cobre os dois lados da virada.
- **BUG-016:** ao interromper a chamada de listagem, o usuário via `Failed to fetch`. A camada de API agora informa indisponibilidade de conexão em português e preserva o tratamento de cancelamentos; o teste recuperou a lista após tentar novamente.
- **BUG-017:** o campo do lembrete recebia foco automaticamente antes de o diálogo registrar o elemento anterior. Ao fechar com Escape, o foco caía no corpo da página. O elemento anterior passou a ser capturado antes da montagem; Tab, Shift+Tab, Enter, Escape e devolução do foco passaram no Edge.
- **BUG-018/019:** a linha expansível da Lixeira não oferecia controle focalizável para teclado, e sua instrução em 10,5 px tinha contraste de apenas 3,74:1. Foi acrescentado botão com rótulo e `aria-expanded`, e a cor foi escurecida. O teste usou Enter para expandir os pedidos; axe passou na Lixeira.
- **BUG-020:** a interface já reservava O.S. ao abrir o formulário, mas uma chamada direta de criação podia omitir o número e salvar `NULL`. O teste reproduziu a falha. As duas rotas agora reservam número no servidor quando não recebem O.S.; duas criações HTTP paralelas de cada tipo receberam números preenchidos e distintos.

## 5. Cobertura executada

| Área | Casos cobertos | Casos ainda sem certificação |
| --- | --- | --- |
| Autenticação | Login inválido, sessão protegida, senha mestra errada/correta, criação e exclusão de usuário QA | Bloqueio por tentativas, expiração de token em uso prolongado |
| Clientes | Criar, recarregar, editar, buscar por nome/telefone/acento, excluir/lixeira/restaurar, mescla básica com pedido, nome vazio, duplo clique, concorrência com 2 contas, atualização da lista em tempo real | Todas as escolhas de campos da mesclagem e combinações de dados legados |
| Fonada | Abrir, criar, recarregar, data inválida/válida, duplo clique, edição concorrente, O.S. paralelas pela interface e API sem número | Todas as regras de segunda mensagem pela interface, impressão e cancelamentos |
| Ao Vivo | Abrir, criar, recarregar, data inválida/válida, duplo clique, edição concorrente, O.S. paralelas pela interface e API sem número | Todos os estados de entrega, pagamento e impressão pela interface |
| Agenda | Abrir, criar/concluir/reabrir/editar/excluir lembrete; diálogo com Escape | Todas as combinações de baixa e reagendamento |
| Cobrança/Recall/Relatórios | Pagamento Ao Vivo e desfazer na interface; cinco datas inválidas; baixa em lote válida e bloqueada pela API; nomes corretos no Recall; totais de vendas e recebimentos após criação/pagamento | Fluxo completo de cada filtro, lote pela interface, desempenho e exportação |
| Interface | 13 rotas de acesso direto, 96 pares largura/página, screenshot desktop/mobile, axe em 8 rotas, diálogo e lixeira por teclado, escala CSS de 200% em Clientes | Zoom nativo em todas as escalas, leitores de tela, aparelhos físicos, comparação pixel a pixel geral |
| API/banco | Autorização, entrada inválida, 404/400/409, persistência após recarga, O.S. única sob criação paralela, evento entre sessões | Carga prolongada, rede externa real, backup/restauração completos |

**Acessibilidade:** axe não encontrou violações de impacto `serious` ou `critical` nas rotas `/login`, `/gerenciar-usuarios`, `/agenda`, `/clientes`, `/clientes/novo`, `/clientes/lixeira`, `/cobranca` e `/recall` após as correções. Isso não substitui teste manual com teclado completo e leitor de tela.

**Responsividade:** os 96 pares página/largura não apresentaram rolagem horizontal do documento. Larguras: 320, 360, 375, 390, 412, 480, 600, 768, 820, 1.024, 1.280, 1.366, 1.440, 1.536, 1.920 e 2.560 px. A correção do nascimento tem teste específico a 390 px.

**Performance:** a compilação gerou carregamento dividido por páginas; não foi feito benchmark confiável com volume equivalente ao banco principal nem teste de latência sob dois operadores por horas. Tempos dos testes automatizados refletem somente a máquina local. O maior arquivo JS inicial do build atual tem 215,36 kB antes de gzip (68,93 kB comprimido); o CSS tem 256,45 kB (47,52 kB comprimido).

## 6. Dependências e riscos restantes

`npm audit fix` aplicou correções compatíveis nos arquivos de lock. Restam no backend **2 moderados e 1 alto**: `node-cron`/`uuid` pedem atualização maior; `xlsx` (alto) não possui correção automática e é usado pelos scripts de importação de planilhas, não pelas rotas HTTP principais. No frontend restam **3 moderados e 1 alto**: `esbuild`/`vite` e `react-router`/`react-router-dom` pedem mudanças de versão maior. Não há vulnerabilidade crítica informada pelo `npm audit`. Esses resultados são apontamentos de dependências, sem exploração demonstrada nesta auditoria.

Outros riscos não encerrados:

1. O aviso de conflito preserva os dados no banco, mas o operador precisa recarregar e reaplicar a própria alteração. O formulário antigo fica visível até então.
2. A alteração da senha mestra requer configuração no ambiente de implantação. Sem ela, a administração responde 503, por segurança.
3. Alguns arquivos de backup SQLite permanecem no repositório; não são parte do servidor PostgreSQL ativo. A rota de autenticação de backup também foi endurecida, mas não passou pela suíte de integração.
4. Não se afirmou cobertura de todos os 72 manipuladores HTTP nem de todos os botões. A matriz detalhada assinala as ações restantes, especialmente mesclagem, operação financeira em lote, impressão, desempenho e testes prolongados.
5. A prova de escala a 200% usa `zoom` CSS. Ela confirma reflow e ação principal nesse cenário, mas não substitui zoom nativo do navegador, leitor de tela ou teclado virtual de aparelho físico.

## 7. Artefatos, execução e revisão

- Testes de navegador: 34 cenários em arquivos por área de `frontend/e2e/`; configuração em `frontend/playwright.config.js`.
- Inventário com 18 caminhos funcionais, 72 manipuladores HTTP e status por área: `docs/auditoria/INVENTARIO_E_COBERTURA.md`.
- Testes novos de data e WhatsApp: `backend/test/validarDataCurta.test.js` e `frontend/test/telefoneWhatsApp.test.js`.
- Capturas visuais em `docs/auditoria/evidencias/`: login, Agenda e novo cliente, em desktop e mobile. Script reproduzível: `frontend/e2e/capturarEvidencias.mjs`.
- Código alterado: autenticação, validações e rotas de clientes/pedidos/Agenda/Cobrança/Recall; esquema PostgreSQL; formulários, navegação, foco de diálogo, mensagens de erro, labels, links WhatsApp e CSS; documentação e locks.
- Última regressão: **33/33 testes backend, 29/29 frontend, 34/34 cenários Edge, build de produção aprovado e `git diff --check` sem erros**. Não há script `lint` nos dois `package.json`. A auditoria de dependências da primeira rodada apontou sete ocorrências abertas, descritas acima.
- Após reiniciar servidor e interface, quatro fluxos críticos passaram de novo: relatório, diálogo com teclado, escala 200% e sincronização entre dois operadores. Servidores foram encerrados; `qa:cleanup` removeu o segundo banco; leitura apenas do banco principal mostrou **2 usuários, 6.476 clientes, 20.359 Fonadas e 2.527 Ao Vivo**, com `qa_existente = 0`.

Os diretórios `_database_backup`, `_git_backup` e `institucional` já estavam fora do trabalho desta auditoria e não foram alterados. O banco principal também permaneceu sem escrita.
