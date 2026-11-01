# Otimização de recursos — 01/11/2026

## Alterações

- QA antigo sem computação ativa; volume e configuração preservados. Consultar [QA sob demanda](QA_SOB_DEMANDA.md).
- Backup por cursor PostgreSQL com lotes de 500 registros e compressão sequencial. Mantidos snapshot `REPEATABLE READ READ ONLY`, doze tabelas, ordenação, nomes dos anexos, JSON/gzip/base64 e transporte existentes. Somente o conteúdo já comprimido permanece acumulado.
- Cron e pedido manual simultâneos compartilham a mesma execução de backup, evitando duplicar o consumo e o envio.
- Verificação de nova versão a cada 120 segundos em abas visíveis, com verificação imediata ao retomar foco/visibilidade. SSE e contingência da Agenda preservados.
- Recall de mensagens em haver consulta apenas os oito campos usados pelo cálculo, mantendo os filtros e as regras de disponibilidade.
- Resumo diário usa pré-filtro conservador por dia/mês no banco e continua aplicando a comparação exata original em JavaScript. Mantidos formatos de ano curto/longo, espaços legados, Brasília, créditos e totais.

Não houve alterações de esquema ou índices de produção, parâmetros de memória do banco, rotinas de gravação, frequência dos backups, regras de cobrança ou serviços adicionais. As alterações locais anteriores de inicialização do banco e WhatsApp não integram esta publicação.

## Validação

- Regressão backend: 169 testes passaram; quatro testes condicionais sem ambiente específico foram omitidos na execução geral.
- Regressão frontend: 73 testes passaram; compilação aprovada.
- Teste de navegador com relógio controlado: intervalo de versão, pausa em aba oculta, retomada e aviso de versão nova aprovados; conexão SSE mantida.
- `node backend/scripts/validarOtimizacaoLocal.js`: três testes PostgreSQL/API aprovados, em banco dedicado local. Foram restauradas as doze tabelas, com 1.214 registros fictícios, conferindo conteúdo integral, Unicode, nulos, datas, tabelas vazias e chaves compostas.
- O backup manteve um snapshot consistente diante de inserção concorrente. Falhas simuladas não enviaram anexos incompletos, liberaram a conexão e permitiram nova tentativa.
- O resumo diário ficou integralmente idêntico ao código da revisão `6f0b4f5`; registros lidos no cenário sintético caíram de 2.408 para 54. Esse percentual pertence ao cenário de teste e não representa uma economia já medida em produção.
- A integração de créditos verificou compra, consumo, devolução, concorrência, repetição, relatórios e mesclagem.
- Não foram enviados emails ou mensagens reais durante os testes.

O ensaio local cria apenas o banco `pombo_correio_qa_otimizacao` em PostgreSQL local. Cada execução usa e remove schemas descartáveis de nomes aleatórios, sem operar no cadastro local principal ou no Railway.

## Acompanhamento e reversão

A economia imediata vem de duas instâncias de QA que deixaram de executar. Custos acumulados não diminuem retroativamente e o mínimo do plano continua aplicável. Comparar a inclinação do consumo nas próximas 48–72 horas e as médias de memória com carga semelhante. O backup continua no horário habitual; não foi disparado manualmente em produção para esta validação.

Se necessário, reverter somente o commit desta otimização restaura a implementação anterior de backup e consultas. A reativação do QA é independente e está documentada. Nenhum dado foi migrado por esta alteração, portanto a reversão de código não exige restauração do banco.
