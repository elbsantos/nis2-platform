/**
 * server/services/course-content.ts
 *
 * Markdown body content for each NIS2 course lesson.
 * Keyed by lesson slug (e.g. "lesson-1-1").
 * Authored in European Portuguese, aligned to DL 125/2025 and CNCS guidance.
 */

export const lessonContent: Record<string, string> = {

// ---------------------------------------------------------------------------
// Module 1 — Fundamentos NIS2 e Obrigações Legais
// ---------------------------------------------------------------------------

"lesson-1-1": `## Da NIS1 à NIS2: Uma Necessidade Urgente

A União Europeia publicou a primeira Diretiva NIS *(Network and Information Security)* em 2016. Era um passo positivo, mas com limitações sérias: abrangia apenas setores considerados «essenciais» como energia, transportes e banca, as sanções eram pouco expressivas, e cada Estado-Membro transpunha e aplicava as regras de forma muito diferente.

O resultado foi previsível: em 2017, os ataques **WannaCry** e **NotPetya** propagaram-se por toda a Europa, causando prejuízos de milhares de milhões de euros a empresas em países com legislação NIS1 em vigor. A lei existia — mas não era suficiente.

## A NIS2 e o DL 125/2025

Em dezembro de 2022, a UE publicou a **Diretiva (UE) 2022/2555**, conhecida como NIS2. Portugal transpôs-a para o direito nacional através do **Decreto-Lei 125/2025**, publicado no início de 2025.

As principais mudanças face à NIS1:

| Aspeto | NIS1 (2016) | NIS2 (2022) |
|--------|-------------|-------------|
| Setores cobertos | 7 setores | 18 setores |
| PMEs incluídas | Raramente | Sim, se ≥ 50 FTE |
| Sanção máxima | Variável por país | €10M ou 2% faturação |
| Responsabilidade gestores | Não | Sim, incluindo suspensão |
| Cadeia de fornecimento | Opcional | Obrigatório |
| Prazo de notificação | 72h | 24h (aviso) + 72h (detalhe) |

## O CNCS: A Autoridade Competente em Portugal

O **Centro Nacional de Cibersegurança (CNCS)** é a autoridade responsável pela aplicação da NIS2 em Portugal. As suas funções incluem:

1. **Registo** — todas as entidades abrangidas devem registar-se em cncs.gov.pt
2. **Supervisão** — auditorias e inspeções às entidades abrangidas
3. **Receção de notificações** — incidentes significativos devem ser reportados ao CNCS
4. **Sanções** — instauração de processos de contraordenação em caso de incumprimento

> **Ação imediata:** Se a empresa estiver abrangida, o registo no CNCS é obrigatório e gratuito. Deve ser concluído nos 3 meses seguintes à determinação da classificação.

## Porque a NIS2 Abrange Agora as PMEs

A NIS1 focava-se em «operadores de serviços essenciais» — grandes organizações de setores críticos. A NIS2 reconheceu três realidades novas:

1. **As PMEs são parte da cadeia de fornecimento das grandes entidades** — comprometer uma PME fornecedora pode ser a forma mais económica de atacar uma grande empresa
2. **As PMEs têm dados valiosos** — dados de clientes, dados financeiros, propriedade intelectual
3. **A maioria dos ataques começa por uma PME** — com menos proteções e mais vetores de entrada do que as grandes organizações

O critério de inclusão combina dois eixos: **dimensão** (≥ 50 trabalhadores ou > €10M de faturação) e **setor** (um dos 18 listados nos Anexos I e II). Ambos têm de ser verificados.

## Os Três Erros Mais Comuns das PMEs

**Erro 1: «Somos pequenos, não somos alvo»**
Os cibercriminosos atuam por oportunidade, não por tamanho. Em 2024, mais de 40% dos ataques de ransomware tiveram PMEs como alvo principal — precisamente porque têm dados valiosos e menos defesas.

**Erro 2: «O nosso parceiro de IT trata disso»**
A responsabilidade legal é da empresa e dos seus gestores, não do fornecedor externo. O MSP pode implementar as medidas técnicas, mas a obrigação de conformidade é do órgão de administração.

**Erro 3: «Já temos antivírus e firewall»**
Estas ferramentas são necessárias mas insuficientes. A NIS2 exige uma abordagem sistemática e documentada: políticas escritas, processos testados, gestão de riscos formal e formação regular.

## Resumo da Aula

- A NIS2 (Diretiva UE 2022/2555) foi transposta em Portugal pelo **DL 125/2025**
- Abrange **18 setores** e inclui PMEs com ≥ 50 trabalhadores
- O **CNCS** é a autoridade competente — o registo é obrigatório
- Sanções até **€10M** com **responsabilidade pessoal** dos gestores
- Cumprir a NIS2 é, na prática, implementar boas práticas de segurança que qualquer empresa deveria ter`,

// ---------------------------------------------------------------------------

"lesson-1-2": `## Os Dois Eixos de Classificação

A NIS2 classifica as entidades segundo **dois eixos independentes**:

1. **Setor de atividade** — em qual dos 18 setores dos Anexos I ou II opera a empresa
2. **Dimensão** — número de trabalhadores e volume de negócios/balanço anual

Apenas as empresas que satisfazem **ambos** os critérios estão abrangidas.

## Os Anexos I e II: Setores Cobertos

**Anexo I — Setores de Alta Criticidade**
Energia (eletricidade, gás, petróleo, hidrogénio), Transportes (aéreo, ferroviário, marítimo, rodoviário), Banca, Infraestruturas dos mercados financeiros, Saúde, Água potável e águas residuais, Infraestruturas digitais (DNS, TLD, datacenters, CDN, cloud), Gestão de serviços de TIC B2B, Espaço.

**Anexo II — Outros Setores Críticos**
Serviços postais e de correio, Gestão de resíduos, Químicos, Alimentar, Fabricação (dispositivos médicos, eletrónica, maquinaria, veículos motorizados), Fornecedores digitais (mercados online, motores de busca, redes sociais), Investigação.

> **Nota prática:** Se a empresa presta serviços digitais (SaaS, cloud, marketplace) a outras empresas em Portugal ou na UE, está quase certamente abrangida pelo Anexo II.

## Cálculo da Dimensão: O Critério UTA

A dimensão é medida em **UTA** (Unidades de Trabalho Anual — equivalente a tempo inteiro):

| Categoria | Trabalhadores | Faturação | Balanço |
|-----------|--------------|-----------|---------|
| Micro | < 10 | ≤ €2M | ≤ €2M |
| Pequena | < 50 | ≤ €10M | ≤ €10M |
| Média | < 250 | ≤ €50M | ≤ €43M |
| Grande | ≥ 250 | > €50M | > €43M |

Para estar **abrangida pela NIS2**, a empresa deve ser, no mínimo, **empresa média** (≥ 50 UTA **ou** > €10M de faturação).

**Como contar trabalhadores (UTA):**
- Trabalhadores a tempo inteiro = 1 UTA
- Trabalhadores a meio tempo = 0,5 UTA
- Trabalhadores sazonais = UTA proporcional ao período trabalhado
- Trabalhadores de empresas associadas ou parceiras podem ser incluídos se existir controlo ou participação qualificada

## Entidades Essenciais vs. Entidades Importantes

A NIS2 distingue dois níveis de obrigação:

**Entidades Essenciais (EE)**
- Grandes empresas (≥ 250 trabalhadores ou > €50M faturação) nos setores do Anexo I
- Microempresas e pequenas empresas que são os únicos prestadores de um serviço essencial num Estado-Membro
- Supervisão **proativa** — o CNCS audita sem necessidade de incidente prévio
- Coimas até **€10 000 000 ou 2%** do volume de negócios global

**Entidades Importantes (EI)**
- Empresas médias nos setores do Anexo I
- Qualquer empresa (média ou grande) nos setores do Anexo II
- Supervisão **reativa** — o CNCS intervém após notificação, queixa ou incidente
- Coimas até **€7 000 000 ou 1,4%** do volume de negócios global

As **obrigações técnicas são idênticas** para EE e EI — a diferença está no regime de supervisão e no nível de coimas.

## O Fluxograma de 5 Passos

**Passo 1:** A empresa opera num setor do Anexo I ou II?
→ Não → Não está abrangida pela NIS2 (boas práticas continuam a ser recomendadas)

**Passo 2:** A empresa tem ≥ 50 UTA **ou** > €10M de faturação?
→ Não → Não está abrangida (exceto exceções do Art. 2.º(2) do DL 125/2025)

**Passo 3:** A empresa tem ≥ 250 UTA **ou** > €50M de faturação **e** está no Anexo I?
→ Sim → **Entidade Essencial**

**Passo 4:** A empresa tem 50-249 UTA **ou** €10M-€50M de faturação?
→ Se Anexo I → **Entidade Importante**
→ Se Anexo II → **Entidade Importante**

**Passo 5:** Registar no CNCS (cncs.gov.pt), indicando a classificação EE ou EI.

## Resumo da Aula

- A classificação depende de **setor** (Anexo I ou II) **e** **dimensão** (≥ 50 UTA)
- As obrigações técnicas são as mesmas para EE e EI — a diferença é no regime de supervisão
- O registo no CNCS é **obrigatório** independentemente da classificação
- Em caso de dúvida sobre a classificação, o CNCS disponibiliza orientação direta`,

// ---------------------------------------------------------------------------

"lesson-1-3": `## O Órgão de Gestão é Diretamente Responsável

Uma das mudanças mais significativas da NIS2 face à NIS1 é a **responsabilidade direta dos órgãos de gestão**. O Art. 20.º da Diretiva (transposto para o DL 125/2025) é explícito:

> *«Os órgãos de gestão das entidades essenciais e importantes são responsáveis por aprovar as medidas de gestão do risco de cibersegurança tomadas por essas entidades e supervisionam a sua implementação.»*

Isto significa que o **Conselho de Administração ou a gerência** — não apenas o responsável de IT — é legalmente responsável pela conformidade NIS2.

## Obrigações Concretas dos Gestores

O Art. 20.º lista obrigações que recaem pessoalmente sobre os membros do órgão de gestão:

1. **Aprovar formalmente** as políticas e medidas de cibersegurança (com registo em ata)
2. **Supervisionar** a implementação das medidas aprovadas de forma contínua
3. **Receber formação** em cibersegurança adaptada às suas funções
4. **Conhecer os riscos** de cibersegurança relevantes para a organização

> **Implicação prática:** Um gestor que aprove um orçamento de IT sem incluir cibersegurança adequada pode ser pessoalmente responsabilizado em caso de incidente com danos a terceiros.

## Formação Obrigatória para Gestores

A NIS2 é inequívoca: os membros do órgão de gestão **devem receber formação** em cibersegurança. Esta formação deve cobrir:

- Compreensão dos riscos de cibersegurança relevantes para o setor
- Noções de gestão de risco (não é necessário saber configurar sistemas — só entender os riscos)
- Os requisitos legais da NIS2 e as consequências do incumprimento
- Como supervisionar eficazmente um CISO ou responsável de IT

**Frequência:** não existe um prazo fixo na lei, mas a prática recomendada é formação anual ou sempre que existam mudanças regulatórias significativas.

## A Figura do CISO

Para entidades abrangidas, a NIS2 recomenda — e em muitos casos torna obrigatória na prática — a nomeação de um **CISO** (Chief Information Security Officer).

**Opções de implementação:**

| Modelo | Custo estimado | Adequado para |
|--------|---------------|---------------|
| CISO interno a tempo inteiro | €60k–€90k/ano | Grandes EE com equipa IT |
| CISO interno parcial (acumula com IT Manager) | €0 extra | PME com equipa IT existente |
| vCISO externo (por horas) | €1.500–€5.000/mês | PME sem CISO dedicado |
| MSP com função CISO incluída | Variável | PME muito pequena |

**Responsabilidades do CISO:**
- Desenvolver e manter a Política de Segurança da Informação (PSI)
- Coordenar a resposta a incidentes
- Reportar ao órgão de gestão trimestralmente
- Assegurar a conformidade contínua com a NIS2

## O Regime de Coimas

O DL 125/2025 estabelece um regime sancionatório em escala:

**Entidades Essenciais:**
- Infração muito grave: até **€10 000 000 ou 2%** do volume de negócios global anual
- Infração grave: até **€5 000 000 ou 1%** do volume de negócios global anual

**Entidades Importantes:**
- Infração muito grave: até **€7 000 000 ou 1,4%** do volume de negócios global anual
- Infração grave: até **€3 500 000 ou 0,7%** do volume de negócios global anual

**Exemplos de infrações muito graves:**
- Não notificar um incidente significativo no prazo de 24h
- Não implementar medidas de gestão de risco adequadas após advertência
- Impedir ou obstruir uma auditoria do CNCS

**Suspensão de gestores:** em casos graves e reincidentes, o CNCS pode solicitar ao tribunal a suspensão temporária do exercício de funções do responsável pela conformidade ou de membros do órgão de gestão.

## Responsabilidade Civil e Reputacional

Para além das coimas administrativas, um incidente pode originar:

- **Responsabilidade civil** pelos danos causados a clientes e terceiros — proporcional ao volume de dados afetados
- **Comunicação pública obrigatória** em casos de violações graves que possam afetar terceiros
- **Perda de contratos** com clientes que exijam conformidade NIS2 dos seus fornecedores (tendência crescente em procurement)

## Resumo da Aula

- Os **órgãos de gestão** são diretamente responsáveis — não apenas o departamento de IT
- A **formação** dos gestores em cibersegurança é **obrigatória** por lei
- O **CISO** (interno ou vCISO externo) gere a implementação operacional
- Coimas até **€10M** com possível **suspensão de gestores** em casos graves
- A conformidade NIS2 é uma decisão de gestão de risco empresarial`,

// ---------------------------------------------------------------------------

"lesson-1-4": `## O Caso SolarWinds: A Lição Mais Cara da Cibersegurança

Em dezembro de 2020, foi descoberto um dos ataques mais sofisticados da história da cibersegurança. O grupo APT29 (associado aos serviços de inteligência russos) comprometeu a empresa **SolarWinds**, fornecedora de software de gestão de IT utilizado por 18 000 organizações em todo o mundo — incluindo agências governamentais dos EUA e múltiplas empresas europeias.

**O método:** os atacantes inseriram código malicioso numa atualização legítima do software Orion. As 18 000 organizações instalaram a atualização através dos seus processos normais de gestão de patches — e ficaram comprometidas sem qualquer indicador visível durante meses.

**A lição central:** não foi necessário atacar cada organização individualmente. A entrada foi por um **fornecedor de IT de confiança**, explorando a relação de confiança que as organizações têm com os seus fornecedores de software.

## Os 6 Tipos de Fornecedores Digitais de Qualquer PME

Uma PME portuguesa típica tem, em média, entre 15 e 30 fornecedores com acesso digital ou que processam os seus dados. Estes fornecedores dividem-se em 6 categorias:

**1. MSP / Parceiro de IT**
Gestão de infraestrutura, helpdesk, backups, manutenção de sistemas. Frequentemente tem acesso administrativo total.

**2. Fornecedores de Software SaaS**
Microsoft 365, Google Workspace, Salesforce, software de contabilidade, ERP. Alojam os dados da empresa na cloud.

**3. Fornecedores de Infraestrutura (IaaS/PaaS)**
AWS, Azure, Google Cloud. A base técnica dos sistemas da empresa.

**4. Fornecedores de Telecomunicações**
ISP, operadores móveis, fornecedores de VPN e SD-WAN. Controlam o canal de comunicação.

**5. Consultores e Prestadores Externos**
Consultores de gestão, auditores, advogados, contabilistas externos com acesso a sistemas ou dados. Frequentemente esquecidos na análise de risco.

**6. Fornecedores Críticos de Negócio**
Parceiros cuja falha ou comprometimento poderia paralisar as operações (ex.: fornecedor de ERP, processador de pagamentos, plataforma de e-commerce).

## A Lógica do Ataque One-to-Many

Os atacantes sofisticados preferem o modelo «one-to-many»:

1. **Identificar** um fornecedor com acesso a múltiplos clientes
2. **Comprometer** esse fornecedor (é apenas um alvo, com potencial impacto em dezenas ou centenas)
3. **Pivotar** para os clientes através do acesso legítimo do fornecedor
4. **Exfiltrar** dados ou instalar ransomware em múltiplas organizações simultaneamente

Este modelo é particularmente eficiente contra PMEs que utilizam os mesmos MSPs regionais. Se o MSP tiver 200 clientes e for comprometido, todos os 200 estão em risco — independentemente das proteções individuais de cada cliente.

## O Que a NIS2 Exige (Art. 21.º(2)(d))

**1. Inventário de fornecedores digitais**
Lista de todos os fornecedores com acesso a sistemas, dados ou infraestrutura. Deve incluir: nome, tipo de acesso, dados processados, criticidade para o negócio.

**2. Avaliação de riscos dos fornecedores críticos**
Para cada fornecedor de criticidade Alta, avaliar:
- Tem políticas de segurança documentadas?
- Tem certificações relevantes (ISO 27001, SOC 2, Cyber Essentials)?
- Como notifica incidentes que possam afetar os seus clientes?
- Tem controlo sobre os seus próprios sub-fornecedores?

**3. Cláusulas contratuais mínimas**
Os contratos com fornecedores críticos devem incluir:
- Obrigação de notificação de incidentes em 24-72h
- Requisitos mínimos de segurança (MFA, encriptação, gestão de patches)
- Direito de auditoria ou acesso a relatórios de auditoria independente
- Responsabilidade em caso de incidente originado pelo fornecedor

**4. Monitorização e revisão periódica**
Revisão anual da conformidade dos fornecedores críticos — não apenas no momento de assinatura do contrato.

## O Processo de Avaliação em 4 Passos

**Passo 1 — Inventariar (1-2 dias)**
Listar todos os fornecedores usando as 6 categorias. Incluir o tipo de acesso e os dados que processam.

**Passo 2 — Classificar por criticidade (1 dia)**
Para cada fornecedor, avaliar: impacto se comprometido (Alto/Médio/Baixo), profundidade de acesso (Total/Parcial/Nenhum), custo de substituição.

**Passo 3 — Avaliar os críticos (1-2 semanas)**
Criticidade Alta: questionário de segurança detalhado ou revisão de certificações.
Criticidade Média: verificação básica de políticas e referências.
Criticidade Baixa: inclusão de cláusulas padrão no próximo contrato.

**Passo 4 — Atualizar contratos (em curso)**
Adendas contratuais para fornecedores críticos sem cláusulas de segurança. Prioritizar pela criticidade.

## Resumo da Aula

- O caso SolarWinds demonstrou que **os fornecedores são o vetor de ataque preferido** dos adversários sofisticados
- Qualquer PME tem entre 15-30 fornecedores digitais organizados em **6 categorias**
- O modelo «one-to-many» torna os MSPs e fornecedores de software alvos de alto valor
- A NIS2 exige **inventário, avaliação de risco, cláusulas contratuais e revisão periódica**
- A responsabilidade pelo risco dos fornecedores é sempre da organização contratante`,

// ---------------------------------------------------------------------------
// Module 2 — Implementação, Incidentes e Auditorias
// ---------------------------------------------------------------------------

"lesson-2-1": `## Porque 10 Medidas e Não Apenas 1

A cibersegurança eficaz funciona em camadas — nenhuma medida individual protege contra todos os ataques. O **Art. 21.º(2)** da NIS2 organiza as obrigações em 10 áreas. Apresentamos aqui ordenadas pelo seu **retorno sobre o investimento de segurança** — quanto risco eliminam pelo menor esforço de implementação.

## Medida 1: MFA — Autenticação Multi-Fator

**O que é:** uma segunda verificação de identidade além da password (código de aplicação, SMS, chave física).

**Por que é a prioridade máxima:** o MFA bloqueia **99,9%** dos ataques baseados em passwords comprometidas — phishing, brute force, credential stuffing. É a medida com maior impacto pelo menor custo.

**Onde implementar (por ordem de prioridade):**
1. Email corporativo (Microsoft 365 / Google Workspace) — implementação em 30 minutos
2. Acesso remoto e VPN
3. Contas de administrador de sistemas
4. Aplicações críticas de negócio (ERP, CRM, contabilidade)
5. Consolas cloud (AWS, Azure)

## Medida 2: Gestão de Patches

**O problema:** 60% dos ataques exploram vulnerabilidades com patch disponível há mais de 3 meses. A solução já existe — não foi aplicada.

**Processo mínimo:**
- Inventário de todos os sistemas com versões de software
- Verificação semanal de patches críticos (CVSS ≥ 9)
- Aplicação de patches críticos em ≤ 7 dias
- Patches de severidade alta em ≤ 30 dias
- Registo documentado de patches aplicados (evidência para auditoria)

## Medida 3: Backups — Regra 3-2-1

**A regra:**
- **3** cópias dos dados
- em **2** tipos de suporte diferentes (ex.: disco local + cloud)
- com **1** cópia fora do local (off-site ou cloud imutável)

**Requisitos adicionais:**
- Frequência mínima: diária para dados críticos
- Teste de restauro: pelo menos trimestral — um backup não testado não é uma garantia
- Proteção contra ransomware: manter pelo menos uma cópia **offline** ou com proteção WORM (imutável)

## Medida 4: Segmentação de Rede

**O que é:** dividir a rede em zonas isoladas para limitar a propagação de um ataque.

**Implementação mínima para PMEs (via VLANs):**
- Rede de produção (servidores e dados críticos)
- Rede de utilizadores (computadores de trabalho)
- Rede de convidados/IoT (visitantes, impressoras, câmaras)
- Rede de gestão (acesso a switches e routers)

Sem segmentação, um utilizador comprometido tem acesso a toda a rede.

## Medida 5: Proteção de Endpoints

**Evolução necessária:** de antivírus tradicional para **EDR** (Endpoint Detection and Response).

Os antivírus tradicionais detetam malware por assinatura — falham contra ameaças novas. O EDR analisa comportamentos e permite resposta centralizada.

**Opções para PMEs:**
- Microsoft Defender for Business (incluído no M365 Business Premium)
- CrowdStrike Falcon Go
- SentinelOne Singularity Commercial

## Medida 6: Controlo de Acesso — Princípio do Mínimo Privilégio

**O princípio:** cada utilizador tem apenas os acessos estritamente necessários para a sua função.

**Implementação:**
- Revisão trimestral de quem tem acesso a quê
- Desativação imediata de acessos no dia de saída do colaborador
- Contas de administrador separadas das contas de uso diário
- Registo (log) de todos os acessos a sistemas críticos

## Medida 7: Encriptação

**Dados em repouso:**
- Encriptação de disco em todos os portáteis (BitLocker no Windows, FileVault no macOS)
- Encriptação de bases de dados com dados pessoais ou financeiros

**Dados em trânsito:**
- HTTPS com TLS válido em todos os sites e aplicações web
- VPN para todo o acesso remoto
- SMTPS/IMAPS para email corporativo

## Medida 8: Plano de Resposta a Incidentes (IRP)

**Conteúdo mínimo:**
1. Critérios para classificar um evento como «incidente significativo»
2. Cadeia de escalada interna (quem contactar, em que ordem)
3. Passos de contenção imediata por tipo de incidente
4. Prazos legais NIS2 (24h aviso ao CNCS, 72h notificação detalhada)
5. Contactos do CNCS (reportar.cncs.gov.pt) e CERT.PT (cert@cert.pt)

**Teste obrigatório:** simular um incidente pelo menos uma vez por ano (*tabletop exercise*).

## Medida 9: Segurança na Cadeia de Fornecimento

*(Ver Aula 1.4 para detalhe completo)*

Pontos críticos:
- Inventariar todos os fornecedores com acesso remoto
- Exigir MFA para qualquer acesso remoto de fornecedores
- Revogar acessos imediatamente quando o contrato terminar
- Incluir cláusulas de notificação de incidentes nos contratos

## Medida 10: Formação e Consciencialização

**Frequência mínima:** formação anual para todos os colaboradores.

**Conteúdo essencial:**
- Identificar e reportar tentativas de phishing
- Criação e gestão de passwords seguras (com gestor de passwords)
- Procedimento interno de reporte de incidentes
- Uso seguro de dispositivos pessoais (BYOD) e redes públicas

**Indicador de eficácia:** taxa de clique em simulações de phishing < 5% após formação.

## Resumo das 10 Medidas por ROI

| # | Medida | Esforço | Impacto |
|---|--------|---------|---------|
| 1 | MFA | Baixo | Muito alto |
| 2 | Patches | Médio | Alto |
| 3 | Backups 3-2-1 | Médio | Muito alto |
| 4 | Segmentação | Médio | Alto |
| 5 | EDR | Baixo | Alto |
| 6 | Mínimo privilégio | Baixo | Alto |
| 7 | Encriptação | Baixo | Médio |
| 8 | IRP | Médio | Alto |
| 9 | Fornecedores | Médio | Alto |
| 10 | Formação | Baixo | Alto |`,

// ---------------------------------------------------------------------------

"lesson-2-2": `## O Que é um Incidente «Significativo»?

Nem todos os eventos de segurança requerem notificação ao CNCS. A NIS2 (Art. 23.º) define um **incidente significativo** como aquele que:

- Causou ou pode causar **perturbação grave** na prestação do serviço, ou
- Causou ou pode causar **perdas financeiras significativas** para a entidade, ou
- Afetou ou pode afetar **outras pessoas ou organizações** causando danos materiais ou imateriais consideráveis

**Exemplos que são incidentes significativos:**
- Ransomware que encriptou sistemas de produção ou dados de clientes
- Violação de dados com exposição de informação pessoal
- Comprometimento de contas de email com acesso a dados financeiros ou pessoais
- Indisponibilidade de sistemas críticos por mais de 4 horas devido a ciberataque

**Exemplos que geralmente NÃO são significativos:**
- Phishing bloqueado pelo filtro de email antes de atingir o utilizador
- Tentativa de acesso bloqueada pelo firewall sem intrusão confirmada
- Falha de hardware sem comprometimento de dados ou serviços

> **Regra prática:** Em caso de dúvida, notificar. O CNCS prefere receber notificações desnecessárias a não ser informado de um incidente real.

## Os Três Prazos Legais

O Art. 23.º da NIS2 (Art. X.º do DL 125/2025) estabelece prazos obrigatórios a contar do momento em que a entidade **toma conhecimento** do incidente:

**24 horas — Aviso Inicial**

Conteúdo mínimo:
- Natureza do incidente (ransomware, violação de dados, DDoS, etc.)
- Sistemas afetados
- Impacto estimado para o serviço
- Se há suspeita de origem criminosa intencional

Como notificar: portal reportar.cncs.gov.pt ou email cert@cert.pt

**72 horas — Notificação Detalhada**

Conteúdo adicional face ao aviso inicial:
- Análise inicial da causa raiz (como o atacante entrou)
- Medidas de contenção adotadas até ao momento
- Impacto real: sistemas afetados, dados comprometidos, número de utilizadores

**1 mês — Relatório Final**

Conteúdo completo:
- Análise completa da causa raiz (com evidências técnicas)
- Cronologia detalhada do incidente (do primeiro indicador à resolução)
- Medidas corretivas implementadas
- Medidas preventivas para evitar recorrência
- Indicadores de comprometimento (IOC) para partilha com o sector

## O Guia de Sobrevivência para as Primeiras 24 Horas

**Hora 0 — Deteção**
- Documentar imediatamente: hora de deteção, quem detetou, o que observou
- Ativar o Plano de Resposta a Incidentes (IRP)
- Notificar o CISO e o órgão de gestão

**Horas 0-2 — Avaliação Inicial**
- Determinar o âmbito: quais sistemas estão afetados?
- Confirmar se é um incidente «significativo» (critérios acima)
- **Isolar da rede** os sistemas afetados — sem desligar (ver nota abaixo)

**Horas 2-6 — Contenção**
- Alterar passwords de contas comprometidas ou suspeitas
- Bloquear acessos externos suspeitos
- Ativar backups alternativos se os sistemas primários estiverem comprometidos
- Contactar MSSP ou fornecedor de IT se necessário

**Horas 6-24 — Notificação**
- Submeter o aviso inicial ao CNCS (prazo: 24h)
- Avaliar se há obrigação de notificação à CNPD (violação de dados pessoais — 72h)
- Comunicar internamente à gestão com registo escrito

## Erros Fatais a Evitar

**Erro 1: Desligar imediatamente os sistemas comprometidos**
Desligar elimina evidências em memória RAM (malware em execução, chaves de encriptação, logs recentes) essenciais para a investigação. A abordagem correta é **isolar da rede** — desligar o cabo Ethernet ou desativar a interface de rede — mas manter o sistema ligado.

**Erro 2: Comunicar publicamente antes de notificar as autoridades**
A notificação ao CNCS tem prioridade sobre comunicados de imprensa ou comunicações a clientes. Comunicar prematuramente pode comprometer a investigação e criar obrigações legais adicionais.

**Erro 3: Tentar resolver em silêncio**
A NIS2 pune a ocultação de incidentes com coimas mais elevadas que a maioria das infrações técnicas. Não notificar um incidente significativo é sempre a pior decisão.

**Erro 4: Não preservar logs e evidências**
Os logs são a base de qualquer investigação forense. Devem ser exportados e guardados antes de qualquer intervenção de remediação nos sistemas afetados.

## A Análise Post-Mortem: Estrutura do Relatório Final

O relatório de 1 mês deve conter:

1. **Sumário executivo** (1 página para gestão)
2. **Cronologia** — do primeiro indicador de comprometimento (IOC) à resolução completa
3. **Causa raiz** — como o atacante entrou, que vulnerabilidade explorou
4. **Impacto real** — sistemas afetados, dados comprometidos, tempo de inatividade, custo estimado
5. **Medidas de contenção** — o que funcionou e o que falhou
6. **Lições aprendidas** — melhorias concretas implementadas para prevenir recorrência
7. **Indicadores de comprometimento (IOC)** — hashes, IPs, domínios maliciosos (para partilha com CNCS e sector)

## Resumo da Aula

- Um incidente é «significativo» se causou ou pode causar perturbação grave ou perdas significativas
- Três prazos obrigatórios: **24h** (aviso), **72h** (notificação detalhada), **1 mês** (relatório final)
- Nas primeiras horas: **isolar** (não desligar), **conter**, **documentar**, **notificar**
- A ocultação de incidentes é punida mais severamente que a maioria das infrações técnicas
- O post-mortem é obrigatório e deve gerar **melhorias documentadas e verificáveis**`,

// ---------------------------------------------------------------------------

"lesson-2-3": `## Os Poderes do CNCS

O CNCS tem poderes extensos de supervisão sobre entidades essenciais e importantes, estabelecidos no DL 125/2025:

**Poderes de supervisão regulares:**
- Solicitar qualquer informação sobre medidas de segurança implementadas
- Realizar inspeções in loco nas instalações da empresa
- Exigir auditorias de segurança por auditores independentes (a custo da entidade)
- Emitir advertências, ordens de conformidade e coimas

**Poderes de publicidade:**
- Publicar a identidade de entidades que não cumpram ordens de conformidade (naming and shaming)
- Notificar autoridades reguladoras sectoriais (ex.: Banco de Portugal, Entidade Reguladora da Saúde)

**Poderes de emergência (incidentes graves):**
- Ordenar a implementação imediata de medidas de segurança específicas
- Solicitar ao tribunal a suspensão temporária de gestores responsáveis

## Supervisão: EE vs. EI

| Aspeto | Entidades Essenciais (EE) | Entidades Importantes (EI) |
|--------|--------------------------|---------------------------|
| Tipo | **Proativa** | **Reativa** |
| Auditorias regulares | Sim, sem incidente prévio | Só após incidente ou queixa |
| Frequência típica | A cada 2-3 anos | Por solicitação |
| Auditorias ad hoc | Sim, a qualquer momento | Sim, mas menos frequentes |
| Relatórios periódicos | Podem ser exigidos | Por solicitação |

> **O que significa «supervisão proativa»:** O CNCS pode selecionar aleatoriamente Entidades Essenciais para auditoria sem qualquer incidente prévio. É análogo a uma inspeção fiscal — pode acontecer a qualquer empresa que satisfaça os critérios.

## Como Funciona uma Auditoria do CNCS

**Fase 1 — Notificação (2-4 semanas antes)**
Para auditorias planeadas, o CNCS notifica a entidade por escrito com o âmbito e o calendário. Para auditorias de emergência (pós-incidente), o prazo pode ser muito menor.

**Fase 2 — Recolha de Documentação**
A entidade deve disponibilizar:
- Política de Segurança da Informação (PSI) atualizada
- Análise de riscos mais recente com plano de tratamento
- Plano de Resposta a Incidentes (IRP) com evidência de teste
- Inventário de ativos (hardware, software, cloud)
- Registos de formação de colaboradores
- Resultados de scans de vulnerabilidades ou testes de penetração
- Contratos com fornecedores críticos (cláusulas de segurança)
- Logs de acessos privilegiados (últimos 90 dias, no mínimo)

**Fase 3 — Entrevistas e Verificação Técnica**
- Entrevistas com o CISO, responsável de IT e membro do órgão de gestão
- Revisão técnica de configurações selecionadas
- Possível realização de testes de penetração ou scan de vulnerabilidades pelo CNCS

**Fase 4 — Relatório e Prazo de Correção**
O CNCS emite um relatório com: conformidades verificadas, não-conformidades identificadas, prazo para correção (tipicamente 30-90 dias) e ações corretivas obrigatórias.

## O Dossier de Conformidade NIS2

O **Dossier de Conformidade** é o conjunto organizado de evidências que demonstram que a empresa implementou as medidas exigidas. É o documento central de qualquer auditoria.

**Estrutura recomendada:**

**Secção 1 — Governação**
- Ata de reunião do órgão de gestão aprovando a PSI (com data e assinaturas)
- Nomeação formal do CISO (despacho interno ou contrato vCISO)
- Registos de formação dos gestores em cibersegurança

**Secção 2 — Análise de Riscos**
- Metodologia utilizada (ex.: ISO 27005, ENISA guidelines)
- Inventário de ativos com classificação por criticidade
- Registo de riscos com probabilidade, impacto e nível de risco
- Plano de tratamento de riscos com responsáveis e prazos

**Secção 3 — Medidas Técnicas Implementadas**
- Evidências de MFA ativo (capturas de ecrã de configuração)
- Relatório de gestão de patches (últimos 90 dias)
- Evidência de backup e resultado de teste de restauro
- Diagrama de rede com segmentação

**Secção 4 — Gestão de Incidentes**
- IRP documentado e datado (última versão)
- Registo de exercício de simulação (data, participantes, resultado)
- Log de incidentes dos últimos 12 meses

**Secção 5 — Cadeia de Fornecimento**
- Inventário de fornecedores com classificação de criticidade
- Questionários de avaliação preenchidos pelos fornecedores críticos
- Contratos ou adendas com cláusulas de segurança

**Secção 6 — Formação**
- Programa de formação aprovado para o ano em curso
- Registos de conclusão de formação por colaborador
- Resultados de simulações de phishing (se realizadas)

## O Plano de Ação para os Próximos 30 Dias

**Semana 1 — Diagnóstico e registo**
- [ ] Confirmar classificação NIS2 (EE ou EI) usando o fluxograma da Aula 1.2
- [ ] Registar no portal do CNCS (cncs.gov.pt)
- [ ] Fazer inventário dos ativos críticos e fornecedores digitais

**Semana 2 — Quick wins técnicos**
- [ ] Ativar MFA no email corporativo para todos os utilizadores
- [ ] Verificar e aplicar patches críticos pendentes
- [ ] Confirmar funcionamento dos backups e testar um restauro

**Semana 3 — Documentação base**
- [ ] Redigir ou atualizar a Política de Segurança da Informação
- [ ] Criar o Plano de Resposta a Incidentes (modelo disponível na plataforma)
- [ ] Nomear formalmente o CISO (interno ou externo)

**Semana 4 — Governação e fornecedores**
- [ ] Apresentar o plano de conformidade ao órgão de gestão (registar em ata)
- [ ] Contactar os 3 fornecedores mais críticos para rever cláusulas contratuais
- [ ] Planear a formação anual de todos os colaboradores

## Resumo da Aula

- O CNCS tem poderes de supervisão **proativa** (EE) e **reativa** (EI) — incluindo publicação de nomes
- Uma auditoria segue 4 fases: notificação, documentação, verificação técnica, relatório
- O **Dossier de Conformidade** é a ferramenta central — deve ser mantido atualizado continuamente
- A conformidade NIS2 não é um projeto com data de fim — é um processo de melhoria contínua
- O plano de 30 dias fornece um caminho imediato e estruturado para começar`,
};
