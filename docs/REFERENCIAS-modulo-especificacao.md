# Módulo de Referências Legais — especificação

Unidade **C-EQ13**. Fecha a unidade de trabalho aberta no v15:

> *Toda a referência legal que a plataforma imprime está atribuída ao diploma certo
> e lida em fonte primária.*

**Terminado quando** os três testes da secção 4 existirem e passarem. Não quando alguém
olhar para o output e achar que está bem.

Fonte de toda a matéria legal deste documento: `docs/REFERENCIAS-LEGAIS-verificadas.md`.
Nenhum valor aqui foi escrito de memória.

---

## 1. O problema que isto resolve

Hoje a mesma referência aparece em formas literais diferentes, espalhada por três
ficheiros. Art. 31.º é #36 e #56. Art. 40.º é #40 e #58. Art. 27.º-30.º são #41, #42,
#46, #59. Corrigir por sintoma apanha uma forma e falha as outras — foi assim que o
C-EQ12a falhou.

Há ainda uma armadilha por explodir: **o Art. 32.º existe nos dois diplomas com matérias
diferentes.**

| Diploma | Art. 32.º | Matéria |
|---|---|---|
| RJC (anexo ao DL 125/2025) | Ponto de contacto permanente | disponibilidade 24/7, comunicação ao CNCS |
| Regulamento CNCS n.º 756/2026 | *(a confirmar a epígrafe em fonte primária)* | lista de ativos acessíveis pela Internet, grau reservado |

Qualquer literal `Art. 32.º` sem diploma é ambíguo hoje e será errado amanhã. O rótulo
`RESERVADO` do §6.2 do v15 já é uma manifestação disto.

---

## 2. Esquema

Tabela — ou módulo de dados, conforme a convenção do repositório; a decisão fica para a
Fase 1 do diagnóstico.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string, PK | Ver secção 2.1 |
| `diploma` | enum | `DL125` \| `RJC` \| `REG756` \| `REC361` \| `REC361A` \| `DIR2555` |
| `diplomaLiteral` | string | **O que é impresso.** Ver secção 2.2 |
| `artigo` | string | `40.º`, `3.º`, `25.º-A` |
| `numero` | string \| null | `1`, `2`, `1 a)` |
| `epigrafe` | string | Literal, do PDF |
| `textoLiteral` | string \| null | Só quando o documento cita o texto |
| `verificado` | enum | `fonte-primaria` \| `calculado` \| `nao-verificado` |
| `fonte` | string | Ficheiro + bloco. Ex.: `REFERENCIAS-LEGAIS-verificadas.md#RJC-40` |
| `dataVerificacao` | date | |

### 2.1 Esquema de `id`

```
{DIPLOMA}-{ARTIGO}[-{NUMERO}][-{ALINEA}]
```

`RJC-40`, `RJC-40-6`, `RJC-61-1-j`, `DL125-11`, `REC361A-3-4`, `REG756-32`.

`REC361` é o **corpo** da Recomendação; `REC361A` é o **anexo**. São séries de artigos
diferentes e a distinção é a origem dos defeitos #19 e #20. O `id` obriga a escolher.

### 2.2 `diplomaLiteral` — a regra que não é óbvia

O que se imprime **não** é o que é estruturalmente correto; é o que o diploma escreve
de si próprio.

O RJC designa-se a si próprio «o presente decreto-lei» e chama aos seus anexos
`anexo iii ao presente decreto-lei`. Nunca escreve «anexo ao regime jurídico».

| `diploma` | `diplomaLiteral` |
|---|---|
| `DL125` | `Decreto-Lei n.º 125/2025, de 4 de dezembro` |
| `RJC` | `Decreto-Lei n.º 125/2025` — o RJC é o anexo e cita-se como o DL |
| `REG756` | `Regulamento CNCS n.º 756/2026` |
| `REC361` | `Recomendação 2003/361/CE` |
| `REC361A` | `anexo à Recomendação 2003/361/CE` |

Os Anexos I, II e III imprimem-se como **`Anexo III ao Decreto-Lei n.º 125/2025`**.
Está verificado. Não alterar.

### 2.3 Datas

Nenhuma data é `fonte-primaria`. As datas do regime são **calculadas** a partir de prazos
literais, e a fórmula tem de ficar visível:

| Facto | Base literal | Cálculo | `verificado` |
|---|---|---|---|
| Entrada em vigor | Art. 11.º DL — `entra em vigor 120 dias após a sua publicação` | 4 dez 2025 + 120 d = **3 abr 2026** | `calculado` |
| Fim da janela do Art. 65.º | `durante 12 meses a contar da entrada em vigor` | 3 abr 2026 + 12 m = **3 abr 2027** | `calculado` |
| Fim dos 24 meses do Art. 10.º/2 | `24 meses após a publicação da regulamentação referida nos artigos 8.º, 14.º, 26.º, 31.º, 32.º e 83.º` | **indeterminável** | `nao-verificado` |

O diploma não diz se os 24 meses correm da primeira, da última ou de cada uma das
regulamentações. **Não imprimir data.**

---

## 3. Seed verificado

Estas entradas saem de `docs/REFERENCIAS-LEGAIS-verificadas.md` e entram com
`verificado: 'fonte-primaria'`. Todas as restantes do inventário de 61 entram com
`nao-verificado` até serem lidas.

