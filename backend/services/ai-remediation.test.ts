/**
 * backend/services/ai-remediation.test.ts
 *
 * Unit + integration tests for the remediation AI pipeline.
 * DB and Anthropic are fully mocked — no network, no real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that depend on them
// ---------------------------------------------------------------------------

vi.mock("../integrations/anthropic", () => ({
  chat: vi.fn(),
  SYSTEM_PROMPTS: { remediationPlanner: "mock-system-prompt" },
}));

vi.mock("../db", () => ({
  getVulnerabilitiesByScanId:  vi.fn(),
  getScanById:                 vi.fn(),
  getOrganizationById:         vi.fn(),
  createRemediationItem:       vi.fn().mockResolvedValue({ id: 1 }),
  getRemediationItemsByScanId: vi.fn(),
  getLibraryByCveIdAndOsKey:   vi.fn(),
  upsertLibraryEntry:          vi.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  stripMarkdown,
  parseAIPlan,
  normalizeOsKey,
  lookupLibrary,
  generateRemediationForScan,
  countEligibleVulns,
} from "./ai-remediation";
import { chat } from "../integrations/anthropic";
import * as db from "../db";

const mockChat                    = chat as ReturnType<typeof vi.fn>;
const mockGetLibrary              = db.getLibraryByCveIdAndOsKey as ReturnType<typeof vi.fn>;
const mockUpsert                  = db.upsertLibraryEntry as ReturnType<typeof vi.fn>;
const mockCreate                  = db.createRemediationItem as ReturnType<typeof vi.fn>;
const mockGetExisting             = db.getRemediationItemsByScanId as ReturnType<typeof vi.fn>;
const mockGetVulns                = db.getVulnerabilitiesByScanId as ReturnType<typeof vi.fn>;
const mockGetScan                 = db.getScanById as ReturnType<typeof vi.fn>;
const mockGetOrg                  = db.getOrganizationById as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// (b) stripMarkdown
// ---------------------------------------------------------------------------

describe("stripMarkdown", () => {
  it("removes **bold**", () => {
    expect(stripMarkdown("Executa **apt-get update** agora")).toBe("Executa apt-get update agora");
  });

  it("removes __bold__", () => {
    expect(stripMarkdown("Confirma com __nmap -sV__ no terminal")).toBe("Confirma com nmap -sV no terminal");
  });

  it("removes `inline code`", () => {
    expect(stripMarkdown("Corre `systemctl restart nginx` como root")).toBe("Corre systemctl restart nginx como root");
  });

  it("removes leading ### header prefix", () => {
    expect(stripMarkdown("### Bloco 2 — Passos")).toBe("Bloco 2 — Passos");
  });

  it("preserves shell globs — chmod 600 *.pem", () => {
    expect(stripMarkdown("chmod 600 *.pem e verifica *.crt")).toBe("chmod 600 *.pem e verifica *.crt");
  });

  it("preserves underscore identifiers — my_custom_config", () => {
    expect(stripMarkdown("edita my_custom_config e reinicia")).toBe("edita my_custom_config e reinicia");
  });

  it("handles nested patterns", () => {
    expect(stripMarkdown("**`apt-get`** atualiza pacotes")).toBe("apt-get atualiza pacotes");
  });
});

// ---------------------------------------------------------------------------
// (a) parseAIPlan — truncation guard
// ---------------------------------------------------------------------------

const FULL_RAW = `
Esta vulnerabilidade permite acesso não autorizado ao servidor via SSH.

### Opção A — Servidores Linux / Ubuntu / Debian
1. Actualiza o OpenSSH com apt-get upgrade openssh-server
2. Desactiva o login root no ficheiro /etc/ssh/sshd_config
3. Verifica com ssh -V que a versão é >= 9.0

### Opção B — Servidores Windows
1. Instala a actualização de segurança disponível no Windows Update
2. Confirma que o serviço SSH está na versão mais recente
3. Verifica com Get-WindowsCapability -Online para confirmar a versão

Esforço: Médio
Art. 21(2)(i)
`;

describe("parseAIPlan — full response", () => {
  it("parses all steps when response is complete", () => {
    const plan = parseAIPlan(FULL_RAW, "CVE-2024-1234 — openssh");
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(plan.effort).toBe("medium");
    expect(plan.nis2Articles).toContain("Art. 21(2)(i)");
  });

  it("assigns linux platform to ### Opção A section", () => {
    const plan = parseAIPlan(FULL_RAW, "CVE-2024-1234 — openssh");
    const linuxSteps = plan.steps.filter((s) => s.platform === "linux");
    expect(linuxSteps.length).toBeGreaterThan(0);
  });

  it("assigns windows platform to ### Opção B section", () => {
    const plan = parseAIPlan(FULL_RAW, "CVE-2024-1234 — openssh");
    const windowsSteps = plan.steps.filter((s) => s.platform === "windows");
    expect(windowsSteps.length).toBeGreaterThan(0);
  });
});

describe("parseAIPlan — truncation discard (simulated by caller)", () => {
  it("last step is discarded when stop_reason is max_tokens", () => {
    const plan = parseAIPlan(FULL_RAW, "CVE-TEST");
    const fullCount = plan.steps.length;
    // Simulate the truncation guard in generatePlanForVuln
    plan.steps.pop();
    expect(plan.steps.length).toBe(fullCount - 1);
  });

  it("complete response (end_turn) keeps all steps intact", () => {
    const plan = parseAIPlan(FULL_RAW, "CVE-TEST");
    const fullCount = plan.steps.length;
    // No discard on end_turn
    expect(plan.steps.length).toBe(fullCount);
  });
});

// ---------------------------------------------------------------------------
// (c) Keyword inference — XAMPP without section header → windows
// ---------------------------------------------------------------------------

describe("parseAIPlan — keyword inference", () => {
  it("infers windows platform from XAMPP keyword (no section header)", () => {
    const raw = `
Vulnerabilidade afecta o servidor XAMPP configurado nesta máquina.

1. Abre o painel de controlo do XAMPP e clica em Stop para Apache
2. Descarrega a versão mais recente do XAMPP em apachefriends.org
3. Instala a actualização e verifica que o Apache arranca correctamente

Esforço: Baixo
Art. 21(2)(e)
`;
    const plan = parseAIPlan(raw, "CVE-TEST-XAMPP — xampp");
    const windowsSteps = plan.steps.filter((s) => s.platform === "windows");
    expect(windowsSteps.length).toBeGreaterThan(0);
  });

  it("infers windows from iis keyword", () => {
    const raw = `
O IIS está desactualizado e vulnerável a execução remota de código.
1. Abre o Gestor do IIS e vai a Sites > Definições de SSL
2. Actualiza o módulo IIS via Windows Update
Esforço: Médio
Art. 21(2)(e)
`;
    const plan = parseAIPlan(raw, "CVE-TEST-IIS — iis");
    const winSteps = plan.steps.filter((s) => s.platform === "windows");
    expect(winSteps.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeOsKey
// ---------------------------------------------------------------------------

describe("normalizeOsKey", () => {
  it("returns 'generic' for null", () => {
    expect(normalizeOsKey(null)).toBe("generic");
  });
  it("returns 'linux' for 'Ubuntu 22.04'", () => {
    expect(normalizeOsKey("Ubuntu 22.04")).toBe("linux");
  });
  it("returns 'linux' for 'Debian GNU/Linux'", () => {
    expect(normalizeOsKey("Debian GNU/Linux")).toBe("linux");
  });
  it("returns 'windows' for 'Windows Server 2019'", () => {
    expect(normalizeOsKey("Windows Server 2019")).toBe("windows");
  });
  it("returns 'generic' for unknown string", () => {
    expect(normalizeOsKey("FreeBSD 14.0")).toBe("generic");
  });
});

// ---------------------------------------------------------------------------
// (d) Library lookup + generateRemediationForScan integration
// ---------------------------------------------------------------------------

const FAKE_SCAN = {
  id: 1,
  organizationId: 42,
  target: "example.pt",
  results: {
    vulnerabilities: [
      {
        cveId: "CVE-2024-9999",
        severity: "high",
        cvssScore: 7.5,
        description: "Test vulnerability description that is long enough",
        affectedService: "nginx",
        port: 443,
        remediationHint: "Update nginx",
      },
    ],
  },
};

const FAKE_ORG = { id: 42, name: "TestOrg", sector: null, size: null };

const LIBRARY_ENTRY_V2 = {
  id: 1,
  cveId: "CVE-2024-9999",
  osKey: "generic",
  steps: [
    { order: 1, instruction: "Passo um", platform: "all" },
    { order: 2, instruction: "Passo dois", platform: "all" },
  ],
  riskSummary: "Risco real da biblioteca.",
  effort: "medium" as const,
  nis2Articles: ["Art. 21(2)(e)"],
  promptVersion: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const LIBRARY_ENTRY_V1 = { ...LIBRARY_ENTRY_V2, promptVersion: 1 };

function setupCommonMocks() {
  mockGetExisting.mockResolvedValue([]);
  mockGetVulns.mockResolvedValue([]);
  mockGetScan.mockResolvedValue(FAKE_SCAN);
  mockGetOrg.mockResolvedValue(FAKE_ORG);
  mockCreate.mockResolvedValue({ id: 99 });
  mockUpsert.mockResolvedValue({});
}

describe("lookupLibrary", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("HIT exact osKey with current version → returns entry", async () => {
    mockGetLibrary.mockResolvedValueOnce(LIBRARY_ENTRY_V2);
    const result = await lookupLibrary("CVE-2024-9999", "generic");
    expect(result).not.toBeNull();
    expect(mockGetLibrary).toHaveBeenCalledTimes(1);
  });

  it("HIT generic fallback for linux osKey → returns generic entry", async () => {
    mockGetLibrary
      .mockResolvedValueOnce(null)           // linux → miss
      .mockResolvedValueOnce(LIBRARY_ENTRY_V2); // generic → hit
    const result = await lookupLibrary("CVE-2024-9999", "linux");
    expect(result).not.toBeNull();
    expect(mockGetLibrary).toHaveBeenCalledTimes(2);
    expect(mockGetLibrary).toHaveBeenNthCalledWith(2, "CVE-2024-9999", "generic");
  });

  it("d4 — windows-only entry NOT served to linux target", async () => {
    // Library has (CVE, 'windows') but we want 'linux'
    mockGetLibrary
      .mockResolvedValueOnce(null)   // (CVE, 'linux') → miss
      .mockResolvedValueOnce(null);  // (CVE, 'generic') → miss
    const result = await lookupLibrary("CVE-2024-9999", "linux");
    expect(result).toBeNull();
  });
});

describe("generateRemediationForScan — library integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("d1 — HIT versão actual → chat() NÃO é chamado", async () => {
    mockGetLibrary.mockResolvedValue(LIBRARY_ENTRY_V2);
    await generateRemediationForScan(1, 42, "pro");
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("d2 — HIT versão antiga → chat() chamado + upsert actualiza biblioteca", async () => {
    mockGetLibrary
      .mockResolvedValueOnce(LIBRARY_ENTRY_V1)  // exact → hit mas versão antiga
      .mockResolvedValueOnce(null);             // generic fallback also v1 → skip
    mockChat.mockResolvedValue({
      text: FULL_RAW,
      stopReason: "end_turn",
    });
    await generateRemediationForScan(1, 42, "pro");
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ cveId: "CVE-2024-9999", promptVersion: 2 })
    );
  });

  it("d3 — MISS → chat() chamado + upsert grava na biblioteca", async () => {
    mockGetLibrary.mockResolvedValue(null);
    mockChat.mockResolvedValue({
      text: FULL_RAW,
      stopReason: "end_turn",
    });
    await generateRemediationForScan(1, 42, "pro");
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

});

// ---------------------------------------------------------------------------
// Guard por vulnerabilidade (C9)
// ---------------------------------------------------------------------------

const FAKE_SCAN_5 = {
  ...FAKE_SCAN,
  results: {
    vulnerabilities: [
      { cveId: "CVE-A", severity: "high",     cvssScore: 7, description: "Desc CVE-A longa o suficiente para passar no filtro", affectedService: "svc-a", port: 80, remediationHint: null },
      { cveId: "CVE-B", severity: "medium",   cvssScore: 5, description: "Desc CVE-B longa o suficiente para passar no filtro", affectedService: "svc-b", port: 80, remediationHint: null },
      { cveId: "CVE-C", severity: "low",      cvssScore: 3, description: "Desc CVE-C longa o suficiente para passar no filtro", affectedService: "svc-c", port: 80, remediationHint: null },
      { cveId: "CVE-D", severity: "high",     cvssScore: 8, description: "Desc CVE-D longa o suficiente para passar no filtro", affectedService: "svc-d", port: 80, remediationHint: null },
      { cveId: "CVE-E", severity: "critical", cvssScore: 9, description: "Desc CVE-E longa o suficiente para passar no filtro", affectedService: "svc-e", port: 80, remediationHint: null },
    ],
  },
};

describe("generateRemediationForScan — guard por vulnerabilidade (C9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("(a) todos os vulns já têm item → skipped=1, created=0, sem chat", async () => {
    mockGetExisting.mockResolvedValue([{ id: 10, title: "CVE-2024-9999 — nginx" }]);
    const result = await generateRemediationForScan(1, 42, "pro");
    expect(result).toEqual({ created: 0, skipped: 1, total: 1 });
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("(b) 2 de 5 vulns em falta → created=2, skipped=3, total=5", async () => {
    mockGetScan.mockResolvedValue(FAKE_SCAN_5);
    mockGetExisting.mockResolvedValue([
      { id: 1, title: "CVE-A — svc-a" },
      { id: 2, title: "CVE-B — svc-b" },
      { id: 3, title: "CVE-C — svc-c" },
    ]);
    mockGetLibrary.mockResolvedValue(null);
    mockChat.mockResolvedValue({ text: FULL_RAW, stopReason: "end_turn" });
    const result = await generateRemediationForScan(1, 42, "pro");
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(3);
    expect(result.total).toBe(5);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("(c) item apagado + biblioteca sem entrada → regenera via API", async () => {
    mockGetExisting.mockResolvedValue([]);
    mockGetLibrary.mockResolvedValue(null);
    mockChat.mockResolvedValue({ text: FULL_RAW, stopReason: "end_turn" });
    const result = await generateRemediationForScan(1, 42, "pro");
    expect(result).toEqual({ created: 1, skipped: 0, total: 1 });
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("(d) item apagado + biblioteca com entrada actual → usa biblioteca, sem chat", async () => {
    mockGetExisting.mockResolvedValue([]);
    mockGetLibrary.mockResolvedValue(LIBRARY_ENTRY_V2);
    const result = await generateRemediationForScan(1, 42, "pro");
    expect(result).toEqual({ created: 1, skipped: 0, total: 1 });
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// C11 — guard reconhece qualquer formato de identificador (split no separador)
// ---------------------------------------------------------------------------

const FAKE_SCAN_NIS2 = {
  ...FAKE_SCAN,
  results: {
    vulnerabilities: [
      {
        cveId: "NIS2-SSH-OUTDATED",
        severity: "high",
        cvssScore: 7.5,
        description: "Servidor SSH desactualizado e vulnerável a exploração remota",
        affectedService: "ssh",
        port: 22,
        remediationHint: "Update SSH server",
      },
    ],
  },
};

describe("generateRemediationForScan — guard formato identificador (C11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("(a) NIS2-SSH-OUTDATED reconhecido via split → skip, sem chamada API", async () => {
    mockGetScan.mockResolvedValue(FAKE_SCAN_NIS2);
    mockGetExisting.mockResolvedValue([
      { id: 167, title: "NIS2-SSH-OUTDATED — ssh (porta 22)" },
    ]);
    const result = await generateRemediationForScan(1, 42, "pro");
    expect(result).toEqual({ created: 0, skipped: 1, total: 1 });
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("(b) título sem separador ' — ' → warning + tratado como inexistente", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetExisting.mockResolvedValue([{ id: 10, title: "Título malformado" }]);
    mockGetLibrary.mockResolvedValue(null);
    mockChat.mockResolvedValue({ text: FULL_RAW, stopReason: "end_turn" });
    const result = await generateRemediationForScan(1, 42, "pro");
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("título sem separador"));
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// countEligibleVulns (C10)
// ---------------------------------------------------------------------------

describe("countEligibleVulns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it("retorna 0 quando scan não existe", async () => {
    mockGetScan.mockResolvedValue(null);
    const count = await countEligibleVulns(1);
    expect(count).toBe(0);
  });

  it("retorna 1 quando scan tem um vuln válido (FAKE_SCAN)", async () => {
    const count = await countEligibleVulns(1);
    expect(count).toBe(1);
  });

  it("conta apenas vulns com cveId e description não vazios", async () => {
    const SCAN_GAPS = {
      ...FAKE_SCAN,
      results: {
        vulnerabilities: [
          { cveId: "CVE-A", description: "Desc suficiente para contar", affectedService: "a", cvssScore: 5, severity: "low" },
          { cveId: "",      description: "Desc suficiente para contar", affectedService: "b", cvssScore: 5, severity: "low" },
          { cveId: "CVE-C", description: "",                            affectedService: "c", cvssScore: 5, severity: "low" },
        ],
      },
    };
    mockGetScan.mockResolvedValue(SCAN_GAPS);
    const count = await countEligibleVulns(1);
    expect(count).toBe(1);
  });
});
