# Feature: Enquadramento NIS2-PT

Implementa o fluxo de enquadramento jurídico de uma organização ao abrigo do
DL 125/2025 e do Regime Jurídico de Cibersegurança (RJC, aprovado como anexo
ao DL 125/2025). O resultado final é um relatório `.docx` pronto a entregar ao
CNCS ou a usar internamente.

## O que faz

1. O utilizador percorre um wizard de perguntas (setor, estrutura societária,
   dimensão) — nenhuma linha é escrita na BD enquanto preenche.
2. Ao submeter, o motor determinístico avalia as respostas e a linha
   `framework_assessments` é criada já com `status = "completed"`.
3. A organização pode consultar o histórico de assessments e descarregar o
   Relatório de Enquadramento (`.docx`) a qualquer momento.
4. O relatório re-corre o motor a partir das `answers` guardadas na BD — o
   questionário não precisa de ser repetido.

## Arquitectura

```
frontend/src/App.tsx                          rotas /enquadramento/*
frontend/src/pages/Enquadramento.tsx          /enquadramento       — lista de assessments
frontend/src/pages/EnquadramentoWizard.tsx    /enquadramento/new   — wizard de perguntas
frontend/src/pages/EnquadramentoResult.tsx    /enquadramento/:id   — resultado + download
frontend/src/components/DecisionWizard.tsx    componente do wizard (React state, questão a questão)

backend/routers/enquadramento.router.ts       endpoints complete, getById, list
backend/routers/documents.router.ts           endpoint relatorioEnquadramento
backend/services/document-generator.ts       gerador do .docx (guard + re-corre motor)
backend/utils/decision-engine.ts             motor determinístico (puro, zero I/O)
backend/middlewares/planGuard.ts             freeProcedure → getOrCreateOrgForOwner → ctx.org

database/schema.ts                           tabela framework_assessments

backend/assets/templates/enquadramento-template.docx   template (não editar à mão)
scripts/create-enquadramento-template.ts               script que gera/regenera o template
scripts/sample-enquadramento.ts                        verifica o template sem BD (ver abaixo)
```

### Fluxo de dados

```
[Wizard] → enquadramento.complete (mutation)
         → evaluateTree(NIS2_PT_TREE, answers)   [motor, síncrono]
         → createCompletedFrameworkAssessment     [BD: INSERT]
         → { id, classification, resultLabel, ... }
         → navigate(/enquadramento/:id)

[Result] → enquadramento.getById                 [BD: SELECT]
         → evaluateTree re-corrido client-side   [trilha auditável]
         → documents.relatorioEnquadramento      [BD: SELECT + .docx gerado]
         → download base64
```

O motor é importado directamente no frontend — as `Answers` e a `NIS2_PT_TREE`
são partilhadas entre backend e frontend sem duplicação.

## ENGINE_VERSION

Definida em `backend/utils/decision-engine.ts:16`:

```
export const ENGINE_VERSION = "3";
```

Sobe **apenas** quando a mesma combinação de respostas produz uma classificação
diferente. Correcções de texto, citações legais e labels não sobem a versão.

Todos os assessments gravados incluem o `engineVersion` no momento do cálculo.
Se o motor for actualizado, os assessments antigos continuam válidos — o
guard bloqueia a geração do relatório. Hoje a única via disponível é repetir
o enquadramento. Tecnicamente o assessment é recalculável a partir dos
`answers` guardados (motor determinístico), mas essa UI **não existe** —
está por implementar.

## Migrations

As migrations são aplicadas manualmente no shell MySQL do Railway. O deploy
**não as corre automaticamente**. Se uma migration for esquecida, o deploy
passa, a aplicação sobe, e falha em runtime ao tocar na coluna inexistente.

A tabela `framework_assessments` está definida em `database/schema.ts:166-188`
e inclui os campos:

| Campo | Tipo | Notas |
|---|---|---|
| `answers` | `json` | respostas originais; permitem recalcular sem refazer o questionário |
| `engineVersion` | `varchar(16) notNull` | versão do motor no momento do cálculo |
| `decisionPath` | `json` | lista de nós percorridos |
| `legalBasis` | `json` | artigos aplicáveis |
| `classification` | `varchar` | slug: `essencial`, `importante`, `a_confirmar`, etc. |
| `resultLabel` | `text` | label legível para o utilizador |

## Guard de engineVersion

Localizado em `backend/services/document-generator.ts:415-418`, dentro de
`generateRelatorioEnquadramento`.

**Ordem das verificações no serviço** (importante: a posse é verificada antes
do guard):

