import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  NIS2_PT_TREE,
  evaluateTree,
  type Answers,
  type TrailStep,
} from "./decision-engine";

// Helpers
const A = (overrides: Answers): Answers => overrides;

// Respostas base para entidade em setor com dimensão definida
const BASE_ENERGIA_GRANDE: Answers = {
  "A.setor":      "energia",
  "C.estrutura":  "autonoma",
  "D.n":          "300",
  "D.vn":         "60",
  "D.b":          "50",
};

const BASE_ENERGIA_MEDIA: Answers = {
  "A.setor":      "energia",
  "C.estrutura":  "autonoma",
  "D.n":          "100",
  "D.vn":         "20",
  "D.b":          "15",
};

// ── Constantes ────────────────────────────────────────────────────────────────

describe("ENGINE_VERSION", () => {
  it("é '3' (v3 — cálculo em gémeo: a_confirmar só quando balanço é decisivo)", () => {
    expect(ENGINE_VERSION).toBe("3");
  });
});

// ── Nó A — Setor ─────────────────────────────────────────────────────────────

describe("Nó A — Setor", () => {
  it("administração pública → fora_mvp", () => {
    const r = evaluateTree(NIS2_PT_TREE, A({ "A.setor": "admin_publica" }));
    expect(r.classification).toBe("fora_mvp");
    expect(r.path).toEqual(["A"]);
    expect(r.legalBasis).toContain("Art. 14.º DL 125/2025");
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
    expect(r.legalBasis).toContain("Art. 3.º/2 DL 125/2025");
    // steps: A + B + E (nó virtual de resultado)
    expect(r.steps).toHaveLength(3);
    const [sA, sB, sE] = r.steps as [TrailStep, TrailStep, TrailStep];
    expect(sA.nodeId).toBe("A");
    expect(sA.label).toContain("Outro setor");
    expect(sA.article).toBe("Art. 2.º DL 125/2025");
    expect(sB.nodeId).toBe("B");
    expect(sB.label).toContain("único fornecedor");
    expect(sB.article).toBe("Art. 3.º/2 a) DL 125/2025");
    expect(sE.nodeId).toBe("E");
    expect(sE.label).toContain("a confirmar");
    expect(sE.article).toBe("Art. 3.º/2 a) DL 125/2025");
  });

  it("fornecedor de entidade abrangida → a_confirmar_contratual", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "outro", "B.excecao": "fornecedor" })
    );
    expect(r.classification).toBe("a_confirmar_contratual");
    expect(r.path).toEqual(["A", "B"]);
  });

  it("nenhuma exceção → fora_condicional", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "outro", "B.excecao": "nenhum" })
    );
    expect(r.classification).toBe("fora_condicional");
  });
});

// ── Nó E — Classificação ─────────────────────────────────────────────────────

