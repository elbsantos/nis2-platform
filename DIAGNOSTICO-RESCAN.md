# Diagnóstico — Re-scan bloqueado dentro de 24h

## Symptoma
Re-scan de `scanme.nmap.org` devolve sempre o scan #38 (< 24h).
A flag `DEV_CACHE_DISABLED=true` foi implementada em sessões anteriores mas não liberta o re-scan.

---

## Fluxo de um pedido `scan.start`

```
1. verifyOwnership()          → scan-executor.ts:222   PUBLIC_TEST_TARGETS.has() → pass
2. isDevCacheDisabled() ?     → scan.router.ts:105     lê process.env em runtime
   └─ false (Railway)         → getRecentCompletedScan → devolve scan #38
3. if (recentScan && !force)  → scan.router.ts:109     ← PRIMEIRA TRANCA (24h)
   └─ true                    → return { scanId: 38, status: "cached" }
   (execução pára aqui — scan novo nunca é criado)
```

### Primeira verificação que bloqueia o re-scan
**Ficheiro**: `backend/routers/scan.router.ts`  
**Linha**: `109`  
**Condição**: `if (recentScan && !input.force)`

`recentScan` é preenchido pelo resultado de `getRecentCompletedScan(orgId, target, 24h)`
(`db.ts:336`) que devolve o scan mais recente concluído dentro do TTL de 24h.
`input.force` é `undefined` porque o frontend (`ScanStart.tsx:152`) nunca envia `force: true`.

---

## Análise da flag `DEV_CACHE_DISABLED`

| Camada | Ficheiro:linha | Comportamento com flag=true |
|--------|---------------|-----------------------------|
| DB cache (24h tranca) | `scan.router.ts:105-107` | `recentScan = null` → 24h tranca bypassed automaticamente em linha 109 ✓ |
| Redis Shodan (24h) | `shodan.ts:168` | `cached = null` → vai à API ✓ |
| Redis Censys (24h) | `censys.ts:155` | `cached = null` → vai à API ✓ |
| Redis NVD (7d) | `nvd.ts:31` | `return null` → vai à API ✓ |
| Invalidação explícita Shodan/Censys | `scan.router.ts:137-144` | **NÃO EXECUTADA** — bloco guarded por `!isDevCacheDisabled() && recentScan && input.force`; com flag=true, `recentScan=null` impossibilita a condição. Não é bloqueante (integrações bypass read), mas entradas Redis antigas permanecem. |

### Por que o bypass NÃO funciona

**Causa raiz**: O ficheiro `.env` está em `.gitignore:12` — **não é confirmado ao git nem enviado ao Railway**.

```
.gitignore linha 12:   .env    .env
```

O Railway não tem `DEV_CACHE_DISABLED=true` nas suas variáveis de ambiente.  
→ `isDevCacheDisabled()` devolve `false`  
→ `getRecentCompletedScan` executa e devolve scan #38  
→ Linha 109 devolve `{ scanId: 38, status: "cached" }`

**Nota sobre o "runtime function"**: a função `() => process.env.DEV_CACHE_DISABLED === "true"` lê
`process.env` em runtime, mas `process.env` só é populado no arranque do processo
(dotenv/OS env). Mudar o `.env` sem reiniciar o servidor local não tem efeito.

---

## Lacuna de log

Não existe mensagem "scan fresco" nos logs. O `console.warn` em linha 102
(`"cache DB e Redis ignorados"`) só é emitido quando `DEV_CACHE_DISABLED=true`,
mas após criar o scan novo não há confirmação nos logs.

---

## Solução aplicada (ver commit)

1. **`scan.router.ts`**: quando `isDevCacheDisabled()`, invalida explicitamente
   as entradas Shodan e Censys no Redis (defesa em profundidade) e emite
   `[Scan] Scan fresco` após `createScan`.

2. **Para activar no Railway**: adicionar a variável de ambiente
   `DEV_CACHE_DISABLED=true` no painel Railway → Settings → Variables.
   O Railway faz redeploy automático após a alteração.

---

## Produção (flag desligada)

Com `DEV_CACHE_DISABLED` ausente ou `false`:
- `getRecentCompletedScan` executa → TTL de 24h mantém-se
- `if (recentScan && !input.force)` → scan em cache devolvido
- Rate limit de force-rescan (3/dia) activo

Nenhuma lógica de produção é afectada pela correção.
