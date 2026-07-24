# REFERÊNCIAS LEGAIS — verificadas em fonte primária

**Fonte única desta verificação**: PDF «TEXTO INTEGRANTE DO ATO ORIGINAL» do Diário da
República, *Decreto-Lei n.º 125/2025, de 4 de dezembro*, 59 páginas.
Extração: `pdftotext -layout` sobre o ficheiro do DR. Nenhuma afirmação deste documento
provém de fonte secundária.

**Regra de uso**: depois deste documento existir, o PDF não volta a ser aberto. Qualquer
referência legal impressa pela plataforma tem de corresponder a um bloco literal da
secção 3 abaixo, citado pelo respetivo `id`.

---

## 1. AS DUAS PERGUNTAS ABERTAS DO v15 — FECHADAS

### Pergunta 1 — Os anexos pertencem ao DL ou ao RJC? O Anexo III existe?

**O Anexo III existe.** Está nas págs. 58–59 do PDF e contém **apenas dois artigos**:
`Artigo 1.º — Empresa` e `Artigo 2.º — Categorias`.

**Estruturalmente, os Anexos I, II e III pertencem ao RJC**, não ao articulado do DL.
Prova pelo teste acordado no v15 (a remissão sob o título):

| Anexo | Remissão literal | Artigos remetidos |
|---|---|---|
| I | `[a que se referem os n.os 1 e 2 e a alínea b) do n.º 2 do artigo 3.º, as alíneas a) e f) do n.º 1 e os n.os 2 e 3 do artigo 6.º, a alínea a) do n.º 2 do artigo 12.º e a alínea d) do n.º 1 do artigo 35.º]` | 3.º, 6.º, 12.º, 35.º |
| II | `[a que se referem os n.os 1 e 2 e a alínea b) do n.º 2 do artigo 3.º, a alínea f) do n.º 1 e os n.os 2 e 3 do artigo 6.º, a alínea a) do n.º 2 do artigo 12.º e a alínea d) do n.º 1 do artigo 35.º]` | 3.º, 6.º, 12.º, 35.º |
| III | `[a que se referem a alínea a) do n.º 1 do artigo 3.º, as alíneas a) e c) do n.º 1 do artigo 6.º, a alínea f) do n.º 2 do artigo 7.º e a alínea i) do n.º 2 do artigo 12.º]` | 3.º, 6.º, 7.º, 12.º |

O articulado do DL tem **11 artigos**, cujas epígrafes são: Objeto, Regime jurídico da
cibersegurança, Alteração à Lei n.º 53/2008, Alteração à Lei n.º 109/2009, Alteração à
Lei n.º 16/2022, Aditamento à Lei n.º 53/2008, Aditamento à Lei n.º 109/2009, Norma
transitória, Norma revogatória, Produção de efeitos, Entrada em vigor. Nenhum deles é o
«artigo 3.º» ou o «artigo 6.º» das remissões acima. Os artigos remetidos só existem no RJC.
**Logo: os anexos são do RJC.**

### Pergunta 1-bis — Mas qual é a forma literal a imprimir?

**Aqui a resposta estrutural e a resposta literal divergem, e o que a plataforma imprime
deve seguir a literal.** O RJC redige-se a si próprio como «o presente decreto-lei» (ver
bloco `RJC-03`), e é assim que designa os seus próprios anexos:

- Art. 3.º/1 RJC: `entidades privadas de um dos tipos que constam nos anexos i ou ii ao presente decreto-lei`
- Art. 3.º/1 a) RJC: `nos termos do artigo 2.º do anexo iii ao presente decreto-lei`
- Art. 6.º/1 a) RJC: `previstos no artigo 2.º do anexo iii ao presente decreto-lei`

O diploma **nunca** escreve «anexo iii ao regime jurídico da cibersegurança».

**Consequência para o inventário**: as referências #21, #24 e #52 do v15 — suspeitas —
**não são defeito**. `Anexo III DL 125/2025` e `Anexos I e II do DL 125/2025` correspondem
ao literal do diploma. As asserções de teste `decision-engine.test.ts:105, :131, :208` e
`document-generator.test.ts:1056, :1069, :1157, :1163` **mantêm-se**.

Fica apenas uma normalização cosmética opcional: o diploma usa a preposição **«ao»**
(`anexos i ou ii ao presente decreto-lei`), não «do». Decisão de estilo, não de direito.

### Pergunta 2 — O Art. 40.º existe com a epígrafe de notificação de incidentes?

**Sim.** `Artigo 40.º — Notificação obrigatória` (bloco `RJC-40`), n.º 1:

> `As entidades essenciais, importantes e públicas relevantes notificam qualquer incidente significativo à autoridade de cibersegurança competente.`

Confirma-se também a inferência feita a partir do Art. 61.º/1 j): a alínea lê
`O incumprimento do dever de notificação nos termos dos artigos 40.º a 44.º`.

**As referências #40 e #58 estão corretas.** Nada a corrigir.

### Pergunta 2-bis — O Art. 40.º está em vigor?

**Sim**, e isto fecha o achado §6.1 do v15 (`artigo 40.º impresso como obrigação em vigor`).

O Art. 10.º/2 do DL difere a produção de efeitos de uma lista **fechada**: `n.os 1 e 2 do
artigo 27.º`, `artigos 28.º a 30.º`, `artigo 33.º` e `alíneas b), c) e f) do n.º 1 do
artigo 61.º`. **O artigo 40.º não consta desta lista.** Está em vigor desde a entrada em
vigor do diploma.

Ressalva a imprimir junto da obrigação, porque é literal: o Art. 40.º/6 manda submeter as
notificações `na plataforma eletrónica referida no n.º 7 do artigo 8.º`, e o Art. 8.º/7
remete essa plataforma para `regulamento a aprovar pelo CNCS`. A obrigação está em vigor;
o canal de cumprimento depende do regulamento.

---

## 2. FACTOS DE CALENDÁRIO — literais

| Facto | Literal | Bloco |
|---|---|---|
| Publicação | 4 de dezembro de 2025 (DR n.º 234/2025, Série I) | — |
| Entrada em vigor | `O presente decreto-lei entra em vigor 120 dias após a sua publicação.` | `DL-11` |
| Produção de efeitos diferida | `produz efeitos 24 meses após a publicação da regulamentação referida nos artigos 8.º, 14.º, 26.º, 31.º, 32.º e 83.º do referido regime` | `DL-10` |
| Âmbito do diferimento | 27.º/1 e /2; 28.º a 30.º; 33.º; 61.º/1 b), c) e f) — **e mais nenhum** | `DL-10` |
| Dispensa de coimas | `durante 12 meses a contar da entrada em vigor do presente decreto-lei` | `RJC-65` |
| Âmbito da dispensa | apenas coimas do `n.º 2 do artigo 61.º` e do `n.º 2 do artigo 62.º`, **mediante pedido devidamente fundamentado**, com fundamento na `inexistência de um procedimento interno de adaptação` | `RJC-65` |
| Autoidentificação | `no prazo de 60 dias após a disponibilização da referida plataforma eletrónica` — **«60 dias», sem «úteis»**, e contados da disponibilização da plataforma, não da entrada em vigor | `RJC-08` |

