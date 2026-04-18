# Arquitectura — NIS2 Plataforma PT

## Decisão principal: Monolito modular

Para o MVP (500 PMEs, 10 semanas), um monolito Node.js bem estruturado
por módulos de serviço é a escolha correcta. Os serviços internos
(`scanner`, `ai`, `billing`, etc.) são independentes o suficiente para
serem extraídos para microserviços na v2 sem reescrever a lógica.

## Camadas

```
Cloudflare CDN + WAF
        ↓
  Express + tRPC
        ↓
┌──────────────────────────────────────┐
│  server/middlewares/                 │
│    rateLimit.ts   planGuard.ts       │
│    auth.ts        tenantGuard.ts     │
├──────────────────────────────────────┤
│  server/services/                    │
│    scan-executor.ts  ai-questionnaire│
│    ai-remediation    report.ts       │
│    course.ts         billing.ts      │
├──────────────────────────────────────┤
│  server/integrations/                │
│    shodan.ts    censys.ts            │
│    anthropic.ts stripe.ts resend.ts  │
├──────────────────────────────────────┤
│  MySQL 8 + Redis + Hetzner S3        │
└──────────────────────────────────────┘
```

## Infra produção

- **Servidor**: Hetzner CPX31 (4 vCPU, 8 GB, Falkenstein EU)
- **CDN/WAF**: Cloudflare free tier
- **Storage**: Hetzner Object Storage (S3-compat) para PDFs
- **Custo estimado**: ~€45/mês

## Tiers de plano

| Tier | Preço | Rate limit scan |
|------|-------|-----------------|
| Free | €0 | 5/hora |
| Pro  | €29/mês | 30/hora |
| MSSP | €199/mês | 100/hora |
