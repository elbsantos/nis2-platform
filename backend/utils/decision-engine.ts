/**
 * backend/utils/decision-engine.ts
 *
 * Motor determinístico de enquadramento NIS2-PT (DL 125/2025).
 * Lógica pura — zero I/O, zero BD. Reutilizável no frontend via tsconfig.web.json.
 *
 * ENGINE_VERSION "2" — adicionado campo `steps` (trilha legível nó a nó).
 * Cada elemento de `steps` tem nodeId, label em linguagem de gestor e article (base legal).
 * Os campos `path` e `legalBasis` são mantidos para retrocompatibilidade.
 * Assessments v1 não têm `steps` na BD; o Relatório re-corre o motor com os answers
 * guardados para os obter — motor é puro/determinístico, mesmas respostas = mesmo resultado.
 * ENGINE_VERSION "3" — cálculo em gémeo de dimensão: a_confirmar só quando o balanço
 * é o factor decisivo (dim(B=0) ≠ dim(B=∞)); VN≤10 com B omitido → fora_condicional.
 */

export const ENGINE_VERSION = "3";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type Classification =
  | "essencial"
  | "importante"
  | "a_confirmar"
  | "a_confirmar_contratual"
  | "fora_condicional"
  | "fora_mvp";

export interface NodeOption {
  id: string;
  label: string;
  legalRef?: string;
}

export interface DecisionNode {
  id: string;
  question: string;
  legalRef: string;
  options: NodeOption[];
}

export interface DecisionTree {
  id: string;
  frameworkSlug: string;
  engineVersion: string;
  nodes: Record<string, DecisionNode>;
  rootId: string;
}

/** Um passo na trilha auditável — um por nó visitado, em linguagem de gestor. */
export interface TrailStep {
  nodeId:  string;  // id do nó ("A", "B", "C", "D", "E")
  label:   string;  // frase legível do que aconteceu neste nó
  article: string;  // base legal deste passo específico
}

export interface DecisionResult {
  classification: Classification;
  resultLabel:    string;
  path:           string[];      // ids dos nós visitados — retrocompatível
  legalBasis:     string[];      // artigos citados — retrocompatível
  steps:          TrailStep[];   // trilha estruturada nó a nó (ENGINE_VERSION "2")
}

export type Answers = Record<string, string>;

// ── Mapeamento setor → categoria de Anexo ─────────────────────────────────────

type SectorAnexo = "tld_dns_confianca" | "telecom" | "anexo_i_outros" | "anexo_ii";

const SECTOR_ANEXO: Record<string, SectorAnexo> = {
  tld_dns_confianca:    "tld_dns_confianca",
  telecom:              "telecom",
  cloud_ixp_datacenter: "anexo_i_outros",
  gestao_tic:           "anexo_i_outros",
  energia:              "anexo_i_outros",
  transportes:          "anexo_i_outros",
  banca_financeiro:     "anexo_i_outros",
  saude:                "anexo_i_outros",
  agua:                 "anexo_i_outros",
  espaco:               "anexo_i_outros",
  postais_residuos:     "anexo_ii",
  quimicos_alimentar:   "anexo_ii",
  industria:            "anexo_ii",
  digital_b2c:          "anexo_ii",
};

// ── Labels legíveis para C.estrutura ─────────────────────────────────────────

const ESTRUTURA_PT: Record<string, string> = {
  autonoma:        "empresa autónoma (sem controlo externo significativo)",
  associada_total: "subsidiária/associada — controlo > 50 % (efetivos e contas somados na íntegra)",
  parceira:        "empresa parceira — participação 25–50 % (cálculo proporcional, resultado condicional)",
  nao_sei:         "estrutura de grupo não identificada (resultado condicional)",
};

// ── Árvore concreta NIS2-PT (DL 125/2025) ────────────────────────────────────

