/**
 * backend/services/document-generator.test.ts
 *
 * C14b: guard de template, CONTENT_TYPES, Buffer base64
 * C15: aggregateRiskGroups (puro), riskSummary vs. NVD, fallbacks,
 *      probability/impact, fórmulas H/I intocadas, excedente 30 linhas
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { ENGINE_VERSION } from "../utils/decision-engine";
import { NIS2_CONTROLS, calculateScores } from "./ai-questionnaire";

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted antes de qualquer import)
// ---------------------------------------------------------------------------

// Tracking state de escritas de células — reset em afterEach
let _cellWrites:       Map<string, any>    = new Map();
let _headerWrites:     Map<string, any>    = new Map();
let _calcProps:        Record<string, any> = {};
let _psiRenderArgs:    Record<string, any> | null = null;
let _eachSheetCalled:  number = 0;
let _painelCellWrites: Map<string, any>    = new Map();

// Valores iniciais de fórmula do Painel de Controlo (simulam o que o template tem).
// preFillPainel lê cell.value para obter a formula antes de escrever {formula, result}.
const PAINEL_INITIAL: Record<string, any> = {
  C5:  { formula: "COUNTA('🎯 REGISTO DE RISCOS'!C8:C40)" },
  C6:  { formula: "COUNTIF('🎯 REGISTO DE RISCOS'!H8:H40,\">=\"&17)" },
  C7:  { formula: "COUNTIFS('🎯 REGISTO DE RISCOS'!H8:H40,\">=\"&10,'🎯 REGISTO DE RISCOS'!H8:H40,\"<\"&17)" },
  C8:  { formula: "COUNTIFS('🎯 REGISTO DE RISCOS'!H8:H40,\">=\"&5,'🎯 REGISTO DE RISCOS'!H8:H40,\"<\"&10)" },
  C9:  { formula: "COUNTIFS('🎯 REGISTO DE RISCOS'!H8:H40,\">=\"&1,'🎯 REGISTO DE RISCOS'!H8:H40,\"<\"&5)" },
  C12: { formula: "COUNTIF('🎯 REGISTO DE RISCOS'!L8:L40,\"Em curso\")" },
  C13: { formula: "COUNTIF('🎯 REGISTO DE RISCOS'!L8:L40,\"Concluído\")" },
  C14: { formula: "COUNTIF('🎯 REGISTO DE RISCOS'!L8:L40,\"Transferir (Seguro)\")" },
};

vi.mock("exceljs", () => {
  const makeRow = (rowNum: number) => ({
    getCell: vi.fn((col: number) => {
      const cell = { value: undefined as any };
      Object.defineProperty(cell, "value", {
        get: () => _cellWrites.get(`${rowNum}:${col}`),
        set: (v: any) => { _cellWrites.set(`${rowNum}:${col}`, v); },
        enumerable: true,
        configurable: true,
      });
      return cell;
    }),
    commit: vi.fn(),
  });
  const makeSheet = () => ({
    getCell: vi.fn((addr: string) => {
      const cell = { value: undefined as any };
      Object.defineProperty(cell, "value", {
        get: () => _headerWrites.get(addr),
        set: (v: any) => { _headerWrites.set(addr, v); },
        enumerable: true,
        configurable: true,
      });
      return cell;
    }),
    getRow: vi.fn((rowNum: number) => makeRow(rowNum)),
    mergeCells: vi.fn(),
  });
  const makePainelSheet = () => ({
    getCell: vi.fn((addr: string) => {
      const cell = { value: undefined as any };
      Object.defineProperty(cell, "value", {
        get: () => _painelCellWrites.has(addr)
          ? _painelCellWrites.get(addr)
          : PAINEL_INITIAL[addr],
        set: (v: any) => { _painelCellWrites.set(addr, v); },
        enumerable: true,
        configurable: true,
      });
      return cell;
    }),
    getRow: vi.fn(),
  });
  return {
    default: {
      Workbook: class MockWorkbook {
        calcProperties = _calcProps;
        xlsx = {
          readFile: vi.fn().mockResolvedValue(undefined),
          writeBuffer: vi.fn().mockResolvedValue(Buffer.from("DUMMY_XLSX")),
        };
        getWorksheet = vi.fn((name: string) =>
          name === "📈 PAINEL DE CONTROLO" ? makePainelSheet() : makeSheet()
        );
        eachSheet    = vi.fn(() => { _eachSheetCalled++; });
      },
    },
  };
});

vi.mock("pizzip", () => ({
  default: class MockPizZip {
    generate = vi.fn().mockReturnValue(Buffer.from("DUMMY_DOCX"));
  },
}));

vi.mock("docxtemplater", () => ({
  default: class MockDocxtemplater {
    render = vi.fn((data: any) => { _psiRenderArgs = data; });
    getZip = vi.fn().mockReturnValue({
      generate: vi.fn().mockReturnValue(Buffer.from("DUMMY_DOCX")),
    });
  },
}));

vi.mock("../db", () => ({
  getScanById:                         vi.fn(),
  getOrganizationById:                 vi.fn(),
  getVulnerabilitiesByScanId:          vi.fn(),
  getFrameworkAssessmentById:          vi.fn(),
  getLatestFrameworkAssessmentByOrgId: vi.fn(),
  getLatestCompletedQuestionnaireForOrg: vi.fn(),
  getQuestionnaireSessionById:         vi.fn(),
  getLatestCompletedScanForOrg:        vi.fn(),
}));

vi.mock("./ai-remediation", () => ({
  lookupLibrary: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports reais (após mocks registados)
// ---------------------------------------------------------------------------

import {
  generateRegistoRiscos,
  generateInventarioAtivos,
  generatePsi,
  generateCartaCiso,
  generateRegistoCncs,
  generateIrp,
  generateRelatorioGestao,
  generateTracker10Medidas,
  generateDeclaracaoMfa,
  generatePatchTracker,
  generateRelatorioEnquadramento,
  generateDossier,
  isProfileComplete,
  getMissingProfileFields,
  aggregateRiskGroups,
  preFillPainel,
  CONTENT_TYPES,
  TEMPLATE_PATHS,
} from "./document-generator";
import * as db             from "../db";
import * as aiRemediation  from "./ai-remediation";

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

const FAKE_SCAN = {
  id: 1,
  organizationId: 1,
  status: "completed",
  createdAt: new Date("2024-06-01"),
  results: { vulnerabilities: [] },
} as any;

const FAKE_ORG = { id: 1, name: "Empresa Teste Lda" } as any;

const FAKE_VULN = (
  cveId: string,
  severity: string,
  cvssScore: number,
  affectedComponent: string
) => ({
  cveId,
  severity,
  cvssScore: String(cvssScore),
  description: "desc",
  affectedComponent,
});

// ---------------------------------------------------------------------------
// afterEach
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  _cellWrites       = new Map();
  _headerWrites     = new Map();
  _calcProps        = {};
  _psiRenderArgs    = null;
  _eachSheetCalled  = 0;
  _painelCellWrites = new Map();
});

// ===========================================================================
// C14b — guard de template
// ===========================================================================

describe("document-generator — guard de template em falta", () => {
  it("generateRegistoRiscos lança erro claro com nome do ficheiro xlsx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateRegistoRiscos(1, 1)).rejects.toThrow(
      "[Documentos] Template não encontrado: registo-riscos.xlsx"
    );
  });

  it("generateInventarioAtivos lança erro claro com nome do ficheiro xlsx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateInventarioAtivos(1, 1)).rejects.toThrow(
      "[Documentos] Template não encontrado: inventario-ativos.xlsx"
    );
  });

  it("generatePsi lança erro claro com nome do ficheiro docx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generatePsi(1)).rejects.toThrow(
      "[Documentos] Template não encontrado: psi-template.docx"
    );
  });

  it("generateCartaCiso lança erro claro com nome do ficheiro docx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateCartaCiso(1)).rejects.toThrow(
      "[Documentos] Template não encontrado: carta-ciso-template.docx"
    );
  });

  it("generateRegistoCncs lança erro claro com nome do ficheiro docx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateRegistoCncs(1)).rejects.toThrow(
      "[Documentos] Template não encontrado: registo-cncs-template.docx"
    );
  });

  it("generateIrp lança erro claro com nome do ficheiro docx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateIrp(1)).rejects.toThrow(
      "[Documentos] Template não encontrado: irp-template.docx"
    );
  });

  it("generateRelatorioGestao lança erro claro com nome do ficheiro docx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateRelatorioGestao(1, 1)).rejects.toThrow(
      "[Documentos] Template não encontrado: registo-gestao-template.docx"
    );
  });
});

// ===========================================================================
// C14b — CONTENT_TYPES
// ===========================================================================

describe("document-generator — CONTENT_TYPES", () => {
  it("xlsx mime type correcto para Excel Open XML", () => {
    expect(CONTENT_TYPES.xlsx).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("docx mime type correcto para Word Open XML", () => {
    expect(CONTENT_TYPES.docx).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });
});

// ===========================================================================
// C14b — Buffer base64 com template dummy
// ===========================================================================

describe("document-generator — Buffer base64 com template dummy", () => {
  it("generateRegistoRiscos devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(FAKE_SCAN);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    const buf = await generateRegistoRiscos(1, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString("base64")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("generateInventarioAtivos devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(FAKE_SCAN);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    const buf = await generateInventarioAtivos(1, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("generatePsi devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    const buf = await generatePsi(1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("generateCartaCiso devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    const buf = await generateCartaCiso(1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("generateRegistoCncs devolve Buffer não vazio (com assessment válido)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion: ENGINE_VERSION,
      classification: "importante",
      answers: { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12000000", "D.b": "5000000" },
    } as any);
    const buf = await generateRegistoCncs(1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("generateIrp devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    const buf = await generateIrp(1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("generateRelatorioGestao devolve Buffer não vazio (com as 3 fontes válidas)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue({
      id: 1, articleScores: {}, completedAt: new Date("2026-07-01"),
    } as any);
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue({
      id: 1, organizationId: 1, userId: 1, sector: null, status: "completed",
      score: "72", articleScores: { a: 100 },
      answers: [{ controlId: "a-1", answer: "yes", score: 100 }],
      completedAt: new Date("2026-07-01"), createdAt: new Date(), updatedAt: new Date(),
    } as any);
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion: ENGINE_VERSION, classification: "importante",
      answers: { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12000000", "D.b": "5000000" },
    } as any);
    vi.mocked(db.getScanById).mockResolvedValue({
      id: 1, organizationId: 1, status: "completed", completedAt: new Date("2026-07-15"),
      results: { criticalCount: 1, highCount: 2, mediumCount: 3, lowCount: 4 },
    } as any);

    const buf = await generateRelatorioGestao(1, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// C15 — aggregateRiskGroups (função pura — sem mocks)
// ===========================================================================

describe("aggregateRiskGroups — agregação e ordenação", () => {
  it("agrupa vulns com mesmo componente e severidade numa única linha", () => {
    const vulns = [
      FAKE_VULN("CVE-2021-1", "high", 7.5, "apache"),
      FAKE_VULN("CVE-2021-2", "high", 6.8, "apache"),
    ];
    const { rows } = aggregateRiskGroups(vulns);
    expect(rows).toHaveLength(1);
    expect(rows[0].affectedComponent).toBe("apache");
    expect(rows[0].vulnCount).toBe(2);
  });

  it("componentes distintos geram linhas separadas mesmo com mesma severidade", () => {
    const vulns = [
      FAKE_VULN("CVE-2021-1", "high", 7.5, "apache"),
      FAKE_VULN("CVE-2021-2", "high", 7.5, "nginx"),
    ];
    const { rows } = aggregateRiskGroups(vulns);
    expect(rows).toHaveLength(2);
  });

  it("ordena critical antes de high antes de medium antes de low", () => {
    const vulns = [
      FAKE_VULN("CVE-A", "low",      2.0, "comp-low"),
      FAKE_VULN("CVE-B", "medium",   5.0, "comp-med"),
      FAKE_VULN("CVE-C", "critical", 9.8, "comp-crit"),
      FAKE_VULN("CVE-D", "high",     7.5, "comp-high"),
    ];
    const { rows } = aggregateRiskGroups(vulns);
    expect(rows.map((r) => r.severity)).toEqual(["critical", "high", "medium", "low"]);
  });

  it("dentro da mesma severidade ordena por CVSS máximo decrescente", () => {
    const vulns = [
      FAKE_VULN("CVE-A", "high", 6.0, "comp-baixo"),
      FAKE_VULN("CVE-B", "high", 9.0, "comp-alto"),
    ];
    const { rows } = aggregateRiskGroups(vulns);
    expect(rows[0].affectedComponent).toBe("comp-alto");
    expect(rows[1].affectedComponent).toBe("comp-baixo");
  });

  it("overflow = 0 quando <= maxRows", () => {
    const vulns = [FAKE_VULN("CVE-1", "high", 7.0, "comp")];
    const { overflow } = aggregateRiskGroups(vulns, 30);
    expect(overflow).toBe(0);
  });

  it("overflow correcto quando > maxRows", () => {
    const vulns = Array.from({ length: 35 }, (_, i) =>
      FAKE_VULN(`CVE-${i}`, "high", 7.0, `comp-${i}`)
    );
    const { rows, overflow } = aggregateRiskGroups(vulns, 30);
    expect(rows).toHaveLength(30);
    expect(overflow).toBe(5);
  });

  it("filtra vulns sem cveId ou sem description (não elegíveis)", () => {
    const vulns = [
      { cveId: "", severity: "high", cvssScore: "7.5", description: "desc", affectedComponent: "comp" },
      { cveId: "CVE-1", severity: "high", cvssScore: "7.5", description: "", affectedComponent: "comp" },
      FAKE_VULN("CVE-2", "high", 7.5, "comp"),
    ];
    const { rows } = aggregateRiskGroups(vulns);
    expect(rows).toHaveLength(1);
  });
});

describe("aggregateRiskGroups — prob e impact", () => {
  it("critical → prob=5, impact=ceil(9.8/2)=5", () => {
    const { rows } = aggregateRiskGroups([FAKE_VULN("CVE-X", "critical", 9.8, "comp")]);
    expect(rows[0].prob).toBe(5);
    expect(rows[0].impact).toBe(5);
  });

  it("high → prob=4, CVSS 7.5 → impact=4", () => {
    const { rows } = aggregateRiskGroups([FAKE_VULN("CVE-X", "high", 7.5, "comp")]);
    expect(rows[0].prob).toBe(4);
    expect(rows[0].impact).toBe(4);
  });

  it("medium → prob=3, CVSS 5.0 → impact=3", () => {
    const { rows } = aggregateRiskGroups([FAKE_VULN("CVE-X", "medium", 5.0, "comp")]);
    expect(rows[0].prob).toBe(3);
    expect(rows[0].impact).toBe(3);
  });

  it("low → prob=2, CVSS 2.0 → impact=1", () => {
    const { rows } = aggregateRiskGroups([FAKE_VULN("CVE-X", "low", 2.0, "comp")]);
    expect(rows[0].prob).toBe(2);
    expect(rows[0].impact).toBe(1);
  });

  it("impact clampado a máx 5 para CVSS=10", () => {
    const { rows } = aggregateRiskGroups([FAKE_VULN("CVE-X", "critical", 10.0, "comp")]);
    expect(rows[0].impact).toBe(5);
  });

  it("impact clampado a mín 1 para CVSS=0", () => {
    const { rows } = aggregateRiskGroups([FAKE_VULN("CVE-X", "low", 0, "comp")]);
    expect(rows[0].impact).toBe(1);
  });
});

// ===========================================================================
// C15 — generateRegistoRiscos: riskSummary vs. NVD, fallbacks, col mapping
// ===========================================================================

describe("generateRegistoRiscos — riskSummary da biblioteca (C15)", () => {
  const VULN = FAKE_VULN("CVE-2021-44228", "critical", 10.0, "Log4j");

  beforeScan: {
    // noop — setup inside each test
  }

  it("usa riskSummary da biblioteca (nunca a description NVD)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue({
      riskSummary: "Execução de código remoto via Log4j em produção",
      steps: [{ order: 1, instruction: "Atualizar Log4j para 2.17.1 ou superior", platform: "generic" }],
    } as any);

    await generateRegistoRiscos(1, 1);

    // C (col 3) da linha 8 deve ter o riskSummary
    expect(_cellWrites.get("8:3")).toBe("Execução de código remoto via Log4j em produção");
    // NÃO deve ser a description NVD (que estaria em inglês)
    expect(_cellWrites.get("8:3")).not.toContain("desc");
  });

  it("fallback quando biblioteca não tem entrada para o CVE", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    expect(_cellWrites.get("8:3")).toBe(
      "[Vulnerabilidade CVE-2021-44228 detetada — ver relatório técnico]"
    );
  });

  it("medida de tratamento contém 'plano de remediação IA' e nome do componente", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue({
      riskSummary: "Risco de execução remota",
      effort: "high",
      steps: [{ order: 1, instruction: "apt-get update && apt-get upgrade", platform: "generic" }],
    } as any);

    await generateRegistoRiscos(1, 1);

    const treatment = _cellWrites.get("8:10") as string;
    expect(treatment).toContain("plano de remediação IA");
    expect(treatment).toContain("Log4j");          // affectedComponent do VULN
    expect(treatment).toContain("alto");            // effort "high" → PT "alto"
    expect(treatment).not.toContain("apt-get");     // nunca o passo diagnóstico
  });

  it("medida de tratamento inclui esforço traduzido (low→baixo, medium→médio)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [FAKE_VULN("CVE-2021-1", "medium", 5.0, "nginx")] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue({
      riskSummary: "Risco médio",
      effort: "low",
      steps: [],
    } as any);

    await generateRegistoRiscos(1, 1);

    expect(_cellWrites.get("8:10")).toContain("baixo");
  });

  it("fallback de tratamento quando sem biblioteca", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    const treatment = _cellWrites.get("8:10") as string;
    expect(treatment).toContain("plano de remediação IA");
    expect(treatment).not.toContain("apt-get");
  });

  it("origem (col 13) = Scan #<scanId>", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(42, 1);

    expect(_cellWrites.get("8:13")).toBe("Scan #42");
  });

  it("estado (col 12) e responsável (col 11) escritos como null (explicitamente vazios)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    // escritos como null explícito para evitar serialização "None" pelo ExcelJS
    expect(_cellWrites.get("8:11")).toBeNull(); // K: Responsável
    expect(_cellWrites.get("8:12")).toBeNull(); // L: Estado
  });

  it("Responsável (col 11) nunca contém 'None' — org sem securityOfficerName", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue({
      ...FAKE_ORG,
      securityOfficerName: null,  // campo nulo no Railway
    });
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    const val = _cellWrites.get("8:11");
    expect(val).not.toBe("None");
    expect(val).not.toBe("null");
    expect(val).not.toBe("undefined");
    // null explícito ou não escrito — ambos são aceitáveis
    expect(val === null || val === "" || val === undefined).toBe(true);
  });

  it("Estado (col 12) nunca contém string espúria", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    const val = _cellWrites.get("8:12");
    expect(val === null || val === "" || val === undefined).toBe(true);
  });

  it("fórmulas H e I (cols 8 e 9) nunca são sobrescritas", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    expect(_cellWrites.has("8:8")).toBe(false); // H: Nível de Risco (fórmula)
    expect(_cellWrites.has("8:9")).toBe(false); // I: Classificação (fórmula)
  });
});

// ===========================================================================
// C16 — generateInventarioAtivos: mapeamento de openPorts + resolvedIp
// ===========================================================================

describe("generateInventarioAtivos — mapeamento de portos (C16)", () => {
  const PORT_HTTP = {
    port: 80, protocol: "tcp", service: "http",
    product: "nginx", version: "1.18.0", cves: ["CVE-2021-1234"],
  };
  const PORT_SSH = {
    port: 22, protocol: "tcp", service: "ssh",
    product: "OpenSSH", version: "7.9", cves: [],
  };

  const SCAN_WITH_PORTS = {
    ...FAKE_SCAN,
    target: "exemplo.pt",
    results: {
      resolvedIp: "1.2.3.4",
      openPorts: [PORT_HTTP, PORT_SSH],
      vulnerabilities: [],
    },
  } as any;

  const ORG_WITH_ASSETS = {
    ...FAKE_ORG,
    keyAssets: ["servidor web", "base de dados"],
  } as any;

  it("B3 preenchido com nome da empresa", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_WITH_PORTS);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    expect(_headerWrites.get("B3")).toContain("Empresa Teste Lda");
  });

  it("F3 preenchido com Origem: Scan CISPLAN #<id>", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_WITH_PORTS);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(42, 1);

    const f3 = _headerWrites.get("F3") as string;
    expect(f3).toContain("Scan CISPLAN #42");
    expect(f3).toContain("Preenchido automaticamente");
  });

  it("1 linha por porto — target, IP, porto, serviço, versão, CVEs mapeados", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_WITH_PORTS);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    // Linha 6 — primeiro porto (HTTP)
    expect(_cellWrites.get("6:3")).toBe("exemplo.pt");    // C: Domínio/Host
    expect(_cellWrites.get("6:4")).toBe("1.2.3.4");       // D: IP
    expect(_cellWrites.get("6:5")).toBe(80);              // E: Porto
    expect(_cellWrites.get("6:6")).toBe("http");          // F: Serviço
    expect(_cellWrites.get("6:7")).toBe("nginx 1.18.0");  // G: Versão/Banner
    expect(_cellWrites.get("6:8")).toBe("CVE-2021-1234"); // H: CVEs

    // Linha 7 — segundo porto (SSH)
    expect(_cellWrites.get("7:5")).toBe(22);
    expect(_cellWrites.get("7:6")).toBe("ssh");
    expect(_cellWrites.get("7:8")).toBe("—");              // 0 CVEs → "—"
  });

  it("endereço IP vazio quando resolvedIp ausente (nunca 'N/D')", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      target: "exemplo.pt",
      results: { openPorts: [PORT_HTTP], vulnerabilities: [] },
    } as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    const ip = _cellWrites.get("6:4");
    expect(ip).toBe("");
    expect(ip).not.toBe("N/D");
    expect(ip).not.toBe(null);
  });

  it("keyAssets em Observações da primeira linha — linhas seguintes sem observações", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_WITH_PORTS);
    vi.mocked(db.getOrganizationById).mockResolvedValue(ORG_WITH_ASSETS);

    await generateInventarioAtivos(1, 1);

    const obs1 = _cellWrites.get("6:11") as string;
    expect(obs1).toContain("servidor web");
    expect(obs1).toContain("base de dados");
    // Linha 7: observações nulas
    expect(_cellWrites.get("7:11")).toBeNull();
  });

  it("Observações da primeira linha são nulas quando sem keyAssets", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_WITH_PORTS);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG); // sem keyAssets

    await generateInventarioAtivos(1, 1);

    expect(_cellWrites.get("6:11")).toBeNull();
  });

  it("Criticidade (col 9) e Responsável (col 10) escritos como null", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(SCAN_WITH_PORTS);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    expect(_cellWrites.get("6:9")).toBeNull();  // I: Criticidade
    expect(_cellWrites.get("6:10")).toBeNull(); // J: Responsável
  });

  it("sem portos — nenhuma linha de dados escrita", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { resolvedIp: "1.2.3.4", openPorts: [], vulnerabilities: [] },
    } as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    expect(_cellWrites.has("6:3")).toBe(false);
  });
});

// ===========================================================================
// C16-fix — CVEs resumidos, fullCalcOnLoad, portos unknown
// ===========================================================================

describe("generateInventarioAtivos — CVEs resumidos (C16-fix)", () => {
  const makeScanWithPort = (cves: string[]) => ({
    ...FAKE_SCAN,
    target: "exemplo.pt",
    results: {
      resolvedIp: "1.2.3.4",
      openPorts: [{ port: 80, protocol: "tcp", service: "http", product: "nginx", version: "1.18.0", cves }],
      vulnerabilities: [],
    },
  } as any);

  it("mais de 3 CVEs → contagem com referência cruzada (não a lista)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const cves108 = Array.from({ length: 108 }, (_, i) => `CVE-2021-${String(i).padStart(5, "0")}`);
    vi.mocked(db.getScanById).mockResolvedValue(makeScanWithPort(cves108));
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    const h = _cellWrites.get("6:8") as string;
    expect(h).toBe("108 CVEs conhecidos — ver Registo de Riscos e relatório técnico");
    expect(h).not.toContain("CVE-2021-");
  });

  it("3 CVEs → lista os 3 (poucos, cabem)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(makeScanWithPort(["CVE-A", "CVE-B", "CVE-C"]));
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    expect(_cellWrites.get("6:8")).toBe("CVE-A, CVE-B, CVE-C");
  });

  it("0 CVEs → '—' (não string vazia nem null)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(makeScanWithPort([]));
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    expect(_cellWrites.get("6:8")).toBe("—");
  });

  it("porto com serviço 'unknown' consta na saída (sem filtro por serviço)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      target: "exemplo.pt",
      results: {
        resolvedIp: "1.2.3.4",
        openPorts: [{ port: 4444, protocol: "tcp", service: "unknown", cves: [] }],
        vulnerabilities: [],
      },
    } as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    expect(_cellWrites.get("6:5")).toBe(4444);       // porto presente
    expect(_cellWrites.get("6:6")).toBe("unknown");  // serviço registado
  });
});

describe("fullCalcOnLoad — fórmulas recalculadas à abertura (C16-fix)", () => {
  it("generateRegistoRiscos activa fullCalcOnLoad no workbook", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(FAKE_SCAN);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    expect(_calcProps.fullCalcOnLoad).toBe(true);
  });

  it("generateInventarioAtivos activa fullCalcOnLoad no workbook", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { resolvedIp: "1.2.3.4", openPorts: [], vulnerabilities: [] },
    } as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    expect(_calcProps.fullCalcOnLoad).toBe(true);
  });
});

// ===========================================================================
// clearFormulaCache — garante recálculo sem depender do cache do template
// ===========================================================================

describe("clearFormulaCache — caches de fórmulas limpos antes de writeBuffer", () => {
  it("generateRegistoRiscos chama eachSheet para limpar caches", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(FAKE_SCAN);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    expect(_eachSheetCalled).toBeGreaterThanOrEqual(1);
  });

  it("generateInventarioAtivos chama eachSheet para limpar caches", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { openPorts: [], resolvedIp: "1.2.3.4" },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);

    await generateInventarioAtivos(1, 1);

    expect(_eachSheetCalled).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// Painel de Controlo — pré-cálculo de contagens (fix-painel)
// ===========================================================================

describe("preFillPainel — contagens do Painel pré-calculadas (fix-painel)", () => {
  // Fixture: 2 CRÍTICO (Nível 20), 1 ALTO (Nível 12), 1 MÉDIO (Nível 6), 1 BAIXO (Nível 3)
  const VULNS_MIXED = [
    FAKE_VULN("CVE-A", "critical", 9.8, "comp-A"),  // prob=5 impact=5 → nivel=25 → CRÍTICO
    FAKE_VULN("CVE-B", "critical", 8.0, "comp-B"),  // prob=5 impact=4 → nivel=20 → CRÍTICO
    FAKE_VULN("CVE-C", "high",    7.0, "comp-C"),   // prob=4 impact=3 → nivel=12 → ALTO
    FAKE_VULN("CVE-D", "medium",  5.0, "comp-D"),   // prob=3 impact=2 → nivel=6  → MÉDIO
    FAKE_VULN("CVE-E", "low",     2.0, "comp-E"),   // prob=2 impact=2 → nivel=4  → BAIXO (? let's check: 4 >= 1 and < 5 → BAIXO)
  ];

  const SETUP = () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(FAKE_SCAN);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue(VULNS_MIXED as any);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);
  };

  it("C5 (Total) = número de grupos escritos", async () => {
    SETUP();
    await generateRegistoRiscos(1, 1);
    expect(_painelCellWrites.get("C5")).toMatchObject({ result: 5 });
  });

  it("C6 (CRÍTICO) = grupos com Nível >= 17", async () => {
    SETUP();
    await generateRegistoRiscos(1, 1);
    expect(_painelCellWrites.get("C6")).toMatchObject({ result: 2 });
  });

  it("C7 (ALTO) = grupos com 10 <= Nível < 17", async () => {
    SETUP();
    await generateRegistoRiscos(1, 1);
    expect(_painelCellWrites.get("C7")).toMatchObject({ result: 1 });
  });

  it("C8 (MÉDIO) = grupos com 5 <= Nível < 10", async () => {
    SETUP();
    await generateRegistoRiscos(1, 1);
    expect(_painelCellWrites.get("C8")).toMatchObject({ result: 1 });
  });

  it("C9 (BAIXO) = grupos com 1 <= Nível < 5", async () => {
    SETUP();
    await generateRegistoRiscos(1, 1);
    expect(_painelCellWrites.get("C9")).toMatchObject({ result: 1 });
  });

  it("C12-C14 (Estado) = 0 porque coluna L começa vazia", async () => {
    SETUP();
    await generateRegistoRiscos(1, 1);
    expect(_painelCellWrites.get("C12")).toMatchObject({ result: 0 });
    expect(_painelCellWrites.get("C13")).toMatchObject({ result: 0 });
    expect(_painelCellWrites.get("C14")).toMatchObject({ result: 0 });
  });

  it("células preservam a fórmula original (formula presente no valor escrito)", async () => {
    SETUP();
    await generateRegistoRiscos(1, 1);
    for (const addr of ["C5", "C6", "C7", "C8", "C9", "C12", "C13", "C14"]) {
      const written = _painelCellWrites.get(addr);
      expect(written).toBeDefined();
      expect(typeof written.formula).toBe("string");
      expect(written.formula.length).toBeGreaterThan(0);
    }
  });

  it("sem riscos → Total=0, todas as contagens=0", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(FAKE_SCAN);
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    expect(_painelCellWrites.get("C5")).toMatchObject({ result: 0 });
    expect(_painelCellWrites.get("C6")).toMatchObject({ result: 0 });
    expect(_painelCellWrites.get("C7")).toMatchObject({ result: 0 });
    expect(_painelCellWrites.get("C8")).toMatchObject({ result: 0 });
    expect(_painelCellWrites.get("C9")).toMatchObject({ result: 0 });
  });

  it("preFillPainel unitário — valores directos sem generator", () => {
    const mockWb = {
      getWorksheet: (name: string) => {
        if (name !== "📈 PAINEL DE CONTROLO") return null;
        return {
          getCell: (addr: string) => {
            const cell = { value: undefined as any };
            Object.defineProperty(cell, "value", {
              get: () => _painelCellWrites.has(addr)
                ? _painelCellWrites.get(addr)
                : PAINEL_INITIAL[addr],
              set: (v: any) => { _painelCellWrites.set(addr, v); },
              enumerable: true, configurable: true,
            });
            return cell;
          },
        };
      },
    };
    preFillPainel(mockWb as any, 7, 3, 2, 1, 1);
    expect(_painelCellWrites.get("C5")).toMatchObject({ result: 7 });
    expect(_painelCellWrites.get("C6")).toMatchObject({ result: 3 });
    expect(_painelCellWrites.get("C7")).toMatchObject({ result: 2 });
    expect(_painelCellWrites.get("C8")).toMatchObject({ result: 1 });
    expect(_painelCellWrites.get("C9")).toMatchObject({ result: 1 });
  });
});

// ===========================================================================
// C17 — generatePsi: PSI auto-preenchida
// ===========================================================================

describe("generatePsi — PSI auto-preenchida (C17)", () => {
  const PSI_SETUP = (orgOverride: object = {}) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue({
      ...FAKE_ORG,
      legalName: "Empresa Teste, Lda.",
      taxId: "PT509123456",
      securityOfficerName: "Ana Costa",
      ...orgOverride,
    } as any);
  };

  it("todas as tags preenchidas — nenhum '{' remanescente nos valores", async () => {
    PSI_SETUP();
    await generatePsi(1);

    expect(_psiRenderArgs).not.toBeNull();
    const TAGS = ["empresa", "nif", "versao", "data_aprovacao", "aprovado_por",
                  "cargo", "ciso_nome", "data_revisao", "proxima_revisao"];
    for (const tag of TAGS) {
      const v = (_psiRenderArgs as any)[tag];
      expect(v, `tag "${tag}" não deve ser undefined`).toBeDefined();
      expect(String(v), `tag "${tag}" não deve conter "{"`)
        .not.toContain("{");
    }
  });

  it("org com legalName → empresa = legalName", async () => {
    PSI_SETUP({ legalName: "Empresa Legal, SA" });
    await generatePsi(1);
    expect(_psiRenderArgs!.empresa).toBe("Empresa Legal, SA");
  });

  it("org sem legalName → empresa = name", async () => {
    PSI_SETUP({ legalName: null });
    await generatePsi(1);
    expect(_psiRenderArgs!.empresa).toBe("Empresa Teste Lda");
  });

  it("org sem taxId → nif = '[A PREENCHER: NIF]'", async () => {
    PSI_SETUP({ taxId: null });
    await generatePsi(1);
    expect(_psiRenderArgs!.nif).toBe("[A PREENCHER: NIF]");
  });

  it("org com taxId → nif = taxId", async () => {
    PSI_SETUP({ taxId: "PT509999999" });
    await generatePsi(1);
    expect(_psiRenderArgs!.nif).toBe("PT509999999");
  });

  it("org sem securityOfficerName → ciso_nome = placeholder", async () => {
    PSI_SETUP({ securityOfficerName: null });
    await generatePsi(1);
    expect(_psiRenderArgs!.ciso_nome).toBe("[A PREENCHER: responsável de segurança]");
  });

  it("org com securityOfficerName → ciso_nome = nome", async () => {
    PSI_SETUP({ securityOfficerName: "Carlos Silva" });
    await generatePsi(1);
    expect(_psiRenderArgs!.ciso_nome).toBe("Carlos Silva");
  });

  it("versao = '1.0' sempre", async () => {
    PSI_SETUP();
    await generatePsi(1);
    expect(_psiRenderArgs!.versao).toBe("1.0");
  });

  it("proxima_revisao = hoje + 1 ano em DD/MM/AAAA", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-15"));
    PSI_SETUP();
    await generatePsi(1);
    expect(_psiRenderArgs!.proxima_revisao).toBe("15/03/2026");
  });

  it("campos de aprovação (atos futuros da empresa) ficam com '[A definir pela equipa]', NUNCA '[A PREENCHER]'", async () => {
    PSI_SETUP();
    await generatePsi(1);
    expect(_psiRenderArgs!.data_aprovacao).toBe("[A definir pela equipa]");
    expect(_psiRenderArgs!.aprovado_por).toBe("[A definir pela equipa]");
    expect(_psiRenderArgs!.cargo).toBe("[A definir pela equipa]");
    expect(_psiRenderArgs!.data_revisao).toBe("[A definir pela equipa]");

    // Nenhum destes 4 deve conter a string "A PREENCHER" — são atos futuros da
    // empresa (aprovação/revisão), não dados em falta do perfil.
    for (const tag of ["data_aprovacao", "aprovado_por", "cargo", "data_revisao"]) {
      expect((_psiRenderArgs as any)[tag]).not.toContain("A PREENCHER");
    }
  });

  it("perfil completo → PSI sai com ZERO '[A PREENCHER]' (só os 4 campos de aprovação, com '[A definir pela equipa]')", async () => {
    PSI_SETUP({
      legalName: "Empresa Teste, Lda.",
      taxId: "PT509123456",
      securityOfficerName: "Ana Costa",
    });
    await generatePsi(1);

    for (const [tag, v] of Object.entries(_psiRenderArgs!)) {
      expect(String(v), `tag "${tag}" não deveria conter "A PREENCHER" com perfil completo`)
        .not.toContain("A PREENCHER");
    }
  });

  it("nenhum valor é null, undefined, 'None' ou 'null'", async () => {
    PSI_SETUP({ legalName: null, taxId: null, securityOfficerName: null });
    await generatePsi(1);
    for (const [k, v] of Object.entries(_psiRenderArgs!)) {
      expect(v, `"${k}" não deve ser null`).not.toBeNull();
      expect(v, `"${k}" não deve ser undefined`).not.toBeUndefined();
      expect(String(v), `"${k}" não deve ser 'None'`).not.toBe("None");
      expect(String(v), `"${k}" não deve ser 'null'`).not.toBe("null");
    }
  });
});

// ===========================================================================
// Carta de Nomeação do CISO — generateCartaCiso
// ===========================================================================

describe("generateCartaCiso — Carta de Nomeação do CISO", () => {
  const CARTA_ORG_COMPLETA = {
    legalName:                "Empresa Teste, Lda.",
    taxId:                    "509123456",
    address:                  "Rua Exemplo 1, 1000-001 Lisboa",
    city:                     "Lisboa",
    caeCode:                  "62010",
    legalRepresentative:      "João Silva",
    legalRepresentativeRole:  "Administrador-Delegado",
    securityOfficerName:      "Ana Costa",
    securityOfficerTaxId:     "123456789",
    securityOfficerRole:      "Diretora de TI",
    securityOfficerStartDate: "2026-01-15",
    securityOfficerEmail:     "ciso@empresa.pt",
    securityOfficerPhone:     "+351 910 000 000",
  };

  const CARTA_SETUP = (orgOverride: object = {}) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue({
      ...FAKE_ORG,
      ...CARTA_ORG_COMPLETA,
      ...orgOverride,
    } as any);
  };

  it("perfil completo — todas as tags preenchidas, nenhum '{' remanescente", async () => {
    CARTA_SETUP();
    await generateCartaCiso(1);

    expect(_psiRenderArgs).not.toBeNull();
    const TAGS = [
      "empresa", "nif", "sede", "cae", "representante", "cargo_rep",
      "ciso_nome", "ciso_nif", "ciso_cargo", "ciso_inicio", "ciso_email",
      "ciso_telemovel", "referencia", "localidade", "data_extenso",
    ];
    for (const tag of TAGS) {
      const v = (_psiRenderArgs as any)[tag];
      expect(v, `tag "${tag}" não deve ser undefined`).toBeDefined();
      expect(String(v), `tag "${tag}" não deve conter "{"`).not.toContain("{");
      expect(String(v), `tag "${tag}" não deve ser [A PREENCHER] com perfil completo`)
        .not.toContain("A PREENCHER");
    }
  });

  it("org com legalName → empresa = legalName", async () => {
    CARTA_SETUP({ legalName: "Empresa Legal, SA" });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.empresa).toBe("Empresa Legal, SA");
  });

  it("org sem legalName → empresa = name", async () => {
    CARTA_SETUP({ legalName: null });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.empresa).toBe("Empresa Teste Lda");
  });

  it("org sem taxId → nif = placeholder", async () => {
    CARTA_SETUP({ taxId: null });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.nif).toBe("[A PREENCHER: NIF]");
  });

  it("org sem caeCode → cae = placeholder", async () => {
    CARTA_SETUP({ caeCode: null });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.cae).toBe("[A PREENCHER: código CAE]");
  });

  it("org com caeCode → cae = caeCode", async () => {
    CARTA_SETUP({ caeCode: "62020" });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.cae).toBe("62020");
  });

  it("representante e cargo do representante mapeados", async () => {
    CARTA_SETUP();
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.representante).toBe("João Silva");
    expect(_psiRenderArgs!.cargo_rep).toBe("Administrador-Delegado");
  });

  it("securityOfficerStartDate 'YYYY-MM-DD' → ciso_inicio 'DD/MM/YYYY'", async () => {
    CARTA_SETUP({ securityOfficerStartDate: "2026-01-15" });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.ciso_inicio).toBe("15/01/2026");
  });

  it("org sem securityOfficerStartDate → ciso_inicio = placeholder", async () => {
    CARTA_SETUP({ securityOfficerStartDate: null });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.ciso_inicio).toBe("[A PREENCHER: data de início]");
  });

  it("ciso_nif, ciso_cargo, ciso_email, ciso_telemovel mapeados do perfil do CISO", async () => {
    CARTA_SETUP();
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.ciso_nif).toBe("123456789");
    expect(_psiRenderArgs!.ciso_cargo).toBe("Diretora de TI");
    expect(_psiRenderArgs!.ciso_email).toBe("ciso@empresa.pt");
    expect(_psiRenderArgs!.ciso_telemovel).toBe("+351 910 000 000");
  });

  it("referência auto-gerada no formato CISO-{ano}-{orgId com 6 dígitos}", async () => {
    vi.setSystemTime(new Date("2026-07-31"));
    CARTA_SETUP();
    await generateCartaCiso(42);
    expect(_psiRenderArgs!.referencia).toBe("CISO-2026-000042");
  });

  it("localidade = campo city (não deriva da morada)", async () => {
    CARTA_SETUP({ city: "Porto", address: "Rua Exemplo 1, 86, 4000-000 Porto" });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.localidade).toBe("Porto");
  });

  it("org sem city → localidade = placeholder, mesmo com address preenchida", async () => {
    CARTA_SETUP({ city: null, address: "Rua Exemplo 1, 1000-001 Lisboa" });
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.localidade).toBe("[A PREENCHER: localidade]");
  });

  it("data_extenso — data actual por extenso em PT", async () => {
    vi.setSystemTime(new Date("2026-01-15"));
    CARTA_SETUP();
    await generateCartaCiso(1);
    expect(_psiRenderArgs!.data_extenso).toBe("15 de janeiro de 2026");
  });

  it("perfil incompleto — campos em falta usam '[A PREENCHER]', nunca null/undefined", async () => {
    CARTA_SETUP({
      taxId: null, address: null, city: null, caeCode: null, legalRepresentative: null,
      legalRepresentativeRole: null, securityOfficerTaxId: null, securityOfficerRole: null,
      securityOfficerStartDate: null, securityOfficerEmail: null, securityOfficerPhone: null,
    });
    await generateCartaCiso(1);
    for (const [k, v] of Object.entries(_psiRenderArgs!)) {
      expect(v, `"${k}" não deve ser null`).not.toBeNull();
      expect(v, `"${k}" não deve ser undefined`).not.toBeUndefined();
      expect(String(v), `"${k}" não deve ser 'None'`).not.toBe("None");
      expect(String(v), `"${k}" não deve ser 'null'`).not.toBe("null");
    }
  });
});

// ===========================================================================
// Registo Inicial CNCS — generateRegistoCncs
// ===========================================================================

describe("generateRegistoCncs — Registo Inicial CNCS", () => {
  const CNCS_ORG_COMPLETA = {
    legalName:            "Empresa Teste, Lda.",
    taxId:                "509123456",
    address:              "Rua Exemplo 1, 1000-001 Lisboa",
    caeCode:              "62010",
    securityOfficerName:  "Ana Costa",
    securityOfficerEmail: "ciso@empresa.pt",
    securityOfficerPhone: "+351 910 000 000",
    securityOfficerRole:  "Diretora de TI",
    ceoContact:           "ceo@empresa.pt",
    employeeCount:        230,
    annualTurnover:       "990000.00",
    countriesOfOperation: ["Espanha", "França"],
  };

  const CNCS_ASSESSMENT_COMPLETA = {
    id: 1, organizationId: 1, engineVersion: ENGINE_VERSION,
    classification: "importante",
    answers: { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12", "D.b": "5" },
  };

  const CNCS_SETUP = (orgOverride: object = {}, assessmentOverride: object | null = {}) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue({
      ...FAKE_ORG,
      ...CNCS_ORG_COMPLETA,
      ...orgOverride,
    } as any);
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue(
      assessmentOverride === null
        ? null
        : ({ ...CNCS_ASSESSMENT_COMPLETA, ...assessmentOverride } as any)
    );
  };

  it("perfil + enquadramento completos — todas as tags preenchidas, nenhum '{' nem '[A PREENCHER]'/'[A CONFIRMAR]'", async () => {
    CNCS_SETUP();
    await generateRegistoCncs(1);

    expect(_psiRenderArgs).not.toBeNull();
    const TAGS = [
      "empresa", "nif", "sede", "cae", "setor_anexo", "classificacao",
      "ciso_nome", "ciso_email", "ciso_telefone", "ciso_cargo", "ceo_contacto",
      "colaboradores", "volume_negocios", "paises_operacao", "referencia", "data_extenso",
    ];
    for (const tag of TAGS) {
      const v = (_psiRenderArgs as any)[tag];
      expect(v, `tag "${tag}" não deve ser undefined`).toBeDefined();
      expect(String(v), `tag "${tag}" não deve conter "{"`).not.toContain("{");
      expect(String(v), `tag "${tag}" não deve ser [A PREENCHER]/[A CONFIRMAR] com dados completos`)
        .not.toMatch(/A PREENCHER|A CONFIRMAR/);
    }
  });

  it("sem assessment de enquadramento → erro claro, não gera documento incompleto", async () => {
    CNCS_SETUP({}, null);
    await expect(generateRegistoCncs(1)).rejects.toThrow(
      "É necessário completar o Enquadramento NIS2 antes de gerar o Registo CNCS."
    );
  });

  it("assessment com engineVersion desatualizada → erro claro a pedir para repetir o enquadramento", async () => {
    CNCS_SETUP({}, { engineVersion: "1" });
    await expect(generateRegistoCncs(1)).rejects.toThrow(
      /versão 1 do motor de decisão/
    );
  });

  it("[REGRESSÃO unidades] assessment da versão imediatamente anterior (v6, D.vn/D.b em M€) é recusado pelo bump para v7", async () => {
    // Prova que o mecanismo já existente (guard de ENGINE_VERSION) trata sozinho a
    // migração de unidade — não é preciso SQL de conversão dos assessments antigos.
    CNCS_SETUP({}, { engineVersion: "6", answers: { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12", "D.b": "5" } });
    await expect(generateRegistoCncs(1)).rejects.toThrow(
      /versão 6 do motor de decisão/
    );
  });

  it("classificação 'essencial' → classificacao = 'Entidade essencial'", async () => {
    CNCS_SETUP({}, { classification: "essencial" });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.classificacao).toBe("Entidade essencial");
  });

  it("classificação 'fora_mvp' (fora de âmbito) — reflete o estatuto real, não força EE/EI", async () => {
    CNCS_SETUP({}, { classification: "fora_mvp" });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.classificacao).toBe("Fora do âmbito do CISPLAN (regime autónomo)");
    expect(_psiRenderArgs!.classificacao).not.toContain("Entidade");
  });

  it("classificação 'a_confirmar' — mostra 'A confirmar', não uma classificação inventada", async () => {
    CNCS_SETUP({}, { classification: "a_confirmar" });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.classificacao).toBe("A confirmar");
  });

  it("setor 'industria' (Anexo II) → setor_anexo = 'Anexo II'", async () => {
    CNCS_SETUP({}, { answers: { ...CNCS_ASSESSMENT_COMPLETA.answers, "A.setor": "industria" } });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.setor_anexo).toBe("Anexo II");
  });

  it("setor 'energia' (Anexo I) → setor_anexo = 'Anexo I'", async () => {
    CNCS_SETUP({}, { answers: { ...CNCS_ASSESSMENT_COMPLETA.answers, "A.setor": "energia" } });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.setor_anexo).toBe("Anexo I");
  });

  it("setor fora dos Anexos I/II (ex.: admin_publica) → placeholder de confirmação, não inventa Anexo", async () => {
    CNCS_SETUP({}, { answers: { ...CNCS_ASSESSMENT_COMPLETA.answers, "A.setor": "admin_publica" } });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.setor_anexo).toBe("[A CONFIRMAR: setor não consta dos Anexos I/II]");
  });

  it("referência auto-gerada no formato REG-CNCS-{ano}-{orgId com 6 dígitos}", async () => {
    vi.setSystemTime(new Date("2026-07-31"));
    CNCS_SETUP();
    await generateRegistoCncs(42);
    expect(_psiRenderArgs!.referencia).toBe("REG-CNCS-2026-000042");
  });

  it("countriesOfOperation preenchido → paises_operacao junta a lista", async () => {
    CNCS_SETUP({ countriesOfOperation: ["Espanha", "França"] });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.paises_operacao).toBe("Espanha, França");
  });

  it("countriesOfOperation vazio/null → 'Nenhum — opera apenas em Portugal' (resposta válida, não placeholder)", async () => {
    CNCS_SETUP({ countriesOfOperation: null });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.paises_operacao).toBe("Nenhum — opera apenas em Portugal");
    expect(_psiRenderArgs!.paises_operacao).not.toContain("A PREENCHER");
  });

  it("colaboradores (employeeCount número) → string no documento", async () => {
    CNCS_SETUP({ employeeCount: 230 });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.colaboradores).toBe("230");
  });

  it("volume_negocios sai formatado em euros (€), não o valor cru da BD", async () => {
    CNCS_SETUP({ annualTurnover: "990000.00" });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.volume_negocios).toBe("990.000,00 €");
    expect(_psiRenderArgs!.volume_negocios).not.toBe("990000.00");
  });

  it("volume_negocios sem annualTurnover → placeholder (não '[A PREENCHER]' genérico do formatMoedaEuro)", async () => {
    CNCS_SETUP({ annualTurnover: null });
    await generateRegistoCncs(1);
    expect(_psiRenderArgs!.volume_negocios).toBe("[A PREENCHER: volume de negócios]");
  });

  it("perfil incompleto — campos em falta usam '[A PREENCHER]', nunca null/undefined", async () => {
    CNCS_SETUP({
      taxId: null, address: null, caeCode: null, securityOfficerName: null,
      securityOfficerEmail: null, securityOfficerPhone: null, securityOfficerRole: null,
      ceoContact: null, employeeCount: null, annualTurnover: null,
    });
    await generateRegistoCncs(1);
    for (const [k, v] of Object.entries(_psiRenderArgs!)) {
      expect(v, `"${k}" não deve ser null`).not.toBeNull();
      expect(v, `"${k}" não deve ser undefined`).not.toBeUndefined();
      expect(String(v), `"${k}" não deve ser 'None'`).not.toBe("None");
      expect(String(v), `"${k}" não deve ser 'null'`).not.toBe("null");
    }
  });

  it("isolamento — getOrganizationById e getLatestFrameworkAssessmentByOrgId chamados com o MESMO orgId, nunca outro", async () => {
    CNCS_SETUP();
    await generateRegistoCncs(7);
    expect(vi.mocked(db.getOrganizationById)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getLatestFrameworkAssessmentByOrgId)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getOrganizationById)).not.toHaveBeenCalledWith(1);
  });
});

// ===========================================================================
// IRP — generateIrp (Plano de Resposta a Incidentes)
// ===========================================================================

describe("generateIrp — Plano de Resposta a Incidentes", () => {
  const IRP_ORG_COMPLETA = {
    legalName:            "Empresa Teste, Lda.",
    taxId:                "509123456",
    securityOfficerName:  "Ana Costa",
    securityOfficerEmail: "ciso@empresa.pt",
    securityOfficerPhone: "+351 910 000 000",
    ceoName:              "João Silva",
    ceoContact:           "ceo@empresa.pt",
  };

  const IRP_SETUP = (orgOverride: object = {}) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue({
      ...FAKE_ORG,
      ...IRP_ORG_COMPLETA,
      ...orgOverride,
    } as any);
  };

  it("perfil completo — todas as tags preenchidas, nenhum '{' nem '[A PREENCHER]'", async () => {
    IRP_SETUP();
    await generateIrp(1);

    expect(_psiRenderArgs).not.toBeNull();
    const TAGS = [
      "empresa", "nif", "cargo_ic_nome", "cargo_ic_email", "cargo_ic_telefone",
      "ceo_nome", "ceo_email", "referencia", "data_extenso", "data_versao_1",
    ];
    for (const tag of TAGS) {
      const v = (_psiRenderArgs as any)[tag];
      expect(v, `tag "${tag}" não deve ser undefined`).toBeDefined();
      expect(String(v), `tag "${tag}" não deve conter "{"`).not.toContain("{");
      expect(String(v), `tag "${tag}" não deve ser [A PREENCHER] com perfil completo`)
        .not.toContain("A PREENCHER");
    }
  });

  it("org com legalName → empresa = legalName", async () => {
    IRP_SETUP({ legalName: "Empresa Legal, SA" });
    await generateIrp(1);
    expect(_psiRenderArgs!.empresa).toBe("Empresa Legal, SA");
  });

  it("org sem legalName → empresa = name", async () => {
    IRP_SETUP({ legalName: null });
    await generateIrp(1);
    expect(_psiRenderArgs!.empresa).toBe("Empresa Teste Lda");
  });

  it("CISO (Comandante do Incidente): nome, email e telefone mapeados do perfil", async () => {
    IRP_SETUP();
    await generateIrp(1);
    expect(_psiRenderArgs!.cargo_ic_nome).toBe("Ana Costa");
    expect(_psiRenderArgs!.cargo_ic_email).toBe("ciso@empresa.pt");
    expect(_psiRenderArgs!.cargo_ic_telefone).toBe("+351 910 000 000");
  });

  it("CEO: nome e email mapeados — SEM campo de telefone (decisão: sem linha directa 24/7)", async () => {
    IRP_SETUP();
    await generateIrp(1);
    expect(_psiRenderArgs!.ceo_nome).toBe("João Silva");
    expect(_psiRenderArgs!.ceo_email).toBe("ceo@empresa.pt");
    // Confirma estruturalmente que não existe nenhum campo "ceo_telefone"/"ceo_phone" —
    // o CEO nunca recebe um contacto 24/7 directo, só email (escalado pelo CISO).
    expect(_psiRenderArgs).not.toHaveProperty("ceo_telefone");
    expect(_psiRenderArgs).not.toHaveProperty("ceo_phone");
  });

  it("referência auto-gerada no formato IRP-{ano}-{orgId com 6 dígitos}", async () => {
    vi.setSystemTime(new Date("2026-07-31"));
    IRP_SETUP();
    await generateIrp(42);
    expect(_psiRenderArgs!.referencia).toBe("IRP-2026-000042");
  });

  it("data_extenso — data actual por extenso em PT", async () => {
    vi.setSystemTime(new Date("2026-01-15"));
    IRP_SETUP();
    await generateIrp(1);
    expect(_psiRenderArgs!.data_extenso).toBe("15 de janeiro de 2026");
  });

  it("data_versao_1 (historial de versões) é a data de geração, em formato curto DD/MM/AAAA", async () => {
    vi.setSystemTime(new Date("2026-01-15"));
    IRP_SETUP();
    await generateIrp(1);
    expect(_psiRenderArgs!.data_versao_1).toBe("15/01/2026");
    // Mesma data-base do data_extenso, só o formato difere (curto vs. por extenso).
    expect(_psiRenderArgs!.data_extenso).toBe("15 de janeiro de 2026");
  });

  it("perfil incompleto — campos em falta usam '[A PREENCHER]', nunca null/undefined", async () => {
    IRP_SETUP({
      taxId: null, securityOfficerName: null, securityOfficerEmail: null,
      securityOfficerPhone: null, ceoName: null, ceoContact: null,
    });
    await generateIrp(1);
    for (const [k, v] of Object.entries(_psiRenderArgs!)) {
      expect(v, `"${k}" não deve ser null`).not.toBeNull();
      expect(v, `"${k}" não deve ser undefined`).not.toBeUndefined();
      expect(String(v), `"${k}" não deve ser 'None'`).not.toBe("None");
      expect(String(v), `"${k}" não deve ser 'null'`).not.toBe("null");
    }
  });

  it("isolamento — getOrganizationById chamado com o orgId certo, nunca outro", async () => {
    IRP_SETUP();
    await generateIrp(7);
    expect(vi.mocked(db.getOrganizationById)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getOrganizationById)).not.toHaveBeenCalledWith(1);
  });

  it("não depende do enquadramento — getLatestFrameworkAssessmentByOrgId nunca é chamado", async () => {
    IRP_SETUP();
    await generateIrp(1);
    expect(vi.mocked(db.getLatestFrameworkAssessmentByOrgId)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Relatório Executivo para a Gestão — generateRelatorioGestao
// ===========================================================================

describe("generateRelatorioGestao — Relatório Executivo para a Gestão", () => {
  const GESTAO_ORG_COMPLETA = { legalName: "Empresa Teste, Lda.", ceoName: "João Silva" };

  function buildAnswers(overrides: Record<string, "yes" | "partial" | "no" | "na"> = {}) {
    return NIS2_CONTROLS.map((c) => {
      const answer = overrides[c.id] ?? "yes";
      const score  = answer === "yes" ? 100 : answer === "partial" ? 50 : 0;
      return { controlId: c.id, answer, score };
    });
  }

  function mockQuestionnaire(answers: ReturnType<typeof buildAnswers>) {
    const scores = calculateScores(answers);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue({
      id: 1, articleScores: scores.byArticle, completedAt: new Date("2026-07-01"),
    } as any);
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue({
      id: 1, organizationId: 1, userId: 1, sector: null, status: "completed",
      score: String(scores.overall), articleScores: scores.byArticle, answers,
      completedAt: new Date("2026-07-01"), createdAt: new Date(), updatedAt: new Date(),
    } as any);
    return scores;
  }

  function mockAssessment(engineVersion: string = ENGINE_VERSION) {
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion, classification: "importante",
      answers: { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12000000", "D.b": "5000000" },
    } as any);
  }

  // getScanById devolve o scan certo consoante o id pedido — permite simular vários scans
  // em simultâneo (ex.: 2 alvos diferentes) e confirmar que o gerador usa o scanId PEDIDO,
  // não "o mais recente da org" (era esse o bug original).
  function mockScan(
    scanId: number,
    orgId: number,
    results: object = { criticalCount: 1, highCount: 2, mediumCount: 3, lowCount: 4 },
    status = "completed"
  ) {
    const scanRecord = { id: scanId, organizationId: orgId, status, completedAt: new Date("2026-07-15"), results } as any;
    vi.mocked(db.getScanById).mockImplementation(async (id: number) => (id === scanId ? scanRecord : null));
  }

  const GESTAO_SETUP_OK = (orgId = 1, scanId = 1, answers = buildAnswers()) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...GESTAO_ORG_COMPLETA } as any);
    mockQuestionnaire(answers);
    mockAssessment();
    mockScan(scanId, orgId);
  };

  it("3 fontes completas — score, 10 medidas, referência ao scan, declaração; zero chavetas, zero [A PREENCHER]", async () => {
    GESTAO_SETUP_OK(1, 1);
    await generateRelatorioGestao(1, 1);

    expect(_psiRenderArgs).not.toBeNull();
    const TAGS = [
      "empresa", "referencia", "data_extenso", "classificacao",
      "score_global", "medidas_conformes", "medidas_parciais", "medidas_falta", "leitura_sumario",
      "scan_data", "scan_vulns_total", "scan_criticas", "scan_altas", "scan_medias", "scan_baixas",
      "ceo_nome",
    ];
    for (const tag of TAGS) {
      const v = (_psiRenderArgs as any)[tag];
      expect(v, `tag "${tag}" não deve ser undefined`).toBeDefined();
      expect(String(v), `tag "${tag}" não deve conter "{"`).not.toContain("{");
      expect(String(v), `tag "${tag}" não deve ser [A PREENCHER] com dados completos`)
        .not.toContain("A PREENCHER");
    }
    expect(_psiRenderArgs!.medidas).toHaveLength(10);
    for (const m of _psiRenderArgs!.medidas as any[]) {
      expect(String(m.score_fmt)).not.toContain("{");
      expect(["Conforme", "Parcial", "Em falta"]).toContain(m.estado);
    }
  });

  it("todas as 42 respostas 'yes' → 10 medidas conformes, zero parciais, zero em falta", async () => {
    GESTAO_SETUP_OK(1, 1);
    await generateRelatorioGestao(1, 1);
    expect(_psiRenderArgs!.medidas_conformes).toBe("10");
    expect(_psiRenderArgs!.medidas_parciais).toBe("0");
    expect(_psiRenderArgs!.medidas_falta).toBe("0");
    expect(_psiRenderArgs!.score_global).toBe("100/100");
  });

  it("mistura de respostas → classifica cada medida corretamente (limiares 80/60)", async () => {
    const overrides: Record<string, "no" | "partial"> = {};
    for (const c of NIS2_CONTROLS.filter((c) => c.articleSlug === "b")) overrides[c.id] = "no";
    const hControls = NIS2_CONTROLS.filter((c) => c.articleSlug === "h");
    overrides[hControls[0].id] = "partial";
    overrides[hControls[1].id] = "partial";
    // hControls[2] fica "yes" (default) — (100+50+50)/3 = 66.7 → round 67 → Parcial (60-79)

    GESTAO_SETUP_OK(1, 1, buildAnswers(overrides));
    await generateRelatorioGestao(1, 1);

    expect(_psiRenderArgs!.medidas_conformes).toBe("8");
    expect(_psiRenderArgs!.medidas_parciais).toBe("1");
    expect(_psiRenderArgs!.medidas_falta).toBe("1");

    const medidas = _psiRenderArgs!.medidas as any[];
    const medidaB = medidas.find((m) => m.slug_maiusc === "B");
    const medidaH = medidas.find((m) => m.slug_maiusc === "H");
    expect(medidaB.estado).toBe("Em falta");
    expect(medidaB.score_fmt).toBe("0/100");
    expect(medidaH.estado).toBe("Parcial");
    expect(medidaH.score_fmt).toBe("67/100");
  });

  it("medida toda-N/A → 'Não avaliado' (não 'Em falta'), lacunas '—'; fronteiras exatas 80→Conforme e 60→Parcial", async () => {
    const overrides: Record<string, "na" | "yes" | "partial"> = {};
    for (const c of NIS2_CONTROLS.filter((c) => c.articleSlug === "f")) overrides[c.id] = "na";

    const aControls = NIS2_CONTROLS.filter((c) => c.articleSlug === "a");
    overrides[aControls[0].id] = "yes";
    overrides[aControls[1].id] = "yes";
    overrides[aControls[2].id] = "yes";
    overrides[aControls[3].id] = "partial";
    overrides[aControls[4].id] = "partial";
    // a: (100*3 + 50*2)/5 = 400/5 = 80 → Conforme (fronteira exata, não Parcial)

    const iControls = NIS2_CONTROLS.filter((c) => c.articleSlug === "i");
    overrides[iControls[0].id] = "yes";
    overrides[iControls[1].id] = "partial";
    overrides[iControls[2].id] = "partial";
    overrides[iControls[3].id] = "partial";
    overrides[iControls[4].id] = "partial";
    // i: (100*1 + 50*4)/5 = 300/5 = 60 → Parcial (fronteira exata, não Em falta)

    GESTAO_SETUP_OK(1, 1, buildAnswers(overrides));
    await generateRelatorioGestao(1, 1);

    const medidas = _psiRenderArgs!.medidas as any[];
    const medidaF = medidas.find((m) => m.slug_maiusc === "F");
    const medidaA = medidas.find((m) => m.slug_maiusc === "A");
    const medidaI = medidas.find((m) => m.slug_maiusc === "I");

    expect(medidaF.estado).toBe("Não avaliado");
    expect(medidaF.score_fmt).toBe("Sem dados");
    expect(medidaF.lacunas).toBe("—");

    expect(medidaA.estado).toBe("Conforme");
    expect(medidaA.score_fmt).toBe("80/100");

    expect(medidaI.estado).toBe("Parcial");
    expect(medidaI.score_fmt).toBe("60/100");

    expect(_psiRenderArgs!.medidas_nao_avaliadas).toBe("1");
    expect(_psiRenderArgs!.medidas_conformes).toBe("8"); // a + b,c,d,e,g,h,j (todas "yes"=100)
    expect(_psiRenderArgs!.medidas_parciais).toBe("1");  // i
    expect(_psiRenderArgs!.medidas_falta).toBe("0");     // "Não avaliado" NÃO soma a "Em falta"
  });

  it("referência auto-gerada no formato REL-GEST-{ano}-{orgId com 6 dígitos}", async () => {
    vi.setSystemTime(new Date("2026-07-31"));
    GESTAO_SETUP_OK(42, 1);
    await generateRelatorioGestao(42, 1);
    expect(_psiRenderArgs!.referencia).toBe("REL-GEST-2026-000042");
  });

  it("data_extenso — data actual por extenso em PT", async () => {
    vi.setSystemTime(new Date("2026-01-15"));
    GESTAO_SETUP_OK(1, 1);
    await generateRelatorioGestao(1, 1);
    expect(_psiRenderArgs!.data_extenso).toBe("15 de janeiro de 2026");
  });

  it("visão técnica reflete o SCAN SELECIONADO (contagens por severidade + total, sem repetir a lista técnica)", async () => {
    GESTAO_SETUP_OK(1, 1);
    await generateRelatorioGestao(1, 1);
    expect(_psiRenderArgs!.scan_criticas).toBe("1");
    expect(_psiRenderArgs!.scan_altas).toBe("2");
    expect(_psiRenderArgs!.scan_medias).toBe("3");
    expect(_psiRenderArgs!.scan_baixas).toBe("4");
    expect(_psiRenderArgs!.scan_vulns_total).toBe("10");
    expect(_psiRenderArgs!.scan_data).toBe("15/07/2026");
  });

  it("REGRESSÃO DO BUG — pedir o scan A (mais antigo, selecionado) devolve os números de A, nunca os do scan B (mais recente)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...GESTAO_ORG_COMPLETA } as any);
    mockQuestionnaire(buildAnswers());
    mockAssessment();

    // Simula exatamente o cenário relatado: scan A é mais antigo (scanme.nmap.org, 29/07,
    // 5 críticas) mas é o que o utilizador tinha aberto/selecionado; scan B é mais recente
    // (helpgames.app, 02/08, 0 vulns) mas NÃO foi pedido.
    const scanA = { id: 106, organizationId: 1, status: "completed", completedAt: new Date("2026-07-29"), results: { criticalCount: 5, highCount: 2, mediumCount: 1, lowCount: 0 } };
    const scanB = { id: 200, organizationId: 1, status: "completed", completedAt: new Date("2026-08-02"), results: { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 } };
    vi.mocked(db.getScanById).mockImplementation(async (id: number) => {
      if (id === scanA.id) return scanA as any;
      if (id === scanB.id) return scanB as any;
      return null;
    });

    await generateRelatorioGestao(1, scanA.id);
    expect(_psiRenderArgs!.scan_criticas).toBe("5");
    expect(_psiRenderArgs!.scan_vulns_total).toBe("8");

    // Inverso: pedir B explicitamente dá os números de B, não os de A.
    await generateRelatorioGestao(1, scanB.id);
    expect(_psiRenderArgs!.scan_criticas).toBe("0");
    expect(_psiRenderArgs!.scan_vulns_total).toBe("0");
  });

  it("precondição: falta questionário → erro menciona-o", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...GESTAO_ORG_COMPLETA } as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue(null as any);
    mockAssessment();
    mockScan(1, 1);

    const err = await generateRelatorioGestao(1, 1).catch((e) => e);
    expect(err).toBeDefined();
    expect(err.message).toContain("Complete primeiro");
    expect(err.message).toContain("questionário de autoavaliação");
  });

  it("precondição: faltam 2 fontes (questionário + scan) → erro lista as 2 de uma vez", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...GESTAO_ORG_COMPLETA } as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue(null as any);
    mockAssessment();
    vi.mocked(db.getScanById).mockResolvedValue(null as any); // scanId pedido não existe

    const err = await generateRelatorioGestao(1, 999).catch((e) => e);
    expect(err).toBeDefined();
    expect(err.message).toContain("questionário de autoavaliação");
    expect(err.message).toContain("scan de segurança");
  });

  it("precondição: scan selecionado existe mas ainda não está concluído → erro menciona scan de segurança", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...GESTAO_ORG_COMPLETA } as any);
    mockQuestionnaire(buildAnswers());
    mockAssessment();
    mockScan(1, 1, {}, "running"); // scan pedido ainda a correr

    const err = await generateRelatorioGestao(1, 1).catch((e) => e);
    expect(err).toBeDefined();
    expect(err.message).toContain("scan de segurança");
  });

  it("precondição: scan selecionado não existe (scanId inválido) → erro menciona scan de segurança", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...GESTAO_ORG_COMPLETA } as any);
    mockQuestionnaire(buildAnswers());
    mockAssessment();
    vi.mocked(db.getScanById).mockResolvedValue(null as any);

    const err = await generateRelatorioGestao(1, 999).catch((e) => e);
    expect(err).toBeDefined();
    expect(err.message).toContain("scan de segurança");
  });

  it("precondição: enquadramento com engineVersion desatualizada → erro específico (não 'em falta' genérico)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...GESTAO_ORG_COMPLETA } as any);
    mockQuestionnaire(buildAnswers());
    mockAssessment("1"); // versão antiga do motor
    mockScan(1, 1);

    const err = await generateRelatorioGestao(1, 1).catch((e) => e);
    expect(err).toBeDefined();
    expect(err.message).toContain("motor desatualizado");
  });

  it("SEGURANÇA — scanId pertence a outra organização → FORBIDDEN, nunca gera com dados de outra org", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...GESTAO_ORG_COMPLETA } as any);
    mockQuestionnaire(buildAnswers());
    mockAssessment();
    mockScan(999, 2); // scan 999 pertence à organização 2

    const err = await generateRelatorioGestao(1, 999).catch((e) => e); // org 1 a tentar aceder
    expect(err).toBeDefined();
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toContain("não pertence à sua organização");
  });

  it("isolamento — getScanById chamado com o scanId PEDIDO (não com o orgId, não 'o mais recente')", async () => {
    GESTAO_SETUP_OK(7, 55);
    await generateRelatorioGestao(7, 55);
    expect(vi.mocked(db.getOrganizationById)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getLatestCompletedQuestionnaireForOrg)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getLatestFrameworkAssessmentByOrgId)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getScanById)).toHaveBeenCalledWith(55);
    expect(vi.mocked(db.getOrganizationById)).not.toHaveBeenCalledWith(1);
  });

  it("declaração de supervisão NÃO afirma conformidade alcançada e inclui o aviso de que não é declaração integral", async () => {
    // O template global de pizzip/docxtemplater está mockado neste ficheiro (captura só
    // os dados, não renderiza texto real) — para verificar o TEXTO FIXO da declaração
    // (que não é um placeholder, é prosa do próprio template), lemos o ficheiro real do
    // disco com a instância REAL do pizzip (vi.importActual bypassa o mock só aqui).
    const { default: RealPizZip } = await vi.importActual<typeof import("pizzip")>("pizzip");
    const content = fs.readFileSync(TEMPLATE_PATHS.relatorioGestao);
    const zip = new RealPizZip(content);
    const xml = zip.file("word/document.xml")!.asText();

    const proibidas = [
      "está em conformidade",
      "cumpre integralmente",
      "encontra-se em conformidade",
      "garante a conformidade",
    ];
    for (const frase of proibidas) {
      expect(xml, `a declaração não deveria conter "${frase}"`).not.toContain(frase);
    }

    expect(xml).toContain("tomou conhecimento");
    expect(xml).toContain("assume a responsabilidade de supervisão");
    expect(xml).toContain("não constitui");
    expect(xml).toContain("declaração de conformidade integral");
  });
});

// ===========================================================================
// Tracker das 10 Medidas — generateTracker10Medidas
// ===========================================================================

describe("generateTracker10Medidas — Tracker das 10 Medidas (.xlsx)", () => {
  function buildAnswers(overrides: Record<string, "yes" | "partial" | "no" | "na"> = {}) {
    return NIS2_CONTROLS.map((c) => {
      const answer = overrides[c.id] ?? "yes";
      const score  = answer === "yes" ? 100 : answer === "partial" ? 50 : 0;
      return { controlId: c.id, answer, score };
    });
  }

  function mockQuestionnaire(answers: ReturnType<typeof buildAnswers>) {
    const scores = calculateScores(answers);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue({
      id: 1, articleScores: scores.byArticle, completedAt: new Date("2026-07-01"),
    } as any);
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue({
      id: 1, organizationId: 1, userId: 1, sector: null, status: "completed",
      score: String(scores.overall), articleScores: scores.byArticle, answers,
      completedAt: new Date("2026-07-01"), createdAt: new Date(), updatedAt: new Date(),
    } as any);
    return scores;
  }

  const TRACKER_SETUP = (answers = buildAnswers()) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, legalName: "Empresa Teste, Lda." } as any);
    mockQuestionnaire(answers);
  };

  it("gera as 10 medidas com estado/score/lacunas corretos, campos operacionais '[A definir pela equipa]'", async () => {
    TRACKER_SETUP();
    await generateTracker10Medidas(1);

    // Linhas 8-17 = medidas a-j na ordem de buildReportData; colunas: C=3 (medida),
    // D=4 (estado), E=5 (score), F=6 (lacunas), H=8 (responsável), J=10 (prazo), K=11 (evidência).
    for (let i = 0; i < 10; i++) {
      const row = 8 + i;
      expect(_cellWrites.get(`${row}:3`)).toBeTruthy();
      expect(_cellWrites.get(`${row}:4`)).toBe("Conforme"); // todas "yes" → 100 → Conforme
      expect(_cellWrites.get(`${row}:5`)).toBe("100/100");
      expect(_cellWrites.get(`${row}:6`)).toBe("0");
      expect(_cellWrites.get(`${row}:8`)).toBe("[A definir pela equipa]");
      expect(_cellWrites.get(`${row}:10`)).toBe("[A definir pela equipa]");
      expect(_cellWrites.get(`${row}:11`)).toBe("[A definir pela equipa]");
    }
  });

  it("dashboard — score global = overallScore/100", async () => {
    TRACKER_SETUP();
    await generateTracker10Medidas(1);
    expect(_headerWrites.get("C4")).toBe("100/100");
  });

  it("mistura de respostas → estados corretos por medida (mesmos limiares 80/60 do doc 4)", async () => {
    const overrides: Record<string, "no" | "partial"> = {};
    for (const c of NIS2_CONTROLS.filter((c) => c.articleSlug === "b")) overrides[c.id] = "no";
    const hControls = NIS2_CONTROLS.filter((c) => c.articleSlug === "h");
    overrides[hControls[0].id] = "partial";
    overrides[hControls[1].id] = "partial";
    // hControls[2] fica "yes" — (100+50+50)/3 = 66.7 → round 67 → Parcial (60-79)

    TRACKER_SETUP(buildAnswers(overrides));
    await generateTracker10Medidas(1);

    // ordem a-j: a=8, b=9, c=10, d=11, e=12, f=13, g=14, h=15, i=16, j=17
    expect(_cellWrites.get("9:4")).toBe("Em falta"); // b — todo "no" → 0
    expect(_cellWrites.get("9:5")).toBe("0/100");
    expect(_cellWrites.get("15:4")).toBe("Parcial"); // h — 67
    expect(_cellWrites.get("15:5")).toBe("67/100");
    expect(_cellWrites.get("8:4")).toBe("Conforme"); // a — inalterado, 100
  });

  it("medida toda-N/A → estado 'Não avaliado' no Tracker (não 'Em falta'), lacunas '—'", async () => {
    const overrides: Record<string, "na"> = {};
    for (const c of NIS2_CONTROLS.filter((c) => c.articleSlug === "f")) overrides[c.id] = "na";

    TRACKER_SETUP(buildAnswers(overrides));
    await generateTracker10Medidas(1);

    // f = linha 13 (a=8,b=9,c=10,d=11,e=12,f=13,...)
    expect(_cellWrites.get("13:4")).toBe("Não avaliado");
    expect(_cellWrites.get("13:5")).toBe("Sem dados");
    expect(_cellWrites.get("13:6")).toBe("—");
  });

  it("coerência com o doc 4 — medida toda-N/A é 'Não avaliado' nos DOIS documentos", async () => {
    const overrides: Record<string, "na"> = {};
    for (const c of NIS2_CONTROLS.filter((c) => c.articleSlug === "f")) overrides[c.id] = "na";
    const answers = buildAnswers(overrides);

    TRACKER_SETUP(answers);
    await generateTracker10Medidas(1);
    const trackerEstadoF = _cellWrites.get("13:4"); // f = linha 13

    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion: ENGINE_VERSION, classification: "importante",
      answers: { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12000000", "D.b": "5000000" },
    } as any);
    vi.mocked(db.getScanById).mockResolvedValue({
      id: 1, organizationId: 1, status: "completed", completedAt: new Date("2026-07-15"),
      results: { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
    } as any);
    await generateRelatorioGestao(1, 1);
    const medidaF = (_psiRenderArgs!.medidas as any[]).find((m) => m.slug_maiusc === "F");

    expect(trackerEstadoF).toBe("Não avaliado");
    expect(medidaF.estado).toBe("Não avaliado");
    expect(trackerEstadoF).toBe(medidaF.estado);
  });

  it("coerência com o doc 4 — a mesma medida tem o MESMO estado no Tracker e no Relatório de Gestão", async () => {
    const overrides: Record<string, "no" | "partial"> = {};
    const hControls = NIS2_CONTROLS.filter((c) => c.articleSlug === "h");
    overrides[hControls[0].id] = "partial";
    overrides[hControls[1].id] = "partial";
    const answers = buildAnswers(overrides);

    TRACKER_SETUP(answers);
    await generateTracker10Medidas(1);
    const trackerEstadoH = _cellWrites.get("15:4"); // h = linha 15

    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion: ENGINE_VERSION, classification: "importante",
      answers: { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12000000", "D.b": "5000000" },
    } as any);
    vi.mocked(db.getScanById).mockResolvedValue({
      id: 1, organizationId: 1, status: "completed", completedAt: new Date("2026-07-15"),
      results: { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
    } as any);
    await generateRelatorioGestao(1, 1);
    const medidaH = (_psiRenderArgs!.medidas as any[]).find((m) => m.slug_maiusc === "H");

    expect(trackerEstadoH).toBe("Parcial");
    expect(medidaH.estado).toBe("Parcial");
    expect(trackerEstadoH).toBe(medidaH.estado);
  });

  it("precondição: sem questionário completo → erro claro", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, legalName: "Empresa Teste, Lda." } as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue(null as any);

    await expect(generateTracker10Medidas(1)).rejects.toThrow(
      "[Documentos] Não é possível gerar o Tracker das 10 Medidas. Complete primeiro o questionário de autoavaliação."
    );
  });

  it("referência auto-gerada TRACKER-{ano}-{orgId com 6 dígitos} + data no cabeçalho", async () => {
    vi.setSystemTime(new Date("2026-08-04"));
    TRACKER_SETUP();
    await generateTracker10Medidas(42);
    const g3 = _headerWrites.get("G3") as string;
    expect(g3).toContain("TRACKER-2026-000042");
    expect(g3).toContain("04/08/2026");
  });

  it("isolamento — getOrganizationById/getLatestCompletedQuestionnaireForOrg chamados com o MESMO orgId, nunca outro", async () => {
    TRACKER_SETUP();
    await generateTracker10Medidas(7);
    expect(vi.mocked(db.getOrganizationById)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getLatestCompletedQuestionnaireForOrg)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getOrganizationById)).not.toHaveBeenCalledWith(1);
  });

  it("guard de template em falta lança erro claro com nome do ficheiro xlsx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateTracker10Medidas(1)).rejects.toThrow(
      "[Documentos] Template não encontrado: tracker-10-medidas-template.xlsx"
    );
  });
});

// ===========================================================================
// Declaração de MFA — generateDeclaracaoMfa
// ===========================================================================

describe("generateDeclaracaoMfa — Declaração de MFA (Autoavaliação)", () => {
  const MFA_ORG_COMPLETA = { legalName: "Empresa Teste, Lda.", securityOfficerName: "João Silva" };

  function mockQuestionnaireMfa(j1: string, j2: string, j3: string) {
    const answers = [
      { controlId: "j-1", answer: j1, score: j1 === "yes" ? 100 : j1 === "partial" ? 50 : 0 },
      { controlId: "j-2", answer: j2, score: j2 === "yes" ? 100 : j2 === "partial" ? 50 : 0 },
      { controlId: "j-3", answer: j3, score: j3 === "yes" ? 100 : j3 === "partial" ? 50 : 0 },
    ];
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue({
      id: 1, articleScores: {}, completedAt: new Date("2026-07-01"),
    } as any);
    vi.mocked(db.getQuestionnaireSessionById).mockResolvedValue({
      id: 1, organizationId: 1, userId: 1, sector: null, status: "completed",
      score: "80", articleScores: {}, answers,
      completedAt: new Date("2026-07-01"), createdAt: new Date(), updatedAt: new Date(),
    } as any);
  }

  const MFA_SETUP_OK = (j1 = "yes", j2 = "partial", j3 = "no") => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...MFA_ORG_COMPLETA } as any);
    mockQuestionnaireMfa(j1, j2, j3);
  };

  it("3 respostas de MFA com estado correto; zero chavetas por substituir", async () => {
    MFA_SETUP_OK("yes", "partial", "no");
    await generateDeclaracaoMfa(1);

    expect(_psiRenderArgs).not.toBeNull();
    expect(_psiRenderArgs!.q1_estado).toBe("Sim");
    expect(_psiRenderArgs!.q2_estado).toBe("Parcial");
    expect(_psiRenderArgs!.q3_estado).toBe("Não");
    expect(_psiRenderArgs!.q1_pergunta).toContain("email corporativo");
    expect(_psiRenderArgs!.q2_pergunta).toContain("acesso remoto e VPN");
    expect(_psiRenderArgs!.q3_pergunta).toContain("contas de administrador");

    const TAGS = [
      "empresa", "referencia", "data_extenso",
      "q1_pergunta", "q1_estado", "q2_pergunta", "q2_estado", "q3_pergunta", "q3_estado",
      "responsavel_nome",
    ];
    for (const tag of TAGS) {
      const v = (_psiRenderArgs as any)[tag];
      expect(v, `tag "${tag}" não deve ser undefined`).toBeDefined();
      expect(String(v), `tag "${tag}" não deve conter "{"`).not.toContain("{");
    }
  });

  it("resposta N/A é traduzida para 'N-A' (vocabulário do formulário, sem reinterpretação)", async () => {
    MFA_SETUP_OK("na", "yes", "yes");
    await generateDeclaracaoMfa(1);
    expect(_psiRenderArgs!.q1_estado).toBe("N-A");
  });

  it("referência auto-gerada MFA-{ano}-{orgId com 6 dígitos} + data por extenso", async () => {
    vi.setSystemTime(new Date("2026-08-04"));
    MFA_SETUP_OK();
    await generateDeclaracaoMfa(42);
    expect(_psiRenderArgs!.referencia).toBe("MFA-2026-000042");
    expect(_psiRenderArgs!.data_extenso).toBe("4 de agosto de 2026");
  });

  it("precondição: sem questionário completo → erro claro", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, ...MFA_ORG_COMPLETA } as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue(null as any);

    await expect(generateDeclaracaoMfa(1)).rejects.toThrow(
      "[Documentos] Não é possível gerar a Declaração de MFA. Complete primeiro o questionário de autoavaliação."
    );
  });

  it("isolamento — getOrganizationById/getLatestCompletedQuestionnaireForOrg chamados com o MESMO orgId, nunca outro", async () => {
    MFA_SETUP_OK();
    await generateDeclaracaoMfa(7);
    expect(vi.mocked(db.getOrganizationById)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getLatestCompletedQuestionnaireForOrg)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getOrganizationById)).not.toHaveBeenCalledWith(1);
  });

  it("guard de template em falta lança erro claro com nome do ficheiro docx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateDeclaracaoMfa(1)).rejects.toThrow(
      "[Documentos] Template não encontrado: declaracao-mfa-template.docx"
    );
  });

  it("documento NÃO contém 'Evidência' nem afirma verificação técnica; contém a nota de autoavaliação", async () => {
    // Bypassa o mock global do pizzip só aqui, para ler o TEXTO FIXO real do template
    // (mesma técnica usada para verificar a declaração de supervisão do doc 4).
    const { default: RealPizZip } = await vi.importActual<typeof import("pizzip")>("pizzip");
    const content = fs.readFileSync(TEMPLATE_PATHS.declaracaoMfa);
    const zip = new RealPizZip(content);
    const xml = zip.file("word/document.xml")!.asText();

    expect(xml, "não deveria conter a palavra 'Evidência'").not.toContain("Evidência");
    expect(xml, "não deveria afirmar 'evidência técnica'").not.toContain("evidência técnica");

    expect(xml).toContain("AUTOAVALIAÇÃO");
    expect(xml).toContain("NÃO constitui verificação técnica independente");
    expect(xml).toContain("a plataforma não acede aos sistemas da organização");
    expect(xml).toContain("A responsabilidade pela veracidade das respostas é inteiramente da organização");
  });
});

// ===========================================================================
// Tracker de Patches e Vulnerabilidades — generatePatchTracker (D14)
// ===========================================================================

describe("generatePatchTracker — Tracker de Patches e Vulnerabilidades (.xlsx)", () => {
  const FAKE_SCAN_PATCH = {
    id: 1, organizationId: 1, target: "exemplo.pt", status: "completed",
    createdAt: new Date("2026-07-29"), completedAt: new Date("2026-07-29"),
    results: {},
  } as any;

  function vuln(
    cveId: string, severity: string, cvssScore: number, affectedComponent: string,
    port: number | null, remediation: string | null
  ) {
    return {
      id: Math.floor(Math.random() * 100000), scanId: 1, organizationId: 1,
      cveId, severity, cvssScore: String(cvssScore), description: "desc",
      affectedComponent, port, remediation, createdAt: new Date(),
    } as any;
  }

  const PATCH_SETUP = (vulns: any[]) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue(FAKE_SCAN_PATCH);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ORG, legalName: "Empresa Teste, Lda." } as any);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue(vulns);
  };

  it("uma linha por vulnerabilidade, ordenadas por severidade (críticas primeiro), com remediation e prazo corretos", async () => {
    PATCH_SETUP([
      vuln("CVE-2024-0001", "low",      3.1, "ssh",   22,   "Atualiza o OpenSSH para a versão mais recente."),
      vuln("CVE-2024-0002", "critical", 9.8, "apache", 443, "Atualiza o Apache para a versão corrente."),
      vuln("CVE-2024-0003", "medium",   5.4, "nginx", 8080, null),
      vuln("CVE-2024-0004", "high",     7.5, "mysql", 3306, "Aplica o patch de segurança do MySQL."),
    ]);

    await generatePatchTracker(1, 1);

    // Ordem esperada: critical(0002) → high(0004) → medium(0003) → low(0001) — linhas 13-16
    expect(_cellWrites.get("13:6")).toBe("CVE-2024-0002"); // F: CVE
    expect(_cellWrites.get("13:3")).toBe("Crítica");       // C: Severidade
    expect(_cellWrites.get("13:8")).toBe("24–72 horas");   // H: Prazo

    expect(_cellWrites.get("14:6")).toBe("CVE-2024-0004");
    expect(_cellWrites.get("14:3")).toBe("Alta");
    expect(_cellWrites.get("14:8")).toBe("7 dias");

    expect(_cellWrites.get("15:6")).toBe("CVE-2024-0003");
    expect(_cellWrites.get("15:3")).toBe("Média");
    expect(_cellWrites.get("15:7")).toBe("[A PREENCHER: patch recomendado]"); // remediation null → fallback
    expect(_cellWrites.get("15:8")).toBe("30 dias");

    expect(_cellWrites.get("16:6")).toBe("CVE-2024-0001");
    expect(_cellWrites.get("16:3")).toBe("Baixa");
    expect(_cellWrites.get("16:8")).toBe("90 dias");

    // Estado sempre editável, sempre "[A definir pela equipa]"
    expect(_cellWrites.get("13:9")).toBe("[A definir pela equipa]");

    // Mini-resumo por severidade
    expect(_headerWrites.get("B10")).toBe("1"); // críticas
    expect(_headerWrites.get("C10")).toBe("1"); // altas
    expect(_headerWrites.get("D10")).toBe("1"); // médias
    expect(_headerWrites.get("E10")).toBe("1"); // baixas
    expect(_headerWrites.get("F10")).toBe("4"); // total
  });

  it("Patch Recomendado usa o campo remediation real — resumo já gravado pelo scanner, sem IA", async () => {
    PATCH_SETUP([vuln("CVE-2024-0002", "critical", 9.8, "apache", 443, "Atualiza o Apache para a versão corrente.")]);
    await generatePatchTracker(1, 1);
    expect(_cellWrites.get("13:7")).toBe("Atualiza o Apache para a versão corrente.");
  });

  it("0 vulnerabilidades → mensagem clara de 'sem patches pendentes', NÃO um erro", async () => {
    PATCH_SETUP([]);
    const buf = await generatePatchTracker(1, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(_headerWrites.get("B13")).toBe(
      "Nenhuma vulnerabilidade detetada neste scan — sem patches pendentes."
    );
  });

  it("REGRESSÃO DO CORTE EM 100 — 117 vulnerabilidades → as 117 aparecem, nenhuma omitida", async () => {
    const vulns = Array.from({ length: 117 }, (_, i) =>
      vuln(`CVE-2024-${String(i).padStart(4, "0")}`, "low", 3.0, `serviço${i}`, 1000 + i, `Patch ${i}`)
    );
    PATCH_SETUP(vulns);
    await generatePatchTracker(1, 1);

    // Todas as 117 linhas (13 a 129) têm o CVE correto — nenhuma linha "+N omitidas" no meio.
    for (let i = 0; i < 117; i++) {
      expect(_cellWrites.get(`${13 + i}:6`)).toBe(`CVE-2024-${String(i).padStart(4, "0")}`);
    }
    // A última (117ª, índice 116) está na linha 129 — prova direta de que não foi cortada em 100.
    expect(_cellWrites.get("129:6")).toBe("CVE-2024-0116");
    expect(_cellWrites.get("129:9")).toBe("[A definir pela equipa]"); // Estado editável até à última linha
    // Não existe nenhuma linha extra de "omitidas" — a linha a seguir aos dados é já o rodapé.
    expect(_cellWrites.get("130:6")).toBeUndefined();
  });

  it("5 vulnerabilidades → exatamente 5 linhas de dados, sem linhas vazias/extra a seguir", async () => {
    PATCH_SETUP([
      vuln("CVE-A", "critical", 9.8, "svcA", 1, "patchA"),
      vuln("CVE-B", "high",     7.0, "svcB", 2, "patchB"),
      vuln("CVE-C", "medium",   5.0, "svcC", 3, "patchC"),
      vuln("CVE-D", "low",      3.0, "svcD", 4, "patchD"),
      vuln("CVE-E", "low",      2.0, "svcE", 5, "patchE"),
    ]);
    await generatePatchTracker(1, 1);

    for (let i = 0; i < 5; i++) {
      expect(_cellWrites.get(`${13 + i}:6`)).toBeTruthy();
    }
    // A 6ª linha (13+5=18) não deve ter dados de vulnerabilidade nenhuma.
    expect(_cellWrites.get("18:6")).toBeUndefined();
  });

  it("referência auto-gerada PATCH-{ano}-{orgId com 6 dígitos}", async () => {
    vi.setSystemTime(new Date("2026-08-04"));
    PATCH_SETUP([]);
    await generatePatchTracker(1, 42);
    expect(_headerWrites.get("F3")).toBe("Referência: PATCH-2026-000042");
  });

  it("cabeçalho: empresa, alvo do scan, data do scan", async () => {
    PATCH_SETUP([]);
    await generatePatchTracker(1, 1);
    expect(_headerWrites.get("B3")).toBe("Empresa: Empresa Teste, Lda.");
    expect(_headerWrites.get("B4")).toBe("Alvo do scan: exemplo.pt");
    expect(_headerWrites.get("F4")).toBe("Data do scan: 29/07/2026");
  });

  it("isolamento — getScanById/getOrganizationById/getVulnerabilitiesByScanId chamados com os IDs certos, nunca outros", async () => {
    PATCH_SETUP([]);
    await generatePatchTracker(55, 7);
    expect(vi.mocked(db.getScanById)).toHaveBeenCalledWith(55);
    expect(vi.mocked(db.getOrganizationById)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getVulnerabilitiesByScanId)).toHaveBeenCalledWith(55);
    expect(vi.mocked(db.getScanById)).not.toHaveBeenCalledWith(1);
  });

  it("guard de template em falta lança erro claro com nome do ficheiro xlsx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generatePatchTracker(1, 1)).rejects.toThrow(
      "[Documentos] Template não encontrado: tracker-patches-template.xlsx"
    );
  });
});

// ===========================================================================
// C-EQ4 — generateRelatorioEnquadramento
// ===========================================================================

// Fixture com output REAL do evaluateTree (motor v7 — D.vn/D.b em euros, não M€):
//   evaluateTree(NIS2_PT_TREE, { "A.setor":"industria","C.estrutura":"autonoma","D.n":"80","D.vn":"12000000","D.b":"5000000" })
//   → path: ["A","C","D","E"]
//   → legalBasis: ["Art. 3.º do RJC","Rec. 2003/361/CE","Anexo III DL 125/2025","Art. 6.º do RJC"]
//   → classification: "importante" (N=80 ≥ 50 já satisfaz o limiar de "média", independente de VN/B)
//   → resultLabel: "Entidade importante — Anexo II, média/grande dimensão (Art. 6.º/2 do RJC)."
const FAKE_ASSESSMENT = {
  id:             99,
  organizationId: 1,
  userId:         1,
  frameworkSlug:  "nis2-pt-dl125",
  classification: "importante",
  resultLabel:    "Entidade importante — Anexo II, média/grande dimensão (Art. 6.º/2 do RJC).",
  engineVersion:  ENGINE_VERSION, // antes: "1" (motor está em v7; guard exige versão actual)
  status:         "completed",
  decisionPath:   ["A", "C", "D", "E"],
  legalBasis:     ["Art. 3.º do RJC", "Rec. 2003/361/CE", "Anexo III DL 125/2025", "Art. 6.º do RJC"],
  answers:        { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12000000", "D.b": "5000000" },
  completedAt:    new Date("2026-07-15"),
  createdAt:      new Date("2026-07-15"),
  updatedAt:      new Date("2026-07-15"),
} as any;

describe("generateRelatorioEnquadramento — enquadramento NIS2 (C-EQ4)", () => {
  const EQ_SETUP = (
    assessmentOverride: object = {},
    orgOverride: object = {},
  ) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getFrameworkAssessmentById).mockResolvedValue({
      ...FAKE_ASSESSMENT,
      ...assessmentOverride,
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue({
      ...FAKE_ORG,
      legalName: "TechCorp, Lda.",
      ...orgOverride,
    } as any);
  };

  it("lança erro claro quando template em falta", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateRelatorioEnquadramento(99, 1)).rejects.toThrow(
      "[Documentos] Template não encontrado: enquadramento-template.docx"
    );
  });

  it("lança erro quando assessment não existe", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getFrameworkAssessmentById).mockResolvedValue(null as any);
    await expect(generateRelatorioEnquadramento(99, 1)).rejects.toThrow(
      "[Documentos] Assessment não encontrado"
    );
  });

  it("lança erro quando assessment não pertence à org (isolamento multi-tenant)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getFrameworkAssessmentById).mockResolvedValue({
      ...FAKE_ASSESSMENT,
      organizationId: 999,
    });
    await expect(generateRelatorioEnquadramento(99, 1)).rejects.toThrow(
      "[Documentos] Acesso não autorizado"
    );
  });

  it("render chamado com empresa, data, classificacao, resultLabel, engineVersion", async () => {
    EQ_SETUP();
    await generateRelatorioEnquadramento(99, 1);

    expect(_psiRenderArgs).not.toBeNull();
    expect(_psiRenderArgs!.empresa).toBe("TechCorp, Lda.");
    expect(_psiRenderArgs!.classificacaoLabel).toBe("Entidade importante"); // antes: .classificacao — campo renomeado
    expect(_psiRenderArgs!.resultLabel).toContain("importante");
    expect(_psiRenderArgs!.engineVersion).toBe(ENGINE_VERSION); // antes: toBe("1") — motor está em v3
    // data no formato DD/MM/AAAA
    expect(typeof _psiRenderArgs!.data).toBe("string");
    expect(_psiRenderArgs!.data).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("org sem legalName → empresa = org.name", async () => {
    EQ_SETUP({}, { legalName: null });
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.empresa).toBe("Empresa Teste Lda");
  });

  it("steps é array derivado do motor (não de decisionPath BD) — labels legíveis, artigos correctos", async () => {
    // O generator re-corre evaluateTree a partir de assessment.answers.
    // FAKE_ASSESSMENT.answers = { A.setor:"industria", C.estrutura:"autonoma", D.n:"80", D.vn:"12", D.b:"5" }
    // motor v3 → 4 steps (A + C + D + E), com labels legíveis em PT.
    EQ_SETUP();
    await generateRelatorioEnquadramento(99, 1);

    const steps = _psiRenderArgs!.steps as Array<{ label: string; article: string }>;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps).toHaveLength(4);

    // Step A: setor
    expect(steps[0]!.label).toContain("Indústria e manufatura");
    expect(steps[0]!.article).toBe("Anexo II, ponto 5");

    // Step C: grupo
    expect(steps[1]!.label).toContain("empresa autónoma");
    expect(steps[1]!.article).toContain("Rec. 2003/361/CE");

    // Step D: dimensão com valores concretos
    expect(steps[2]!.label).toContain("média");
    expect(steps[2]!.label).toContain("trabalhadores: 80");
    expect(steps[2]!.label).toContain("VN: 12.000.000 €");
    expect(steps[2]!.article).toContain("Anexo III DL 125/2025");

    // Step E: resultado final
    expect(steps[3]!.label).toContain("entidade importante");
    expect(steps[3]!.article).toBe("Art. 6.º/2 do RJC"); // antes: "Art. 6.º/2 DL 125/2025" — citação corrigida no C-EQ12a

    // Nenhum step tem label com '{' (nenhum placeholder por substituir)
    for (const s of steps) {
      expect(s.label).not.toContain("{");
      expect(s.article).not.toContain("{");
    }
  });

  it("answers null → steps derivado de respostas vazias (motor devolve resultado por omissão)", async () => {
    // Com answers=null → {} → setor não identificado → B → nenhuma exceção → fora_condicional
    EQ_SETUP({ answers: null });
    await generateRelatorioEnquadramento(99, 1);

    const steps = _psiRenderArgs!.steps as Array<{ label: string; article: string }>;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    // Primeiro step é sempre o nó A
    expect(steps[0]!.label).toContain("Setor");
  });

  it("classification null → classificacaoLabel = '—'", async () => {
    EQ_SETUP({ classification: null });
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.classificacaoLabel).toBe("—"); // antes: .classificacao — campo renomeado
  });

  it("resultLabel null → resultLabel = '—'", async () => {
    EQ_SETUP({ resultLabel: null });
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.resultLabel).toBe("—");
  });

  it("nenhum valor nos render args contém '{' (nenhum placeholder por substituir)", async () => {
    EQ_SETUP();
    await generateRelatorioEnquadramento(99, 1);

    const flat = [
      _psiRenderArgs!.empresa,
      _psiRenderArgs!.data,
      _psiRenderArgs!.classificacaoLabel, // antes: .classificacao — campo renomeado
      _psiRenderArgs!.resultLabel,
      _psiRenderArgs!.engineVersion,
    ];
    for (const v of flat) {
      expect(String(v)).not.toContain("{");
    }
  });

  it("devolve Buffer não vazio com base64 válido", async () => {
    EQ_SETUP();
    const buf = await generateRelatorioEnquadramento(99, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.toString("base64")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("guard dispara: assessment com engineVersion diferente → rejeita antes de gerar ficheiro", async () => {
    const VERSAO_ANTIGA = `${ENGINE_VERSION}-antiga`;
    EQ_SETUP({ engineVersion: VERSAO_ANTIGA });
    await expect(generateRelatorioEnquadramento(99, 1)).rejects.toThrow(
      `versão ${VERSAO_ANTIGA} do motor de decisão`
    );
    await expect(generateRelatorioEnquadramento(99, 1)).rejects.toThrow(
      `versão actual é ${ENGINE_VERSION}`
    );
  });

  it("caminho feliz: assessment com ENGINE_VERSION actual → gera Buffer normalmente", async () => {
    EQ_SETUP({ engineVersion: ENGINE_VERSION });
    const buf = await generateRelatorioEnquadramento(99, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("guard aceita engineVersion numérico (VARCHAR pode chegar como number)", async () => {
    EQ_SETUP({ engineVersion: Number(ENGINE_VERSION) as unknown as string });
    const buf = await generateRelatorioEnquadramento(99, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// C-EQ15 — coverageState no gerador: textos por estado
// ===========================================================================

describe("generateRelatorioEnquadramento — textos por coverageState (C-EQ15)", () => {
  // Fixtures de answers para cada estado
  // abrangida (importante): FAKE_ASSESSMENT.answers
  const ANSWERS_ABRANGIDA    = { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12000000", "D.b": "5000000" };
  // condicional (a_confirmar): setor não mapeado, excecao qualitativa
  const ANSWERS_CONDICIONAL  = { "A.setor": "outro", "B.excecao": "qualitativo" };
  // condicional (a_confirmar_contratual): setor não mapeado, excecao fornecedor
  const ANSWERS_CONTRATUAL   = { "A.setor": "outro", "B.excecao": "fornecedor" };
  // fora (fora_condicional): setor não mapeado, sem excecao
  const ANSWERS_FORA         = { "A.setor": "outro", "B.excecao": "nenhum" };
  // fora (fora_mvp): admin pública
  const ANSWERS_FORA_MVP     = { "A.setor": "admin_publica" };

  const setupWith = (answers: object, classificationOverride?: string) => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    vi.mocked(db.getFrameworkAssessmentById).mockResolvedValue({
      ...FAKE_ASSESSMENT,
      answers,
      classification: classificationOverride ?? undefined,
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...FAKE_ASSESSMENT, id: 1, name: "Org Teste" } as any);
  };

  // ── abrangida ──────────────────────────────────────────────────────────────

  it("abrangida → sec3Title 'de si hoje', provavel=false, emVigorTexto afirmativo", async () => {
    setupWith(ANSWERS_ABRANGIDA, "importante");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.sec3Title).toBe("3. O que a lei já exige de si hoje");
    expect(_psiRenderArgs!.provavel).toBe(false);
    expect(_psiRenderArgs!.emVigorTexto).toContain("estão em vigor desde a entrada em vigor");
    expect(_psiRenderArgs!.isFora).toBe(false);
    expect(_psiRenderArgs!.isCondicional).toBe(false);
    expect(_psiRenderArgs!.isAbrangida).toBe(true);
  });

  it("abrangida → classificacaoLabel sem prefixo 'Provável'", async () => {
    setupWith(ANSWERS_ABRANGIDA, "importante");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.classificacaoLabel).toBe("Entidade importante");
    expect(_psiRenderArgs!.classificacaoLabel).not.toContain("Provável");
  });

  // ── condicional (a_confirmar) ──────────────────────────────────────────────

  it("a_confirmar → sec3Title 'das entidades abrangidas', provavel=true, emVigorTexto condicionado", async () => {
    setupWith(ANSWERS_CONDICIONAL, "a_confirmar");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.sec3Title).toBe("3. O que a lei exige das entidades abrangidas");
    expect(_psiRenderArgs!.provavel).toBe(true);
    expect(_psiRenderArgs!.emVigorTexto).toContain("depende de se confirmar que está abrangida");
    expect(_psiRenderArgs!.isCondicional).toBe(true);
    expect(_psiRenderArgs!.isFora).toBe(false);
  });

  it("a_confirmar → classificacaoLabel com prefixo 'Provável'", async () => {
    setupWith(ANSWERS_CONDICIONAL, "a_confirmar");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.classificacaoLabel).toContain("Provável");
    expect(_psiRenderArgs!.classificacaoLabel).toContain("A confirmar");
  });

  // ── condicional (a_confirmar_contratual) — o ramo que escapava ────────────

  it("a_confirmar_contratual → sec3Title 'das entidades abrangidas' (era 'de si hoje' antes do fix)", async () => {
    setupWith(ANSWERS_CONTRATUAL, "a_confirmar_contratual");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.sec3Title).toBe("3. O que a lei exige das entidades abrangidas");
    expect(_psiRenderArgs!.provavel).toBe(true);
    expect(_psiRenderArgs!.emVigorTexto).toContain("depende de se confirmar que está abrangida");
    expect(_psiRenderArgs!.isCondicional).toBe(true);
    expect(_psiRenderArgs!.isFora).toBe(false);
  });

  it("a_confirmar_contratual → classificacaoLabel com prefixo 'Provável'", async () => {
    setupWith(ANSWERS_CONTRATUAL, "a_confirmar_contratual");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.classificacaoLabel).toContain("Provável");
    expect(_psiRenderArgs!.classificacaoLabel).toContain("obrigações por via contratual");
  });

  // ── fora (fora_condicional) ────────────────────────────────────────────────

  it("fora_condicional → sec3Title 'das entidades abrangidas', provavel=false, emVigorTexto informativo", async () => {
    setupWith(ANSWERS_FORA, "fora_condicional");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.sec3Title).toBe("3. O que a lei exige das entidades abrangidas");
    expect(_psiRenderArgs!.provavel).toBe(false);
    expect(_psiRenderArgs!.emVigorTexto).toContain("não são exigíveis a esta organização");
    expect(_psiRenderArgs!.isFora).toBe(true);
    expect(_psiRenderArgs!.isCondicional).toBe(false);
  });

  it("fora_condicional → classificacaoLabel sem 'Provavelmente' (removido)", async () => {
    setupWith(ANSWERS_FORA, "fora_condicional");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.classificacaoLabel).not.toContain("Provavelmente");
    expect(_psiRenderArgs!.classificacaoLabel).toContain("orientação preliminar");
  });

  // ── fora (fora_mvp) — também escapava ─────────────────────────────────────

  it("fora_mvp → sec3Title 'das entidades abrangidas', isFora=true (era 'de si hoje' antes do fix)", async () => {
    setupWith(ANSWERS_FORA_MVP, "fora_mvp");
    await generateRelatorioEnquadramento(99, 1);
    expect(_psiRenderArgs!.sec3Title).toBe("3. O que a lei exige das entidades abrangidas");
    expect(_psiRenderArgs!.isFora).toBe(true);
    expect(_psiRenderArgs!.provavel).toBe(false);
    expect(_psiRenderArgs!.emVigorTexto).toContain("não são exigíveis a esta organização");
  });
});

// ===========================================================================
// isProfileComplete / getMissingProfileFields — perfil completo (Opção A)
// ===========================================================================

describe("isProfileComplete / getMissingProfileFields — perfil completo (Opção A)", () => {
  const COMPLETE_ORG_FIELDS = {
    legalName: "Empresa Teste, Lda.",
    taxId: "PT509123456",
    address: "Rua Exemplo, 123",
    caeCode: "62010",
    legalRepresentative: "João Silva",
    legalRepresentativeRole: "Gerente",
    securityOfficerName: "Ana Costa",
    securityOfficerTaxId: "123456789",
    securityOfficerRole: "CISO",
    securityOfficerStartDate: "2024-01-01",
    securityOfficerEmail: "ana@empresa.pt",
    securityOfficerPhone: "912345678",
    city: "Lisboa",
    ceoName: "Carlos Mendes",
    ceoContact: "ceo@empresa.pt",
  };

  it("perfil com os 15 campos preenchidos → true, sem campos em falta", () => {
    expect(isProfileComplete(COMPLETE_ORG_FIELDS)).toBe(true);
    expect(getMissingProfileFields(COMPLETE_ORG_FIELDS)).toEqual([]);
  });

  it("perfil sem CISO (securityOfficerName) → incompleto, lista o campo", () => {
    const org = { ...COMPLETE_ORG_FIELDS, securityOfficerName: null };
    expect(isProfileComplete(org)).toBe(false);
    expect(getMissingProfileFields(org)).toContain("nome do CISO");
  });

  it("perfil com vários campos em falta → lista TODOS de uma vez, não só o primeiro", () => {
    const org = { ...COMPLETE_ORG_FIELDS, taxId: null, ceoName: "", city: undefined };
    const missing = getMissingProfileFields(org);
    expect(missing).toContain("NIF");
    expect(missing).toContain("nome do CEO");
    expect(missing).toContain("localidade");
    expect(missing).toHaveLength(3);
  });

  it("campos opcionais (countriesOfOperation/employeeCount/annualTurnover) NÃO afetam a completude", () => {
    const org = { ...COMPLETE_ORG_FIELDS, countriesOfOperation: [], employeeCount: null, annualTurnover: null };
    expect(isProfileComplete(org)).toBe(true);
  });
});

// ===========================================================================
// Dossier de Conformidade NIS2 — generateDossier (6º e último documento)
// ===========================================================================

describe("generateDossier — Dossier de Conformidade NIS2 (Índice Mestre)", () => {
  const COMPLETE_ORG = {
    ...FAKE_ORG,
    legalName: "Empresa Teste, Lda.",
    taxId: "PT509123456",
    address: "Rua Exemplo, 123",
    caeCode: "62010",
    legalRepresentative: "João Silva",
    legalRepresentativeRole: "Gerente",
    securityOfficerName: "Ana Costa",
    securityOfficerTaxId: "123456789",
    securityOfficerRole: "CISO",
    securityOfficerStartDate: "2024-01-01",
    securityOfficerEmail: "ana@empresa.pt",
    securityOfficerPhone: "912345678",
    city: "Lisboa",
    ceoName: "Carlos Mendes",
    ceoContact: "ceo@empresa.pt",
  };

  const DOSSIER_SETUP_OK = () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue(COMPLETE_ORG as any);
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion: ENGINE_VERSION, classification: "importante",
    } as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue({
      id: 1, articleScores: {}, completedAt: new Date("2026-07-01"),
    } as any);
    vi.mocked(db.getLatestCompletedScanForOrg).mockResolvedValue({
      id: 1, organizationId: 1, status: "completed", completedAt: new Date("2026-07-15"),
    } as any);
  };

  it("as 4 fontes completas → os 28 estados corretos (11 disponível / 15 empresa / 2 N/A), zero chavetas", async () => {
    DOSSIER_SETUP_OK();
    await generateDossier(1);

    // Amostra: D01 disponível, D04 empresa, D23 N/A, D28 disponível
    expect(_cellWrites.get("10:5")).toBe("✅ Disponível na plataforma"); // D01
    expect(_cellWrites.get("13:5")).toBe("🔴 A cargo da empresa");       // D04
    expect(_cellWrites.get("37:5")).toBe("— N/A");                       // D23
    expect(_cellWrites.get("43:5")).toBe("✅ Disponível na plataforma"); // D28

    // Contagem completa dos 28 — tem de bater exatamente 11/15/2.
    const allRows = [10,11,12,13,14, 16,17,18, 20,21,22,23, 25,26,27,28,29, 31,32,33, 35,36,37,38, 40,41,42,43];
    expect(allRows).toHaveLength(28);
    const estados = allRows.map((r) => _cellWrites.get(`${r}:5`));
    expect(estados.filter((e) => e === "✅ Disponível na plataforma")).toHaveLength(11);
    expect(estados.filter((e) => e === "🔴 A cargo da empresa")).toHaveLength(15);
    expect(estados.filter((e) => e === "— N/A")).toHaveLength(2);
    // Nenhum dos 28 fica por preencher.
    expect(estados.every((e) => e !== undefined && e !== null)).toBe(true);
  });

  it("cabeçalho: empresa, referência DOSSIER-{ano}-{orgId com 6 dígitos}, data por extenso", async () => {
    vi.setSystemTime(new Date("2026-08-06"));
    DOSSIER_SETUP_OK();
    await generateDossier(42);
    expect(_headerWrites.get("B3")).toBe("Empresa: Empresa Teste, Lda.");
    expect(_headerWrites.get("E3")).toBe("Referência: DOSSIER-2026-000042");
    expect(_headerWrites.get("B4")).toBe("Data: 6 de agosto de 2026");
  });

  it("TRAVA: falta o questionário → erro menciona-o", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue(COMPLETE_ORG as any);
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion: ENGINE_VERSION,
    } as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue(null as any);
    vi.mocked(db.getLatestCompletedScanForOrg).mockResolvedValue({
      id: 1, organizationId: 1, status: "completed", completedAt: new Date(),
    } as any);

    const err = await generateDossier(1).catch((e) => e);
    expect(err).toBeDefined();
    expect(err.message).toContain("Complete primeiro");
    expect(err.message).toContain("questionário de autoavaliação");
  });

  it("TRAVA: faltam 2 fontes (perfil incompleto + scan) → lista as 2 de uma vez", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue({ ...COMPLETE_ORG, securityOfficerName: null } as any);
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion: ENGINE_VERSION,
    } as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue({
      id: 1, articleScores: {}, completedAt: new Date(),
    } as any);
    vi.mocked(db.getLatestCompletedScanForOrg).mockResolvedValue(null as any);

    const err = await generateDossier(1).catch((e) => e);
    expect(err).toBeDefined();
    expect(err.message).toContain("perfil da entidade");
    expect(err.message).toContain("nome do CISO");
    expect(err.message).toContain("scan de segurança");
  });

  it("TRAVA: enquadramento com motor desatualizado → erro específico (não 'em falta' genérico)", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getOrganizationById).mockResolvedValue(COMPLETE_ORG as any);
    vi.mocked(db.getLatestFrameworkAssessmentByOrgId).mockResolvedValue({
      id: 1, organizationId: 1, engineVersion: "1",
    } as any);
    vi.mocked(db.getLatestCompletedQuestionnaireForOrg).mockResolvedValue({
      id: 1, articleScores: {}, completedAt: new Date(),
    } as any);
    vi.mocked(db.getLatestCompletedScanForOrg).mockResolvedValue({
      id: 1, organizationId: 1, status: "completed", completedAt: new Date(),
    } as any);

    const err = await generateDossier(1).catch((e) => e);
    expect(err).toBeDefined();
    expect(err.message).toContain("motor desatualizado");
  });

  it("isolamento — todas as fontes pedidas com o MESMO orgId, nunca outro", async () => {
    DOSSIER_SETUP_OK();
    await generateDossier(7);
    expect(vi.mocked(db.getOrganizationById)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getLatestFrameworkAssessmentByOrgId)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getLatestCompletedQuestionnaireForOrg)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getLatestCompletedScanForOrg)).toHaveBeenCalledWith(7);
    expect(vi.mocked(db.getOrganizationById)).not.toHaveBeenCalledWith(1);
  });

  it("guard de template em falta lança erro claro com nome do ficheiro xlsx", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(generateDossier(1)).rejects.toThrow(
      "[Documentos] Template não encontrado: dossier-conformidade-template.xlsx"
    );
  });
});