1. Assessment existe? (linha 407-408)
2. **Posse**: `assessment.organizationId !== orgId` → throw (linha 409-410)
3. Organização existe? (linha 412-413)
4. **Guard**: `String(assessment.engineVersion) !== String(ENGINE_VERSION)` → throw (linha 415-418)
5. Motor re-corre a partir de `assessment.answers`

O `String()` em ambos os lados é deliberado: a coluna é `VARCHAR` mas o MySQL
pode devolvê-la como `number` consoante o driver. Sem `String()`, um assessment
com `engineVersion = 3` (número) seria recusado mesmo sendo válido — o pior
modo de falha possível (guard que recusa tudo).

A mensagem de erro identifica a versão do assessment e a versão actual, para
que o utilizador saiba que precisa de repetir o enquadramento e não de contactar
suporte.

## Isolamento multi-tenant

O acesso é verificado em **duas camadas independentes**:

### Camada 1 — Router

- `enquadramento.getById` (`enquadramento.router.ts:67-68`):
  `assessment.organizationId !== ctx.org.id` → `TRPCError FORBIDDEN`
- `documents.relatorioEnquadramento` (`documents.router.ts:83-84`):
  `assessment.organizationId !== ctx.org.id` → `TRPCError FORBIDDEN`

### Camada 2 — Serviço

- `generateRelatorioEnquadramento` (`document-generator.ts:409-410`):
  `assessment.organizationId !== orgId` → `throw Error`

A camada de serviço existe porque o serviço pode ser chamado por outros
call-sites no futuro. Não depende do router para garantir isolamento.

### Canal de identidade

Todos os endpoints usam `freeProcedure` (`planGuard.ts`), que resolve:

```
ctx.user.id → getOrCreateOrgForOwner → ctx.org.id
```

O `ctx.org` é injectado pelo middleware — nunca vem do input do utilizador.

### Testes de isolamento (E.12)

`backend/routers/enquadramento.router.test.ts` — 3 testes:

- `getById`: Org B tenta aceder a assessment de Org A → `FORBIDDEN`
- `relatorioEnquadramento`: Org B tenta gerar relatório de assessment de Org A → `FORBIDDEN`
- `list`: mock distingue por `orgId`; Org B recebe lista vazia mesmo que Org A tenha dados

Estratégia: `createCaller(ctx)` com `ctx.user` real — o canal de resolução de
identidade corre como em produção. Só a camada de dados é mockada.

## Citações legais

As citações presentes no motor e nos relatórios seguem estritamente a
numeração do DL 125/2025 e do RJC:

- A atribuição de um artigo a um diploma decide-se pela **epígrafe** e pelo
  **conteúdo**, nunca pelo número. Os artigos 1.º a 11.º existem nos dois
  diplomas com conteúdos diferentes — o número sozinho não identifica o diploma.
- O **DL 125/2025** tem exactamente 11 artigos (Art. 1.º a Art. 11.º).
  Tudo o resto (âmbito, classificação, limiares, fornecedores, coimas) pertence
  ao **RJC**, aprovado como anexo ao decreto-lei.
- Os Anexos I, II e III são anexos ao decreto-lei e citam-se como
  "Anexo I DL 125/2025", "Anexo II DL 125/2025", "Anexo III DL 125/2025".
- Ser fornecedor de uma entidade abrangida não confere âmbito próprio ao
  abrigo do Art. 3.º/2 do RJC. O Art. 28.º do RJC impõe obrigações à
  **entidade abrangida** quanto aos seus fornecedores.

Todo o texto legal é texto fixo — viva ele no template, no gerador ou nas
definições dos nós do motor. O motor verifica a lógica de decisão, nunca a
referência legal que imprime. Verificar sempre na fonte primária antes de
escrever. Em julho de 2026 foram encontradas cerca de 30 citações atribuídas
ao diploma errado já em produção.

## Como regenerar o template

O ficheiro `backend/assets/templates/enquadramento-template.docx` **não deve
ser editado à mão**. É gerado pelo script:

```
npx tsx scripts/create-enquadramento-template.ts
```

Regenerar é necessário sempre que a estrutura do relatório muda (campos novos,
nova secção, alteração de layout). Após regenerar, commitar o ficheiro `.docx`.

### Script de verificação (sem BD)

```
npx tsx scripts/sample-enquadramento.ts
```

Gera `../../sample-enquadramento.docx` directamente a partir do template, sem
qualquer ligação à base de dados. Útil para verificar o template localmente.
**Não escreve na BD.** (Dev e produção partilham a mesma base de dados Railway —
qualquer script que escreva na BD afecta dados reais.)

## Baseline de testes

Medida em 23 jul 2026.

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | 7 erros (todos pre-existentes, nenhum introduzido por esta feature) |
| `npx vitest run` | 1 falhanço / 287 testes (`stripe.test.ts > constructWebhookEvent`, pre-existente) |
