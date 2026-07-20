import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  NIS2_PT_TREE,
  evaluateTree,
  type Answers,
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
  it("versão inicial é '1'", () => {
    expect(ENGINE_VERSION).toBe("1");
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

  it("balanço desconhecido → assume B=VN → pode elevar para média (resultado condicional)", () => {
    // N=10, VN=12, B omitido → B assume 12 → (12>10 AND 12>10) → média → importante (saude = Anexo I)
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "saude", "C.estrutura": "autonoma", "D.n": "10", "D.vn": "12" })
    );
    expect(r.classification).toBe("importante");
    expect(r.resultLabel).toMatch(/Provável/);
  });

  it("balanço desconhecido não gera falso 'fora' — N=30, VN=8, B omitido → a_confirmar", () => {
    // Fix 1: B=VN=8 era errado — (8>10 && 8>10)=false → piccola → fora (falso negativo)
    // Fix 1 (B=Infinity) sozinho não resolve: (8>10 && Infinity>10)=false, VN é o fator restritivo
    // Fix 2 (piccola+condicional→a_confirmar) é o que evita o falso "fora"
    const r = evaluateTree(
      NIS2_PT_TREE,
      A({ "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "30", "D.vn": "8" })
    );
    expect(r.classification).not.toBe("fora_condicional");
    expect(r.classification).toBe("a_confirmar");
    expect(r.resultLabel).toMatch(/confirmar/);
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
});