export const NIS2_PT_TREE: DecisionTree = {
  id: "nis2-pt-dl125-v1",
  frameworkSlug: "nis2-pt-dl125",
  engineVersion: ENGINE_VERSION,
  rootId: "A",
  nodes: {
    A: {
      id: "A",
      question: "Em que setor opera a sua organização?",
      legalRef: "Art. 3.º do RJC",
      options: [
        {
          id: "tld_dns_confianca",
          label: "Registos TLD, DNS autoritativos ou Serviços de Confiança Qualificados",
          legalRef: "Anexo I, ponto 8 — infraestrutura digital",
        },
        {
          id: "telecom",
          label: "Redes ou serviços de comunicações eletrónicas acessíveis ao público",
          legalRef: "Anexo I, ponto 8 — infraestrutura digital",
        },
        {
          id: "cloud_ixp_datacenter",
          label: "Cloud computing, centros de dados, CDN ou pontos de troca de Internet (IXP)",
          legalRef: "Anexo I, ponto 8 — infraestrutura digital",
        },
        {
          id: "gestao_tic",
          label: "Gestão de serviços TIC B2B (MSP / MSSP)",
          legalRef: "Anexo I, ponto 9",
        },
        {
          id: "energia",
          label: "Energia (eletricidade, gás, petróleo, hidrogénio, aquecimento/arrefecimento)",
          legalRef: "Anexo I, ponto 1",
        },
        {
          id: "transportes",
          label: "Transportes (aéreo, ferroviário, aquático ou rodoviário)",
          legalRef: "Anexo I, ponto 2",
        },
        {
          id: "banca_financeiro",
          label: "Banca ou infraestruturas de mercados financeiros",
          legalRef: "Anexo I, pontos 3–4",
        },
        {
          id: "saude",
          label: "Saúde (prestadores, laboratórios, I&D, dispositivos médicos, farmácias)",
          legalRef: "Anexo I, ponto 5",
        },
        {
          id: "agua",
          label: "Água potável e/ou residual",
          legalRef: "Anexo I, pontos 6–7",
        },
        {
          id: "espaco",
          label: "Espaço (operadores de infraestruturas terrestres)",
          legalRef: "Anexo I, ponto 10",
        },
        {
          id: "postais_residuos",
          label: "Serviços postais/estafetas ou gestão de resíduos",
          legalRef: "Anexo II, pontos 1–2",
        },
        {
          id: "quimicos_alimentar",
          label: "Químicos ou setor alimentar (distribuição/transformação a grande escala)",
          legalRef: "Anexo II, pontos 3–4",
        },
        {
          id: "industria",
          label: "Indústria e manufatura (dispositivos médicos, equipamentos elétricos, veículos, etc.)",
          legalRef: "Anexo II, ponto 5",
        },
        {
          id: "digital_b2c",
          label: "Mercados online, motores de busca online ou plataformas de redes sociais",
          legalRef: "Anexo II, ponto 6",
        },
        {
          id: "admin_publica",
          label: "Administração Pública",
          legalRef: "Art. 3.º/3 e Art. 7.º do RJC",
        },
        {
          id: "outro",
          label: "Outro setor / não identifico o setor da minha organização",
        },
      ],
    },

    B: {
      id: "B",
      question:
        "Embora fora dos setores listados, existe alguma situação que possa tornar a sua organização relevante para a NIS2?",
      legalRef: "Art. 3.º/2 do RJC",
      options: [
        {
          id: "qualitativo",
          label:
            "Sim — somos o único fornecedor de um serviço essencial, ou uma perturbação teria impacto transfronteiriço significativo",
          legalRef: "Art. 3.º/2 b) e d) do RJC",
        },
        {
          id: "fornecedor",
          label:
            "Sim — somos fornecedor crítico de uma entidade já abrangida pela NIS2 (via contrato ou dependência operacional)",
          legalRef: "Art. 28.º do RJC (obrigação da entidade abrangida quanto aos seus fornecedores)",
        },
        {
          id: "nenhum",
          label: "Não — nenhuma das situações anteriores se aplica",
        },
      ],
    },

    C: {
      id: "C",
      question: "Qual é a estrutura do grupo empresarial da sua organização?",
      legalRef: "Rec. 2003/361/CE; Art. 3.º/1 do RJC",
      options: [
        {
          id: "autonoma",
          label: "Autónoma — sem participações significativas de outras empresas (≤ 25 %)",
        },
        {
          id: "associada_total",
          label:
            "Associada / subsidiária — outra empresa detém mais de 50 % do capital ou direitos de voto (soma-se 100 % dos efetivos do grupo)",
          legalRef: "Art. 3.º/4 do anexo à Rec. 2003/361/CE",
        },
        {
          id: "parceira",
          label:
            "Parceira — outra empresa detém entre 25 % e 50 % (cálculo proporcional; resultado a confirmar)",
          legalRef: "Art. 3.º/2 do anexo à Rec. 2003/361/CE",
        },
        {
          id: "nao_sei",
          label: "Não sei / prefiro não responder (usa-se a dimensão própria, resultado condicional)",
        },
      ],
    },

    D: {
      id: "D",
      question:
        "Qual é a dimensão da sua organização? Introduza os valores agregados do grupo quando aplicável (número de trabalhadores, volume de negócios em M€, balanço total em M€).",
      legalRef: "Anexo III DL 125/2025; Rec. 2003/361/CE",
      options: [
        {
          id: "form",
          label:
            "Preencher os campos: D.n (trabalhadores), D.vn (VN em M€), D.b (balanço em M€, opcional). " +
            "Para grupo associado (C = associada_total): D.grupo_n, D.grupo_vn, D.grupo_b.",
        },
      ],
    },

    E: {
      id: "E",
      question: "Classificação final (calculada automaticamente com base no setor e dimensão)",
      legalRef: "Art. 6.º do RJC",
      options: [],
    },
  },
};