**Nota de rigor sobre o diferimento**: o Art. 10.º/2 refere `a regulamentação referida nos
artigos 8.º, 14.º, 26.º, 31.º, 32.º e 83.º` — no plural e sem dizer se o prazo corre da
publicação de cada uma, da primeira ou da última. O diploma não resolve a questão. Enquanto
não for resolvida, a plataforma **não deve imprimir uma data concreta** para o fim do
período de 24 meses.

---

## 3. ACHADO NOVO — não fechado, registado para não se perder

**O Anexo III não transpõe as regras de agregação da Recomendação 2003/361/CE.**

O anexo à Recomendação 2003/361/CE tem nove artigos: 1.º (Empresa), 2.º (Efetivos e
limiares financeiros), 3.º (Tipos de empresas — autónomas, parceiras, associadas), 4.º
(Dados a considerar), 5.º (Efetivos/UTA), 6.º (Determinação dos dados — agregação).

O **Anexo III do DL 125/2025 tem dois artigos**: 1.º e 2.º. Reproduz a definição de empresa
e os limiares. **Não reproduz os artigos 3.º a 6.º.**

O Art. 3.º/1 a) do RJC qualifica pela via do `artigo 2.º do anexo iii ao presente
decreto-lei ..., correspondentes ao previsto na Recomendação 2003/361/CE`.

Questão em aberto, que afeta a agregação ao nível do grupo no motor de enquadramento:
a expressão `correspondentes ao previsto na Recomendação 2003/361/CE` incorpora as regras
de agregação do artigo 6.º do anexo à Recomendação, ou é apenas a indicação da origem dos
limiares do artigo 2.º? **O diploma não responde.** Enquanto não houver resposta em fonte
com autoridade, a plataforma não deve imprimir uma conclusão de enquadramento cuja base
legal seja um artigo do anexo à Recomendação que o Anexo III não transpõe.

Isto afeta as referências #19 e #20 (`Art. 3.º/4 do anexo à Rec. 2003/361/CE`): a correção
da **forma literal** está certa e mantém-se; o que fica em aberto é se essa base legal deve
sequer ser invocada num enquadramento feito ao abrigo do DL 125/2025.

---

## 4. CONTAGENS — confirmadas

- **Anexo I — Setores de importância crítica: 10 setores.** 1 Energia; 2 Transportes;
  3 Setor bancário; 4 Infraestruturas do mercado financeiro; 5 Saúde; 6 Água potável;
  7 Águas residuais; 8 Infraestruturas digitais; 9 Gestão de serviços de tecnologias da
  informação ou comunicação (entre empresas); 10 Espaço.
- **Anexo II — Outros setores críticos: 7 setores.** 1 Serviços postais e de estafeta;
  2 Gestão de resíduos; 3 Produção, fabrico e distribuição de produtos químicos;
  4 Produção, transformação e distribuição de produtos alimentares; 5 Indústria
  transformadora; 6 Prestação de serviços digitais; 7 Investigação.
- **Limiares (Anexo III, Art. 2.º)** — confirmam a lógica AND/OR do motor:
  - PME: `menos de 250 pessoas` **E** (`volume de negócios anual não excede 50 milhões` **OU** `balanço total anual não excede 43 milhões`)
  - Pequena: `menos de 50 pessoas` **E** (`volume de negócios anual ou balanço total anual não excede 10 milhões`)
  - Micro: `menos de 10 pessoas` **E** (`volume de negócios anual ou balanço total anual não excede 2 milhões`)

---

## 5. VEREDICTO POR REFERÊNCIA DO INVENTÁRIO v15

| # | Ficheiro:linha | Estado após verificação |
|---|---|---|
| 19 | `decision-engine.ts:229` | **Corrigir** para `Art. 3.º/4 do anexo à Rec. 2003/361/CE` — sem prejuízo do achado da secção 3 |
| 20 | `decision-engine.ts:235` | **Corrigir** para `Art. 3.º/2 do anexo à Rec. 2003/361/CE` — idem |
| 21 | `decision-engine.ts:248` | **Correta.** Não mexer |
| 24 | `decision-engine.ts:400` | **Correta.** Não mexer |
| 52 | `create-enquadramento-template.ts:210` | **Correta.** Opcionalmente `Anexos I e II ao DL 125/2025` (cosmético) |
| 40 | — | **Correta.** Art. 40.º existe e está em vigor |
| 58 | — | **Correta.** Idem |

---

## 6. BLOCOS LITERAIS

### `DL-02` — Decreto-Lei n.º 125/2025 — Artigo 2.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 259–265.

```
Artigo 2.º
Regime jurídico da cibersegurança
É aprovado, em anexo ao presente decreto-lei e do qual faz parte integrante, o regime jurídico da cibersegurança.
```

### `DL-10` — Decreto-Lei n.º 125/2025 — Artigo 10.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 431–443.

```
Artigo 10.º
Produção de efeitos
1 - O disposto na alínea d) do artigo 9.º produz efeitos após a substituição ou revogação, pelas entidades competentes, dos
regulamentos e atos adotados pela ANACOM, em matéria de segurança e de integridade das redes e serviços, ao abrigo da Lei n.º
5/2004, de 10 de fevereiro, da Lei n.º 16/2022, de 18 de agosto, e do Decreto-Lei n.º 65/2021, de 30 de julho, e que não sejam
incompatíveis com o disposto no presente decreto-lei.
2 - O disposto nos n.os 1 e 2 do artigo 27.º, nos artigos 28.º a 30.º, no artigo 33.º e nas alíneas b), c) e f) do n.º 1 do artigo 61.º do
regime jurídico da cibersegurança, aprovado em anexo ao presente decreto-lei, produz efeitos 24 meses após a publicação da
regulamentação referida nos artigos 8.º, 14.º, 26.º, 31.º, 32.º e 83.º do referido regime.
```

### `DL-11` — Decreto-Lei n.º 125/2025 — Artigo 11.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 444–451.

```
Artigo 11.º
Entrada em vigor
O presente decreto-lei entra em vigor 120 dias após a sua publicação.
Assinatura
```

### `ANEXO` — Cabeçalho do Anexo (RJC)

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 463–466.

```
Anexo
Regime jurídico da cibersegurança
(a que se refere o artigo 2.º)
```

### `RJC-03` — RJC — Artigo 3.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 675–748.

