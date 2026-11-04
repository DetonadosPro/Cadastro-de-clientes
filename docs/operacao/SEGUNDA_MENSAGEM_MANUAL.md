# Liberação individual da segunda mensagem

No formulário Fonada, `Ctrl + Q` libera a segunda mensagem do pedido aberto quando o valor não concede a segunda mensagem automaticamente. Há também um botão pequeno `Liberar · Ctrl + Q` junto ao título da segunda mensagem.

A ação não salva o formulário automaticamente. A liberação é incluída no rascunho e registrada no pedido ao clicar em Salvar, junto das demais alterações e da verificação de versão concorrente. O limite global, o valor cobrado e os créditos permanecem iguais. Cliente bloqueado, validade e mensagem já utilizada continuam sujeitos às validações existentes. O atalho não atua enquanto há diálogo aberto.

Persistência: `fonadas.segunda_mensagem_liberada BOOLEAN NOT NULL DEFAULT FALSE`. A migração é aditiva e prepara pedidos antigos com o comportamento anterior. Não libera nenhum pedido em lote. O campo é validado como booleano na criação e edição. A elegibilidade compartilhada e as projeções de Agenda, ficha do cliente e Recall usam a mesma indicação.

O inicializador existente inclui a coluna na lista de adições idempotentes, preparando-a antes de aceitar requisições na nova versão. Opcionalmente, o script `backend/scripts/liberarColunaSegundaMensagem.js` permite preparar a coluna antecipadamente com transação, espera de bloqueio de dois segundos e limite de dez segundos de execução. Para rodá-lo, fornecer `MIGRACAO_DATABASE_URL` explicitamente e `MIGRACAO_SSL=1` para uma conexão que exija TLS; nunca gravar a URL no repositório.

Verificação: testes de valor fora do limite, persistência, criação/edição, Agenda, concorrência, disponibilidade em haver, validade e uso. Testes de navegador cobrem Ctrl+Q em um campo, gravação/recarregamento e cliente bloqueado, com dados simulados.

Se for necessário reverter o código, preservar a coluna e os pedidos que receberam a exceção; não apagar a coluna como parte de uma reversão rotineira.
