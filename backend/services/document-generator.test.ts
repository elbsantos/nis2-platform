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
  getScanById:                  vi.fn(),
  getOrganizationById:          vi.fn(),
  getVulnerabilitiesByScanId:   vi.fn(),
  getFrameworkAssessmentById:   vi.fn(),
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
  generateRelatorioEnquadramento,
  aggregateRiskGroups,
  preFillPainel,
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

  it("campos manuais ficam com placeholder '[A PREENCHER]'", async () => {
    PSI_SETUP();
    await generatePsi(1);
    expect(_psiRenderArgs!.data_aprovacao).toBe("[A PREENCHER]");
    expect(_psiRenderArgs!.aprovado_por).toBe("[A PREENCHER]");
    expect(_psiRenderArgs!.cargo).toBe("[A PREENCHER]");
    expect(_psiRenderArgs!.data_revisao).toBe("[A PREENCHER]");
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
// C-EQ4 — generateRelatorioEnquadramento
// ===========================================================================

// Fixture com output REAL do evaluateTree (motor v3):
//   evaluateTree(NIS2_PT_TREE, { "A.setor":"industria","C.estrutura":"autonoma","D.n":"80","D.vn":"12","D.b":"5" })
//   → path: ["A","C","D","E"]
//   → legalBasis: ["Art. 3.º do RJC","Rec. 2003/361/CE","Anexo III DL 125/2025","Art. 6.º do RJC"]
//   → classification: "importante"
//   → resultLabel: "Entidade importante — Anexo II, média/grande dimensão (Art. 6.º/2 do RJC)."
const FAKE_ASSESSMENT = {
  id:             99,
  organizationId: 1,
  userId:         1,
  frameworkSlug:  "nis2-pt-dl125",
  classification: "importante",
  resultLabel:    "Entidade importante — Anexo II, média/grande dimensão (Art. 6.º/2 do RJC).",
  engineVersion:  ENGINE_VERSION, // antes: "1" (motor está em v3; guard exige versão actual)
  status:         "completed",
  decisionPath:   ["A", "C", "D", "E"],
  legalBasis:     ["Art. 3.º do RJC", "Rec. 2003/361/CE", "Anexo III DL 125/2025", "Art. 6.º do RJC"],
  answers:        { "A.setor": "industria", "C.estrutura": "autonoma", "D.n": "80", "D.vn": "12", "D.b": "5" },
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
    expect(steps[2]!.label).toContain("VN: 12 M€");
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
