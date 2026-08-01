import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  NIS2_PT_TREE,
  evaluateTree,
  resolveCoverageState,
  type Answers,
  type TrailStep,
} from "./decision-engine";

// Helpers
const A = (overrides: Answers): Answers => overrides;

// Respostas base para entidade em setor com dimensão definida
// D.vn/D.b em EUROS (ENGINE_VERSION 7+) — antes eram em milhões (M€).
const BASE_ENERGIA_GRANDE: Answers = {
  "A.setor":      "energia",
  "C.estrutura":  "autonoma",
  "D.n":          "300",
  "D.vn":         "60000000",
  "D.b":          "50000000",
};

const BASE_ENERGIA_MEDIA: Answers = {
  "A.setor":      "energia",
  "C.estrutura":  "autonoma",
  "D.n":          "100",
  "D.vn":         "20000000",
  "D.b":          "15000000",
};

// ── Constantes ────────────────────────────────────────────────────────────────

describe("ENGINE_VERSION", () => {
  it("é '7' (v7 — D.vn/D.b passam a ser introduzidos e comparados em euros, não em M€)", () => {
    expect(ENGINE_VERSION).toBe("7");
  });
});

// ── coverageState — mapa por classification ───────────────────────────────────

describe("coverageState", () => {
  const cases: Array<[Parameters<typeof evaluateTree>[1], string, string]> = [
    [A({ "A.setor": "energia",     "C.estrutura": "autonoma", "D.n": "300", "D.vn": "60000000", "D.b": "50000000" }), "essencial",              "abrangida"],
    [A({ "A.setor": "industria",   "C.estrutura": "autonoma", "D.n": "60",  "D.vn": "12000000", "D.b": "10000000" }), "importante",             "abrangida"],
    [A({ "A.setor": "outro",       "B.excecao": "qualitativo" }),                                          "a_confirmar",            "condicional"],
    [A({ "A.setor": "outro",       "B.excecao": "fornecedor" }),                                           "a_confirmar_contratual", "condicional"],
    [A({ "A.setor": "outro",       "B.excecao": "nenhum" }),                                               "fora_condicional",       "fora"],
    [A({ "A.setor": "admin_publica" }),                                                                    "fora_mvp",               "fora"],
  ];

  it.each(cases)(
    "classification %s → coverageState %s",
    (answers, expectedClass, expectedCoverage) => {
      const r = evaluateTree(NIS2_PT_TREE, answers);
      expect(r.classification).toBe(expectedClass);
      expect(r.coverageState).toBe(expectedCoverage);
    },
  );

  it("nenhum resultado do motor tem coverageState undefined", () => {
    // Corre todos os cenários do ficheiro e verifica que coverageState está sempre definido
    const scenarios = [
      A({ "A.setor": "energia",   "C.estrutura": "autonoma",        "D.n": "300", "D.vn": "60000000", "D.b": "50000000" }),
      A({ "A.setor": "industria", "C.estrutura": "autonoma",        "D.n": "60",  "D.vn": "12000000", "D.b": "10000000" }),
      A({ "A.setor": "outro",     "B.excecao": "qualitativo" }),
      A({ "A.setor": "outro",     "B.excecao": "fornecedor" }),
      A({ "A.setor": "outro",     "B.excecao": "nenhum" }),
      A({ "A.setor": "admin_publica" }),
      A({ "A.setor": "energia",   "C.estrutura": "autonoma",        "D.n": "30",  "D.vn": "5000000" }),
      A({ "A.setor": "energia",   "C.estrutura": "associada_total", "D.n": "240", "D.vn": "45000000", "D.b": "38000000", "D.grupo_n": "20", "D.grupo_vn": "8000000", "D.grupo_b": "5000000" }),
    ];
    for (const s of scenarios) {
      const r = evaluateTree(NIS2_PT_TREE, s);
      expect(r.coverageState).toBeDefined();
      expect(['abrangida', 'condicional', 'fora']).toContain(r.coverageState);
    }
  });

  it("resolveCoverageState lança se classification não está mapeada", () => {
    expect(() => resolveCoverageState("xpto")).toThrow(
      "coverageState em falta para classification: xpto",
    );
  });
});

// ── Nó A — Setor ─────────────────────────────────────────────────────────────

