# Arquitectura — NIS2 Plataforma PT

## Decisão principal: Monolito modular

Para o MVP (500 PMEs, 10 semanas), um monolito Node.js bem estruturado
por módulos de serviço é a escolha correcta. Os serviços internos
(`scanner`, `ai`, `billing`, etc.) são independentes o suficiente para
serem extraídos para microserviços na v2 sem reescrever a lógica.

## Camadas

```
Railway (EU-West, Amesterdão)
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
│  MySQL 8 + Redis                     │
└──────────────────────────────────────┘
```

## Infra produção

- **Plataforma**: Railway (região EU-West, Amesterdão)
- **PDFs/documentos**: gerados em memória por pedido, devolvidos em base64 (sem storage persistente)
- **Custo**: plano Railway conforme uso

## Tiers de plano

| Tier | Preço | Rate limit scan |
|------|-------|-----------------|
| Free | €0 | 5/hora |
| Pro  | €29/mês | 30/hora |
| MSSP | €199/mês | 100/hora |