describe("Nó E — Classificação por setor e dimensão", () => {
  it("[obrigatório] Anexo I grande dimensão → essencial", () => {
    const r = evaluateTree(NIS2_PT_TREE, BASE_ENERGIA_GRANDE);
    expect(r.classification).toBe("essencial");
    expect(r.path).toEqual(["A", "C", "D", "E"]);
    expect(r.legalBasis).toContain("Art. 6.º DL 125/2025");
    // steps: A + C + D + E
    expect(r.steps).toHaveLength(4);
    const [sA, sC, sD, sE] = r.steps as [TrailStep, TrailStep, TrailStep, TrailStep];
    expect(sA).toEqual({ nodeId: "A", label: "Setor: Energia (eletricidade, gás, petróleo, hidrogénio, aquecimento/arrefecimento)", article: "Anexo I, ponto 1" });
    expect(sC).toEqual({ nodeId: "C", label: "Grupo: empresa autónoma (sem controlo externo significativo)", article: "Rec. 2003/361/CE; Art. 3.º/1 DL 125/2025" });
    expect(sD).toEqual({ nodeId: "D", label: "Dimensão: grande (trabalhadores: 300, VN: 60 M€, balanço: 50 M€)", article: "Anexo III DL 125/2025; Rec. 2003/361/CE" });
    expect(sE).toEqual({ nodeId: "E", label: "Resultado: entidade essencial — Anexo I, grande dimensão", article: "Art. 6.º/1 a) DL 125/2025" });
  });

  it("[obrigatório] Anexo I média dimensão → importante", () => {
    const r = evaluateTree(NIS2_PT_TREE, BASE_ENERGIA_MEDIA);
    expect(r.classification).toBe("importante");
    expect(r.path).toEqual(["A", "C", "D", "E"]);
  });

  it("[obrigatório] caso-limite: N=30, VN=12M, B=8M → pequena → fora_condicional", () => {
    // N<50; VN=12>10 MAS B=8≤10 → NÃO satisfaz (VN>10 E B>10) → pequena
    // B=8 é CONHECIDO → condicional=false → fora_condicional (não a_confirmar)
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "industria",
        "C.estrutura": "autonoma",
        "D.n":         "30",
        "D.vn":        "12",
        "D.b":         "8",
      })
    );
    expect(r.classification).toBe("fora_condicional");
    expect(r.path).toEqual(["A", "C", "D", "E"]);
    expect(r.legalBasis).toContain("Art. 2.º DL 125/2025");
    expect(r.legalBasis).toContain("Anexo III DL 125/2025");
    expect(r.legalBasis).toContain("Art. 6.º DL 125/2025");
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
        "D.vn":        "5",
        "D.b":         "4",
      })
    );
    expect(r.classification).toBe("importante");
    // step E deve citar o artigo de exceção para telecom pequena
    const sE = r.steps.find(s => s.nodeId === "E")!;
    expect(sE.label).toContain("telecom de pequena/micro dimensão");
    expect(sE.article).toBe("Art. 3.º/2 a) i) DL 125/2025");
  });

  it("telecom média dimensão → essencial", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "telecom",
        "C.estrutura": "autonoma",
        "D.n":         "80",
        "D.vn":        "15",
        "D.b":         "12",
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
        "D.vn":        "1",
        "D.b":         "0.5",
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
        "D.vn":         "45",
        "D.b":          "38",
        "D.grupo_n":    "20",
        "D.grupo_vn":   "8",
        "D.grupo_b":    "5",
      })
    );
    expect(r.classification).toBe("essencial");
    expect(r.path).toEqual(["A", "C", "D", "E"]);
    expect(r.legalBasis).toContain("Rec. 2003/361/CE");
    expect(r.legalBasis).toContain("Anexo III DL 125/2025");
    expect(r.legalBasis).toContain("Art. 6.º DL 125/2025");
    // step C mostra "subsidiária/associada"; step D mostra valores agregados do grupo
    const sC = r.steps.find(s => s.nodeId === "C")!;
    expect(sC.label).toContain("subsidiária/associada");
    const sD = r.steps.find(s => s.nodeId === "D")!;
    expect(sD.label).toContain("valores agregados do grupo");
    expect(sD.label).toContain("trabalhadores: 260");

    // Confirma que sem o grupo (240 < 250, VN=45≤50) seria apenas média → importante
    const semGrupo = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "energia",
        "C.estrutura": "autonoma",
        "D.n":         "240",
        "D.vn":        "45",
        "D.b":         "38",
      })
    );
    expect(semGrupo.classification).toBe("importante");
    expect(semGrupo.path).toEqual(["A", "C", "D", "E"]);
    expect(semGrupo.legalBasis).toContain("Art. 6.º DL 125/2025");
  });

  it("Anexo II média dimensão → importante", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({
        "A.setor":     "quimicos_alimentar",
        "C.estrutura": "autonoma",
        "D.n":         "60",
        "D.vn":        "15",
        "D.b":         "12",
      })
    );
    expect(r.classification).toBe("importante");
  });
});

// ── Dimensão — thresholds e casos especiais ───────────────────────────────────

