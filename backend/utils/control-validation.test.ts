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
    expect(r.evidence[0]).toContain("1 vulnerabilidade de severidade alta ou crítica");
    expect(r.evidence.some((e) => e.includes("CVE-2024-1234"))).toBe(true);
  });

  it("yes + zero CVEs ≥7 → verified", async () => {
    const scan = emptyScan({ vulnerabilities: [{ cveId: "CVE-2024-0001", cvssScore: 3.1, affectedService: "nginx" }] });
    const r = await find({ "e-2": "yes" }, scan, "e-2");
    expect(r.state).toBe("verified");
  });

  it("30 CVEs críticos → evidence.length <= 5, agregado + top 3 por CVSS + 'e mais 27'", async () => {
    const vulnerabilities = Array.from({ length: 30 }, (_, i) => ({
      cveId: `CVE-2024-${1000 + i}`,
      cvssScore: 7 + (i % 3), // 7, 8, 9 a rodar — o de CVSS 9 (índices 2,5,8,...) deve ficar no topo
      affectedService: "openssh",
    }));
    // Garante um CVSS claramente mais alto que todos os outros, para confirmar a ordenação.
    vulnerabilities[15] = { cveId: "CVE-2024-9999", cvssScore: 9.8, affectedService: "openssh" };

    const scan = emptyScan({ vulnerabilities });
    const r = await find({ "e-2": "yes" }, scan, "e-2");

    expect(r.state).toBe("contradicted");
    expect(r.evidence.length).toBeLessThanOrEqual(5);
    expect(r.evidence[0]).toBe("30 vulnerabilidades de severidade alta ou crítica em serviços expostos");
    expect(r.evidence[1]).toContain("CVE-2024-9999"); // CVSS 9.8 — o mais alto, deve vir primeiro
    expect(r.evidence.at(-1)).toBe("... e mais 27. Ver a secção Vulnerabilidades para a lista completa.");
  });

  it("respondeu 'no' com CVE crítico presente → NÃO contradiz, é verified_noncompliant", async () => {
    const scan = emptyScan({
      vulnerabilities: [{ cveId: "CVE-2024-1234", cvssScore: 9.1, affectedService: "OpenSSH" }],
    });
    const r = await find({ "e-2": "no" }, scan, "e-2");
    expect(r.state).toBe("verified_noncompliant");
    expect(r.source).toBe("scanner");
    expect(r.evidence.some((e) => e.includes("CVE-2024-1234"))).toBe(true);
  });

  it("respondeu 'no' sem CVEs críticos → self_declared (nada confirma a admissão)", async () => {
    const scan = emptyScan({ vulnerabilities: [{ cveId: "CVE-2024-0001", cvssScore: 3.1, affectedService: "nginx" }] });
    const r = await find({ "e-2": "no" }, scan, "e-2");
    expect(r.state).toBe("self_declared");
    expect(r.source).toBeNull();
  });

  it("respondeu 'partial' com CVE crítico presente → verified_noncompliant (mesma lógica do 'no')", async () => {
    const scan = emptyScan({
      vulnerabilities: [{ cveId: "CVE-2024-1234", cvssScore: 9.1, affectedService: "OpenSSH" }],
    });
    const r = await find({ "e-2": "partial" }, scan, "e-2");
    expect(r.state).toBe("verified_noncompliant");
  });

  it("respondeu 'na' com CVE crítico presente → self_declared (na nunca é avaliado)", async () => {
    const scan = emptyScan({
      vulnerabilities: [{ cveId: "CVE-2024-1234", cvssScore: 9.1, affectedService: "OpenSSH" }],
    });
    const r = await find({ "e-2": "na" }, scan, "e-2");
    expect(r.state).toBe("self_declared");
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

  it("respondeu 'no' com produto EOL presente → verified_noncompliant (a admissão é confirmada)", async () => {
    mockIsEol.mockResolvedValueOnce({ eol: true, eolDate: "2015-07-14", cycle: "6.0" });
    const scan = emptyScan({ openPorts: [{ port: 21, service: "ftp", product: "Microsoft-IIS", version: "6.0" }] });
    const r = await find({ "e-3": "no" }, scan, "e-3");
    expect(r.state).toBe("verified_noncompliant");
    expect(mockIsEol).toHaveBeenCalledWith("Microsoft-IIS", "6.0");
  });

  it("respondeu 'na' → self_declared, nem chama isEol (poupa a chamada externa)", async () => {
    const scan = emptyScan({ openPorts: [{ port: 21, service: "ftp", product: "Microsoft-IIS", version: "6.0" }] });
    const r = await find({ "e-3": "na" }, scan, "e-3");
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

  it("no + tlsIssue presente → verified_noncompliant, sem repetir a porta no texto", async () => {
    const scan = emptyScan({ tlsIssues: [{ port: 443, issue: "Porta 443 (HTTPS) não acessível — sem encriptação TLS." }] });
    const r = await find({ "h-2": "no" }, scan, "h-2");
    expect(r.state).toBe("verified_noncompliant");
    expect(r.evidence[0]).toBe("Porta 443 (HTTPS) não acessível — sem encriptação TLS.");
    expect(r.evidence[0]).not.toMatch(/\(porta 443\).*\(porta 443\)/);
  });

  it("no + tudo limpo → self_declared", async () => {
    const scan = emptyScan();
    const r = await find({ "h-2": "no" }, scan, "h-2");
    expect(r.state).toBe("self_declared");
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

  it("no + SPF fail → verified_noncompliant", async () => {
    const scan = emptyScan({ emailSecurityChecks: [{ name: "SPF", status: "fail" }] });
    const r = await find({ "j-5": "no" }, scan, "j-5");
    expect(r.state).toBe("verified_noncompliant");
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

  it("summarizeValidations conta corretamente os 5 estados", async () => {
    const scan = emptyScan({
      vulnerabilities: [{ cveId: "X", cvssScore: 9, affectedService: "y" }], // e-2 → contradicted (yes)
      openPorts:       [{ port: 3389, service: "rdp" }],                     // i-5 → unconfirmed
      scansLast12Months: 1,                                                  // f-2 → verified
    });
    const answers = { "e-2": "yes", "i-5": "yes", "j-5": "no" }; // j-5 sem evidência de falha → self_declared
    const validations = await validateControls(answers, scan);
    const summary = summarizeValidations(validations);

    expect(summary.contradicted).toBe(1);
    expect(summary.unconfirmed).toBe(1);
    expect(summary.verified).toBeGreaterThanOrEqual(1); // pelo menos f-2
    expect(
      summary.contradicted + summary.unconfirmed + summary.verified +
      summary.verifiedNoncompliant + summary.selfDeclared
    ).toBe(42);
  });

  it("summarizeValidations conta verifiedNoncompliant separadamente dos outros estados", async () => {
    const scan = emptyScan({
      vulnerabilities: [{ cveId: "X", cvssScore: 9, affectedService: "y" }], // e-2
      tlsIssues:       [{ port: 443, issue: "Certificado expirado" }],       // h-2
    });
    const answers = { "e-2": "no", "h-2": "no" }; // ambos admitem a falha, ambos confirmados
    const validations = await validateControls(answers, scan);
    const summary = summarizeValidations(validations);

    expect(summary.verifiedNoncompliant).toBe(2);
    expect(summary.contradicted).toBe(0); // "no" nunca é contradicted, só quem afirma "yes" pode ser
  });
});