```
Artigo 3.º
Âmbito de aplicação subjetivo
1 - O presente decreto-lei aplica-se às entidades privadas de um dos tipos que constam nos anexos i ou ii ao presente decreto-lei e do
qual fazem parte integrante, que, respeitados os critérios de âmbito territorial fixados no artigo seguinte:
a) Sejam qualificadas como médias empresas nos termos do artigo 2.º do anexo iii ao presente decreto-lei e do qual faz parte
integrante, correspondentes ao previsto na Recomendação 2003/361/CE, da Comissão, de 6 de maio de 2003, ou que excedam os
limiares relativos às médias empresas previstos no n.º 1 desse artigo; e
b) Prestem os seus serviços ou exerçam as suas atividades na União Europeia.
2 - O presente decreto-lei aplica-se igualmente às entidades de um dos tipos que constam nos anexos i ou ii ao presente decreto-lei
que, independentemente da sua natureza e dimensão e respeitados os critérios de âmbito territorial fixados no artigo seguinte,
preencham pelo menos um dos seguintes requisitos:
a) A entidade em causa seja:
i) Fornecedor de redes públicas de comunicações eletrónicas ou prestador de serviços de comunicações eletrónicas acessíveis ao
público;
ii) Prestador de serviços de confiança;
iii) Registo de nomes de domínio de topo, prestador de serviços de registo de nomes de domínio, e prestador de serviços de sistemas
de nomes de domínio;
b) A entidade em causa seja o único prestador de um serviço que é essencial para a manutenção de atividades sociais ou económicas
críticas, designadamente as atividades correspondentes aos setores, subsetores e tipos de entidades referidos nos anexos i e ii ao
presente decreto-lei;
c) Uma perturbação do serviço por si prestado possa afetar consideravelmente a segurança pública, a proteção pública ou a saúde
pública;
d) Uma perturbação do serviço por si prestado possa gerar riscos sistémicos consideráveis, especialmente para os setores relativamente
aos quais tal perturbação possa ter um impacto transfronteiriço;
e) A entidade seja crítica devido à sua importância específica, a nível nacional ou regional, para o setor ou tipo de serviço em causa, ou
para outros setores interdependentes.
3 - O presente decreto-lei aplica-se à Administração Pública, abrangendo:
a) Os serviços da administração direta do Estado, central e periférica;
b) Os serviços da administração direta das Regiões Autónomas, central e periférica;
c) As entidades da administração indireta do Estado;
d) As entidades da administração indireta das Regiões Autónomas;
e) As entidades da administração autónoma;
f) Os organismos e as entidades administrativas independentes, com exceção do Banco de Portugal, da Comissão do Mercado dos
Valores Mobiliários e da Autoridade de Supervisão de Seguros e Fundos de Pensões.
4 - O presente decreto-lei aplica-se às seguintes entidades:
a) Provedoria de Justiça;
b) Conselho Económico e Social;
c) Serviços técnicos e administrativos da Presidência da República, da Assembleia da República, dos tribunais e das secretarias com
competência para a tramitação de procedimentos, do Conselho Superior da Magistratura, do Conselho Superior dos Tribunais
Administrativos e Fiscais e do Conselho Superior do Ministério Público, sem prejuízo do disposto no n.º 7.
5 - O presente decreto-lei aplica-se às entidades que, independentemente da sua dimensão, sejam identificadas como entidades
críticas nos termos do disposto da Diretiva (UE) 2022/2557, do Parlamento Europeu e o Conselho, de 14 de dezembro de 2022, relativa
à resiliência das entidades críticas, sem prejuízo da alínea f) do n.º 3.
6 - O presente decreto-lei aplica-se às instituições de ensino superior.
7 - O presente decreto-lei não é aplicável:
a) Ao Estado-Maior-General das Forças Armadas e dos ramos das Forças Armadas, no que respeita às redes e sistemas de informação
diretamente relacionados com o seu comando e controlo;
b) Às entidades públicas com responsabilidades de investigação criminal e aos órgãos de polícia criminal e de segurança pública, no
que respeita às redes e sistemas de informação diretamente relacionados com o seu comando e controlo;
c) Às entidades públicas com responsabilidades exclusivas em matéria de produção de informações, nomeadamente ao Sistema de
Informações da República Portuguesa, ao Serviço de Informações Estratégicas de Defesa e ao Serviço de Informações de Segurança, no
que respeita às redes e sistemas de informação diretamente relacionados com o seu comando e controlo;
d) Às entidades públicas cuja atividade incida sobre redes e sistemas de informação diretamente relacionados com a produção e
difusão de informação classificada, nomeadamente com as marcas nacionais, da Organização do Tratado do Atlântico Norte (OTAN), e
da União Europeia, ou catalogada como segredo de Estado, no que respeita a essas redes e sistemas de informação;
e) Às demais entidades públicas que exercem a sua atividade nos domínios da segurança nacional, da segurança pública, incluindo as
entidades com responsabilidades de investigação criminal e os órgãos de polícia criminal, da defesa e dos serviços de informações, no
que respeita às redes e sistemas de informação diretamente relacionados com as atividades de produção de informações e prevenção,
investigação, deteção e repressão de infrações penais;
f) Às entidades privadas que prestem serviços exclusivamente a uma ou mais entidades previstas nas alíneas anteriores e no que
respeita a estas atividades.
8 - Às entidades referidas na alínea b) do n.º 2 do artigo 15.º aplica-se o presente decreto-lei apenas no que respeita ao exercício das
suas competências na qualidade de autoridades nacionais especiais de cibersegurança.
9 - O presente decreto-lei não prejudica o disposto no Regulamento (UE) 2022/2554, do Parlamento Europeu e do Conselho, de 14 de
dezembro de 2022, relativo à resiliência operacional digital do setor financeiro.
```

### `RJC-06` — RJC — Artigo 6.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 812–848.

```
Artigo 6.º
Entidades essenciais e entidades importantes
1 - Para efeitos do presente decreto-lei, consideram-se entidades essenciais:
a) As entidades de um dos tipos referidos no anexo i ao presente decreto-lei que excedam os limiares para as médias empresas
previstos no artigo 2.º do anexo iii ao presente decreto-lei, correspondentes aos da Recomendação 2003/361/CE, da Comissão, de 6 de
maio de 2003;
b) Os prestadores de serviços de confiança qualificados e registo de nomes de domínio de topo, e os prestadores de serviços de
sistemas de nomes de domínio, independentemente da sua dimensão;
c) As empresas que oferecem redes públicas de comunicações eletrónicas ou serviços de comunicações eletrónicas acessíveis ao
público que sejam consideradas médias empresas nos termos do artigo 2.º do anexo iii ao presente decreto-lei, correspondentes aos
da Recomendação 2003/361/CE da Comissão, de 6 de maio de 2003;
d) As entidades da Administração Pública que tenham como atribuições a prestação de serviços nas áreas do desenvolvimento,
manutenção e gestão de infraestruturas de tecnologias de informação e comunicação ou aquelas que apresentem um grau
particularmente elevado de integração digital na prestação dos seus serviços, e ainda a entidade pública responsável pela área da
avaliação educativa;
e) As entidades identificadas como entidades críticas nos termos da Diretiva (UE) 2022/2557, do Parlamento Europeu e o Conselho, de
14 de dezembro de 2022, relativa à resiliência das entidades críticas e que revoga a Diretiva 2008/114/CE do Conselho,
independentemente da sua dimensão;
f) Qualquer outra entidade de um dos tipos constantes dos anexos i ou ii ao presente decreto-lei, referida nas alíneas b) a e) do n.º 2 do
artigo 3.º, que seja qualificada como entidade essencial com base no respetivo grau de exposição da entidade aos riscos, na dimensão
da entidade e na probabilidade de ocorrência de incidentes e a sua gravidade, incluindo o seu impacto social e económico.
2 - Para efeitos do presente decreto-lei, são entidades importantes as entidades dos tipos referidos nos anexos i e ii ao presente
decreto-lei que não sejam consideradas entidades essenciais ao abrigo do número anterior.
3 - Para efeitos do presente decreto-lei, são também entidades importantes as entidades de um dos tipos constantes nos anexos i ou ii
ao presente decreto-lei, referidas nas alíneas b) a e) do n.º 2 do artigo 3.º, que justifiquem tal qualificação com base no respetivo grau
de exposição da entidade aos riscos, na dimensão da entidade e na probabilidade de ocorrência de incidentes e a sua gravidade,
incluindo o seu impacto social e económico.
4 - A atribuição das qualificações de entidades essenciais e entidades importantes previstas nos números anteriores resulta dos
mecanismos previstos no artigo 8.º
```