describe("Nó A — Setor", () => {
  it("administração pública → fora_mvp", () => {
    const r = evaluateTree(NIS2_PT_TREE, A({ "A.setor": "admin_publica" }));
    expect(r.classification).toBe("fora_mvp");
    expect(r.path).toEqual(["A"]);
    expect(r.legalBasis).toContain("Art. 3.º/3 e Art. 7.º do RJC"); // antes: "Art. 14.º DL 125/2025"
  });
});

// ── Nó B — Exceções (fora de setor) ──────────────────────────────────────────

describe("Nó B — Exceções Art. 3.º/2 (entidade fora de setor)", () => {
  it("[obrigatório] exceção qualitativa → a_confirmar", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "outro", "B.excecao": "qualitativo" })
    );
    expect(r.classification).toBe("a_confirmar");
    expect(r.path).toEqual(["A", "B"]);
    expect(r.legalBasis).toContain("Art. 3.º/2 do RJC"); // antes: "Art. 3.º/2 DL 125/2025"
    // steps: A + B + E (nó virtual de resultado)
    expect(r.steps).toHaveLength(3);
    const [sA, sB, sE] = r.steps as [TrailStep, TrailStep, TrailStep];
    expect(sA.nodeId).toBe("A");
    expect(sA.label).toContain("Outro setor");
    expect(sA.article).toBe("Art. 3.º do RJC"); // antes: "Art. 2.º DL 125/2025"
    expect(sB.nodeId).toBe("B");
    expect(sB.label).toContain("único fornecedor");
    expect(sB.article).toBe("Art. 3.º/2 b) e d) do RJC"); // antes: "Art. 3.º/2 a) DL 125/2025" — diploma e alíneas corrigidos
    expect(sE.nodeId).toBe("E");
    expect(sE.label).toContain("a confirmar");
    expect(sE.article).toBe("Art. 3.º/2 b) e d) do RJC"); // antes: "Art. 3.º/2 a) DL 125/2025"
  });

  it("fornecedor de entidade abrangida → a_confirmar_contratual", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "outro", "B.excecao": "fornecedor" })
    );
    expect(r.classification).toBe("a_confirmar_contratual");
    expect(r.path).toEqual(["A", "B"]);
    // Não deve afirmar abrangência directa — a obrigação chega por contrato (Art. 28.º)
    expect(r.resultLabel).toContain("Art. 28.º do RJC");
    expect(r.resultLabel).not.toContain("abrangência via cadeia");
    // steps.label do nó E não deve dizer "abrangência" nem "cadeia" (v6)
    const sE = r.steps.find(s => s.nodeId === "E")!;
    expect(sE.label).toContain("via contratual");
    expect(sE.label).not.toContain("abrangência");
    expect(sE.label).not.toContain("cadeia");
  });

  it("nenhuma exceção → fora_condicional", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "outro", "B.excecao": "nenhum" })
    );
    expect(r.classification).toBe("fora_condicional");
  });
});

// ── Nó C — legalRef das opções de estrutura de grupo ─────────────────────────

describe("Nó C — legalRef das opções de estrutura de grupo", () => {
  it("opção associada_total cita Art. 3.º/4 do anexo à Rec. 2003/361/CE", () => {
    // O artigo 3.º do CORPO da Recomendação não tem números; os tipos de empresa
    // (autónoma, parceiras, associadas) estão no Art. 3.º DO ANEXO.
    const opt = NIS2_PT_TREE.nodes["C"].options.find(o => o.id === "associada_total")!;
    expect(opt.legalRef).toBe("Art. 3.º/4 do anexo à Rec. 2003/361/CE");
  });

  it("opção parceira cita Art. 3.º/2 do anexo à Rec. 2003/361/CE", () => {
    const opt = NIS2_PT_TREE.nodes["C"].options.find(o => o.id === "parceira")!;
    expect(opt.legalRef).toBe("Art. 3.º/2 do anexo à Rec. 2003/361/CE");
  });
});

// ── Nó E — Classificação ─────────────────────────────────────────────────────

