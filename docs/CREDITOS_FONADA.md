# Créditos de Fonada

Na ficha do cliente, **Adicionar créditos** registra a quantidade de créditos comprados, o valor total pago e a forma de pagamento. O saldo e o histórico ficam na carteira, e a visão rápida mostra um atalho quando há saldo disponível.

- Cada crédito vale um pedido com duas mensagens, exclusivamente de Fonada, sem vencimento.
- Na nova Fonada, **Usar créditos** custeia o pedido inteiro com um crédito, incluindo sua segunda mensagem em haver sem vencimento.
- O desconto ocorre ao criar o pedido. Editar, transmitir, desfazer a transmissão e reagendar não descontam novamente. Excluir um pedido pago com crédito devolve o crédito uma única vez, com uma movimentação de estorno; pedidos comuns não devolvem créditos.
- A quantidade de créditos de um pedido salvo não muda. Para usar mais créditos, cria-se outro pedido.
- O pacote entra uma vez em vendas, recebimentos, desempenho da equipe e resumo diário, na data do registro em Brasília. As mensagens custeadas pelo pacote não entram como novas vendas.
- Compras e usos conservam data, horário, operador e referência do pedido. O histórico de uso sobrevive à exclusão do pedido.
- A lixeira preserva a carteira. A mesclagem transfere saldo e histórico ao cadastro que permanece. A exclusão definitiva de um cliente com saldo disponível é impedida para evitar perda dos créditos pagos.
- **Corrigir compra** permite remover créditos disponíveis e reduzir um valor escolhido do pacote, juntos ou separadamente. A compra original permanece no histórico, com o motivo, o operador e a data de cada correção. A redução de valor corrige vendas e recebimentos na data da compra original; não registra devolução de dinheiro. A correção não pode tornar o saldo negativo nem ultrapassar a quantidade ou o valor ainda existentes na compra.
- O backup semanal inclui o livro de movimentações `creditos_fonada`.

O saldo é a soma das movimentações, sem rotina de expiração. Compra e uso travam a linha do cliente em transação. A identificação única da operação impede duplicação após resposta perdida; saldo insuficiente desfaz a criação do pedido e o débito juntos.

As vendas comuns e as mensagens em haver existentes continuam com suas regras anteriores. Créditos não convertem nem renovam mensagens antigas.

Validação: testes de API com PostgreSQL local em schema descartável, cenários de concorrência e repetição, agenda, relatórios, mesclagem e lixeira; testes de navegador para compra, consumo, edição, resposta perdida, saldo insuficiente, celular e acessibilidade.
