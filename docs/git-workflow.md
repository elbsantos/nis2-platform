# Git Workflow — NIS2 Plataforma PT

## Estrutura de branches

```
main          ← produção (deploy automático via CI/CD)
  └── develop ← integração (default branch para PRs)
        ├── feat/scanner-agentless
        ├── feat/ai-questionnaire
        ├── feat/billing-stripe
        ├── fix/rate-limit-redis
        └── chore/update-deps
```

## Regras

| Branch | Quem pode fazer push directo | Deploy automático |
|--------|------------------------------|-------------------|
| `main` | Ninguém — só merge de `develop` | Não |
| `develop` | Merge de `feat/*`, `fix/*`, `chore/*` | Sim → Railway (produção, cisplan.com) |
| `feat/*` | Dev directamente | Não |
| `fix/*` | Dev directamente | Não |

## Fluxo de uma feature (Semana 2 exemplo)

```bash
# 1. Partir de develop actualizado
git checkout develop
git pull origin develop

# 2. Criar branch da feature
git checkout -b feat/shodan-integration

# 3. Trabalhar e commitar
git add server/integrations/shodan.ts
git commit -m "feat(integrations): adicionar Shodan wrapper com cache Redis

- lookupHost() usa InternetDB (free) sem API key
- Fallback para paid API quando SHODAN_API_KEY está definida
- Cache Redis 24h por IP para minimizar custos
- Graceful degradation se Shodan em baixo"

# 4. Push e abrir PR para develop
git push origin feat/shodan-integration
# → Abrir PR no GitHub: feat/shodan-integration → develop

# 5. Após review e CI verde, merge para develop

# 6. Quando develop está estável para release:
git checkout main
git merge develop
git push origin main
# → Railway já fez deploy automático a partir do push anterior para develop
```

## Mensagens de commit

Formato: `tipo(âmbito): descrição`

### Tipos
- `feat` — nova funcionalidade
- `fix` — correcção de bug
- `chore` — infra, deps, config (sem impacto no produto)
- `docs` — documentação
- `test` — testes
- `refactor` — refactoring sem change de comportamento
- `perf` — melhoria de performance

### Âmbitos sugeridos
`scanner` `auth` `billing` `course` `ai` `report` `middleware` `infra` `db` `integrations`

### Exemplos
```
feat(scanner): substituir Nmap por Shodan + Censys API
fix(rateLimit): corrigir key generator para X-Forwarded-For Cloudflare
chore(deps): actualizar drizzle-orm para 0.44.5
test(scanner): adicionar testes mock para Shodan InternetDB
refactor(services): extrair cálculo NIS2 score para ficheiro separado
docs(arch): actualizar diagrama com camada Redis
```

## Deploy

O deploy é automático via integração nativa da Railway com o GitHub — cada
push para `develop` é implementado diretamente pela Railway, sem passar
pelo GitHub Actions. O CI (`ci.yml`) faz apenas testes e typecheck; não
há nenhum secret de deploy a configurar no GitHub.

## Protecção de branches (configurar no GitHub)

`Settings > Branches > Branch protection rules`:

**Para `main`:**
- ✅ Require a pull request before merging
- ✅ Require status checks to pass (CI test job)
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

**Para `develop`:**
- ✅ Require status checks to pass (CI test job)
