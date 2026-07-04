# ADR-003 — Critério de Divergência no Score Combinado

**Estado**: Aceite  
**Data**: 2026-07-04  
**Módulo**: `backend/utils/combined-score.ts`

---

## Contexto

O score combinado (scan + questionário) assinala medidas onde as duas fontes
discordam acentuadamente — campo `divergent: boolean` em `CombinedArticleScore`.
Este ADR define o que conta como divergência.

A plataforma tem um cenário-bandeira de valor máximo para o cliente: a empresa
declara conformidade perfeita numa medida mas o scan externo encontra falhas.
Ex.: empresa declara criptografia total (100), scan detecta porto 80 aberto (85).
Esse caso — autoavaliação optimista desmentida pelo mundo real — não deve passar
despercebido.

---

## Decisão

Duas regras independentes, aplicadas com `||`:

### §1 — Regra geral (limiar numérico)

```
divergent = |scanScore − questionnaireScore| >= 10
```

- **Limiar 10**: captura diferenças relevantes (≥ 10 pontos) sem sinalizar ruído
  de 1–9 pontos.
- Bidirecional: sinaliza independentemente de qual fonte é mais severa.

### §2 — Regra especial (declaração de perfeição desmentida)

```
divergent = questionnaireScore === 100 AND scanScore < 100
```

- Activa **sempre** que a empresa declarou conformidade perfeita (100) e o scan
  observa algo inferior, independentemente da diferença numérica.
- **Assimétrica por design**: o caso inverso (scan=100, q<100) não tem regra
  especial. Não há declaração optimista desmentida; e casos com diferença
  relevante já estouram o limiar geral da §1.
- Caso-limite **(100, 100)**: `scanScore < 100` é `false` → não sinaliza.
  Correcto: acordo total não é divergência.

### §3 — Critério composto

```typescript
const divergent = thresholdDivergent || declaredPerfectButDisproved;
```

---

## Casos de teste de referência

| scanScore | qScore | divergent | Regra activa          |
|-----------|--------|-----------|-----------------------|
| 100       | 85     | **true**  | §2 (q=100, scan<100)  |
| 85        | 100    | **true**  | §1 (diff 15 ≥ 10)     |
| 100       | 100    | false     | nenhuma (diff 0, scan=100) |
| 33        | 31     | false     | nenhuma (diff 2 < 10) |
| 88        | 0      | **true**  | §1 (diff 88 ≥ 10)     |
| 71        | 30     | **true**  | §1 (diff 41 ≥ 10)     |
| 96        | 25     | **true**  | §1 (diff 71 ≥ 10)     |
| 100       | 20     | **true**  | §1 e §2               |
| 71        | 0      | **true**  | §1 (diff 71 ≥ 10)     |
| null      | 80     | false     | sem scanScore         |
| 80        | null   | false     | sem qScore            |

---

## Consequências

- **Ecrã**: triângulo ⚠ e linha de sub-scores aparecem em mais casos (ex.: h=85/q=100).
- **PDF**: campo `divergent` já está disponível; exposição no PDF é trabalho separado
  (`fix/combined-score-all-mixed-measures`) — não misturar.
- **Contador "N divergências detectadas"**: actualiza automaticamente (vem do campo).
- **Regressão**: com limiar 10 em vez de 20, nenhum caso anteriormente sinalizado
  deixa de o ser; apenas (100, 85) passa de false → true.