describe("Nó E — Classificação por setor e dimensão", () => {
  it("[obrigatório] Anexo I grande dimensão → essencial", () => {
    const r = evaluateTree(NIS2_PT_TREE, BASE_ENERGIA_GRANDE);
    expect(r.classification).toBe("essencial");
    expect(r.path).toEqual(["A", "C", "D", "E"]);
    expect(r.legalBasis).toContain("Art. 6.º do RJC"); // antes: "Art. 6.º DL 125/2025"
    // steps: A + C + D + E
    expect(r.steps).toHaveLength(4);
    const [sA, sC, sD, sE] = r.steps as [TrailStep, TrailStep, TrailStep, TrailStep];
    expect(sA).toEqual({ nodeId: "A", label: "Setor: Energia (eletricidade, gás, petróleo, hidrogénio, aquecimento/arrefecimento)", article: "Anexo I, ponto 1" });
    expect(sC).toEqual({ nodeId: "C", label: "Grupo: empresa autónoma (sem controlo externo significativo)", article: "Rec. 2003/361/CE; Art. 3.º/1 do RJC" }); // antes: "...Art. 3.º/1 DL 125/2025"
    expect(sD).toEqual({ nodeId: "D", label: "Dimensão: grande (trabalhadores: 300, VN: 60.000.000 €, balanço: 50.000.000 €)", article: "Anexo III DL 125/2025; Rec. 2003/361/CE" }); // ENGINE_VERSION 7: valores em euros, não M€
    expect(sE).toEqual({ nodeId: "E", label: "Resultado: entidade essencial — Anexo I, grande dimensão", article: "Art. 6.º/1 a) do RJC" }); // antes: "Art. 6.º/1 a) DL 125/2025"
  });

  it("[obrigatório] Anexo I média dimensão → importante", () => {
    const r = evaluateTree(NIS2_PT_TREE, BASE_ENERGIA_MEDIA);
    expect(r.classification).toBe("importante");
    expect(r.path).toEqual(["A", "C", "D", "E"]);
  });

  it("[obrigatório] caso-limite: N=30, VN=12.000.000€, B=8.000.000€ → pequena → fora_condicional", () => {
    // N<50; VN=12M>10M MAS B=8M≤10M → NÃO satisfaz (VN>10M E B>10M) → pequena
    // B=8M é CONHECIDO → condicional=false → fora_condicional (não a_confirmar)
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "industria",
        "C.estrutura": "autonoma",
        "D.n":         "30",
        "D.vn":        "12000000",
        "D.b":         "8000000",
      })
    );
    expect(r.classification).toBe("fora_condicional");
    expect(r.path).toEqual(["A", "C", "D", "E"]);
    expect(r.legalBasis).toContain("Art. 3.º do RJC"); // antes: "Art. 2.º DL 125/2025"
    expect(r.legalBasis).toContain("Anexo III DL 125/2025");
    expect(r.legalBasis).toContain("Art. 6.º do RJC"); // antes: "Art. 6.º DL 125/2025"
    // steps: label de D mostra "pequena/micro"
    expect(r.steps).toHaveLength(4);
    const sD = r.steps[2]!;
    expect(sD.nodeId).toBe("D");
    expect(sD.label).toContain("pequena/micro");
    expect(sD.label).toContain("trabalhadores: 30");
    const sE = r.steps[3]!;
    expect(sE.nodeId).toBe("E");
    expect(sE.label).toContain("provavelmente fora");
  });

  it("[obrigatório] telecom pequena dimensão → importante", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "telecom",
        "C.estrutura": "autonoma",
        "D.n":         "30",
        "D.vn":        "5000000",
        "D.b":         "4000000",
      })
    );
    expect(r.classification).toBe("importante");
    // step E deve citar o artigo de exceção para telecom pequena
    const sE = r.steps.find(s => s.nodeId === "E")!;
    expect(sE.label).toContain("telecom de pequena/micro dimensão");
    expect(sE.article).toBe("Art. 3.º/2 a) i) do RJC; Art. 6.º/2 do RJC"); // antes: "Art. 3.º/2 a) i) DL 125/2025" — base de categoria (6.º/2) acrescentada
  });

  it("telecom média dimensão → essencial", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "telecom",
        "C.estrutura": "autonoma",
        "D.n":         "80",
        "D.vn":        "15000000",
        "D.b":         "12000000",
      })
    );
    expect(r.classification).toBe("essencial");
  });

  it("TLD/DNS/confiança qualificada → essencial independentemente da dimensão (micro)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "tld_dns_confianca",
        "C.estrutura": "autonoma",
        "D.n":         "5",
        "D.vn":        "1000000",
        "D.b":         "500000",
      })
    );
    expect(r.classification).toBe("essencial");
  });

  it("[obrigatório] grupo >50 % soma 20 trabalhadores, ultrapassa 250 → grande → essencial", () => {
    // Própria: 240. Grupo (>50 %): +20. Total: 260 ≥ 250 → grande
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":      "energia",
        "C.estrutura":  "associada_total",
        "D.n":          "240",
        "D.vn":         "45000000",
        "D.b":          "38000000",
        "D.grupo_n":    "20",
        "D.grupo_vn":   "8000000",
        "D.grupo_b":    "5000000",
      })
    );
    expect(r.classification).toBe("essencial");
    expect(r.path).toEqual(["A", "C", "D", "E"]);
    expect(r.legalBasis).toContain("Rec. 2003/361/CE");
    expect(r.legalBasis).toContain("Anexo III DL 125/2025");
    expect(r.legalBasis).toContain("Art. 6.º do RJC"); // antes: "Art. 6.º DL 125/2025"
    // step C mostra "subsidiária/associada"; step D mostra valores agregados do grupo
    const sC = r.steps.find(s => s.nodeId === "C")!;
    expect(sC.label).toContain("subsidiária/associada");
    expect(sC.article).toBe("Art. 3.º/4 do anexo à Rec. 2003/361/CE"); // v4: cita opção, não nó
    const sD = r.steps.find(s => s.nodeId === "D")!;
    expect(sD.label).toContain("valores agregados do grupo");
    expect(sD.label).toContain("trabalhadores: 260");

    // Confirma que sem o grupo (240 < 250, VN=45M≤50M) seria apenas média → importante
    const semGrupo = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "energia",
        "C.estrutura": "autonoma",
        "D.n":         "240",
        "D.vn":        "45000000",
        "D.b":         "38000000",
      })
    );
    expect(semGrupo.classification).toBe("importante");
    expect(semGrupo.path).toEqual(["A", "C", "D", "E"]);
    expect(semGrupo.legalBasis).toContain("Art. 6.º do RJC"); // antes: "Art. 6.º DL 125/2025"
  });

  it("Anexo II média dimensão → importante", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "quimicos_alimentar",
        "C.estrutura": "autonoma",
        "D.n":         "60",
        "D.vn":        "15000000",
        "D.b":         "12000000",
      })
    );
    expect(r.classification).toBe("importante");
  });
});

