/**
 * backend/services/pdf-report-generator.test.ts
 *
 * Unit tests for enrichFinding.
 * Princípio: enrichFinding nunca reescreve descrições NVD reais.
 */

import { describe, it, expect } from "vitest";
import { enrichFinding, buildMethodologyBullets } from "./pdf-report-generator";

describe("enrichFinding — guard: descrições NVD não são reescritas", () => {
  it("descrição NVD com número de versão '2.4.23' não dispara o regex do Telnet", () => {
    const nvdDesc = "Apache HTTP Server 2.4.0 to 2.4.23 mod_session_crypto padding oracle attack.";
    const result = enrichFinding(nvdDesc, "CVE-2016-0736");
    // NUNCA deve reescrever para "Porta 23 Aberta (Telnet)"
    expect(result.text).not.toContain("Telnet");
    expect(result.text).not.toContain("Porta 23");
    // Deve devolver a descrição NVD intacta
    expect(result.text).toBe(nvdDesc);
  });

  it("descrição NVD com '2.4.21' não dispara o regex do FTP", () => {
    const nvdDesc = "Apache HTTP Server up to 2.4.21 allows header injection in mod_proxy.";
    const result = enrichFinding(nvdDesc, "CVE-2017-9798");
    expect(result.text).not.toContain("FTP");
    expect(result.text).not.toContain("Porta 21");
    expect(result.text).toBe(nvdDesc);
  });

  it("finding CVE no formato findings[] (sem cveId param) é guardado via detecção de texto", () => {
    const raw = "CVE-2021-41773 (CVSS 9.8) — Apache HTTP Server 2.4.49 path traversal and RCE.";
    const result = enrichFinding(raw); // sem cveId param — call site 3 (técnico, artigo)
    expect(result.text).toBe(raw);     // devolvido intacto
    expect(result.text).not.toContain("Telnet");
  });

  it("fallback sem descrição (raw === cveId) não activa o guard e passa pelo enriquecimento", () => {
    // Quando description é vazia, o caller usa cveId como raw.
    // O guard não deve disparar (raw === structuralCveId).
    const result = enrichFinding("CVE-2021-41773", "CVE-2021-41773");
    // Não é reescrito para nenhum texto de porto (nenhum regex de porto corresponde)
    expect(result.text).not.toContain("Porta 23");
    expect(result.text).not.toContain("Telnet");
    // Pode ser o próprio cveId (fallback de enrichFinding)
    expect(result.text).toBe("CVE-2021-41773");
  });
});

describe("enrichFinding — findings sintéticos continuam enriquecidos", () => {
  it("deducao de porto 21 (FTP) sintetica recebe texto amigavel", () => {
    const synthetic = "Porto 21 (ftp) exposto — aumenta superfície de ataque";
    const result = enrichFinding(synthetic); // sem cveId: é sintético, não tem CVE ID
    expect(result.text).toContain("Porta 21");
    expect(result.text).toContain("FTP");
    expect(result.text).not.toBe(synthetic); // foi enriquecido
  });

  it("deducao de porto 23 (Telnet) sintetica recebe texto amigavel", () => {
    const synthetic = "Porto 23 (telnet) exposto — aumenta superfície de ataque";
    const result = enrichFinding(synthetic);
    expect(result.text).toContain("Porta 23");
    expect(result.text).toContain("Telnet");
    expect(result.critical).toBe(true);
  });

  it("finding NIS2-HEADER-CSP sintetico (sem cveId param) enriquecido via padrão csp", () => {
    const synthetic = "Content-Security-Policy ausente — risco de XSS e injecção de conteúdo malicioso.";
    const result = enrichFinding(synthetic, "NIS2-HEADER-CSP");
    expect(result.text).toContain("CSP");
    expect(result.text).not.toBe(synthetic);
  });

  it("finding NIS2-HEADER-HSTS sintetico enriquecido via padrão hsts", () => {
    const synthetic = "Strict-Transport-Security ausente — browsers podem aceder via HTTP.";
    const result = enrichFinding(synthetic, "NIS2-HEADER-HSTS");
    expect(result.text).toContain("HSTS");
    expect(result.text).not.toBe(synthetic);
  });

  it("finding DMARC sintetico enriquecido mesmo com cveId NIS2-EMAIL", () => {
    const synthetic = "DMARC ausente — domínio vulnerável a spoofing.";
    const result = enrichFinding(synthetic, "NIS2-EMAIL-DMARC");
    expect(result.text).toContain("DMARC");
    expect(result.critical).toBe(true);
  });
});

describe("buildMethodologyBullets — bullet de headers derivada de dataSources", () => {
  it("scan #63 (alvo morto, sem httpHeaders em dataSources) → sem bullet de headers", () => {
    // Reproduz dataSources do scan #63: emailSecurity correu (DNS), httpHeaders não (alvo inacessível)
    const dataSources = ["shodan", "emailSecurity"];
    const bullets = buildMethodologyBullets(dataSources);
    const labels = bullets.map((b) => b.label);
    expect(labels).not.toContain("Cabeçalhos de Segurança HTTP");
    expect(labels).toContain("Validação de Email e DNS");
  });

  it("scan #62 (scanme, httpHeaders verificados) → bullet de headers presente", () => {
    const dataSources = ["shodan", "directTls", "emailSecurity", "httpHeaders", "nvd"];
    const bullets = buildMethodologyBullets(dataSources);
    const labels = bullets.map((b) => b.label);
    expect(labels).toContain("Cabeçalhos de Segurança HTTP");
    const headerBullet = bullets.find((b) => b.label === "Cabeçalhos de Segurança HTTP")!;
    expect(headerBullet.detail).toContain("HSTS");
    expect(headerBullet.detail).toContain("CSP");
  });

  it("bullet de email sempre presente independentemente de httpHeaders", () => {
    // Email é DNS-only — corre mesmo quando o alvo não serve HTTP
    const withoutHeaders = buildMethodologyBullets(["shodan", "emailSecurity"]);
    const withHeaders    = buildMethodologyBullets(["shodan", "emailSecurity", "httpHeaders"]);
    expect(withoutHeaders.map((b) => b.label)).toContain("Validação de Email e DNS");
    expect(withHeaders.map((b) => b.label)).toContain("Validação de Email e DNS");
  });

  it("bullet de email não menciona cabeçalhos HTTP no seu texto", () => {
    const bullets = buildMethodologyBullets(["shodan", "emailSecurity", "httpHeaders"]);
    const emailBullet = bullets.find((b) => b.label === "Validação de Email e DNS")!;
    expect(emailBullet.detail).not.toContain("cabeçalhos");
    expect(emailBullet.detail).toContain("SPF");
    expect(emailBullet.detail).toContain("DMARC");
    expect(emailBullet.detail).toContain("DKIM");
  });

  it("perimeter bullet menciona Censys quando presente em dataSources", () => {
    const withCensys    = buildMethodologyBullets(["shodan", "censys"]);
    const withoutCensys = buildMethodologyBullets(["shodan"]);
    const pWith    = withCensys.find((b) => b.label === "Mapeamento de Perímetro")!;
    const pWithout = withoutCensys.find((b) => b.label === "Mapeamento de Perímetro")!;
    expect(pWith.detail).toContain("Censys");
    expect(pWithout.detail).not.toContain("Censys");
  });
});