### `RJC-07` — RJC — Artigo 7.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 849–887.

```
Artigo 7.º
Entidades públicas relevantes
1 - As entidades públicas que não sejam qualificadas como entidades essenciais ou importantes nos termos do artigo anterior,
consideram-se entidades públicas relevantes, integrando-se em dois grupos para efeitos de aplicação de regimes específicos nos
termos do presente decreto-lei e restante regulamentação emitida pelo CNCS.
2 - São consideradas entidades públicas relevantes do Grupo A:
a) Os serviços da administração direta do Estado, central e periférica, com 250 ou mais trabalhadores no seu quadro de pessoal;
b) Os serviços da administração direta das Regiões Autónomas, central e periférica, com 250 ou mais trabalhadores no seu quadro de
pessoal;
c) As entidades da administração indireta do Estado, com mais de 250 trabalhadores no seu quadro de pessoal;
d) As entidades da administração indireta das Regiões Autónomas, com mais de 250 trabalhadores no seu quadro de pessoal;
e) As entidades da administração autónoma, com mais de 250 trabalhadores no seu quadro de pessoal;
f) As entidades públicas empresariais que excedam os limiares previstos no artigo 2.º do anexo iii ao presente decreto-lei,
correspondentes aos da Recomendação 2003/361/CE, da Comissão, de 6 de maio de 2003;
g) As entidades administrativas independentes;
h) O Conselho Económico e Social, a Provedoria da Justiça, os serviços técnicos e administrativos da Presidência da República, da
Assembleia da República, dos tribunais e das secretarias com competência para a tramitação de procedimentos, do Conselho Superior
da Magistratura, do Conselho Superior dos Tribunais Administrativos e Fiscais e do Conselho Superior do Ministério Público.
3 - São consideradas entidades públicas relevantes do Grupo B:
a) Os serviços da administração direta do Estado, central e periférica, que tenham entre 75 e 249 trabalhadores no seu quadro de
pessoal;
b) Os serviços da administração direta das Regiões Autónomas, central e periférica, que tenham entre 75 e 249 trabalhadores no seu
quadro de pessoal;
c) As entidades da administração indireta do Estado, que tenham entre 75 e 249 trabalhadores no seu quadro de pessoal;
d) As entidades da administração indireta das Regiões Autónomas, que tenham entre 75 e 249 trabalhadores no seu quadro de pessoal;
e) As entidades da administração autónoma, que tenham entre 75 e 249 trabalhadores no seu quadro de pessoal;
f) As entidades públicas empresariais qualificadas como empresas médias nos termos do anexo iii ao presente decreto-lei,
correspondentes aos da Recomendação 2003/361/CE, da Comissão, de 6 de maio de 2003.
4 - A atribuição da qualificação de entidade pública relevante prevista nos números anteriores resulta dos mecanismos de qualificação
previstos no artigo seguinte.
```

### `RJC-08` — RJC — Artigo 8.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 888–914.

```
Artigo 8.º
Procedimento de qualificação das entidades
1 - As entidades previstas no artigo 3.º identificam-se em plataforma eletrónica disponibilizada pelo CNCS, no prazo de 30 dias após o
início da sua atividade ou, caso a entidade já se encontre em atividade aquando da entrada em vigor do presente decreto-lei, no prazo
de 60 dias após a disponibilização da referida plataforma eletrónica, sendo responsáveis por manter essa informação devidamente
atualizada.
2 - A qualificação das entidades pelo CNCS com base nos critérios previstos nas alíneas a) a c) e e) do n.º 1 e no n.º 2 do artigo 6.º, e
ainda no artigo 7.º, resulta do mecanismo previsto no número anterior.
3 - A qualificação das entidades pelo CNCS com base nos critérios previstos nas alíneas d) e f) do n.º 1 e no n.º 3 do artigo 6.º, é
comunicada com a antecedência mínima de 60 dias ao membro do Governo responsável pela área da cibersegurança e revista pelo
menos de dois em dois anos.
4 - A qualificação prevista no número anterior é devidamente fundamentada pelo CNCS, sendo precedida de audiência prévia da
entidade em causa e, quando aplicável, de parecer das autoridades nacionais setoriais de cibersegurança referidas na alínea a) do n.º 2
do artigo 15.º
5 - O CNCS, ou, quando aplicável, as autoridades nacionais setoriais de cibersegurança competentes nos termos da alínea a) do n.º 2 do
artigo 15.º, notifica a entidade da sua qualificação nos termos dos n.os 2 e 3, no prazo máximo de 30 dias a contar da data da referida
qualificação.
6 - Os prestadores de serviços de registos de nomes de domínio devem identificar-se e comunicar a informação prevista no n.º 2 do
artigo 35.º através da plataforma eletrónica disponibilizada pelo CNCS, no prazo de 30 dias após o início da sua atividade.
7 - As regras de funcionamento da plataforma eletrónica referida no presente artigo são definidas através de regulamento a aprovar
pelo CNCS.
8 - O procedimento de qualificação referido no presente artigo não prejudica, para as entidades abrangidas, o cumprimento do dever
previsto no artigo 35.º
```

### `RJC-26` — RJC — Artigo 26.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1512–1548.

```
Artigo 26.º
Sistema de gestão de riscos de cibersegurança
1 - As entidades essenciais e importantes são responsáveis por garantir a segurança das redes e dos sistemas de informação, tomando
as medidas técnicas, operacionais e organizativas adequadas para gerir os riscos que se colocam à segurança das redes e dos sistemas
de informação que utilizam nas suas operações e para impedir ou minimizar o impacto de incidentes nos destinatários dos seus
serviços e noutros serviços.
2 - As medidas de cibersegurança adotadas devem basear-se numa abordagem sistémica que abranja todos os riscos para as entidades
essenciais e importantes e que vise proteger todos os ativos que garantam a continuidade do funcionamento das redes e os sistemas
de informação que suportam os serviços essenciais, incluindo o seu ambiente físico, contra incidentes.
3 - As medidas devem ainda:
a) Garantir um nível de segurança das redes e dos sistemas de informação adequado ao risco em causa, tendo em conta os progressos
técnicos mais recentes e, se aplicáveis, as normas europeias e internacionais pertinentes, bem como os custos de execução e a
viabilidade financeira destes; e
b) Ser proporcionais ao grau de exposição da entidade aos riscos, a dimensão da entidade e a probabilidade de ocorrência de
incidentes e a sua gravidade, incluindo o seu impacto social e económico, segundo os critérios técnicos que venham a ser definidos
pelo CNCS.
4 - De forma a orientar a política de gestão de riscos de cibersegurança por parte das entidades essenciais e importantes, o CNCS pode
emitir instruções técnicas de harmonização e, sempre que necessário, elaborar e atualizar a matriz de risco aplicável àquelas entidades.
5 - Considerando o setor de atividade e a dimensão da entidade e a matriz de risco definida, o CNCS, através de regulamento a aprovar
pelo CNCS, define medidas de cibersegurança mínimas e específicas e níveis de conformidade a adotar pelas entidades essenciais e
entidades importantes.
6 - As medidas de cibersegurança mínimas não prejudicam a adoção de outras medidas que sejam necessárias e proporcionais, em
resultado da análise e gestão dos riscos residuais de cibersegurança, nos termos do artigo seguinte.
7 - As entidades públicas relevantes devem adotar as medidas técnicas, operacionais e organizativas adequadas que sejam
determinadas pelo CNCS, de acordo com o grupo a que pertençam, nos termos do artigo 33.º
8 - Sempre que seja alterada a qualificação das entidades, nos termos do artigo 8.º, ou as medidas de cibersegurança mínimas previstas
no n.º 5 do presente artigo, em função da atualização da matriz de risco, as entidades essenciais e importantes dispõem de um prazo
de seis meses para a respetiva adaptação à nova qualificação ou às novas medidas de cibersegurança mínimas, podendo o prazo ser
prorrogado até um ano pela Autoridade Nacional de Cibersegurança, mediante pedido fundamento da entidade.
```

