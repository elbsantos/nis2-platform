# NIS2 Plataforma PT

Plataforma SaaS para apoio de PMEs portuguesas na conformidade com a Directiva NIS2 (EU 2022/2555).

## Stack

- **Frontend**: React 19 + Vite + Tailwind v4 + tRPC client
- **Backend**: Node.js + Express + tRPC v11
- **ORM**: Drizzle ORM + MySQL 8
- **Cache / Rate limiting**: Redis
- **Infra**: Hetzner CPX31 + Cloudflare CDN/WAF
- **Integrações**: Shodan API, Censys API, Anthropic API, Stripe, Resend

## Desenvolvimento local

```bash
# 1. Instalar dependências
pnpm install

# 2. Copiar variáveis de ambiente
cp .env.example .env
# Editar .env com os valores correctos

# 3. Iniciar MySQL e Redis (Docker)
docker compose up -d db redis

# 4. Aplicar migrations
pnpm db:push

# 5. Iniciar servidor de desenvolvimento
pnpm dev
```

## Estrutura do projecto

```
nis2-platform/
├── client/          # React SPA
│   └── src/
│       ├── components/  # Componentes reutilizáveis
│       ├── pages/       # Páginas (Scan, Dashboard, Course…)
│       ├── hooks/       # Custom hooks
│       └── lib/         # tRPC client, utils
├── server/          # Node.js backend
│   ├── _core/       # Express setup, tRPC, auth
│   ├── integrations/ # Shodan, Censys, Anthropic, Stripe, Resend
│   ├── middlewares/ # Rate limiting, plan guard, auth
│   ├── routers/     # tRPC routers por domínio
│   └── services/    # Business logic (scanner, AI, reports…)
├── drizzle/         # Schema + migrations
│   ├── schema.ts
│   └── migrations/
├── shared/          # Tipos partilhados client/server
├── docs/            # Documentação técnica
└── scripts/         # Scripts de deploy e manutenção
```

## Branches

| Branch | Propósito |
|--------|-----------|
| `main` | Produção — deploy automático via CI/CD |
| `develop` | Integração — PRs merged aqui primeiro |
| `feat/*` | Features individuais |
| `fix/*` | Bugfixes |
| `chore/*` | Infra, deps, config |

## Semanas de desenvolvimento

- **S1–2**: Fundações seguras (rate limiting, HTTPS, integrações externas)
- **S3–4**: Scanner agentless (Shodan + Censys, score NIS2)
- **S5–6**: IA — questionário adaptativo + remediação guiada
- **S7–8**: Curso integrado + billing (Stripe)
- **S9–10**: QA, segurança, deploy produção

## Feature: Enquadramento NIS2 (C-EQ1–C-EQ6)

Ferramenta de auto-classificação NIS2 ao abrigo do DL 125/2025.

### O que faz

- Wizard de perguntas multi-etapas que determina se a organização é entidade **essencial**, **importante**, **a confirmar**, ou está **fora** do âmbito.
- Produz um relatório .docx (Secções 1–8) com a trilha de decisão auditável, exposto sancionatório e próximos passos.

### Rotas

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/enquadramento` | `Enquadramento.tsx` | Lista de assessments da org |
| `/enquadramento/new` | `EnquadramentoWizard.tsx` | Wizard (cria + responde) |
| `/enquadramento/:id` | `EnquadramentoResult.tsx` | Resultado + botão de .docx |

### Arquitectura

- **Motor de decisão** (`backend/utils/decision-engine.ts`) — fonte de verdade única. Função pura `evaluateTree(tree, answers): DecisionResult`. Importada no frontend (tipos) e no backend (lógica).
- **`ENGINE_VERSION`** — constante exportada do motor; nunca hardcoded nos routers.
- **tRPC router** (`backend/routers/enquadramento.router.ts`) — `complete`, `getById`, `list`. Todos `freeProcedure`. Não existe estado `in_progress`: a linha nasce já `completed` (C-EQ7).
- **Geração do .docx** (`backend/services/document-generator.ts` → `generateRelatorioEnquadramento`) — re-corre o motor sobre as `answers` da BD (determinístico); usa `docxtemplater` com `paragraphLoop: true`.
- **Template** regenerado com `npx tsx scripts/create-enquadramento-template.ts`.

### Isolamento multi-tenant

`getById` e `relatorioEnquadramento` verificam `assessment.organizationId !== ctx.org.id → FORBIDDEN`. `list` filtra por `organizationId` na query SQL (`WHERE organizationId = ?`).

### Migration manual

A tabela `framework_assessments` **não está nas migrations de arranque** — aplica-se manualmente ao Railway antes do deploy:

```bash
# Railway CLI
railway run mysql -u $DB_USER -p < database/manual-migrations/framework_assessments.sql
```

### Consistência da trilha

O `.docx` re-corre `evaluateTree(NIS2_PT_TREE, BD.answers)` no momento da geração. Como o motor é puro e determinístico, a Secção 2 do relatório é sempre coerente com as respostas guardadas na BD.

---

## Critérios de done globais

- [ ] Zero referências a Nmap no código
- [ ] Rate limiting activo em todas as rotas públicas
- [ ] HTTPS forçado em produção
- [ ] Cobertura vitest > 70% nos serviços críticos
- [ ] Isolamento multi-tenant verificado (IDOR test)
- [ ] CI/CD a fazer deploy em < 5 min sem downtime
