# Checklist automática de lacunas recebidas — Fase 3

Origem: `INVENTARIO_E_COBERTURA.md` antes da Fase 3. Extração por `◐` ou `—` em linhas de tabela. Total: **25 linhas**. A classificação abaixo não altera o estado original.

## PÁGINA (2)

- [ ] LAC-001 · Páginas e ações: Fonada `/fonada` · busca, filtro por campo, ordenação/páginas, seleção de pedido · ◐ · abertura, criação e pedido persistido: ✓; filtros/ordenação/paginação com volume: —
- [ ] LAC-002 · Páginas e ações: Ao Vivo `/ao-vivo` · busca, filtro, lista/páginas, seleção · ◐ · abertura e criação: ✓; filtros e paginação em volume: —

## API (3)

- [ ] LAC-003 · Páginas e ações: Cobrança `/cobranca` · abas Fonada/Ao Vivo, filtros, dar/desfazer baixa, reagendar, lote, recibos · ◐ · pagamento e desfazer Ao Vivo, datas inválidas, lote bloqueado e válido pela API: ✓; Fonada por interface e impressão: —
- [ ] LAC-004 · Páginas e ações: Recall `/recall` · fila, aniversário, busca, histórico, status, pedido criado · ◐ · aniversário e nomes corretos via API e abas na interface: ✓; atualização de status e histórico completo: —
- [ ] LAC-005 · Condições transversais: Erros de API · ◐ · 400, 401, 403, 404, 409, falha de rede; 422/429/500/502/503 por tela: —

## INTERAÇÃO (1)

- [ ] LAC-006 · Páginas e ações: Ao Vivo de hoje `/ao-vivo/hoje` · lista operacional e entrega · ◐ · acesso direto: ✓; baixa/não recebeu: —

## SEGURANÇA (5)

- [ ] LAC-007 · Páginas e ações: Acesso `/login` · usuário, senha, entrar, erro de credenciais · ✓ · `navegacao.spec.js`; duração/expiração da sessão: —
- [ ] LAC-008 · Páginas e ações: Administração `/gerenciar-usuarios` · senha mestra, lista, criar e excluir operador · ✓ · `administracao.spec.js`; política de tentativas: —
- [ ] LAC-009 · Páginas e ações: Agenda `/agenda` · calendário e setas de dia, abas, lembretes, baixa, tentativas, reagendar · ◐ · CRUD de lembrete e diálogo: ✓ (`agenda.spec.js`, `teclado-e-zoom.spec.js`); baixa/reagendamento e todas as combinações de abas: —
- [ ] LAC-010 · Páginas e ações: Fonada de hoje `/fonada/hoje` · lista operacional, baixa e tentativas · ◐ · acesso direto: ✓; ações operacionais: —
- [ ] LAC-011 · Condições transversais: Segurança · ◐ · autenticação, senha fixa removida, XSS/SQLi controlados, IDs inválidos; pentest abrangente: —

## CONCORRÊNCIA (1)

- [ ] LAC-012 · Páginas e ações: Ficha `/clientes/:id` · dados, edição, bloqueio, WhatsApp, pedidos, mês, excluir, navegação · ◐ · edição, bloqueio, WhatsApp, conflito simultâneo e recarga: ✓; todas as abas e impressão: —

## RESPONSIVIDADE (3)

- [ ] LAC-013 · Páginas e ações: Clientes `/clientes` · busca por nome/telefone, aniversário/situação, ordenação, paginação, seleção, exclusão em lote, duplicatas, mesclagem, drawer · ◐ · busca, lista, tempo real e responsividade: ✓; mesclagem e seleção em lote: —
- [ ] LAC-014 · Páginas e ações: Novo cliente `/clientes/novo` · nome, nascimento, telefones, endereço, validação, salvar/cancelar · ◐ · cadastro, nome inválido, clique duplo e largura móvel: ✓; limites máximos/autofill/CEP real: —
- [ ] LAC-015 · Condições transversais: Resolução de 320 a 2.560 px · ◐ · 16 larguras × 6 páginas sem overflow horizontal; não inspeciona todos os controles/alturas

## NAVEGADOR (1)

- [ ] LAC-016 · Condições transversais: Navegadores/dispositivos · ◐ · Edge automatizado; outros navegadores e aparelhos físicos: —

## ACESSIBILIDADE (4)

- [ ] LAC-017 · Páginas e ações: Lixeira `/clientes/lixeira` · localizar, expandir pedidos, restaurar, exclusão definitiva · ◐ · restauração de cliente e pedidos, expansão por teclado: ✓ (`lixeira.spec.js`); exclusão definitiva pela interface: —
- [ ] LAC-018 · Condições transversais: Zoom · ◐ · escala CSS de 200% com ação em Clientes; zoom nativo 80–200% ainda não certificado
- [ ] LAC-019 · Condições transversais: Teclado · ◐ · Tab, Shift+Tab, Enter e Escape em diálogo da Agenda; navegação completa só com teclado: —
- [ ] LAC-020 · Condições transversais: Acessibilidade · ◐ · axe sem falhas sérias/críticas em oito rotas; leitores de tela e todas as telas: —