### `RJC-27` — RJC — Artigo 27.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1549–1575.

```
Artigo 27.º
Medidas de cibersegurança
1 - As medidas de cibersegurança a adotar pelas entidades essenciais e importantes, tendo em consideração a matriz de risco em que
estiverem inseridas nos termos do artigo anterior, abrangem, designadamente, as seguintes áreas:
a) Tratamento de incidentes;
b) Continuidade das atividades, como a gestão de cópias de segurança e a recuperação de desastres, e gestão de crises;
c) Segurança da cadeia de abastecimento, incluindo aspetos de segurança respeitantes às relações entre cada entidade e os respetivos
fornecedores ou prestadores de serviços diretos;
d) Segurança na aquisição, desenvolvimento e manutenção das redes e sistemas de informação, incluindo o tratamento e a divulgação
de vulnerabilidades;
e) Políticas e procedimentos para avaliar a eficácia das medidas de gestão dos riscos de cibersegurança;
f) Práticas básicas de ciber-higiene e formação em cibersegurança, incluindo os titulares de órgãos máximos de gestão e trabalhadores;
g) Políticas e procedimentos relativos à utilização de criptografia e, se for caso disso, de cifragem, sem prejuízo das competências
conferidas a outras entidades em matéria de criptografia no âmbito nacional ou perante outras organizações internacionais de que
Portugal seja membro;
h) Segurança dos recursos humanos, políticas seguidas em matéria de controlo do acesso e gestão de ativos;
i) Utilização de autenticação multifator ou de autenticação contínua, comunicações seguras e sistemas seguros de comunicações de
emergência no seio da entidade.
2 - As entidades essenciais e importantes devem adotar ainda, sem demora injustificada, todas as medidas de cibersegurança corretivas
necessárias, adequadas e proporcionais, que sejam indispensáveis ao suprimento de falhas ou omissões no cumprimento das medidas
previstas no número anterior.
3 - As autoridades nacionais setoriais de cibersegurança podem emitir disposições regulamentares para adoção de medidas de
cibersegurança específicas do sector, sem prejuízo do disposto no n.º 3 do artigo 20.º
```

### `RJC-28` — RJC — Artigo 28.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1576–1592.

```
Artigo 28.º
Cadeia de abastecimento
As medidas de cibersegurança relativas à segurança da cadeia de abastecimento, incluindo aspetos de segurança respeitantes às
relações entre cada entidade e os respetivos fornecedores ou prestadores de serviços diretos, devem considerar, designadamente:
a) As vulnerabilidades específicas de cada fornecedor direto e cada prestador de serviços;
b) A qualidade global dos produtos na componente de cibersegurança;
c) As práticas de cibersegurança dos seus fornecedores e prestadores de serviços, incluindo os respetivos procedimentos de
desenvolvimento seguro;
d) As avaliações coordenadas dos riscos de segurança de cadeias de abastecimento de produtos de TIC, sistemas de TIC ou serviços de
TIC críticos que sejam realizadas nos termos do artigo 22.º da Diretiva (UE) 2022/2555, do Parlamento Europeu e do Conselho, de 14 de
dezembro de 2022;
e) As decisões relativas à aplicação de restrições à utilização, a cessação de utilização ou exclusão de equipamentos, componentes ou
serviços de tecnologias de informação e comunicação, ao abrigo do disposto no n.º 3 do artigo 18.º
```

### `RJC-29` — RJC — Artigo 29.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1593–1614.

```
Artigo 29.º
Gestão do risco residual
1 - As entidades essenciais e importantes devem realizar uma análise e gestão de riscos em relação a todos os ativos que garantam a
continuidade do funcionamento das redes e sistemas de informação que utilizam, incluindo aos ativos que garantam a prestação dos
serviços essenciais, com a periodicidade e os elementos técnicos e documentais a definir por regulamento da autoridade de
cibersegurança competente, para além do cumprimento das medidas de cibersegurança mínimas nos termos do n.º 5 do artigo 26.º
2 - Com base na análise e gestão de riscos referida no número anterior, as entidades essenciais e importantes devem adotar as medidas
de cibersegurança adequadas e proporcionais de forma a gerir os riscos que se colocam à segurança das redes e dos sistemas de
informação que utilizam, incluindo os riscos residuais, tendo em conta o QNRCS, os progressos técnicos mais recentes e, se aplicáveis,
as normas europeias e internacionais pertinentes.
3 - As entidades essenciais e importantes devem documentar a preparação, a execução e a apresentação dos resultados da análise dos
riscos.
```

### `RJC-30` — RJC — Artigo 30.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1615–1646.

```
Artigo 30.º
Relatório anual
1 - As entidades essenciais e importantes devem elaborar e manter um relatório anual que contenha os seguintes elementos em
relação ao ano civil a que se reportam:
a) Descrição sumária das principais atividades desenvolvidas em matéria de segurança das redes e dos serviços de informação;
b) Estatística trimestral de todos os incidentes, com indicação do número e do tipo dos incidentes;
c) Análise agregada dos incidentes com impacto significativo, com informação sobre:
i) Número de utilizadores afetados pela perturbação serviço;
ii) Duração dos incidentes;
iii) Distribuição geográfica, no que se refere à zona afetada pelos incidentes, incluindo a indicação de impacto transfronteiriço;
d) Recomendações de atividades, de medidas ou de práticas que promovam a melhoria da segurança das redes e dos sistemas de
informação;
e) Problemas identificados e medidas implementadas na sequência dos incidentes;
f) Qualquer outra informação que se considere relevante.
2 - As entidades essenciais remetem o relatório anual à autoridade de cibersegurança competente, devidamente assinado pelo
responsável de cibersegurança, nos seguintes termos:
a) O primeiro relatório anual é submetido:
i) Até ao último dia útil do mês de janeiro do ano civil seguinte ao primeiro ano civil de atividade, quando esta tenha tido início no
primeiro semestre;
ii) Até ao último dia útil do mês de janeiro do segundo ano civil seguinte ao primeiro ano civil de atividade, quando esta tenha tido
início no segundo semestre;
b) Os relatórios anuais subsequentes são submetidos até ao último dia útil do mês de janeiro do ano civil seguinte aos quais os
mesmos se reportam.
3 - Para efeitos do disposto na subalínea ii) da alínea a) do número anterior, o relatório anual deve abranger também o período entre a
data de início de atividade e o final do ano civil anterior ao que se reporta.
4 - As entidades importantes devem comunicar o relatório anual ao CNCS sempre que solicitado.
5 - O CNCS, ouvidas as autoridades nacionais setoriais de cibersegurança, pode adotar modelos para a apresentação do relatório
referido nos números anteriores.
```

