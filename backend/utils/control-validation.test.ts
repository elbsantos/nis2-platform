/**
 * backend/utils/control-validation.test.ts
 *
 * Unit tests for validateControls() — as 6 regras técnicas + fallback self_declared.
 * isEol() (endoflife.date) é mockado — sem rede/Redis reais nestes testes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../integrations/endoflife", () => ({
  isEol: vi.fn(),
}));

import { validateControls, summarizeValidations, type ScanResultData } from "./control-validation";
import { isEol } from "../integrations/endoflife";

const mockIsEol = isEol as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockIsEol.mockReset();
  // Fail-safe por omissão — só os testes de e-3 sobrepõem isto explicitamente.
  mockIsEol.mockResolvedValue({ eol: false, eolDate: null, cycle: null });
});

function emptyScan(overrides: Partial<ScanResultData> = {}): ScanResultData {
  return {
    vulnerabilities:      [],
    tlsIssues:            [],
    openPorts:            [],
    httpHeaderChecks:     [],
    emailSecurityChecks:  [],
    httpRedirectsToHttps: null,
    scansLast12Months:    0,
    ...overrides,
  };
}

async function find(answers: Record<string, string>, scan: ScanResultData | null, controlId: string) {
  const validations = await validateControls(answers, scan);
  const v = validations.find((x) => x.controlId === controlId);
  if (!v) throw new Error(`controlo ${controlId} não encontrado`);
  return v;
}

describe("validateControls — e-2 (gestão de patches)", () => {
  it("yes + CVE crítico exposto → contradicted", async () => {
    const scan = emptyScan({
      vulnerabilities: [{ cveId: "CVE-2024-1234", cvssScore: 9.1, affectedService: "OpenSSH", port: 22 }],
    });
    const r = await find({ "e-2": "yes" }, scan, "e-2");
    expect(r.state).toBe("contradicted");
    expect(r.source).toBe("scanner");
    expect(r.evidence[0]).toContain("CVE-2024-1234");
  });

  it("yes + zero CVEs ≥7 → verified", async () => {
    const scan = emptyScan({ vulnerabilities: [{ cveId: "CVE-2024-0001", cvssScore: 3.1, affectedService: "nginx" }] });
    const r = await find({ "e-2": "yes" }, scan, "e-2");
    expect(r.state).toBe("verified");
  });

  it("respondeu 'no' com CVE crítico presente → NÃO contradiz (self_declared)", async () => {
    const scan = emptyScan({
      vulnerabilities: [{ cveId: "CVE-2024-1234", cvssScore: 9.1, affectedService: "OpenSSH" }],
    });
    const r = await find({ "e-2": "no" }, scan, "e-2");
    expect(r.state).toBe("self_declared");
    expect(r.source).toBeNull();
  });
});

describe("validateControls — e-3 (sistemas EOL, via endoflife.date)", () => {
  it("produto EOL confirmado pelo endoflife.date → contradicted", async () => {
    mockIsEol.mockResolvedValueOnce({ eol: true, eolDate: "2015-07-14", cycle: "6.0" });
    const scan = emptyScan({ openPorts: [{ port: 21, service: "ftp", product: "Microsoft-IIS", version: "6.0" }] });
    const r = await find({ "e-3": "yes" }, scan, "e-3");
    expect(r.state).toBe("contradicted");
    expect(r.evidence[0]).toContain("suporte terminou em 2015-07-14");
    expect(mockIsEol).toHaveBeenCalledWith("Microsoft-IIS", "6.0");
  });

  it("produto suportado (endoflife.date confirma eol:false) → verified", async () => {
    mockIsEol.mockResolvedValueOnce({ eol: false, eolDate: null, cycle: "1.25" });
    const scan = emptyScan({ openPorts: [{ port: 443, service: "https", product: "nginx", version: "1.25.0" }] });
    const r = await find({ "e-3": "yes" }, scan, "e-3");
    expect(r.state).toBe("verified");
  });

  it("API indisponível (isEol devolve eol:false por fail-safe) → NÃO gera contradição", async () => {
    // isEol() já garante eol:false em qualquer falha — o mock replica esse contrato.
    mockIsEol.mockResolvedValueOnce({ eol: false, eolDate: null, cycle: null });
    const scan = emptyScan({ openPorts: [{ port: 21, service: "ftp", product: "Apache", version: "2.4.58" }] });
    const r = await find({ "e-3": "yes" }, scan, "e-3");
    expect(r.state).not.toBe("contradicted");
    expect(r.state).toBe("verified");
  });

  it("respondeu 'no' com produto EOL presente → NÃO contradiz (self_declared), nem chama isEol", async () => {
    const scan = emptyScan({ openPorts: [{ port: 21, service: "ftp", product: "Microsoft-IIS", version: "6.0" }] });
    const r = await find({ "e-3": "no" }, scan, "e-3");
    expect(r.state).toBe("self_declared");
    expect(mockIsEol).not.toHaveBeenCalled();
  });
});

describe("validateControls — h-2 (dados em trânsito)", () => {
  it("yes + porta 80 aberta SEM redirect para HTTPS → contradicted", async () => {
    const scan = emptyScan({ openPorts: [{ port: 80, service: "http" }], httpRedirectsToHttps: false });
    const r = await find({ "h-2": "yes" }, scan, "h-2");
    expect(r.state).toBe("contradicted");
  });

  it("yes + porta 80 aberta COM redirect para HTTPS → NÃO contradiz (verified)", async () => {
    const scan = emptyScan({ openPorts: [{ port: 80, service: "http" }], httpRedirectsToHttps: true });
    const r = await find({ "h-2": "yes" }, scan, "h-2");
    expect(r.state).toBe("verified");
  });

  it("yes + porta 80 aberta e não foi possível determinar o redirect (null) → não usa o sinal, não contradiz", async () => {
    const scan = emptyScan({ openPorts: [{ port: 80, service: "http" }], httpRedirectsToHttps: null });
    const r = await find({ "h-2": "yes" }, scan, "h-2");
    expect(r.state).toBe("verified");
  });

  it("yes + tlsIssue presente → contradicted", async () => {
    const scan = emptyScan({ tlsIssues: [{ port: 443, issue: "Certificado expirado" }] });
    const r = await find({ "h-2": "yes" }, scan, "h-2");
    expect(r.state).toBe("contradicted");
    expect(r.evidence[0]).toContain("Certificado expirado");
  });

  it("yes + HSTS fail → contradicted", async () => {
    const scan = emptyScan({ httpHeaderChecks: [{ name: "HSTS", status: "fail" }] });
    const r = await find({ "h-2": "yes" }, scan, "h-2");
    expect(r.state).toBe("contradicted");
  });

  it("yes + tudo limpo → verified", async () => {
    const scan = emptyScan({ httpHeaderChecks: [{ name: "HSTS", status: "pass" }] });
    const r = await find({ "h-2": "yes" }, scan, "h-2");
    expect(r.state).toBe("verified");
  });
});

describe("validateControls — j-5 (comunicações seguras)", () => {
  it("yes + porta de email em claro aberta → contradicted", async () => {
    const scan = emptyScan({ openPorts: [{ port: 25, service: "smtp" }] });
    const r = await find({ "j-5": "yes" }, scan, "j-5");
    expect(r.state).toBe("contradicted");
  });

  it("yes + SPF fail → contradicted", async () => {
    const scan = emptyScan({ emailSecurityChecks: [{ name: "SPF", status: "fail" }] });
    const r = await find({ "j-5": "yes" }, scan, "j-5");
    expect(r.state).toBe("contradicted");
  });

  it("yes + DMARC fail → contradicted", async () => {
    const scan = emptyScan({ emailSecurityChecks: [{ name: "DMARC", status: "fail" }] });
    const r = await find({ "j-5": "yes" }, scan, "j-5");
    expect(r.state).toBe("contradicted");
  });

  it("yes + tudo limpo → verified", async () => {
    const scan = emptyScan({ emailSecurityChecks: [{ name: "SPF", status: "pass" }, { name: "DMARC", status: "pass" }] });
    const r = await find({ "j-5": "yes" }, scan, "j-5");
    expect(r.state).toBe("verified");
  });
});

describe("validateControls — f-2 (testes de vulnerabilidade)", () => {
  it("≥1 scan nos últimos 12 meses → verified, independentemente da resposta", async () => {
    const scan = emptyScan({ scansLast12Months: 3 });
    const r = await find({}, scan, "f-2");
    expect(r.state).toBe("verified");
    expect(r.evidence[0]).toContain("3 análises realizadas nos últimos 12 meses");
  });

  it("zero scans nos últimos 12 meses → self_declared", async () => {
    const scan = emptyScan({ scansLast12Months: 0 });
    const r = await find({}, scan, "f-2");
    expect(r.state).toBe("self_declared");
  });
});

describe("validateControls — i-5 (contas de administrador)", () => {
  it("yes + porta de administração remota exposta → unconfirmed (nunca contradicted)", async () => {
    const scan = emptyScan({ openPorts: [{ port: 3389, service: "rdp" }] });
    const r = await find({ "i-5": "yes" }, scan, "i-5");
    expect(r.state).toBe("unconfirmed");
    expect(r.evidence[0]).toContain("porta 3389");
  });

  it("yes + sem portas de administração expostas → verified", async () => {
    const scan = emptyScan();
    const r = await find({ "i-5": "yes" }, scan, "i-5");
    expect(r.state).toBe("verified");
  });
});

describe("validateControls — fallback e resumo", () => {
  it("controlo sem regra técnica (ex.: a-1) fica sempre self_declared", async () => {
    const scan = emptyScan({ vulnerabilities: [{ cveId: "X", cvssScore: 9.9, affectedService: "y" }] });
    const r = await find({ "a-1": "yes" }, scan, "a-1");
    expect(r.state).toBe("self_declared");
    expect(r.source).toBeNull();
  });

  it("scan === null → todos os 42 controlos ficam self_declared", async () => {
    const validations = await validateControls({ "e-2": "yes", "h-2": "yes" }, null);
    expect(validations).toHaveLength(42);
    expect(validations.every((v) => v.state === "self_declared")).toBe(true);
  });

  it("devolve os 42 controlos", async () => {
    expect(await validateControls({}, emptyScan())).toHaveLength(42);
  });

  it("summarizeValidations conta corretamente os 4 estados", async () => {
    const scan = emptyScan({
      vulnerabilities: [{ cveId: "X", cvssScore: 9, affectedService: "y" }], // e-2 → contradicted
      openPorts:       [{ port: 3389, service: "rdp" }],                     // i-5 → unconfirmed
      scansLast12Months: 1,                                                  // f-2 → verified
    });
    const answers = { "e-2": "yes", "i-5": "yes" };
    const validations = await validateControls(answers, scan);
    const summary = summarizeValidations(validations);

    expect(summary.contradicted).toBe(1);
    expect(summary.unconfirmed).toBe(1);
    expect(summary.verified).toBeGreaterThanOrEqual(1); // pelo menos f-2
    expect(summary.contradicted + summary.unconfirmed + summary.verified + summary.selfDeclared).toBe(42);
  });
});