describe("Dimensão — thresholds e casos de fronteira", () => {
  it("N=50 exato → média (threshold inclusivo)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "energia", "C.estrutura": "autonoma", "D.n": "50", "D.vn": "5", "D.b": "4" })
    );
    expect(r.classification).toBe("importante"); // Anexo I média
  });

  it("N=49 com VN=12 e B=8 → pequena (B≤10 impede média por VN+B)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "energia", "C.estrutura": "autonoma", "D.n": "49", "D.vn": "12", "D.b": "8" })
    );
    // N<50 AND NOT(VN>10 AND B>10) porque B=8≤10 → pequena
    expect(r.classification).toBe("fora_condicional");
  });

  it("balanço desconhecido com VN>10 → a_confirmar (o balanço decide entre pequena e média)", () => {
    // CORRIGIDO: N=10, VN=12, B omitido → dim(B=0)=pequena, dim(B=∞)=média → dims diferem → a_confirmar.
    // Antes codificava comportamento errado: assumia B=∞ → média → "Provável importante".
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "saude", "C.estrutura": "autonoma", "D.n": "10", "D.vn": "12" })
    );
    expect(r.classification).toBe("a_confirmar");
  });

  it("balanço desconhecido com VN≤10 → fora_condicional (VN decide sozinho, balanço irrelevante)", () => {
    // CORRIGIDO: N=30, VN=8, B omitido → dim(B=0)=pequena, dim(B=∞)=pequena → dims iguais → fora_condicional.
    // VN=8≤10 faz (VN>10 AND B>10) falhar para qualquer B — o balanço não muda a decisão.
    // Antes codificava comportamento errado: piccola+condicional→a_confirmar (incerteza falsa).
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "8" })
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
        "D.vn":        "18",
        "D.b":         "14",
      })
    );
    expect(r.classification).toBe("importante"); // Anexo I média
    expect(r.resultLabel).toMatch(/Provável/);
  });

  // ── Cálculo em gémeo — tabela de regressão ENGINE_VERSION "3" ────────────

  it("[EQ8-T1] N=30, VN=8, B=desconhecido → fora_condicional (VN≤10, balanço irrelevante)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "8" })
    );
    expect(r.classification).toBe("fora_condicional");
  });

  it("[EQ8-T2] N=30, VN=8, B=5 → fora_condicional (B conhecido, pequena determinística)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "8", "D.b": "5" })
    );
    expect(r.classification).toBe("fora_condicional");
  });

  it("[EQ8-T3] N=30, VN=12, B=desconhecido → a_confirmar (balanço decide entre pequena e média)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "12" })
    );
    expect(r.classification).toBe("a_confirmar");
  });

  it("[EQ8-T4] N=30, VN=12, B=8 → fora_condicional (B≤10 torna pequena determinística)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "12", "D.b": "8" })
    );
    expect(r.classification).toBe("fora_condicional");
  });

  it("[EQ8-T5] N=30, VN=12, B=15 → dentro do âmbito (B>10 → média → importante)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "12", "D.b": "15" })
    );
    expect(r.classification).toBe("importante");
  });

  it("[EQ8-T6] N=60, VN=2, B=desconhecido → dentro do âmbito (N≥50 basta, balanço irrelevante)", () => {
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "60", "D.vn": "2" })
    );
    expect(r.classification).toBe("importante"); // Anexo II, média (N≥50)
  });

  it("[EQ8-T7] N=200, VN=60, B=desconhecido → a_confirmar (balanço decide entre média e grande)", () => {
    // calcDim(B=0)=média (N<250, VN>50 mas B=0 não passa >43)
    // calcDim(B=∞)=grande (VN=60>50 E ∞>43)
    // dims diferem → o balanço é decisivo → a_confirmar
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "energia", "C.estrutura": "autonoma", "D.n": "200", "D.vn": "60" })
    );
    expect(r.classification).toBe("a_confirmar");
  });
});