### `RJC-31` — RJC — Artigo 31.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1647–1685.

```
Artigo 31.º
Responsável de cibersegurança
1 - As entidades essenciais e importantes designam um responsável de cibersegurança para a gestão da cibersegurança e da segurança
da informação, que seja titular dos órgãos de gestão, direção ou administração ou lhes responda organicamente e de forma direta.
2 - O responsável de cibersegurança tem, pelo menos, as seguintes funções:
a) Propor as medidas de gestão dos riscos de cibersegurança, incluindo ao nível da cadeia de abastecimento, que devem ser aprovadas
nos termos da alínea a) do n.º 1 do artigo 25.º;
b) Prestar informações relativas às medidas de gestão dos riscos de cibersegurança aos órgãos da entidade responsável pela sua
supervisão nos termos da alínea b) do n.º 1 do artigo 25.º;
c) Auxiliar os órgãos da entidade no cumprimento das medidas de supervisão e de execução nos termos da alínea c) do n.º 1 do artigo
25.º;
d) Contribuir para a promoção de uma cultura de cibersegurança na entidade, propondo, nomeadamente, as ações de formação em
cibersegurança previstas na alínea d) do n.º 1 do artigo 25.º;
e) Assegurar a gestão de riscos prevista no artigo 29.º;
f) Assegurar o cumprimento das obrigações referentes à elaboração do relatório anual nos termos do artigo 30.º;
g) Coordenar as ações do ponto de contacto permanente, previstas no artigo 32.º, quando esta função não seja assegurada por si.
3 - As entidades essenciais e importantes comunicam à autoridade de cibersegurança competente, no prazo de 20 dias úteis a contar
do início de funções, a pessoa designada para exercer as funções de responsável de cibersegurança, incluindo a informação referida em
regulamento a aprovar pelo CNCS.
4 - As entidades essenciais e importantes que tenham iniciado atividade antes da data de entrada em vigor do presente decreto-lei,
efetuam a comunicação prevista no número anterior no prazo de 20 dias úteis a contar desta data.
5 - As entidades essenciais e importantes comunicam, sem demora injustificada, às autoridades de cibersegurança competentes, a
substituição do responsável de cibersegurança.
6 - Relativamente às entidades essenciais e importantes que pertençam à administração direta, pode ser designado o mesmo
responsável de cibersegurança para vários ministérios, áreas governativas ou secretarias regionais.
7 - Relativamente às entidades essenciais e importantes inseridas no mesmo grupo empresarial, pode cada empresa estabelecer um
elemento que funcione como ponto de contacto para a cibersegurança sob coordenação de um responsável de segurança comum ao
grupo.
8 - O exercício das funções de responsável de cibersegurança é compatível com a acumulações de outras funções dentro da mesma
entidade, sem prejuízo do disposto no presente artigo.
```

### `RJC-32` — RJC — Artigo 32.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1686–1723.

```
Artigo 32.º
Ponto de contacto permanente
1 - As entidades essenciais e importantes asseguram a função do ponto de contacto permanente com uma disponibilidade contínua de
24 horas por dia e de sete dias por semana, limitada a períodos de ativação, iniciados e terminados mediante comunicação da
autoridade de cibersegurança competente.
2 - As entidades essenciais e importantes comunicam ao CNCS, pelo menos, um ponto de contacto permanente, que pode ser
assegurado por um elemento ou uma equipa, de modo a assegurar:
a) Os fluxos de informação de nível operacional e técnico com a autoridade de cibersegurança competente, nomeadamente:
i) A articulação intersectorial, incluindo a eficácia da resposta a incidentes de segurança com impacto a nível dos setores;
ii) A obtenção de informação operacional e técnica, na sequência de notificação de incidentes com impacto significativo submetida pela
mesma ou por outra entidade;
iii) A obtenção e atualização de informação de situação integrada no contexto de um incidente significativo;
b) A partilha de informação com a autoridade de cibersegurança competente, quando estejam ativados planos de emergência de
proteção civil diretamente relacionados ou com impacto ao nível da cibersegurança bem como de planos no âmbito do planeamento
civil de emergência da cibersegurança, dos planos de segurança das infraestruturas críticas nacionais ou europeias, ou dos planos de
resiliência das entidades críticas nacionais ou europeias;
c) A operacionalização dos procedimentos fixados no âmbito de um plano de emergência de proteção civil quando tenham impacto no
funcionamento das redes e sistemas de informação, ou do planeamento civil de emergência da cibersegurança;
d) A receção das orientações, recomendações, instruções técnicas e ordens emitidas pela autoridade de cibersegurança competente.
3 - As entidades essenciais e importantes devem indicar à autoridade de cibersegurança competente, no prazo de 20 dias úteis a contar
do início de funções, a pessoa ou pessoas que compõem a equipa que asseguram as funções de ponto de contacto permanente, bem
como os respetivos meios de contacto principal e alternativos contendo a informação referida em regulamento a aprovar pelo CNCS.
4 - As entidades essenciais e importantes que tenham iniciado atividade antes da data da entrada em vigor do presente decreto-lei
devem efetuar a comunicação prevista no número anterior no prazo de 20 dias úteis a contar desta data.
5 - As entidades essenciais e importantes devem comunicar imediatamente à autoridade de cibersegurança competente qualquer
alteração à informação prevista no n.º 3.
6 - As entidades essenciais e importantes devem assegurar que o ponto de contacto permanente dispõe de meios de contacto
principais e alternativos para a comunicação com a autoridade de cibersegurança competente.
```

### `RJC-33` — RJC — Artigo 33.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1724–1737.

```
Artigo 33.º
Medidas de cibersegurança aplicáveis às entidades públicas relevantes
1 - As entidades públicas relevantes devem cumprir com as medidas de cibersegurança estabelecidas pelo CNCS nos termos do
número seguinte.
2 - O CNCS estabelece, através de regulamento, as medidas de cibersegurança que devem ser cumpridas por parte das entidades
públicas relevantes, considerando os critérios previstos no disposto nos n.os 2 e 3 do artigo 26.º e em termos proporcionais e
adequados ao grupo a que pertencem, de acordo com o disposto no artigo 7.º
3 - As entidades públicas relevantes estão sujeitas às medidas de supervisão e de execução previstas nos artigos 55.º e 56.º,
respetivamente.
4 - É aplicável às entidades públicas relevantes o disposto no n.º 8 do artigo 26.º
```

### `RJC-35` — RJC — Artigo 35.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1763–1802.

