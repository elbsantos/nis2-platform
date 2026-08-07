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

import { executeAgentlessScan, verifyOwnership, verifyOwnershipWithRootFallback } from "./scan-executor";
import { lookupHost as shodanLookup } from "../integrations/shodan";
import { lookupHost as censysLookup } from "../integrations/censys";
import { checkHttpHeaders } from "../integrations/http-headers";
import { checkEmailSecurity } from "../integrations/email-security";
import { checkDarkWeb } from "../integrations/dark-web";
import { checkDirectTls } from "../integrations/direct-tls";
import { batchLookupCveVersionRanges, isVersionInNvdRanges } from "../integrations/nvd";
import { checkSsh } from "../integrations/ssh-check";
import { resolveTxt } from "dns/promises";
import { updateScanStatus, createVulnerability } from "../db";

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

describe("verifyOwnershipWithRootFallback — herança de domínio raiz (segurança)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ORG_ID = 1;
  const TOKEN = `nis2pt-verify=${ORG_ID}`;

  /** Só os hostnames em `withToken` respondem com o token — os restantes falham (ENOTFOUND), como DNS real. */
  function mockTxtFor(withToken: string[]) {
    vi.mocked(resolveTxt).mockImplementation(async (hostname: string) => {
      if (withToken.includes(hostname)) return [[TOKEN]];
      throw new Error("ENOTFOUND");
    });
  }

  it("subdomínio real de um raiz verificado → autorizado por herança (root-inherited), replica o caso real cisplan.com/www.cisplan.com", async () => {
    mockTxtFor(["cisplan.com"]); // só a raiz tem o TXT — www.cisplan.com não tem nenhum
    const result = await verifyOwnershipWithRootFallback("www.cisplan.com", ORG_ID, "cisplan.com");
    expect(result.verified).toBe(true);
    expect(result.method).toBe("root-inherited");
  });

  it("SEGURANÇA — 'cisplan.com.atacante.com' com rootDomain=cisplan.com → NEGADO (a raiz aparece como prefixo, não é sufixo real)", async () => {
    mockTxtFor(["cisplan.com"]);
    const result = await verifyOwnershipWithRootFallback("cisplan.com.atacante.com", ORG_ID, "cisplan.com");
    expect(result.verified).toBe(false);
  });

  it("SEGURANÇA — 'evilcisplan.com' com rootDomain=cisplan.com → NEGADO (concatenação sem separador de subdomínio)", async () => {
    mockTxtFor(["cisplan.com"]);
    const result = await verifyOwnershipWithRootFallback("evilcisplan.com", ORG_ID, "cisplan.com");
    expect(result.verified).toBe(false);
  });

  it("SEGURANÇA — 'cisplan.com.evil.com' com rootDomain=cisplan.com → NEGADO", async () => {
    mockTxtFor(["cisplan.com"]);
    const result = await verifyOwnershipWithRootFallback("cisplan.com.evil.com", ORG_ID, "cisplan.com");
    expect(result.verified).toBe(false);
  });

  it("subdomínio com rootDomain NÃO verificado (raiz sem TXT) → NEGADO, cai para verificação individual (que também falha)", async () => {
    mockTxtFor([]); // ninguém tem o TXT, nem a raiz
    const result = await verifyOwnershipWithRootFallback("www.cisplan.com", ORG_ID, "cisplan.com");
    expect(result.verified).toBe(false);
  });

  it("target === rootDomain exatamente → autorizado", async () => {
    mockTxtFor(["cisplan.com"]);
    const result = await verifyOwnershipWithRootFallback("cisplan.com", ORG_ID, "cisplan.com");
    expect(result.verified).toBe(true);
  });

  it("rootDomain vazio ('') nunca autoriza por herança — cai para verificação individual", async () => {
    mockTxtFor(["cisplan.com"]);
    const result = await verifyOwnershipWithRootFallback("www.cisplan.com", ORG_ID, "");
    expect(result.verified).toBe(false);
  });

  it("NÃO-REGRESSÃO — sem rootDomain (scan único) → verificação individual normal, como antes", async () => {
    mockTxtFor(["www.cisplan.com"]); // desta vez é o PRÓPRIO subdomínio que tem o TXT
    const result = await verifyOwnershipWithRootFallback("www.cisplan.com", ORG_ID, undefined);
    expect(result.verified).toBe(true);
    expect(result.method).toBe("dns-txt"); // não "root-inherited" — é o caminho normal
  });

  it("normaliza maiúsculas/minúsculas e ponto final (FQDN) antes de comparar target com rootDomain", async () => {
    mockTxtFor(["cisplan.com"]);
    const result = await verifyOwnershipWithRootFallback("WWW.CISPLAN.COM.", ORG_ID, "cisplan.com");
    expect(result.verified).toBe(true);
    expect(result.method).toBe("root-inherited");
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

  it("BUG REAL corrigido — scan de subdomínio com rootDomain herdado passa a ownership mesmo sem TXT próprio (caso real: cisplan.com/www.cisplan.com)", async () => {
    vi.mocked(resolveTxt).mockImplementation(async (hostname: string) => {
      if (hostname === "cisplan.com") return [["nis2pt-verify=1"]];
      throw new Error("ENOTFOUND"); // www.cisplan.com não tem TXT próprio — é o caso real
    });
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: [], tags: [], cpes: [], vulns: [], ports: [],
    });

    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "www.cisplan.com",
      mode: "sme",
      rootDomain: "cisplan.com",
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("NÃO-REGRESSÃO — sem rootDomain, o mesmo subdomínio sem TXT próprio continua a falhar (era este o bug original)", async () => {
    vi.mocked(resolveTxt).mockImplementation(async (hostname: string) => {
      if (hostname === "cisplan.com") return [["nis2pt-verify=1"]];
      throw new Error("ENOTFOUND");
    });

    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "www.cisplan.com",
      mode: "sme",
      // sem rootDomain — comportamento de scan único, tem de continuar a exigir TXT próprio
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

  it("port22.cves contém apenas CVEs reais — NIS2-SSH-OUTDATED não é propagado para port.cves", async () => {
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

    // 4 CVEs reais + 1 sintético — reproduz OpenSSH 6.6.1 no scanme
    vi.mocked(checkSsh).mockResolvedValue({
      port: 22,
      banner: "SSH-2.0-OpenSSH_6.6.1p1",
      software: "OpenSSH_6.6.1p1",
      version: "6.6.1",
      vulns: [
        { cveId: "CVE-2023-51385", cvssScore: 9.8, severity: "critical" as const, description: "d1", nis2Articles: ["Art. 21(2)(i)"], cisControls: [], iso27001Controls: [], nistCsfControls: [], remediationHint: "" },
        { cveId: "CVE-2021-41617", cvssScore: 7.0, severity: "high"     as const, description: "d2", nis2Articles: ["Art. 21(2)(i)"], cisControls: [], iso27001Controls: [], nistCsfControls: [], remediationHint: "" },
        { cveId: "CVE-2018-15473", cvssScore: 5.3, severity: "medium"   as const, description: "d3", nis2Articles: ["Art. 21(2)(i)"], cisControls: [], iso27001Controls: [], nistCsfControls: [], remediationHint: "" },
        { cveId: "CVE-2016-0777",  cvssScore: 8.1, severity: "high"     as const, description: "d4", nis2Articles: ["Art. 21(2)(i)"], cisControls: [], iso27001Controls: [], nistCsfControls: [], remediationHint: "" },
        // sintético — NÃO deve entrar em port22.cves
        { cveId: "NIS2-SSH-OUTDATED", cvssScore: 7.5, severity: "high"  as const, description: "OpenSSH 6.6.1 desactualizado", nis2Articles: ["Art. 21(2)(i)"], cisControls: [], iso27001Controls: [], nistCsfControls: [], remediationHint: "" },
      ],
    });

    const result = await executeAgentlessScan({
      scanId: 1,
      organizationId: 1,
      target: "example.com",
      mode: "sme",
    });

    expect(result.success).toBe(true);

    const port22 = result.openPorts.find((p) => p.port === 22);
    expect(port22).toBeDefined();

    // Tabela de portos conta apenas os 4 CVEs reais
    expect(port22!.cves).toHaveLength(4);
    expect(port22!.cves).not.toContain("NIS2-SSH-OUTDATED");
    expect(port22!.cves).toContain("CVE-2023-51385");
    expect(port22!.cves).toContain("CVE-2021-41617");
    expect(port22!.cves).toContain("CVE-2018-15473");
    expect(port22!.cves).toContain("CVE-2016-0777");

    // Sintético continua presente no pipeline de findings
    const outdated = result.vulnerabilities.find((v) => v.cveId === "NIS2-SSH-OUTDATED");
    expect(outdated).toBeDefined();
  });

  // ── C14a: resolvedIp ───────────────────────────────────────────────────────

  it("grava resolvedIp em results quando Shodan devolve IP", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "69.46.46.45",
      hostnames: [],
      tags: [],
      cpes: [],
      vulns: [],
      ports: [],
    });

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "example.com", mode: "sme",
    });

    expect(result.success).toBe(true);
    expect(result.resolvedIp).toBe("69.46.46.45");
    // updateScanStatus chamado com completed + resolvedIp no objeto results
    const completedCall = vi.mocked(updateScanStatus).mock.calls
      .find((c) => c[1] === "completed");
    expect(completedCall?.[4]).toMatchObject({ resolvedIp: "69.46.46.45" });
  });

  it("resolvedIp ausente quando shodanData é null — scans antigos não partem leitores", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue(null as any);

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "example.com", mode: "sme",
    });

    expect(result.success).toBe(true);
    expect(result.resolvedIp).toBeUndefined();
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
    description?: string;
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

  // ── Testes da descrição real do NVD ──────────────────────────────────────────

  it("CVE com descrição NVD real usa-a em vez do template genérico", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4",
      hostnames: ["example.com"],
      tags: [],
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-DESC-REAL"],
      ports: [{ port: 443, transport: "tcp" }], // porto 443 — não interfere com regex porta.*80
    });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "https://example.com",
      serverBanner: "Apache/2.4.7",
    });

    const realDesc = "A use-after-free in Apache HTTP Server mod_ssl allows an attacker to cause a denial of service.";

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-DESC-REAL", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
        description: realDesc,
      }],
    ]));
    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "example.com", mode: "sme",
    });

    const vuln = result.vulnerabilities.find((v) => v.cveId === "CVE-DESC-REAL");
    expect(vuln).toBeDefined();
    // Descrição real presente — sem texto de template
    expect(vuln?.description).toBe(realDesc);
    expect(vuln?.description).not.toContain("Vulnerabilidade CVE-DESC-REAL detectada");
  });

  it("CVE sem descrição NVD usa fallback neutro (sem 'porto N' — não colapsa em 'Porta 80')", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4",
      hostnames: ["example.com"],
      tags: [],
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-NO-DESC"],
      ports: [{ port: 80, transport: "tcp" }],
    });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://example.com",
      serverBanner: "Apache/2.4.7",
    });

    // NVD sem description (campo ausente — como os antigos entries em cache)
    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-NO-DESC", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
        // sem description → undefined
      }],
    ]));
    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "example.com", mode: "sme",
    });

    const vuln = result.vulnerabilities.find((v) => v.cveId === "CVE-NO-DESC");
    expect(vuln).toBeDefined();
    // Fallback neutro — NÃO contém "(porto 80)" que dispararia enrichFinding porta.*80
    expect(vuln?.description).not.toMatch(/\(porto\s+\d+\)/i);
    // Sem o padrão do template antigo
    expect(vuln?.description).not.toContain("Vulnerabilidade CVE-NO-DESC detectada no serviço");
    // É o fallback esperado (contém o cveId e o produto)
    expect(vuln?.description).toContain("CVE-NO-DESC");
    expect(vuln?.description).toContain("apache");
  });

  it("descrição NVD real com keyword TLS mapeia CVE a Art. 21(2)(h) em vez do fallback (e)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4",
      hostnames: ["example.com"],
      tags: [],
      cpes: ["cpe:/a:apache:http_server:2.4.7"],
      vulns: ["CVE-TLS-MAP"],
      ports: [{ port: 443, transport: "tcp" }],
    });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "https://example.com",
      serverBanner: "Apache/2.4.7",
    });

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(makeNvdMap([
      ["CVE-TLS-MAP", {
        hasRangeData: true,
        affectedProducts: ["apache:http_server"],
        ranges: [{ versionStartIncluding: "2.4.0", versionEndExcluding: "2.4.50" }],
        description: "SSL/TLS weak cipher negotiation in Apache HTTP Server exposes sessions to MITM attacks.",
      }],
    ]));
    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "example.com", mode: "sme",
    });

    const vuln = result.vulnerabilities.find((v) => v.cveId === "CVE-TLS-MAP");
    expect(vuln).toBeDefined();
    // Descrição real com "TLS" → mapCveToNIS2Articles retorna (h) em vez do fallback (e)
    expect(vuln?.nis2Articles).toContain("Art. 21(2)(h)");
    expect(vuln?.nis2Articles).not.toContain("Art. 21(2)(e)");
  });

  // ── Testes de status "unverified" em headers HTTP (issues A, B, C) ─────────

  const UNVERIFIED_CHECKS = [
    { name: "HSTS",                   status: "unverified" as const, detail: "Site inacessível — não foi possível verificar headers de segurança HTTP.", nis2Article: "Art. 21(2)(h)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
    { name: "CSP",                    status: "unverified" as const, detail: "Site inacessível — não foi possível verificar headers de segurança HTTP.", nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
    { name: "X-Frame-Options",        status: "unverified" as const, detail: "Site inacessível — verificação de headers não concluída.", nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
    { name: "X-Content-Type-Options", status: "unverified" as const, detail: "Site inacessível — verificação de headers não concluída.", nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
    { name: "Referrer-Policy",        status: "unverified" as const, detail: "Site inacessível — verificação de headers não concluída.", nis2Article: "Art. 21(2)(h)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
  ];

  it("alvo inacessível (todos unverified) — zero findings, zero dedução em (e)/(h), httpHeaders fora de dataSources, scanLimitations presente", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: [], tags: [], cpes: [], vulns: [],
      ports: [{ port: 443, transport: "tcp" }],
    });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: UNVERIFIED_CHECKS,
      score: null,
      url: "https://unreachable.example",
    });

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "unreachable.example", mode: "sme",
    });

    // Sem findings NIS2-HEADER-*
    expect(result.vulnerabilities.filter((v) => v.cveId.startsWith("NIS2-HEADER-"))).toHaveLength(0);

    // Sem achado de "inacessível" nas medidas (e) e (h)
    const artE = result.nis2Scores.find((s) => s.article === "Art. 21(2)(e)");
    const artH = result.nis2Scores.find((s) => s.article === "Art. 21(2)(h)");
    expect(artE?.findings.some((f) => f.includes("inacessível"))).toBe(false);
    expect(artH?.findings.some((f) => f.includes("inacessível"))).toBe(false);

    // updateScanStatus chamado com dataSources sem "httpHeaders" e scanLimitations correcto
    const dbMock = vi.mocked(updateScanStatus);
    expect(dbMock).toHaveBeenCalled();
    const stored = dbMock.mock.calls[dbMock.mock.calls.length - 1][4];
    expect(stored?.dataSources).not.toContain("httpHeaders");
    expect(stored?.scanLimitations).toContain(
      "Verificação de cabeçalhos HTTP não concluída — alvo não respondeu em HTTPS/HTTP."
    );
  });

  it("headers verificados com warn (Referrer-Policy permissivo) continuam a deduzir 4 pts (regressão warn)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: [], tags: [], cpes: [], vulns: [],
      ports: [{ port: 443, transport: "tcp" }],
    });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [
        { name: "HSTS",                   status: "pass", detail: "HSTS activo", nis2Article: "Art. 21(2)(h)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
        { name: "CSP",                    status: "pass", detail: "CSP configurado", nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
        { name: "X-Frame-Options",        status: "pass", detail: "XFO presente", nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
        { name: "X-Content-Type-Options", status: "pass", detail: "XCTO presente", nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
        { name: "Referrer-Policy",        status: "warn", detail: "Referrer-Policy permissivo (unsafe-url)", nis2Article: "Art. 21(2)(h)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
      ],
      score: 95,
      url: "https://example.com",
    });

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "example.com", mode: "sme",
    });

    // Sem findings NIS2-HEADER-* (apenas warns, não fails)
    expect(result.vulnerabilities.filter((v) => v.cveId.startsWith("NIS2-HEADER-"))).toHaveLength(0);
    // Warn de Referrer-Policy gera extraDeduction em Art. 21(2)(h)
    const artH = result.nis2Scores.find((s) => s.article === "Art. 21(2)(h)");
    expect(artH?.findings.some((f) => f.includes("Referrer-Policy"))).toBe(true);
    // "httpHeaders" em dataSources (houve verificação real)
    const stored = vi.mocked(updateScanStatus).mock.calls[vi.mocked(updateScanStatus).mock.calls.length - 1][4];
    expect(stored?.dataSources).toContain("httpHeaders");
    expect(stored?.scanLimitations ?? []).toHaveLength(0);
  });

  it("headers verificados com fail criam NIS2-HEADER-* e 'httpHeaders' em dataSources (regressão fail)", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: [], tags: [], cpes: [], vulns: [],
      ports: [{ port: 80, transport: "tcp" }],
    });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [
        { name: "HSTS",                   status: "fail", detail: "Strict-Transport-Security ausente", nis2Article: "Art. 21(2)(h)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
        { name: "CSP",                    status: "fail", detail: "Content-Security-Policy ausente",   nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
        { name: "X-Frame-Options",        status: "fail", detail: "X-Frame-Options ausente",          nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
        { name: "X-Content-Type-Options", status: "fail", detail: "X-Content-Type-Options ausente",   nis2Article: "Art. 21(2)(e)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
        { name: "Referrer-Policy",        status: "warn", detail: "Referrer-Policy ausente",          nis2Article: "Art. 21(2)(h)", cisControls: [], iso27001Controls: [], nistCsfControls: [] },
      ],
      score: 35,
      url: "http://example.com",
    });

    const result = await executeAgentlessScan({
      scanId: 1, organizationId: 1, target: "example.com", mode: "sme",
    });

    // 4 findings NIS2-HEADER-* (um por cada fail)
    const headerVulns = result.vulnerabilities.filter((v) => v.cveId.startsWith("NIS2-HEADER-"));
    expect(headerVulns).toHaveLength(4);
    expect(headerVulns.map((v) => v.cveId)).toContain("NIS2-HEADER-CSP");
    expect(headerVulns.map((v) => v.cveId)).toContain("NIS2-HEADER-HSTS");
    // "httpHeaders" em dataSources
    const stored = vi.mocked(updateScanStatus).mock.calls[vi.mocked(updateScanStatus).mock.calls.length - 1][4];
    expect(stored?.dataSources).toContain("httpHeaders");
    expect(stored?.scanLimitations ?? []).toHaveLength(0);
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

  // -------------------------------------------------------------------------
  // Persistência dos 7 tipos de achados sintéticos (correção do corte 117 vs 110)
  // -------------------------------------------------------------------------

  it("PERSISTÊNCIA COMPLETA — NIS2-SVC-UNKNOWN, NIS2-TLS-001, CVE real e CVE SSH são todos persistidos com a severidade correta", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: ["example.com"], tags: [], cpes: [], vulns: [],
      ports: [
        // Porta 80: versão conhecida + CVE real confirmado pelo NVD — também dispara
        // NIS2-TLS-001 (HTTP presente, 443 ausente).
        { port: 80, transport: "tcp", product: "nginx", version: "1.20.0",
          vulns: { "CVE-2021-1234": { cvss: 7.5, summary: "Buffer overflow", references: [] } } },
        // Porta 8080: tem CVE mas SEM versão detetável em lado nenhum → NIS2-SVC-UNKNOWN.
        { port: 8080, transport: "tcp",
          vulns: { "CVE-2020-9999": { cvss: 6.0, summary: "desc", references: [] } } },
        // Porta 22: dispara o checkSsh (mockado abaixo) → CVE real de SSH.
        { port: 22, transport: "tcp", product: "OpenSSH", version: "7.4" },
      ],
    } as any);
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [], score: 50, url: "http://example.com",
    });
    vi.mocked(checkEmailSecurity).mockResolvedValue({ checks: [], score: 100 });
    vi.mocked(checkDarkWeb).mockResolvedValue({
      breachesFound: 0, breaches: [], hasPasswordExposure: false, blacklists: [], score: 100, hibpEnabled: false,
    });
    vi.mocked(checkDirectTls).mockResolvedValue(null as any); // catch(()=>null) no scan-executor cobre isto

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(new Map([
      ["CVE-2021-1234", {
        cveId: "CVE-2021-1234", hasRangeData: true, affectedProducts: ["nginx:nginx"],
        ranges: [{ versionStartIncluding: "1.0.0", versionEndExcluding: "2.0.0" }],
      }],
    ]) as any);
    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    vi.mocked(checkSsh).mockResolvedValue({
      port: 22, banner: "SSH-2.0-OpenSSH_7.4", software: "OpenSSH_7.4", version: "7.4",
      vulns: [{
        cveId: "CVE-2018-15473", cvssScore: 5.3, severity: "medium",
        description: "Enumeração de utilizadores via timing attack",
        nis2Articles: ["Art. 21(2)(h)"], cisControls: [], iso27001Controls: [], nistCsfControls: [],
        remediationHint: "Atualiza o OpenSSH para a versão mais recente.",
      }],
    });

    const result = await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });
    expect(result.success).toBe(true);

    const persistCalls = vi.mocked(createVulnerability).mock.calls.map((c) => c[0] as any);
    const persistedCveIds = persistCalls.map((p) => p.cveId);

    // Não-regressão: os 2 tipos já persistidos antes desta correção continuam a persistir.
    expect(persistedCveIds).toContain("CVE-2021-1234");
    expect(persistedCveIds).toContain("CVE-2018-15473");
    // Os 2 tipos novos verificados neste teste (os outros 5 estão no teste seguinte).
    expect(persistedCveIds).toContain("NIS2-SVC-UNKNOWN");
    expect(persistedCveIds).toContain("NIS2-TLS-001");

    const svcUnknownCall = persistCalls.find((p) => p.cveId === "NIS2-SVC-UNKNOWN")!;
    expect(svcUnknownCall.severity).toBe("medium");
    expect(svcUnknownCall.cvssScore).toBe(5.0);
    expect(svcUnknownCall.port).toBe(8080); // port incluído — pedido explícito desta correção
    expect(svcUnknownCall.scanId).toBe(1);
    expect(svcUnknownCall.organizationId).toBe(1);

    const tls001Call = persistCalls.find((p) => p.cveId === "NIS2-TLS-001")!;
    expect(tls001Call.severity).toBe("high");
    expect(tls001Call.cvssScore).toBe(7.5);

    // O nº de linhas persistidas bate com o nº de vulnerabilidades no array final (sem duplicados
    // neste cenário) — prova direta de que a tabela deixa de estar incompleta face ao ecrã.
    expect(persistCalls.length).toBe(result.vulnerabilities.length);
    expect(result.vulnerabilities.map((v) => v.cveId).sort()).toEqual(
      ["CVE-2018-15473", "CVE-2021-1234", "NIS2-SVC-UNKNOWN", "NIS2-TLS-001"].sort()
    );
  });

  it("PERSISTÊNCIA COMPLETA — NIS2-EMAIL, NIS2-HEADER, NIS2-BREACH, NIS2-BLACKLIST e certificado TLS são todos persistidos com a severidade correta", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: ["example.com"], tags: [], cpes: [], vulns: [],
      // Porta 443 com versão conhecida e sem CVEs — não dispara SVC-UNKNOWN nem TLS-001,
      // mantém este teste focado nos outros 5 tipos.
      ports: [{ port: 443, transport: "tcp", product: "nginx", version: "1.20.0" }],
    } as any);
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({
      checks: [{ name: "HSTS", status: "fail", detail: "HSTS ausente", nis2Article: "Art. 21(2)(h)" }],
      score: 50, url: "https://example.com",
    });
    vi.mocked(checkEmailSecurity).mockResolvedValue({
      checks: [{ name: "DMARC", status: "fail", detail: "DMARC ausente", nis2Article: "Art. 21(2)(b)" }],
      score: 50,
    });
    vi.mocked(checkDarkWeb).mockResolvedValue({
      breachesFound: 1,
      breaches: [{ name: "ExampleBreach", dataClasses: ["emails", "passwords"], hasPasswords: true }],
      hasPasswordExposure: true,
      blacklists: [{ name: "Spamhaus", listed: true, detail: "Listado em Spamhaus DBL" }],
      score: 40, hibpEnabled: true,
    });
    vi.mocked(checkDirectTls).mockResolvedValue({
      accessible: true, certificate: null,
      tlsIssues: [{
        issue: "Certificado TLS expirado há 5 dias", cvssScore: 8.0, severity: "high",
        nis2Article: "Art. 21(2)(h)",
      }],
      ports: [], cdn: { detected: false, provider: null, isProtected: false },
    });

    vi.mocked(batchLookupCveVersionRanges).mockResolvedValue(new Map() as any);
    vi.mocked(isVersionInNvdRanges).mockReturnValue(true);

    const result = await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });
    expect(result.success).toBe(true);

    const persistCalls = vi.mocked(createVulnerability).mock.calls.map((c) => c[0] as any);
    const persistedCveIds = persistCalls.map((p) => p.cveId);

    expect(persistedCveIds).toContain("NIS2-EMAIL-DMARC");
    expect(persistedCveIds).toContain("NIS2-HEADER-HSTS");
    expect(persistedCveIds).toContain("NIS2-BREACH-EXAMPLEBREACH");
    expect(persistedCveIds).toContain("NIS2-BLACKLIST-SPAMHAUS");
    expect(persistedCveIds).toContain("NIS2-TLS-443-CERT-EXPIRED");

    const emailCall = persistCalls.find((p) => p.cveId === "NIS2-EMAIL-DMARC")!;
    expect(emailCall.severity).toBe("high");
    expect(emailCall.cvssScore).toBe(7.0);

    const headerCall = persistCalls.find((p) => p.cveId === "NIS2-HEADER-HSTS")!;
    expect(headerCall.severity).toBe("medium");
    expect(headerCall.cvssScore).toBe(6.5);

    const breachCall = persistCalls.find((p) => p.cveId === "NIS2-BREACH-EXAMPLEBREACH")!;
    expect(breachCall.severity).toBe("high"); // hasPasswords=true
    expect(breachCall.cvssScore).toBe(8.5);

    const blacklistCall = persistCalls.find((p) => p.cveId === "NIS2-BLACKLIST-SPAMHAUS")!;
    expect(blacklistCall.severity).toBe("high");
    expect(blacklistCall.cvssScore).toBe(7.0);

    const tlsCertCall = persistCalls.find((p) => p.cveId === "NIS2-TLS-443-CERT-EXPIRED")!;
    expect(tlsCertCall.severity).toBe("high");
    expect(tlsCertCall.cvssScore).toBe(8.0);
    expect(tlsCertCall.port).toBe(443);

    expect(persistCalls.length).toBe(result.vulnerabilities.length);
  });

  it("falha ao persistir UM achado não aborta o scan — .catch não-fatal preservado; scan.results inalterado", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=1"]]);
    vi.mocked(shodanLookup).mockResolvedValue({
      ip: "1.2.3.4", hostnames: ["example.com"], tags: [], cpes: [], vulns: [],
      ports: [
        { port: 80, transport: "tcp",
          vulns: { "CVE-2020-9999": { cvss: 6.0, summary: "desc", references: [] } } }, // SVC-UNKNOWN
      ],
    } as any);
    vi.mocked(censysLookup).mockResolvedValue({ ip: "1.2.3.4", services: [], tlsIssues: [] });
    vi.mocked(checkHttpHeaders).mockResolvedValue({ checks: [], score: 50, url: "http://example.com" });
    vi.mocked(checkEmailSecurity).mockResolvedValue({ checks: [], score: 100 });
    vi.mocked(checkDarkWeb).mockResolvedValue({
      breachesFound: 0, breaches: [], hasPasswordExposure: false, blacklists: [], score: 100, hibpEnabled: false,
    });
    vi.mocked(checkDirectTls).mockResolvedValue(null as any); // catch(()=>null) no scan-executor cobre isto

    // A PRIMEIRA chamada a createVulnerability falha — simula uma persistência que rejeita.
    vi.mocked(createVulnerability).mockRejectedValueOnce(new Error("DB indisponível"));

    const result = await executeAgentlessScan({ scanId: 1, organizationId: 1, target: "example.com", mode: "sme" });

    // O scan continua e completa, apesar da falha de UMA persistência.
    expect(result.success).toBe(true);
    const completedCall = vi.mocked(updateScanStatus).mock.calls.find((c) => c[1] === "completed");
    expect(completedCall).toBeDefined();
    // O achado continua no array em memória / scan.results mesmo que a sua persistência
    // específica na tabela tenha falhado — scan.results não depende da persistência ter sucesso.
    expect(result.vulnerabilities.some((v) => v.cveId === "NIS2-SVC-UNKNOWN")).toBe(true);
  });
});
