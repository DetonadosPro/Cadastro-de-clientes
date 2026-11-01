# Ambiente antigo de QA sob demanda

Em 01/11/2026 foram removidas somente as implantações em execução de `go-live-qa-20260928`. O ambiente, os serviços, as variáveis e o volume foram preservados. Nenhum serviço de produção foi parado.

O registro anterior à parada está em [qa-preservado-2026-11-01.json](qa-preservado-2026-11-01.json), sem credenciais. O custo de computação deixa de correr enquanto não existem implantações ativas; o volume continua sendo cobrado.

| Item | Identificação |
|---|---|
| Projeto | `46844939-468b-43a5-91a5-e513bb609682` |
| Ambiente de QA | `620b4030-2eb1-486b-83ff-de9e657935da` |
| Backend QA | `45784f38-d39f-4960-9aa9-8978eff3e43f` / `insightful-heart` |
| Banco QA | `2bff73c1-91dd-46a2-85e7-881e180d6998` / `Postgres-mQEz` |
| Volume preservado | `9ab3f51b-f572-4683-80e6-5db56f67f16c` |
| Montagem | `/var/lib/postgresql/data` |

## Reativação

Primeiro, consultar `railway status --json` e confirmar o projeto e os IDs acima. A produção usa outro serviço PostgreSQL (`74c0f2c5-9014-4459-8cb7-9f764a3d2577`), que não participa desse procedimento.

Reativar o banco pela fonte já configurada, mantendo o volume anexado:

```powershell
npx --yes @railway/cli redeploy --environment 620b4030-2eb1-486b-83ff-de9e657935da --service 2bff73c1-91dd-46a2-85e7-881e180d6998 --from-source --yes
```

Executar a partir do checkout vinculado ao projeto indicado acima e conferir `railway status --json` antes de prosseguir. O ambiente de QA é informado explicitamente em todos os comandos.

Depois de o banco estar disponível, escolher explicitamente a revisão do backend que será ensaiada e executar:

```powershell
npx --yes @railway/cli redeploy --environment 620b4030-2eb1-486b-83ff-de9e657935da --service 45784f38-d39f-4960-9aa9-8978eff3e43f --commit REVISAO_ESCOLHIDA --yes
```

A revisão antiga está registrada no JSON de preservação. O serviço segue ligado ao repositório e à branch antiga de QA; atualizações na `main` não o reativam automaticamente. Para testar código atual, escolha o commit atual explicitamente. Confirme a URL privada do banco e mantenha envios externos desabilitados nos testes.

## Encerramento da rodada

Parar o backend antes do banco, com o ambiente e os serviços explicitamente identificados:

```powershell
npx --yes @railway/cli down --project 46844939-468b-43a5-91a5-e513bb609682 --environment 620b4030-2eb1-486b-83ff-de9e657935da --service 45784f38-d39f-4960-9aa9-8978eff3e43f --yes
npx --yes @railway/cli down --project 46844939-468b-43a5-91a5-e513bb609682 --environment 620b4030-2eb1-486b-83ff-de9e657935da --service 2bff73c1-91dd-46a2-85e7-881e180d6998 --yes
```

Conferir `activeDeployments` vazio nos dois serviços e o volume com `isPendingDeletion=false`. Um serviço desligado pode mostrar o estado de uma implantação antiga; a confirmação relevante é não haver instâncias ativas. Não usar exclusão de serviço, ambiente, banco ou volume para encerrar uma rodada.
