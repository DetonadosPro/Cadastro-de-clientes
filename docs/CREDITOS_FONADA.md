# Créditos de Fonada

Na ficha do cliente, **Adicionar créditos** registra a quantidade de mensagens compradas, o valor total pago e a forma de pagamento. O saldo e o histórico ficam na carteira, e a visão rápida mostra um atalho quando há saldo disponível.

- Cada crédito vale uma mensagem, exclusivamente de Fonada, sem vencimento.
- Na nova Fonada, **Usar créditos** permite custear uma ou duas mensagens. Duas mensagens consomem dois créditos; não há segunda mensagem gratuita nessa modalidade.
- O desconto é definitivo ao salvar. Editar, transmitir, desfazer a transmissão, reagendar ou excluir o pedido não altera o saldo novamente.
- A quantidade de créditos de um pedido salvo não muda. Para usar mais créditos, cria-se outro pedido.
- O pacote entra uma vez em vendas, recebimentos, desempenho da equipe e resumo diário, na data do registro em Brasília. As mensagens custeadas pelo pacote não entram como novas vendas.
- Compras e usos conservam data, horário, operador e referência do pedido. O histórico de uso sobrevive à exclusão do pedido.
- A lixeira preserva a carteira. A mesclagem transfere saldo e histórico ao cadastro que permanece. A exclusão definitiva de um cliente com saldo disponível é impedida para evitar perda dos créditos pagos.
- O backup semanal inclui o livro de movimentações `creditos_fonada`.

O saldo é a soma das movimentações, sem rotina de expiração. Compra e uso travam a linha do cliente em transação. A identificação única da operação impede duplicação após resposta perdida; saldo insuficiente desfaz a criação do pedido e o débito juntos.

As vendas comuns e as mensagens em haver existentes continuam com suas regras anteriores. Créditos não convertem nem renovam mensagens antigas.

Validação: testes de API com PostgreSQL local em schema descartável, cenários de concorrência e repetição, agenda, relatórios, mesclagem e lixeira; testes de navegador para compra, consumo, edição, resposta perdida, saldo insuficiente, celular e acessibilidade.
