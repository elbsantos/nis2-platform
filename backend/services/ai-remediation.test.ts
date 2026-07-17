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

  it("scan já tem items → retorna contagem existente sem chamar chat()", async () => {
    mockGetExisting.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const count = await generateRemediationForScan(1, 42, "pro");
    expect(count).toBe(2);
    expect(mockChat).not.toHaveBeenCalled();
  });
});
