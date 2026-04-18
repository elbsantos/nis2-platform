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

## Critérios de done globais

- [ ] Zero referências a Nmap no código
- [ ] Rate limiting activo em todas as rotas públicas
- [ ] HTTPS forçado em produção
- [ ] Cobertura vitest > 70% nos serviços críticos
- [ ] Isolamento multi-tenant verificado (IDOR test)
- [ ] CI/CD a fazer deploy em < 5 min sem downtime