```
Artigo 35.º
Dever de registo
1 - Para efeitos de registo, as entidades essenciais, importantes e públicas relevantes têm o dever de inscrever na plataforma eletrónica
referida no n.º 7 do artigo 8.º os elementos que permitam a sua identificação completa, designadamente:
a) Nome da entidade em causa;
b) Número de identificação fiscal;
c) Endereço e dados de contacto atualizados, incluindo os endereços de correio eletrónico, as gamas de endereços IP e os números de
telefone;
d) Se aplicável, o setor e subsetor pertinentes referidos nos anexos i ou ii ao presente decreto-lei; e
e) Se aplicável, uma lista dos Estados-Membros da União Europeia em que prestam serviços abrangidos pelo âmbito de aplicação do
presente decreto-lei.
2 - Além dos dados referidos no número anterior, o registo de nomes de domínio de topo, bem como as entidades que sejam
prestadores de serviços de DNS, prestadores serviços de registo de nomes de domínio, prestadores de serviços de computação em
nuvem, prestadores de serviços de centro de dados, fornecedores de redes de distribuição de conteúdos, prestadores de serviços
geridos, prestadores de serviços de segurança geridos, bem como dos prestadores de serviços de mercados em linha, de motores de
pesquisa em linha e de plataformas de serviços de redes sociais, têm o dever de inscrever na plataforma eletrónica referida no n.º 7 do
artigo 8.º os seguintes elementos:
a) O endereço do respetivo estabelecimento principal e dos outros estabelecimentos legais que possui na União Europeia ou, caso não
esteja estabelecida na União, do representante designado;
b) Contactos atualizados, incluindo endereços de correio eletrónico e números de telefone da entidade e, se aplicável, do seu
representante designado;
c) Os Estados-Membros onde presta serviços; e
d) As gamas de endereços IP.
3 - As entidades essenciais, importantes, públicas relevantes e os prestadores de serviços de registos de nomes de domínio notificam o
CNCS de qualquer alteração aos dados referidos nos números anteriores, no prazo de 30 dias úteis a contar da alteração.
4 - No caso do registo de nomes de TLD, bem como as entidades que sejam prestadores de serviços de DNS, prestadores serviços de
registo de nomes de domínio, prestadores de serviços de computação em nuvem, prestadores de serviços de centro de dados,
fornecedores de redes de distribuição de conteúdos, prestadores de serviços geridos, prestadores de serviços de segurança geridos,
bem como dos prestadores de serviços de mercados em linha, de motores de pesquisa em linha e de plataformas de serviços de redes
sociais, a alteração aos dados referidos nos n.os 1 e 2 é notificada no prazo de três meses a contar da alteração.
```

### `RJC-40` — RJC — Artigo 40.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 1893–1919.

```
Artigo 40.º
Notificação obrigatória
1 - As entidades essenciais, importantes e públicas relevantes notificam qualquer incidente significativo à autoridade de cibersegurança
competente.
2 - O cumprimento da mera notificação não gera responsabilidade acrescida para a entidade notificante.
3 - A fim de determinar se um incidente tem impacto significativo nos termos do n.º 1, as entidades em causa devem ter em
consideração, designadamente, os seguintes parâmetros:
a) Número de utilizadores afetados pela perturbação do serviço;
b) Número total de utilizadores do serviço perturbado;
c) A duração do incidente;
d) O nível da gravidade da perturbação do funcionamento do serviço;
e) A dimensão do impacto nas atividades económicas e sociais.
4 - As entidades devem ainda ter em consideração os parâmetros e limiares definidos, quando aplicável, por instrução técnica do CNCS
e pelos atos de execução da Comissão, previstos no n.º 11 do artigo 23.º da Diretiva (UE) 2022/2555, do Parlamento Europeu e do
Conselho, de 14 de dezembro de 2022.
5 - O cumprimento do disposto no presente decreto-lei não dispensa o respeito pelas obrigações específicas de notificação de
incidentes nos termos definidos pelas autoridades com competência para o efeito, nomeadamente o Ministério Público, a Polícia
Judiciária, a CNPD, a Entidade Fiscalizadora do Segredo de Estado e o GNS, de acordo com as disposições legais e regulamentares
aplicáveis.
6 - As notificações devem ser submetidas na plataforma eletrónica referida no n.º 7 do artigo 8.º
7 - Às entidades essenciais, importantes e públicas relevantes é assegurada a possibilidade de notificar um incidente, simultaneamente,
à autoridade de cibersegurança competente, às autoridades especiais de cibersegurança, bem como às entidades previstas no n.º 5,
através da plataforma prevista no n.º 7 do artigo 8.º, nos termos a definir por protocolo outorgado entre as referidas autoridades.
```

### `RJC-61` — RJC — Artigo 61.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 2402–2441.

```
Artigo 61.º
Contraordenações muito graves
1 - Constituem contraordenações muito graves ao abrigo do presente decreto-lei:
a) O incumprimento das decisões do membro do Governo responsável pela área da cibersegurança, previstas no n.º 3 do artigo 18.º;
b) O incumprimento do dever de adoção das medidas de cibersegurança nos termos dos artigos 27.º a 29.º;
c) O incumprimento dos deveres previstos no artigo 30.º;
d) O incumprimento dos deveres previstos no artigo 31.º;
e) O incumprimento dos deveres previstos no artigo 32.º;
f) O incumprimento do dever de adoção das medidas de cibersegurança estabelecidas pelo CNCS nos termos do artigo 33.º;
g) O incumprimento dos deveres previstos no artigo 34.º;
h) O incumprimento dos deveres previstos nos n.os 1 e 2 do artigo 36.º;
i) O incumprimento dos deveres previstos no artigo 37.º;
j) O incumprimento do dever de notificação nos termos dos artigos 40.º a 44.º;
k) O incumprimento do dever de comunicação nos termos do disposto no artigo 48.º
2 - As contraordenações referidas no número anterior são punidas com as seguintes coimas:
a) Quando se trate de uma entidade essencial:
i) De € 2 000,00 a € 10 000 000,00 ou a 2 % do volume de negócios anual a nível mundial, no exercício financeiro anterior, da entidade
essencial em causa, consoante o montante que for mais elevado, se praticadas por uma pessoa coletiva;
ii) De € 350,00 a € 200 000,00, se praticadas por uma pessoa singular;
b) Quando se trate de uma entidade importante:
i) De € 1 250,00 a € 7 000 000,00 ou num montante máximo não inferior a 1,4 % do volume de negócios anual a nível mundial, no
exercício financeiro anterior, da entidade importante em causa, consoante o montante que for mais elevado, se praticada por pessoa
coletiva;
ii) De € 350,00 a € 200 000,00, se praticadas por uma pessoa singular;
c) Quando se trate de uma entidade pública relevante integrada no Grupo A previsto no n.º 2 do artigo 7.º:
i) De € 16 000,00 a € 4 000 000,00, se praticadas por pessoa coletiva;
ii) De € 500,00 a € 16 000,00, se praticadas por pessoa singular;
d) Quando se trate de uma entidade pública relevante integrada no Grupo B previsto no n.º 3 do artigo 7.º:
i) De € 8 000,00 a € 350 000,00, se praticadas por pessoa coletiva;
ii) De € 500,00 a € 16 000,00, se praticadas por pessoa singular.
```

### `RJC-62` — RJC — Artigo 62.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 2442–2480.