| `id` | artigo | epígrafe | bloco |
|---|---|---|---|
| `DL125-2` | 2.º | Regime jurídico da cibersegurança | `DL-02` |
| `DL125-10` | 10.º | Produção de efeitos | `DL-10` |
| `DL125-11` | 11.º | Entrada em vigor | `DL-11` |
| `RJC-3` | 3.º | Âmbito de aplicação subjetivo | `RJC-03` |
| `RJC-6` | 6.º | Entidades essenciais e entidades importantes | `RJC-06` |
| `RJC-7` | 7.º | Entidades públicas relevantes | `RJC-07` |
| `RJC-8` | 8.º | Procedimento de qualificação das entidades | `RJC-08` |
| `RJC-26` | 26.º | Sistema de gestão de riscos de cibersegurança | `RJC-26` |
| `RJC-27` | 27.º | Medidas de cibersegurança | `RJC-27` |
| `RJC-28` | 28.º | Cadeia de abastecimento | `RJC-28` |
| `RJC-29` | 29.º | Gestão do risco residual | `RJC-29` |
| `RJC-30` | 30.º | Relatório anual | `RJC-30` |
| `RJC-31` | 31.º | Responsável de cibersegurança | `RJC-31` |
| `RJC-32` | 32.º | **Ponto de contacto permanente** | `RJC-32` |
| `RJC-33` | 33.º | Medidas de cibersegurança aplicáveis às entidades públicas relevantes | `RJC-33` |
| `RJC-35` | 35.º | Dever de registo | `RJC-35` |
| `RJC-40` | 40.º | **Notificação obrigatória** | `RJC-40` |
| `RJC-61` | 61.º | Contraordenações muito graves | `RJC-61` |
| `RJC-62` | 62.º | Contraordenações graves | `RJC-62` |
| `RJC-65` | 65.º | Dispensa de aplicação das coimas | `RJC-65` |
| `RJC-66` | 66.º | Determinação da medida da coima | `RJC-66` |
| `RJC-ANEXO-I` | — | Setores de importância crítica (10 setores) | `ANEXO-I` |
| `RJC-ANEXO-II` | — | Outros setores críticos (7 setores) | `ANEXO-II` |
| `RJC-ANEXO-III` | — | *(sem epígrafe; só remissão)* — Art. 1.º Empresa, Art. 2.º Categorias | `ANEXO-III` |

`REG756-32` entra como **`nao-verificado`** até a epígrafe ser lida no Regulamento.

---

## 4. Os três testes

O primeiro é o que a unidade exige: fica vermelho se qualquer referência regredir.

### T1 — estrutural: nenhuma citação sem diploma

Percorre o output gerado de todos os cenários. Falha se encontrar um padrão de citação
de artigo sem um token de diploma na mesma frase.

```
/(Art\.|artigo)\s*\d+\.º/
```

Para cada ocorrência, exige que a mesma frase contenha um dos `diplomaLiteral` conhecidos
ou uma remissão interna explícita ao diploma já identificado no parágrafo.

**Caso de teste obrigatório**: `Art. 32.º` isolado tem de falhar este teste.

### T2 — integridade: nada impresso sem verificação

Toda a chamada ao módulo passa um `id`. O teste falha se:
- um `id` usado pelo código não existir na tabela;
- um `id` usado tiver `verificado: 'nao-verificado'`;
- uma data impressa vier de uma entrada `nao-verificado`.

O gerador deve **lançar**, não degradar silenciosamente. Um erro em runtime é preferível
a um documento com uma afirmação legal por verificar.

### T3 — golden: o refactor não muda o output

Antes de tocar em código: gerar os documentos de todos os cenários e guardar.
Depois: exigir output **byte a byte idêntico**.

Se o output for idêntico, `ENGINE_VERSION` **não sobe**. Se diferir, parar e explicar
a diferença antes de decidir se sobe.

---

## 5. Ordem de execução

1. Gerar e guardar os golden antes de qualquer alteração. Sem isto o refactor não é seguro.
2. Criar o módulo e o seed. Sem tocar nos três ficheiros consumidores.
3. Escrever T1 e T2 e vê-los falhar contra o código atual — se passarem à primeira, estão errados.
4. Migrar os consumidores para `id`, um ficheiro de cada vez, correndo T3 entre cada um.
5. Absorver §6.1 (ressalva do Art. 40.º/6 sobre a plataforma do Art. 8.º/7) e §6.2 (remover o rótulo `RESERVADO`) — mesma classe, mesmo commit.

**Nota sobre o passo 5**: o Art. 40.º está em vigor e a obrigação imprime-se. O que falta
é a ressalva literal de que o canal de submissão (`plataforma eletrónica referida no n.º 7
do artigo 8.º`) depende de `regulamento a aprovar pelo CNCS`.

---

## 6. Fora de âmbito — registado, não trabalhar

- **Agregação ao nível do grupo.** O Anexo III só transpõe os artigos 1.º e 2.º do anexo
  à Recomendação. Não transpõe o 3.º, o 5.º nem o 6.º (agregação). Se o motor agrega,
  invoca uma regra não transposta. Precisa de decisão jurídica, não de código.
- **Epígrafe do Art. 32.º do Regulamento 756/2026.** Fica `nao-verificado`.
- Tudo o resto do §6 do v15 — unidades C-EQ14 a C-EQ16.