## PERFORMANCE (2)

- [ ] LAC-021 · Páginas e ações: Relatórios `/relatorios` · vendas, recebimentos, desempenho, período, gráficos · ◐ · totais de vendas/recebimentos e recarga: ✓; desempenho/exportação: —
- [ ] LAC-022 · Condições transversais: Carga e escala · — · sem benchmark com 500–1.000 cadastros ou dois operadores por horas

## REDE (1)

- [ ] LAC-023 · Condições transversais: Internet interrompida · ◐ · falha de fetch e recuperação na lista; 3G/offline prolongado: —

## IMPRESSÃO (2)

- [ ] LAC-024 · Páginas e ações: Novo/editar Fonada `/fonada/novo`, `/fonada/:id` · cliente, destinatário, mensagem, datas, valor, salvar, excluir, impressão · ◐ · criação, validação, clique duplo, conflito entre dois operadores: ✓; impressão e todas as regras de segunda mensagem: —
- [ ] LAC-025 · Páginas e ações: Novo/editar Ao Vivo `/ao-vivo/novo`, `/ao-vivo/:id` · cliente, entrega, data, valor, salvar, excluir, impressão · ◐ · criação, validação, clique duplo, conflito: ✓; impressão/estados de entrega: —

## EXPORTAÇÃO (0)

## Resultado da checklist recebida

As linhas acima preservam o retrato original. A tabela abaixo registra o desfecho de cada ID; `✗` indica falha do **gate de cobertura**, sem atribuir defeito funcional à tela.

| ID | Estado final | Evidência ou limite |
| --- | --- | --- |
| LAC-001 | ✓ TESTADO E APROVADO | Busca, filtros e volume Fonada. |
| LAC-002 | ✓ TESTADO E APROVADO | Busca, filtros e volume Ao Vivo. |
| LAC-003 | ✓ TESTADO E APROVADO | Cobrança Fonada/Ao Vivo, lote e PDF. |
| LAC-004 | ✓ TESTADO E APROVADO | Estados e histórico Recall. |
| LAC-005 | ✗ TESTADO E FALHOU | Gate de exceções HTTP por handler/tela ainda tem 93 células sem prova. |
| LAC-006 | ✓ TESTADO E APROVADO | Operação de Ao Vivo Hoje. |
| LAC-007 | ✓ TESTADO E APROVADO | Sessão realmente expirada impede salvamento. |
| LAC-008 | ✗ TESTADO E FALHOU | Política de tentativas da administração não certificada individualmente. |
| LAC-009 | ✗ TESTADO E FALHOU | Agenda principal passou; todas as combinações de controles condicionais não foram certificadas. |
| LAC-010 | ✓ TESTADO E APROVADO | Baixa e tentativa de Fonada Hoje. |
| LAC-011 | ✗ TESTADO E FALHOU | Testes de autorização/entrada passaram; pentest abrangente permanece sem prova. |
| LAC-012 | ✗ TESTADO E FALHOU | Fluxo da ficha passou; nem todos os controles de abas e contextos tiveram prova individual. |
| LAC-013 | ✓ TESTADO E APROVADO | Mesclagem e exclusão em lote pela interface. |
| LAC-014 | ✗ TESTADO E FALHOU | ViaCEP e campos principais passaram; limites e autofill completos não foram certificados. |
| LAC-015 | ✗ TESTADO E FALHOU | 21 viewports passaram; inspeção de cada controle em cada tamanho não foi concluída. |
| LAC-016 | BLOQUEADO | Firefox falhou ao iniciar neste Windows; aparelhos físicos indisponíveis. Edge e WebKit passaram. |
| LAC-017 | ✓ TESTADO E APROVADO | Lixeira completa com exclusão definitiva. |
| LAC-018 | BLOQUEADO | Zoom nativo não expôs escala verificável; escala CSS a 200% passou. |
| LAC-019 | ✗ TESTADO E FALHOU | Navegação principal por teclado passou; controles condicionais não tiveram certificação individual completa. |
| LAC-020 | BLOQUEADO | Axe passou nas 18 rotas; leitor de tela real indisponível no ambiente. |
| LAC-021 | ✓ TESTADO E APROVADO | Desempenho conferido; exportação por arquivo é N/A no produto. |
| LAC-022 | BLOQUEADO | Carga local passou; operação de horas na hospedagem online não pôde ser reproduzida. |
| LAC-023 | ✗ TESTADO E FALHOU | Offline e atraso local passaram; 3G e interrupção prolongada não foram certificados. |
| LAC-024 | ✓ TESTADO E APROVADO | Segunda mensagem e PDF Fonada. |
| LAC-025 | ✓ TESTADO E APROVADO | Estados de entrega e PDF Ao Vivo. |

**Total:** 12 aprovados, 9 gates de cobertura não fechados e 4 bloqueados. A matriz de controles permanece a fonte para cada botão, campo e modal.