```
Artigo 62.º
Contraordenações graves
1 - Constituem contraordenações graves ao abrigo do presente decreto-lei:
a) O incumprimento dos deveres previstos no artigo 8.º;
b) O incumprimento dos deveres previstos no artigo 35.º;
c) O incumprimento dos deveres previstos nos n.os 4 e 5 do artigo 36.º;
d) O incumprimento dos deveres previstos no artigo 46.º;
e) O incumprimento da obrigação prevista no n.º 2 do artigo 51.º;
f) O incumprimento da medida de execução imediata prevista no n.º 3 do artigo 52.º;
g) O incumprimento das advertências, ordens ou instruções vinculativas dadas pela autoridade de cibersegurança competente, ao
abrigo do disposto nas alíneas a) a g) do n.º 1 do artigo 56.º;
h) A violação da suspensão determinada ao abrigo do disposto na alínea a) do n.º 2 do artigo 56.º;
i) A violação da suspensão determinada ao abrigo do disposto na alínea b) do n.º 2 do artigo 56.º;
j) O incumprimento das ordens ou instruções previstas no artigo 57.º
2 - As contraordenações referidas no número anterior são punidas com as seguintes coimas:
a) Quando se trate de uma entidade essencial:
i) De € 1 250,00 a € 5 000 000,00 ou a 1 % do volume de negócios anual a nível mundial, no exercício financeiro anterior, da entidade
essencial em causa, consoante o montante que for mais elevado, se praticadas por uma pessoa coletiva;
ii) De € 250,00 a € 125 000,00, se praticadas por uma pessoa singular;
b) Quando se trate de uma entidade importante:
i) De € 875,00 a € 3 500 000,00 ou num montante máximo não inferior a 0,7 % do volume de negócios anual a nível mundial, no
exercício financeiro anterior, da entidade importante em causa, consoante o montante que for mais elevado, se praticada por pessoa
coletiva;
ii) De € 250,00 a € 125 000,00, se praticadas por uma pessoa singular;
c) Quando se trate de uma entidade pública relevante integrada no «Grupo A» previsto no n.º 2 do artigo 7.º:
i) De € 10 000,00 a € 2 500 000,00, se praticadas por pessoa coletiva;
ii) De € 375,00 a € 10 000,00, se praticadas por pessoa singular;
d) Quando se trate de uma entidade pública relevante integrada no «Grupo B» previsto no n.º 3 do artigo 7.º:
i) De € 5 000,00 a € 225 000,00, se praticadas por pessoa coletiva;
ii) De € 375,00 a € 10 000,00, se praticadas por pessoa singular.
```

### `RJC-65` — RJC — Artigo 65.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 2505–2514.

```
Artigo 65.º
Dispensa de aplicação das coimas
Todas as entidades essenciais, importantes e públicas relevantes podem, mediante pedido devidamente fundamentado, solicitar à
autoridade de cibersegurança competente a dispensa da aplicação de coimas referidas no n.º 2 do artigo 61.º e no n.º 2 do artigo 62.º,
com fundamento na inexistência de um procedimento interno de adaptação dessas entidades ao novo regime jurídico, durante 12
meses a contar da entrada em vigor do presente decreto-lei.
```

### `RJC-66` — RJC — Artigo 66.º

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 2515–2549.

```
Artigo 66.º
Determinação da medida da coima
1 - A determinação da coima concreta faz-se em função da gravidade da ilicitude concreta do facto, da culpa do agente, da sua
situação económica e do benefício económico que este retirou da prática da contraordenação.
2 - Na determinação da ilicitude concreta do facto e da culpa do agente atende-se às seguintes circunstâncias:
a) A gravidade da infração;
b) A duração da infração;
c) O caráter ocasional ou reiterado da infração;
d) Os danos causados, incluindo quaisquer prejuízos financeiros ou económicos, os efeitos noutros serviços e o número de utilizadores
afetados;
e) As medidas tomadas pela entidade para prevenir ou atenuar os danos referidos na alínea anterior;
f) O nível de cooperação das pessoas singulares ou coletivas responsáveis com a autoridade de cibersegurança competente.
3 - Para efeitos da alínea a) do número anterior, presumem-se graves:
a) As violações repetidas do presente decreto-lei;
b) A ausência de notificação de incidentes nos termos dos artigos 40.º e seguintes;
c) A ausência de correção de incidentes significativos;
d) A ausência de correção de deficiências na sequência de instruções vinculativas das autoridades competentes;
e) A obstrução de auditorias ou atividades de acompanhamento ordenadas pela autoridade de cibersegurança competente, na
sequência da verificação de uma infração ao presente decreto-lei;
f) A prestação de informações falsas ou grosseiramente inexatas em relação às medidas de cibersegurança e deveres relativos às
medidas de cibersegurança, nos termos do disposto nos artigos 27.º e seguintes, ou das obrigações de notificação, nos termos do
disposto nos artigos 40.º e seguintes.
4 - O disposto na alínea f) do número anterior não prejudica a responsabilidade nos termos do Código Penal.
5 - Exceto em caso de dolo, a instauração de processo de contraordenação depende de prévia advertência do agente, por parte da
autoridade de cibersegurança competente, para cumprimento da obrigação omitida ou reintegração da proibição violada em prazo
razoável.
```

### `ANEXO-I` — Cabeçalho do Anexo I

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 2891–2895.

```
Anexo I
Setores de importância crítica
[a que se referem os n.os 1 e 2 e a alínea b) do n.º 2 do artigo 3.º, as alíneas a) e f) do n.º 1 e os n.os 2 e 3 do artigo 6.º, a alínea a) do n.º
2 do artigo 12.º e a alínea d) do n.º 1 do artigo 35.º]
```

### `ANEXO-II` — Cabeçalho do Anexo II

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 3131–3135.

```
Anexo II
Outros setores críticos
[a que se referem os n.os 1 e 2 e a alínea b) do n.º 2 do artigo 3.º, a alínea f) do n.º 1 e os n.os 2 e 3 do artigo 6.º, a alínea a) do n.º 2 do
artigo 12.º e a alínea d) do n.º 1 do artigo 35.º]
```

### `ANEXO-III` — Anexo III (integral)

> Fonte: PDF do DR, pág. correspondente; extraído com `pdftotext -layout`, linhas 3216–3246.

```
Anexo III
[a que se referem a alínea a) do n.º 1 do artigo 3.º, as alíneas a) e c) do n.º 1 do artigo 6.º, a alínea f) do n.º 2 do artigo 7.º e a
alínea i) do n.º 2 do artigo 12.º]
Artigo 1.º
Empresa
Entende-se por empresa qualquer entidade que, independentemente da sua forma jurídica, exerce uma atividade económica. São,
nomeadamente, consideradas como tal as entidades que exercem uma atividade artesanal ou outras atividades a título individual ou
familiar, as sociedades de pessoas ou as associações que exercem regularmente uma atividade económica.
Artigo 2.º
Categorias
1 - A categoria das micro, pequenas e médias empresas (PME) é constituída por empresas que empregam menos de 250 pessoas e cujo
volume de negócios anual não excede 50 milhões de euros ou cujo balanço total anual não excede 43 milhões de euros.
2 - Na categoria das PME, uma pequena empresa é definida como uma empresa que emprega menos de 50 pessoas e cujo volume de
negócios anual ou balanço total anual não excede 10 milhões de euros.
3 - Na categoria das PME, uma microempresa é definida como uma empresa que emprega menos de 10 pessoas e cujo volume de
negócios anual ou balanço total anual não excede 2 milhões de euros.
```