// ── Motor de avaliação ────────────────────────────────────────────────────────
//
// Chaves de `answers` usadas:
//   "A.setor"     — id de opção do Nó A
//   "B.excecao"   — id de opção do Nó B (só se A.setor = "outro")
//   "C.estrutura" — id de opção do Nó C
//   "D.n"         — trabalhadores próprios (inteiro)
//   "D.vn"        — volume de negócios em M€ (decimal)
//   "D.b"         — balanço total em M€ (decimal; omitir = desconhecido)
//   "D.grupo_n"   — trabalhadores adicionais do grupo (para associada_total)
//   "D.grupo_vn"  — VN adicional do grupo em M€
//   "D.grupo_b"   — balanço adicional do grupo em M€

export function evaluateTree(
  tree: DecisionTree,
  answers: Answers
): DecisionResult {
  const path:      string[]     = [];
  const legalBasis: string[]    = [];
  const steps:     TrailStep[]  = [];

  // Helper: encontra opção de um nó pelo id da resposta
  const findOpt = (nodeId: string, optId: string): NodeOption | undefined =>
    tree.nodes[nodeId]?.options.find(o => o.id === optId);

  // ── Nó A: Setor ──────────────────────────────────────────────────────────
  path.push("A");
  legalBasis.push("Art. 3.º do RJC");

  const setor    = answers["A.setor"] ?? "";
  const setorOpt = findOpt("A", setor);

  steps.push({
    nodeId:  "A",
    label:   setorOpt ? `Setor: ${setorOpt.label}` : "Setor: não identificado",
    article: setorOpt?.legalRef ?? tree.nodes["A"].legalRef,
  });

  if (setor === "admin_publica") {
    const art = "Art. 3.º/3 e Art. 7.º do RJC";
    steps.push({
      nodeId:  "E",
      label:   "Resultado: Administração Pública — regime autónomo (fora do MVP; contacte o CNCS)",
      article: art,
    });
    return {
      classification: "fora_mvp",
      resultLabel:
        "Administração Pública — regime autónomo (Art. 3.º/3 e Art. 7.º do RJC). Consulte o CNCS diretamente.",
      path,
      legalBasis: [...legalBasis, art],
      steps,
    };
  }

  if (setor === "outro" || !SECTOR_ANEXO[setor]) {
    // ── Nó B: Exceções Art. 3.º/2 ────────────────────────────────────────
    path.push("B");
    legalBasis.push("Art. 3.º/2 do RJC");

    const excecao   = answers["B.excecao"] ?? "";
    const excOpt    = findOpt("B", excecao);
    const bArticle  = excOpt?.legalRef ?? "Art. 3.º/2 do RJC";

    steps.push({
      nodeId:  "B",
      label:   excOpt ? `Exceção: ${excOpt.label}` : "Exceção: nenhuma situação especial identificada",
      article: bArticle,
    });

    if (excecao === "qualitativo") {
      steps.push({
        nodeId:  "E",
        label:   "Resultado: a confirmar — critério qualitativo (avaliação final pelo CNCS)",
        article: bArticle,
      });
      return {
        classification: "a_confirmar",
        resultLabel:
          "Não foi possível enquadrar a sua atividade nas opções apresentadas. Os critérios qualitativos do Art. 3.º/2 do RJC aplicam-se a entidades que constam dos Anexos I ou II, independentemente da dimensão — verifique se a sua atividade consta desses anexos e confirme junto do CNCS.",
        path,
        legalBasis,
        steps,
      };
    }
    if (excecao === "fornecedor") {
      steps.push({
        nodeId:  "E",
        label:   "Resultado: a confirmar — abrangência via cadeia de abastecimento",
        article: bArticle,
      });
      return {
        classification: "a_confirmar_contratual",
        resultLabel:
          "Possível abrangência via cadeia de fornecimento de entidade abrangida — confirmar com o cliente ou autoridade competente.",
        path,
        legalBasis,
        steps,
      };
    }
    steps.push({
      nodeId:  "E",
      label:   "Resultado: provavelmente fora do âmbito (reavalie se setor, dimensão ou clientes mudarem)",
      article: "Art. 3.º/2 do RJC",
    });
    return {
      classification: "fora_condicional",
      resultLabel:
        "Organização fora do âmbito da NIS2. Reavalie se o setor ou relações contratuais se alterarem.",
      path,
      legalBasis,
      steps,
    };
  }

  const categoriaSetor = SECTOR_ANEXO[setor]!;

  // ── Nó C: Grupo ──────────────────────────────────────────────────────────
  path.push("C");
  legalBasis.push("Rec. 2003/361/CE");

  const estrutura = answers["C.estrutura"] ?? "autonoma";
  const condicionalGrupo = estrutura === "parceira" || estrutura === "nao_sei";

  steps.push({
    nodeId:  "C",
    label:   `Grupo: ${ESTRUTURA_PT[estrutura] ?? estrutura}`,
    article: tree.nodes["C"].legalRef,
  });

  // ── Nó D: Dimensão ───────────────────────────────────────────────────────
  path.push("D");
  legalBasis.push("Anexo III DL 125/2025");

  const ownN    = parseInt(answers["D.n"]  ?? "0", 10) || 0;
  const ownVn   = parseFloat(answers["D.vn"] ?? "0")   || 0;
  const ownBStr = answers["D.b"];
  let   ownB    = ownBStr !== undefined && ownBStr !== "" ? parseFloat(ownBStr) : -1;

  let totalN  = ownN;
  let totalVn = ownVn;
  let totalB  = ownB;

  if (estrutura === "associada_total") {
    totalN  += parseInt(answers["D.grupo_n"]  ?? "0", 10) || 0;
    totalVn += parseFloat(answers["D.grupo_vn"] ?? "0")   || 0;
    const grupoBStr = answers["D.grupo_b"];
    if (grupoBStr !== undefined && grupoBStr !== "") {
      const grupoB = parseFloat(grupoBStr);
      totalB = ownB >= 0 ? ownB + grupoB : grupoB;
    }
    // se grupo_b omitido e own_b também, totalB permanece -1
  }

  const bDesconhecido = totalB < 0;
  const bLabelStr     = bDesconhecido ? "não informado" : `${totalB} M€`;

  // Thresholds do Anexo III DL 125/2025 / Rec. 2003/361/CE
  const calcDim = (b: number): "grande" | "media" | "pequena" => {
    if (totalN >= 250 || (totalVn > 50 && b > 43)) return "grande";
    if (totalN >= 50  || (totalVn > 10 && b > 10)) return "media";
    return "pequena";
  };

  // Cálculo em gémeo: pior caso financeiro (B=0) vs melhor caso (B=∞).
  // Se dim(B=0) ≠ dim(B=∞), o balanço é o factor decisivo → a_confirmar.
  // Se coincidem, a incerteza do balanço é irrelevante para a decisão de dimensão.
  const dimB0   = calcDim(bDesconhecido ? 0                       : totalB);
  const dimBInf = calcDim(bDesconhecido ? Number.POSITIVE_INFINITY : totalB);

  const condicionalBalanco = bDesconhecido && dimB0 !== dimBInf;
  const dimensao           = dimBInf;  // pior caso: maior dimensão possível
  const condicional        = condicionalGrupo || condicionalBalanco;

  const dimensaoLabels: Record<string, string> = {
    grande: "grande", media: "média", pequena: "pequena/micro",
  };
  const grupoSufixo = estrutura === "associada_total"
    ? " (valores agregados do grupo)"
    : "";
  const dimensaoLabel = condicionalBalanco
    ? `a confirmar (entre ${dimensaoLabels[dimB0]} e ${dimensaoLabels[dimBInf]}, balanço decisivo)`
    : dimensaoLabels[dimensao];

  steps.push({
    nodeId:  "D",
    label:   `Dimensão: ${dimensaoLabel}${grupoSufixo} (trabalhadores: ${totalN}, VN: ${totalVn} M€, balanço: ${bLabelStr})`,
    article: tree.nodes["D"].legalRef,
  });

  // ── Nó E: Classificação ──────────────────────────────────────────────────
  // Se o balanço foi o factor decisivo entre dimensões distintas, não é possível
  // determinar o enquadramento sem ele — independentemente do setor.
  if (condicionalBalanco) {
    const art = "Art. 6.º do RJC";
    path.push("E");
    legalBasis.push(art);
    steps.push({
      nodeId:  "E",
      label:   "Resultado: dimensão a confirmar — balanço desconhecido é o factor decisivo",
      article: art,
    });
    return {
      classification: "a_confirmar",
      resultLabel:
        "Dimensão a confirmar — o balanço desconhecido determina se a organização é abrangida e em que categoria. Forneça o balanço para obter uma classificação definitiva.",
      path,
      legalBasis,
      steps,
    };
  }

  path.push("E");
  legalBasis.push("Art. 6.º do RJC");

  return classifyE(categoriaSetor, dimensao, condicional, path, legalBasis, steps);
}