// ── Dimensão — thresholds e casos especiais ───────────────────────────────────
// D.vn/D.b em EUROS (ENGINE_VERSION 7+): limiares do Anexo III/Rec. 2003/361/CE
// são 50.000.000€/43.000.000€ (grande) e 10.000.000€/10.000.000€ (média).

describe("Dimensão — thresholds e casos de fronteira", () => {
  it("N=50 exato → média (threshold inclusivo)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "energia", "C.estrutura": "autonoma", "D.n": "50", "D.vn": "5000000", "D.b": "4000000" })
    );
    expect(r.classification).toBe("importante"); // Anexo I média
  });

  it("N=49 com VN=12.000.000€ e B=8.000.000€ → pequena (B≤10M€ impede média por VN+B)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "energia", "C.estrutura": "autonoma", "D.n": "49", "D.vn": "12000000", "D.b": "8000000" })
    );
    // N<50 AND NOT(VN>10M€ AND B>10M€) porque B=8M€≤10M€ → pequena
    expect(r.classification).toBe("fora_condicional");
  });

  it("balanço desconhecido com VN>10.000.000€ → a_confirmar (o balanço decide entre pequena e média)", () => {
    // N=10, VN=12M€, B omitido → dim(B=0)=pequena, dim(B=∞)=média → dims diferem → a_confirmar.
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "saude", "C.estrutura": "autonoma", "D.n": "10", "D.vn": "12000000" })
    );
    expect(r.classification).toBe("a_confirmar");
  });

  it("balanço desconhecido com VN≤10.000.000€ → fora_condicional (VN decide sozinho, balanço irrelevante)", () => {
    // N=30, VN=8M€, B omitido → dim(B=0)=pequena, dim(B=∞)=pequena → dims iguais → fora_condicional.
    // VN=8M€≤10M€ faz (VN>10M€ AND B>10M€) falhar para qualquer B — o balanço não muda a decisão.
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "8000000" })
    );
    expect(r.classification).toBe("fora_condicional");
    expect(r.classification).not.toBe("a_confirmar");
  });

  it("estrutura parceira → resultado sempre condicional", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "saude",
        "C.estrutura": "parceira",
        "D.n":         "80",
        "D.vn":        "18000000",
        "D.b":         "14000000",
      })
    );
    expect(r.classification).toBe("importante"); // Anexo I média
    expect(r.resultLabel).toMatch(/Provável/);
  });

  // ── Cálculo em gémeo — tabela de regressão ENGINE_VERSION "7" (valores em euros) ────────────

  it("[EQ8-T1] N=30, VN=8.000.000€, B=desconhecido → fora_condicional (VN≤10M€, balanço irrelevante)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "8000000" })
    );
    expect(r.classification).toBe("fora_condicional");
  });

  it("[EQ8-T2] N=30, VN=8.000.000€, B=5.000.000€ → fora_condicional (B conhecido, pequena determinística)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "8000000", "D.b": "5000000" })
    );
    expect(r.classification).toBe("fora_condicional");
  });

  it("[EQ8-T3] N=30, VN=12.000.000€, B=desconhecido → a_confirmar (balanço decide entre pequena e média)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "12000000" })
    );
    expect(r.classification).toBe("a_confirmar");
  });

  it("[EQ8-T4] N=30, VN=12.000.000€, B=8.000.000€ → fora_condicional (B≤10M€ torna pequena determinística)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "12000000", "D.b": "8000000" })
    );
    expect(r.classification).toBe("fora_condicional");
  });

  it("[EQ8-T5] N=30, VN=12.000.000€, B=15.000.000€ → dentro do âmbito (B>10M€ → média → importante)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "12000000", "D.b": "15000000" })
    );
    expect(r.classification).toBe("importante");
  });

  it("[EQ8-T6] N=60, VN=2.000.000€, B=desconhecido → dentro do âmbito (N≥50 basta, balanço irrelevante)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "60", "D.vn": "2000000" })
    );
    expect(r.classification).toBe("importante"); // Anexo II, média (N≥50)
  });

  it("[EQ8-T7] N=200, VN=60.000.000€, B=desconhecido → a_confirmar (balanço decide entre média e grande)", () => {
    // calcDim(B=0)=média (N<250, VN>50M€ mas B=0 não passa >43M€)
    // calcDim(B=∞)=grande (VN=60M€>50M€ E ∞>43M€)
    // dims diferem → o balanço é decisivo → a_confirmar
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "energia", "C.estrutura": "autonoma", "D.n": "200", "D.vn": "60000000" })
    );
    expect(r.classification).toBe("a_confirmar");
  });

  // ── Regressão do incidente que motivou a mudança de unidade (M€ → €) ───────

  it("[REGRESSÃO] micro-empresa com VN=15.000€ NÃO é classificada como grande/essencial", () => {
    // Incidente: utilizador escreveu 15000 a pensar €15.000; com o motor em M€ isso
    // era lido como 15.000 M€ (quinze mil milhões) → "grande"/essencial, errado.
    // Em euros, 2 trabalhadores + €15.000 de VN é claramente micro/pequena.
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "2", "D.vn": "15000", "D.b": "5000" })
    );
    expect(r.classification).not.toBe("essencial");
    expect(r.classification).toBe("fora_condicional");
  });

  it("[REGRESSÃO] média empresa com VN=12.000.000€ (60 trab.) → importante", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "60", "D.vn": "12000000", "D.b": "11000000" })
    );
    expect(r.classification).toBe("importante");
  });

  it("[REGRESSÃO] grande empresa com VN=60.000.000€ (300 trab.) → essencial (setor Anexo I)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "energia", "C.estrutura": "autonoma", "D.n": "300", "D.vn": "60000000", "D.b": "50000000" })
    );
    expect(r.classification).toBe("essencial");
  });
});
