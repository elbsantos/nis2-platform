/**
 * server/services/scan-executor.test.ts
 *
 * Unit tests for the NIS2 scanner.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ShodanHostResult } from "../integrations/shodan";
import type { CensysHostResult } from "../integrations/censys";

// Mock all integrations and external dependencies
vi.mock("../integrations/shodan", () => ({
  lookupHost: vi.fn(),
}));

vi.mock("../integrations/censys", () => ({
  lookupHost: vi.fn(),
}));

vi.mock("../integrations/direct-tls", () => ({
  checkDirectTls: vi.fn().mockResolvedValue(null),
}));

vi.mock("../integrations/http-headers", () => ({
  checkHttpHeaders: vi.fn().mockResolvedValue(null),
}));

vi.mock("../integrations/email-security", () => ({
  checkEmailSecurity: vi.fn().mockResolvedValue(null),
}));

vi.mock("../integrations/ssh-check", () => ({
  checkSsh: vi.fn().mockResolvedValue(null),
}));

vi.mock("../integrations/dark-web", () => ({
  checkDarkWeb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../integrations/nvd", () => ({
  batchLookupCveVersionRanges: vi.fn().mockResolvedValue(new Map()),
  isVersionInNvdRanges: vi.fn().mockReturnValue(true),
}));

vi.mock("../db", () => ({
  updateScanStatus: vi.fn().mockResolvedValue(undefined),
  createVulnerability: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("dns/promises", () => ({
  resolveTxt: vi.fn(),
}));

import { executeAgentlessScan, verifyOwnership } from "./scan-executor";
import { lookupHost as shodanLookup } from "../integrations/shodan";
import { lookupHost as censysLookup } from "../integrations/censys";
import { checkHttpHeaders } from "../integrations/http-headers";
import { batchLookupCveVersionRanges, isVersionInNvdRanges } from "../integrations/nvd";
import { checkSsh } from "../integrations/ssh-check";
import { resolveTxt } from "dns/promises";

describe("verifyOwnership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Domain — DNS TXT path
  it("returns verified=true when DNS TXT record matches", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=123"]]);
    const result = await verifyOwnership("example.com", 123);
    expect(result.verified).toBe(true);
    expect(result.method).toBe("dns-txt");
  });

  it("returns verified=false when DNS TXT record missing", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["other-record"]]);
    const result = await verifyOwnership("example.com", 123);
    expect(result.verified).toBe(false);
  });

  it("returns verified=false on DNS lookup failure", async () => {
    vi.mocked(resolveTxt).mockRejectedValue(new Error("NXDOMAIN"));
    const result = await verifyOwnership("nonexistent.local", 123);
    expect(result.verified).toBe(false);
  });

  // IP — HTTP .well-known path (http module is not mocked, so this returns false)
  it("returns verified=false for IP when .well-known is unreachable", async () => {
    const result = await verifyOwnership("185.0.0.1", 42);
    expect(result.verified).toBe(false);
  });
});

describe("executeAgentlessScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CENSYS_ENABLED;
  });

  afterEach(() => {
    delete process.env.CENSYS_ENABLED;
  });

  it("fails if ownership verification fails", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([]);
    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "example.com",
      mode: "sme",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("ownership");
  });

  it("completes successfully with Shodan + Censys data", async () => {
    process.env.CENSYS_ENABLED = "true"; // activar explicitamente para testar o caminho Censys
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);

    const shodanData: ShodanHostResult = {
      ip: "1.2.3.4",
      hostnames: ["example.com"],
      tags: [],
      cpes: [],
      vulns: ["CVE-2021-1234"],
      ports: [
        {
          port: 443,
          transport: "tcp",
          product: "nginx",
          version: "1.20.0",
          vulns: {
            "CVE-2021-1234": {
              cvss: 7.5,
              summary: "Buffer overflow in nginx",
              references: [],
            },
          },
        },
      ],
    };

    const censysData: CensysHostResult = {
      ip: "1.2.3.4",
      services: [],
      tlsIssues: [],
    };

    vi.mocked(shodanLookup).mockResolvedValue(shodanData);
    vi.mocked(censysLookup).mockResolvedValue(censysData);

    // Gate 2 exige hasRangeData=true + versão no intervalo
    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(new Map([
      ["CVE-2021-1234", {
        cveId: "CVE-2021-1234",
        ranges: [{ versionStartIncluding: "1.0.0", versionEndExcluding: "2.0.0" }],
        hasRangeData: true,
        affectedProducts: ["nginx:nginx"],
      }],
    ]));

    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "example.com",
      mode: "sme",
    });

    expect(result.success).toBe(true);
    expect(result.vulnerabilities.length).toBeGreaterThan(0);
    expect(result.vulnerabilities[0].cveId).toBe("CVE-2021-1234");
    expect(result.nis2Scores.length).toBe(10); // 10 articles
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(vi.mocked(censysLookup)).toHaveBeenCalledTimes(1); // CENSYS_ENABLED=true → deve ser chamado
  });

  it("Censys desactivado por omissão — lookupHost não é invocado por scan", async () => {
    // CENSYS_ENABLED não definido (beforeEach garante isso)
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4",
      hostnames: [],
      tags: [],
      cpes: [],
      vulns: [],
      ports: [{ port: 443, transport: "tcp" }],
    });

    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "example.com",
      mode: "sme",
    });

    expect(result.success).toBe(true);
    expect(vi.mocked(censysLookup)).not.toHaveBeenCalled();
  });

  it("detects plain HTTP without HTTPS as NIS2-TLS-001", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);

    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4",
      hostnames: ["example.com"],
      tags: [],
      cpes: [],
      vulns: [],
      ports: [{ port: 80, transport: "tcp" }],
    });

    vi.mocked(censysLookup).mockResolvedValue({
      ip: "1.2.3.4",
      services: [],
      tlsIssues: [],
    });

    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "example.com",
      mode: "sme",
    });

    expect(result.success).toBe(true);
    const tlsVuln = result.vulnerabilities.find((v) => v.cveId === "NIS2-TLS-001");
    expect(tlsVuln).toBeDefined();
    expect(tlsVuln?.nis2Articles).toContain("Art. 21(2)(h)");
  });

  it("maps SSH CVE to Art. 21(2)(i)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);

    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4",
      hostnames: [],
      tags: [],
      cpes: [],
      vulns: [],
      ports: [{ port: 22, transport: "tcp" }],
    });
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });

    // Vulnerabilidades SSH injectadas directamente pelo ssh-check (bypass do filtro NVD)
    vi.mocked(checkSsh).mockResolvedValue({
      port: 22,
      software: "OpenSSH_8.4p1",
      version: "8.4p1",
      vulns: [{
        cveId:   "CVE-2021-SSH",
        cvssScore: 9.8,
        severity: "critical" as const,
        description: "SSH authentication bypass",
        nis2Articles: ["Art. 21(2)(i)"],
        cisControls: [],
        iso27001Controls: [],
        nistCsfControls: [],
        remediationHint: "Actualiza o OpenSSH",
      }],
      issues: [],
    });

    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "example.com",
      mode: "sme",
    });

    const sshVuln = result.vulnerabilities.find((v) => v.cveId === "CVE-2021-SSH");
    expect(sshVuln?.nis2Articles).toContain("Art. 21(2)(i)");
  });

  it("enriquece porto 80 com banner Server e CVEs via CPE quando InternetDB nao tem versao", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);

    // InternetDB: port 80 without product/version/vulns; host-level CVE + Apache CPE
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4",
      hostnames: ["example.com"],
      tags: [],
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-2014-0117"],
      ports: [{ port: 80, transport: "tcp" }],
    });

    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });

    // Server: header returns Apache/2.4.7
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [],
      score: 50,
      url: "http://example.com",
      serverBanner: "Apache/2.4.7 (Ubuntu)",
    });

    // NVD confirms CVE-2014-0117 affects apache:http_server
    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(
      new Map([
        [
          "CVE-2014-0117",
          {
            cveId: "CVE-2014-0117",
            ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.10" }],
            hasRangeData: true,
            affectedProducts: ["apache:http_server"],
          },
        ],
      ])
    );

    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "example.com",
      mode: "sme",
    });

    expect(result.success).toBe(true);
    // Port 80 should show apache 2.4.7, not unknown
    const port80 = result.openPorts.find((p) => p.port === 80);
    expect(port80?.service).toBe("apache");
    expect(port80?.version).toBe("2.4.7");
    // CVE-2014-0117 should appear (affects apache:http_server 2.4.7)
    const apacheCve = result.vulnerabilities.find((v) => v.cveId === "CVE-2014-0117");
    expect(apacheCve).toBeDefined();
    expect(apacheCve?.affectedService).toBe("apache");
  });

  // ── Testes do gate único nvdUnavailable ────────────────────────────────────

  // Helpers reutilizados nos testes abaixo
  function shodanApache(extraVulns: string[] = []): ShodanHostResult {
    return {
      ip: "1.2.3.4",
      hostnames: ["example.com"],
      tags: [],
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-CONFIRMED-001", "CVE-INDET-001", ...extraVulns],
      ports: [{ port: 80, transport: "tcp" }],
    };
  }

  type NvdPartial = {
    ranges?: any[];
    hasRangeData?: boolean;
    affectedProducts?: string[];
    nvdUnavailable?: boolean;
    cvssScore?: number;
  };

  function makeNvdMap(entries: Array<[string, NvdPartial]>) {
    return new Map(
      entries.map(([id, partial]) => [
        id,
        { cveId: id, ranges: [], hasRangeData: false, affectedProducts: [], ...partial },
      ])
    );
  }

  it("CVE com nvdUnavailable=true vai para indeterminateCves e não para vulnerabilities", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue(shodanApache());
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://example.com",
      serverBanner: "Apache/2.4.7",
    });

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-CONFIRMED-001", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
      }],
      ["CVE-INDET-001", { nvdUnavailable: true }],
    ]));

    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const result = await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });

    // CVE indeterminado NÃO está em vulnerabilities
    expect(result.vulnerabilities.find((v) => v.cveId === "CVE-INDET-001")).toBeUndefined();
    // CVE indeterminado ESTÁ em indeterminateCves
    const indet = result.indeterminateCves.find((c) => c.cveId === "CVE-INDET-001");
    expect(indet).toBeDefined();
    expect(indet?.reason).toBe("nvd_unavailable");
  });

  it("CVE confirmado pelo NVD (produto + intervalo) entra em vulnerabilities (regressão)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue(shodanApache());
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://example.com",
      serverBanner: "Apache/2.4.7",
    });

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-CONFIRMED-001", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
      }],
      ["CVE-INDET-001", { nvdUnavailable: true }],
    ]));

    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const result = await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });

    const confirmed = result.vulnerabilities.find((v) => v.cveId === "CVE-CONFIRMED-001");
    expect(confirmed).toBeDefined();
    expect(confirmed?.affectedService).toBe("apache");
  });

  it("CVE com produto NVD não correspondente é excluído (gate 1 preservado)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: [], tags: [],
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-MISMATCH-001"],
      ports: [{ port: 80, transport: "tcp" }],
    });
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://example.com",
      serverBanner: "Apache/2.4.7",
    });

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-MISMATCH-001", {
        hasRangeData: true,
        affectedProducts: ["openssl:openssl"],  // não é apache
        ranges: [{ versionStartIncluding: "1.0.0", versionEndExcluding: "3.0.0" }],
      }],
    ]));

    const result = await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });

    expect(result.vulnerabilities.find((v) => v.cveId === "CVE-MISMATCH-001")).toBeUndefined();
    expect(result.indeterminateCves.find((c) => c.cveId === "CVE-MISMATCH-001")).toBeUndefined();
  });

  it("CVE fora do intervalo de versão NVD é excluído (gate 2 preservado)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue(shodanApache(["CVE-OUTOFRANGE-001"]));
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://example.com",
      serverBanner: "Apache/2.4.7",
    });

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-CONFIRMED-001", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
      }],
      ["CVE-INDET-001", { nvdUnavailable: true }],
      ["CVE-OUTOFRANGE-001", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.50", versionEndExcluding: "2.5.0" }],
      }],
    ]));

    // isVersionInNvdRanges: true só para o CVE confirmado, false para o out-of-range
    vi.mocked(isVersionInNvdRanges)
      .mockImplementation((_ver: string, ranges: any[]) =>
        ranges[0]?.versionStartIncluding === "2.4.0"
      );

    const result = await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });

    expect(result.vulnerabilities.find((v) => v.cveId === "CVE-OUTOFRANGE-001")).toBeUndefined();
    expect(result.indeterminateCves.find((c) => c.cveId === "CVE-OUTOFRANGE-001")).toBeUndefined();
  });

  it("contagem de vulnerabilidades exclui indeterminados (N confirmados, não N+M)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    // 1 confirmado + 2 indeterminados
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: [], tags: [],
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-CONFIRMED-001", "CVE-INDET-001", "CVE-INDET-002"],
      ports: [{ port: 80, transport: "tcp" }],
    });
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://example.com",
      serverBanner: "Apache/2.4.7",
    });

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-CONFIRMED-001", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
      }],
      ["CVE-INDET-001", { nvdUnavailable: true }],
      ["CVE-INDET-002", { nvdUnavailable: true }],
    ]));

    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const result = await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });

    // vulnerabilities conta só os confirmados (ignorando NIS2-TLS-001 e outros sintéticos)
    const realCves = result.vulnerabilities.filter((v) => v.cveId.startsWith("CVE-"));
    expect(realCves).toHaveLength(1);
    expect(realCves[0].cveId).toBe("CVE-CONFIRMED-001");
    // indeterminateCves tem os 2 indeterminados
    const indetCves = result.indeterminateCves.filter((c) => c.cveId.startsWith("CVE-INDET-"));
    expect(indetCves).toHaveLength(2);
  });

  // ── Testes da heurística de IP partilhado ─────────────────────────────────

  it("VPS dedicado com tags cloud não é classificado como PaaS (sem falso positivo)", async () => {
    // scanme.nmap.org está em PUBLIC_TEST_TARGETS — ownership bypass automático
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "45.33.32.156",
      hostnames: ["scanme.nmap.org"],  // sem sufixo PaaS
      tags: ["cloud", "hosting"],       // tags genéricas que antes disparavam isSharedInfra
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-VPS-TEST"],
      ports: [{ port: 80, transport: "tcp" }],
    });
    vi.mocked(censysLookup).mockResolvedValue({ ip: "45.33.32.156", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://scanme.nmap.org", serverBanner: "Apache/2.4.7",
    });
    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-VPS-TEST", {
        hasRangeData: true, affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
      }],
    ]));
    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "scanme.nmap.org", mode: "sme",
    });

    // CVE processado normalmente — tags genéricas não suprimem nada
    expect(result.vulnerabilities.find(v => v.cveId === "CVE-VPS-TEST")).toBeDefined();
    // Sem log de PaaS/CDN partilhado
    const paasLog = logSpy.mock.calls.find(
      args => typeof args[0] === "string" && args[0].includes("PaaS/CDN partilhado")
    );
    expect(paasLog).toBeUndefined();

    logSpy.mockRestore();
  });

  it("hostname PaaS (*.railway.app) → rotulado mas CVEs não suprimidos", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4",
      hostnames: ["myapp.up.railway.app"],  // sufixo PaaS → isSharedInfra=true
      tags: [],
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-PAAS-TEST"],
      ports: [{ port: 80, transport: "tcp" }],
    });
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://myapp.up.railway.app", serverBanner: "Apache/2.4.7",
    });
    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-PAAS-TEST", {
        hasRangeData: true, affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
      }],
    ]));
    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "myapp.up.railway.app", mode: "sme",
    });

    // CVE avaliado normalmente pelo filtro CPE (não suprimido)
    expect(result.vulnerabilities.find(v => v.cveId === "CVE-PAAS-TEST")).toBeDefined();
    // Log informativo presente
    const paasLog = logSpy.mock.calls.find(
      args => typeof args[0] === "string" && args[0].includes("PaaS/CDN partilhado")
    );
    expect(paasLog).toBeDefined();
    // Sem "ignorados para CVEs" — a supressão foi removida
    const ignoredLog = logSpy.mock.calls.find(
      args => typeof args[0] === "string" && args[0].includes("ignorados para CVEs")
    );
    expect(ignoredLog).toBeUndefined();

    logSpy.mockRestore();
  });

  it("um único log por CVE indeterminado (gate 0 emite uma vez e faz continue)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue(shodanApache());
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://example.com",
      serverBanner: "Apache/2.4.7",
    });

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-CONFIRMED-001", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
      }],
      ["CVE-INDET-001", { nvdUnavailable: true }],
    ]));

    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const consoleSpy = vi.spyOn(console, "log");
    await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });

    const indetLogs = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("CVE-INDET-001")
    );
    // Deve haver exactamente 1 log para CVE-INDET-001 (não 2 como antes)
    expect(indetLogs).toHaveLength(1);
    expect(indetLogs[0][0]).toContain("INDETERMINADO");
    consoleSpy.mockRestore();
  });
});
