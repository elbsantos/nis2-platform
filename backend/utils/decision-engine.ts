/**
 * backend/utils/decision-engine.ts
 *
 * Motor determinístico de enquadramento NIS2-PT (DL 125/2025).
 * Lógica pura — zero I/O, zero BD. Reutilizável no frontend via tsconfig.web.json.
 */

export const ENGINE_VERSION = "1";

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

export interface DecisionResult {
  classification: Classification;
  resultLabel: string;
  path: string[];
  legalBasis: string[];
}

export type Answers = Record<string, string>;

// ── Mapeamento setor → categoria de Anexo ─────────────────────────────────────
// Usado internamente por evaluateTree para aplicar as regras do Art. 6.º

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
      legalRef: "Art. 2.º DL 125/2025",
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
          legalRef: "Art. 14.º DL 125/2025",
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
      legalRef: "Art. 3.º/2 DL 125/2025",
      options: [
        {
          id: "qualitativo",
          label:
            "Sim — somos o único fornecedor de um serviço essencial, ou uma perturbação teria impacto transfronteiriço significativo",
          legalRef: "Art. 3.º/2 a) DL 125/2025",
        },
        {
          id: "fornecedor",
          label:
            "Sim — somos fornecedor crítico de uma entidade já abrangida pela NIS2 (via contrato ou dependência operacional)",
          legalRef: "Art. 3.º/2 b) DL 125/2025",
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
      legalRef: "Rec. 2003/361/CE; Art. 6.º/2 DL 125/2025",
      options: [
        {
          id: "autonoma",
          label: "Autónoma — sem participações significativas de outras empresas (≤ 25 %)",
        },
        {
          id: "associada_total",
          label:
            "Associada / subsidiária — outra empresa detém mais de 50 % do capital ou direitos de voto (soma-se 100 % dos efetivos do grupo)",
          legalRef: "Art. 3.º/4 Rec. 2003/361/CE",
        },
        {
          id: "parceira",
          label:
            "Parceira — outra empresa detém entre 25 % e 50 % (cálculo proporcional; resultado a confirmar)",
          legalRef: "Art. 3.º/2 Rec. 2003/361/CE",
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
      legalRef: "Art. 6.º DL 125/2025",
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
  _tree: DecisionTree,
  answers: Answers
): DecisionResult {
  const path: string[] = [];
  const legalBasis: string[] = [];

  // ── Nó A: Setor ──────────────────────────────────────────────────────────
  path.push("A");
  legalBasis.push("Art. 2.º DL 125/2025");

  const setor = answers["A.setor"] ?? "";

  if (setor === "admin_publica") {
    return {
      classification: "fora_mvp",
      resultLabel:
        "Administração Pública — regime autónomo (Art. 14.º DL 125/2025). Consulte o CNCS diretamente.",
      path,
      legalBasis: [...legalBasis, "Art. 14.º DL 125/2025"],
    };
  }

  if (setor === "outro" || !SECTOR_ANEXO[setor]) {
    // ── Nó B: Exceções Art. 3.º/2 ────────────────────────────────────────
    path.push("B");
    legalBasis.push("Art. 3.º/2 DL 125/2025");

    const excecao = answers["B.excecao"] ?? "";

    if (excecao === "qualitativo") {
      return {
        classification: "a_confirmar",
        resultLabel:
          "Possível abrangência por critério qualitativo — classificação a confirmar pelo CNCS (Art. 3.º/2 a) DL 125/2025).",
        path,
        legalBasis,
      };
    }
    if (excecao === "fornecedor") {
      return {
        classification: "a_confirmar_contratual",
        resultLabel:
          "Possível abrangência via cadeia de fornecimento de entidade abrangida — confirmar com o cliente ou autoridade competente.",
        path,
        legalBasis,
      };
    }
    return {
      classification: "fora_condicional",
      resultLabel:
        "Organização fora do âmbito da NIS2. Reavalie se o setor ou relações contratuais se alterarem.",
      path,
      legalBasis,
    };
  }

  const categoriaSetor = SECTOR_ANEXO[setor]!;

  // ── Nó C: Grupo ──────────────────────────────────────────────────────────
  path.push("C");
  legalBasis.push("Rec. 2003/361/CE");

  const estrutura = answers["C.estrutura"] ?? "autonoma";
  // parceira (proporcional) e nao_sei sempre marcam resultado como condicional
  let condicional = estrutura === "parceira" || estrutura === "nao_sei";

  // ── Nó D: Dimensão ───────────────────────────────────────────────────────
  path.push("D");
  legalBasis.push("Anexo III DL 125/2025");

  const ownN  = parseInt(answers["D.n"]  ?? "0", 10) || 0;
  const ownVn = parseFloat(answers["D.vn"] ?? "0")  || 0;
  const ownBStr = answers["D.b"];
  let ownB = ownBStr !== undefined && ownBStr !== "" ? parseFloat(ownBStr) : -1;

  let totalN  = ownN;
  let totalVn = ownVn;
  let totalB  = ownB;

  if (estrutura === "associada_total") {
    totalN  += parseInt(answers["D.grupo_n"]  ?? "0", 10) || 0;
    totalVn += parseFloat(answers["D.grupo_vn"] ?? "0")  || 0;
    const grupoBStr = answers["D.grupo_b"];
    if (grupoBStr !== undefined && grupoBStr !== "") {
      const grupoB = parseFloat(grupoBStr);
      totalB = ownB >= 0 ? ownB + grupoB : grupoB;
    }
    // se grupo_b omitido e own_b também, totalB permanece -1
  }

  if (totalB < 0) {
    // Balanço desconhecido — pior caso: assume que ultrapassa qualquer limiar,
    // para nunca gerar um falso "fora". Marca condicional para revisão.
    // (B=VN seria errado: com VN=8M, B=8 não satisfaz B>10 e a empresa sairia como fora.)
    totalB = Number.POSITIVE_INFINITY;
    condicional = true;
  }

  // Thresholds do Anexo III DL 125/2025 / Rec. 2003/361/CE
  let dimensao: "grande" | "media" | "pequena";
  if (totalN >= 250 || (totalVn > 50 && totalB > 43)) {
    dimensao = "grande";
  } else if (totalN >= 50 || (totalVn > 10 && totalB > 10)) {
    dimensao = "media";
  } else {
    dimensao = "pequena";
  }

  // ── Nó E: Classificação ──────────────────────────────────────────────────
  path.push("E");
  legalBasis.push("Art. 6.º DL 125/2025");

  return classifyE(categoriaSetor, dimensao, condicional, path, legalBasis);
}

function classifyE(
  cat: SectorAnexo,
  dimensao: "grande" | "media" | "pequena",
  condicional: boolean,
  path: string[],
  legalBasis: string[]
): DecisionResult {
  const pfx = condicional ? "Provável " : "";

  // Regra 1: TLD / DNS / Confiança Qualificada → ESSENCIAL independentemente da dimensão
  if (cat === "tld_dns_confianca") {
    return {
      classification: "essencial",
      resultLabel: `${pfx}Entidade essencial — TLD/DNS/Confiança Qualificada (Art. 6.º/1 DL 125/2025, independente da dimensão).`,
      path,
      legalBasis,
    };
  }

  // Regra 2: Telecom — dimensão determina essencial vs importante
  if (cat === "telecom") {
    if (dimensao === "pequena") {
      return {
        classification: "importante",
        resultLabel: `${pfx}Entidade importante — telecom de pequena/micro dimensão (Art. 3.º/2 a) i) DL 125/2025).`,
        path,
        legalBasis,
      };
    }
    return {
      classification: "essencial",
      resultLabel: `${pfx}Entidade essencial — telecom de média ou grande dimensão (Art. 3.º/2 a) i) DL 125/2025).`,
      path,
      legalBasis,
    };
  }

  // Regra 3: Anexo I (outros setores)
  if (cat === "anexo_i_outros") {
    if (dimensao === "grande") {
      return {
        classification: "essencial",
        resultLabel: `${pfx}Entidade essencial — Anexo I, grande dimensão (Art. 6.º/1 DL 125/2025).`,
        path,
        legalBasis,
      };
    }
    if (dimensao === "media") {
      return {
        classification: "importante",
        resultLabel: `${pfx}Entidade importante — Anexo I, média dimensão (Art. 6.º/2 DL 125/2025).`,
        path,
        legalBasis,
      };
    }
    // piccola + condicional: dimensão incerta → não afirmar "fora"; deixar para confirmação
    return {
      classification: condicional ? "a_confirmar" : "fora_condicional",
      resultLabel: condicional
        ? "Dimensão a confirmar — balanço ou estrutura de grupo desconhecidos. Pode estar fora ou dentro do âmbito."
        : "Não abrangida — Anexo I, mas pequena/micro dimensão. Reavalie se a dimensão aumentar ou se existirem critérios qualitativos.",
      path,
      legalBasis,
    };
  }

  // Regra 4: Anexo II
  if (dimensao === "pequena") {
    // piccola + condicional: dimensão incerta → não afirmar "fora"; deixar para confirmação
    return {
      classification: condicional ? "a_confirmar" : "fora_condicional",
      resultLabel: condicional
        ? "Dimensão a confirmar — balanço ou estrutura de grupo desconhecidos. Pode estar fora ou dentro do âmbito."
        : "Não abrangida — Anexo II, pequena/micro dimensão. Reavalie se a dimensão aumentar.",
      path,
      legalBasis,
    };
  }
  return {
    classification: "importante",
    resultLabel: `${pfx}Entidade importante — Anexo II, média/grande dimensão (Art. 6.º/2 DL 125/2025).`,
    path,
    legalBasis,
  };
}
