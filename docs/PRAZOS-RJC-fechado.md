# PRAZOS DO RJC — REFERÊNCIA FECHADA

**Estado: FECHADO em 24 jul 2026.** Este ficheiro consulta-se, não se re-deriva.
Qualquer alteração exige nova leitura em fonte primária e justificação escrita aqui.

Motivo de existir: os prazos do regime têm unidades diferentes em artigos diferentes,
e a página do CNCS diverge da lei num deles. Sem uma referência única, cada sessão
volta a derivar tudo do zero e reabre a mesma discussão.

---

## 1. Tabela de prazos

| # | Prazo | Base legal | Unidade | Fonte |
|---|---|---|---|---|
| 1 | Autoidentificação — entidades já em atividade | Art. 8.º/1 RJC | **60 dias** (corridos) | Articulado (DR) |
| 2 | Autoidentificação — entidades novas | Art. 8.º/1 RJC | **30 dias** (corridos) | Articulado (DR) |
| 3 | Comunicação do responsável de cibersegurança | Art. 31.º/3 RJC | **20 dias úteis** | Articulado (DR) |
| 4 | Comunicação do ponto de contacto permanente | Art. 32.º/3 RJC | **20 dias úteis** | Articulado (DR) |
| 5 | — nas pré-existentes, o prazo 3/4 conta da notificação de qualificação | Art. 14.º/2 e 15.º/2 Reg. → Art. 8.º/5 RJC | (mesma unidade) | Regulamento |
| 6 | Entrada em vigor do RJC | Art. 11.º DL 125/2025 | 120 dias → **3 abr 2026** | Articulado (DR) |
| 7 | Entrada em vigor do Regulamento | Art. 34.º Reg. 756/2026 | **23 jun 2026** | Regulamento |
| 8 | Diferimento (Art. 27.º/1-2, 28.º–30.º, 33.º) | Art. 10.º/2 DL 125/2025 | 24 meses da **publicação do Regulamento** → **22 jun 2028** | Articulado + CNCS |
| 9 | Dispensa de coimas (pedido fundamentado) | Art. 65.º RJC | até **3 abr 2027** | Articulado (DR) |
| 10 | Lista de ativos | Art. 32.º Reg. | até **31 jan do ano seguinte** à qualificação **ou** 6 meses após, o que ocorrer primeiro | Regulamento + CNCS |
| 11 | Notificação inicial de incidente significativo | (gama 36.º–58.º, **não lida**) | 24 horas | CNCS |
| 12 | Notificação da qualificação pela autoridade | não identificada | 30 dias úteis | **CNCS apenas** |
| 13 | Audiência de interessados sobre o Projeto de Ato de Qualificação | não identificada | 10 dias úteis | **CNCS apenas** |

Âncora do #8 confirmada dos dois lados: o articulado remete para a publicação do
Regulamento, e a página do CNCS diz literalmente "24 meses após a publicação do
Regulamento do Regime Jurídico da Cibersegurança".

---

## 2. A divergência CNCS ↔ lei (prazos #1 e #2)

**Lei**, Art. 8.º/1 do RJC, citação literal do articulado publicado em DR:

> "no prazo de 60 dias após a disponibilização da referida plataforma eletrónica"

**CNCS**, página do MyCiber, secção "Calendário de obrigações":

> "30 dias úteis → Entidades que tenham iniciado atividade depois da entrada em vigor
> do RJC; 60 dias úteis → Entidades que tenham iniciado atividade antes da entrada em
> vigor do RJC aquando da disponibilização da Plataforma"

**Resolução adotada:** o relatório imprime a formulação da lei (dias corridos) e
sinaliza ao utilizador que o CNCS publica os mesmos prazos em dias úteis, remetendo
para confirmação junto do CNCS. Não se escolhe entre as duas fontes nem se calcula
data absoluta.

**Não se imprime data absoluta de autoidentificação** enquanto a data de
disponibilização da plataforma não for um facto observado e registado. O erro original
(≈15 set 2026) resultou de multiplicar duas suposições: unidade errada × data
presumida.

---

## 3. Invariante do output gerado

O relatório de enquadramento contém **exactamente duas** ocorrências de `dias úteis`:

1. `20 dias úteis` — comunicação do responsável e do ponto de contacto (prazos #3/#4)
2. a frase que sinaliza que o CNCS publica o prazo do Art. 8.º em dias úteis

**Qualquer terceira ocorrência é defeito até prova em contrário.** Em particular,
`dias úteis` associado ao artigo 8.º fora da frase de divergência é defeito.

A invariante é sobre **o que o relatório imprime**, não sobre o regime — o regime tem
mais prazos em dias úteis (#12, #13) que o relatório hoje não menciona. Se algum deles
passar a ser impresso, actualiza-se esta secção **antes** de alterar o teste.

Teste de regressão: verificar a lista de ocorrências pelo texto literal, não pela
contagem. Contagens escondem substituições (v14, §6.2).

---

## 4. Não verificado em fonte primária

- **Artigos 36.º a 58.º do RJC** não foram lidos. O prazo #11 e a citação do `artigo 40.º`
  que o relatório imprime vêm de inferência e da página do CNCS, não do articulado.
- **Prazos #12 e #13** constam apenas da página do CNCS. Não foi identificada a base
  legal no Regulamento. Não devem ser impressos com número de artigo até serem lidos.

---

## 5. Regra de atribuição — a página do CNCS não serve como fonte

A própria página do MyCiber atribui ao Decreto-Lei artigos que pertencem ao RJC:

- "n.º 1 do artigo 8.º do Decreto-lei n.º 125/2025" e, mais abaixo, "n.º 5 do artigo 8.º
  do RJC" — o mesmo artigo, dois diplomas diferentes, na mesma página
- "alíneas b), c), d) e e) do n.º 2 (...) do artigo 3.º do Decreto-lei n.º 125/2025"

O DL tem 11 artigos e o seu Art. 3.º é "Alteração à Lei n.º 53/2008". Isto identifica a
origem provável das ~30 citações erradas corrigidas no C-EQ12a.

**Regra:** a página do CNCS serve como fonte para *prazos operacionais e factos de
processo*; **nunca** para atribuição de artigo a diploma. Essa decide-se pela epígrafe
e pelo conteúdo no articulado publicado em DR.
