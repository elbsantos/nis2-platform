/**
 * server/services/scan-executor.test.ts
 *
 * Unit tests for the NIS2 scanner.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShodanHostResult } from "../integrations/shodan";
import type { CensysHostResult } from "../integrations/censys";

// Mock the integrations
vi.mock("../integrations/shodan", () => ({
  lookupHost: vi.fn(),
}));

vi.mock("../integrations/censys", () => ({
  lookupHost: vi.fn(),
}));

vi.mock("../db", () => ({
  updateScanStatus: vi.fn(),
  createVulnerability: vi.fn(),
}));

vi.mock("dns/promises", () => ({
  resolveTxt: vi.fn(),
}));

import { executeAgentlessScan, verifyDomainOwnership } from "./scan-executor";
import { lookupHost as shodanLookup } from "../integrations/shodan";
import { lookupHost as censysLookup } from "../integrations/censys";
import { resolveTxt } from "dns/promises";

describe("verifyDomainOwnership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns verified=true when DNS TXT record matches", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["nis2pt-verify=123"]]);
    const result = await verifyDomainOwnership("example.com", 123);
    expect(result.verified).toBe(true);
    expect(result.method).toBe("dns-txt");
  });

  it("returns verified=false when DNS TXT record missing", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["other-record"]]);
    const result = await verifyDomainOwnership("example.com", 123);
    expect(result.verified).toBe(false);
  });

  it("returns verified=false on DNS lookup failure", async () => {
    vi.mocked(resolveTxt).mockRejectedValue(new Error("NXDOMAIN"));
    const result = await verifyDomainOwnership("nonexistent.local", 123);
    expect(result.verified).toBe(false);
  });
});

describe("executeAgentlessScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      vulns: ["CVE-2021-SSH"],
      ports: [
        {
          port: 22,
          transport: "tcp",
          product: "OpenSSH",
          vulns: {
            "CVE-2021-SSH": {
              cvss: 9.8,
              summary: "SSH authentication bypass",
              references: [],
            },
          },
        },
      ],
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

    const sshVuln = result.vulnerabilities.find((v) => v.cveId === "CVE-2021-SSH");
    expect(sshVuln?.nis2Articles).toContain("Art. 21(2)(i)");
  });
});