function classifyE(
  cat:         SectorAnexo,
  dimensao:    "grande" | "media" | "pequena",
  condicional: boolean,
  path:        string[],
  legalBasis:  string[],
  steps:       TrailStep[],
): DecisionResult {
  const pfx = condicional ? "Provável " : "";

  // Helper: empurra o passo E e devolve o resultado
  const finish = (
    classification: Classification,
    resultLabel:    string,
    eLabel:         string,
    eArticle:       string,
  ): DecisionResult => {
    steps.push({ nodeId: "E", label: eLabel, article: eArticle });
    return { classification, resultLabel, path, legalBasis, steps };
  };

  // Regra 1: TLD / DNS / Confiança Qualificada → ESSENCIAL independentemente da dimensão.
  // pfx não aplicável — dimensão é irrelevante para esta regra, nunca é "provável".
  if (cat === "tld_dns_confianca") {
    const art = "Art. 6.º/1 b) do RJC";
    return finish(
      "essencial",
      "Entidade essencial — TLD/DNS/Confiança Qualificada (Art. 6.º/1 b) do RJC, independente da dimensão).",
      "Resultado: entidade essencial — regra especial TLD/DNS/Confiança (independente da dimensão)",
      art,
    );
  }

  // Regra 2: Telecom — dimensão determina essencial vs importante
  if (cat === "telecom") {
    if (dimensao === "pequena") {
      const art = "Art. 3.º/2 a) i) do RJC; Art. 6.º/2 do RJC";
      return finish(
        "importante",
        `${pfx}Entidade importante — telecom de pequena/micro dimensão (abrangida nos termos do Art. 3.º/2 a) i) do RJC; qualificada nos termos do Art. 6.º/2 do RJC).`,
        `${pfx}Resultado: entidade importante — telecom de pequena/micro dimensão`,
        art,
      );
    }
    const art = "Art. 6.º/1 a) e c) do RJC";
    return finish(
      "essencial",
      `${pfx}Entidade essencial — telecom de média ou grande dimensão (Art. 6.º/1 a) e c) do RJC).`,
      `${pfx}Resultado: entidade essencial — telecom de média/grande dimensão`,
      art,
    );
  }

  // Regra 3: Anexo I (outros setores)
  if (cat === "anexo_i_outros") {
    if (dimensao === "grande") {
      const art = "Art. 6.º/1 a) do RJC";
      return finish(
        "essencial",
        `${pfx}Entidade essencial — Anexo I, grande dimensão (Art. 6.º/1 a) do RJC).`,
        `${pfx}Resultado: entidade essencial — Anexo I, grande dimensão`,
        art,
      );
    }
    if (dimensao === "media") {
      const art = "Art. 6.º/2 do RJC";
      return finish(
        "importante",
        `${pfx}Entidade importante — Anexo I, média dimensão (Art. 6.º/2 do RJC).`,
        `${pfx}Resultado: entidade importante — Anexo I, média dimensão`,
        art,
      );
    }
    // piccola + condicional: dimensão incerta → não afirmar "fora"; deixar para confirmação
    const art = "Art. 6.º do RJC";
    return finish(
      condicional ? "a_confirmar" : "fora_condicional",
      condicional
        ? "Dimensão a confirmar — balanço ou estrutura de grupo desconhecidos. Pode estar fora ou dentro do âmbito."
        : "Não abrangida — Anexo I, mas pequena/micro dimensão. Reavalie se a dimensão aumentar ou se existirem critérios qualitativos.",
      condicional
        ? "Resultado: dimensão a confirmar — balanço ou estrutura de grupo desconhecidos"
        : "Resultado: provavelmente fora — Anexo I, pequena/micro dimensão",
      art,
    );
  }

  // Regra 4: Anexo II
  if (dimensao === "pequena") {
    const art = "Art. 6.º do RJC";
    return finish(
      condicional ? "a_confirmar" : "fora_condicional",
      condicional
        ? "Dimensão a confirmar — balanço ou estrutura de grupo desconhecidos. Pode estar fora ou dentro do âmbito."
        : "Não abrangida — Anexo II, pequena/micro dimensão. Reavalie se a dimensão aumentar.",
      condicional
        ? "Resultado: dimensão a confirmar — balanço ou estrutura de grupo desconhecidos"
        : "Resultado: provavelmente fora — Anexo II, pequena/micro dimensão",
      art,
    );
  }
  const art = "Art. 6.º/2 do RJC";
  return finish(
    "importante",
    `${pfx}Entidade importante — Anexo II, média/grande dimensão (Art. 6.º/2 do RJC).`,
    `${pfx}Resultado: entidade importante — Anexo II, média/grande dimensão`,
    art,
  );
}
