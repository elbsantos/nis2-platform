/**
 * backend/services/document-generator.test.ts
 *
 * C14b: guard de template, CONTENT_TYPES, Buffer base64
 * C15: aggregateRiskGroups (puro), riskSummary vs. NVD, fallbacks,
 *      probability/impact, fórmulas H/I intocadas, excedente 30 linhas
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";

// ---------------------------------------------------------------------------
// Mocks de módulo (hoisted antes de qualquer import)
// ---------------------------------------------------------------------------

// Tracking state de escritas de células — reset em afterEach
let _cellWrites: Map<string, any> = new Map();
let _headerWrites: Map<string, any> = new Map();

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
  });
  return {
    default: {
      Workbook: class MockWorkbook {
        xlsx = {
          readFile: vi.fn().mockResolvedValue(undefined),
          writeBuffer: vi.fn().mockResolvedValue(Buffer.from("DUMMY_XLSX")),
        };
        getWorksheet = vi.fn(() => makeSheet());
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
    render = vi.fn();
    getZip = vi.fn().mockReturnValue({
      generate: vi.fn().mockReturnValue(Buffer.from("DUMMY_DOCX")),
    });
  },
}));

vi.mock("../db", () => ({
  getScanById:              vi.fn(),
  getOrganizationById:      vi.fn(),
  getVulnerabilitiesByScanId: vi.fn(),
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
  aggregateRiskGroups,
  CONTENT_TYPES,
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
  _cellWrites   = new Map();
  _headerWrites = new Map();
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
    const buf = await generateInventarioAtivos(1, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("generatePsi devolve Buffer não vazio", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("DUMMY_DOCX") as any);
    const buf = await generatePsi(1);
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

  it("medida de tratamento usa primeiro passo + sufixo da plataforma", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue({
      riskSummary: "Risco de execução remota",
      steps: [
        { order: 2, instruction: "Reiniciar o serviço", platform: "generic" },
        { order: 1, instruction: "Atualizar o pacote", platform: "generic" },
      ],
    } as any);

    await generateRegistoRiscos(1, 1);

    // J (col 10): deve ser o passo com order=1 (o mais baixo) + sufixo
    expect(_cellWrites.get("8:10")).toBe(
      "Atualizar o pacote — plano completo na plataforma"
    );
  });

  it("fallback de tratamento quando biblioteca não tem steps", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue({
      riskSummary: "Risco de execução remota",
      steps: [],
    } as any);

    await generateRegistoRiscos(1, 1);

    expect(_cellWrites.get("8:10")).toBe(
      "[Gerar plano de remediação IA na plataforma]"
    );
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

  it("estado (col 12) e responsável (col 11) ficam vazios", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(db.getScanById).mockResolvedValue({
      ...FAKE_SCAN,
      results: { vulnerabilities: [VULN] },
    });
    vi.mocked(db.getOrganizationById).mockResolvedValue(FAKE_ORG);
    vi.mocked(db.getVulnerabilitiesByScanId).mockResolvedValue([]);
    vi.mocked(aiRemediation.lookupLibrary).mockResolvedValue(null);

    await generateRegistoRiscos(1, 1);

    // nunca escritos
    expect(_cellWrites.has("8:11")).toBe(false); // K: Responsável
    expect(_cellWrites.has("8:12")).toBe(false); // L: Estado
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
