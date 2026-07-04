/**
 * backend/integrations/nvd.test.ts
 *
 * Testa lookupCveVersionRanges: retry em 429, marcação nvdUnavailable,
 * e distinção entre NVD indisponível vs produto genuinamente não correspondente.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Redis mock — lookupCveVersionRanges lê DEV_CACHE_DISABLED e chama getRedisClient
vi.mock("../middlewares/rateLimit", () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get:   vi.fn().mockResolvedValue(null),  // cache miss — vai à API
    setEx: vi.fn().mockResolvedValue("OK"),
  }),
}));

// A função é importada DEPOIS dos mocks para que os vi.mock acima estejam activos.
const { lookupCveVersionRanges } = await import("./nvd");

// Resposta NVD real mínima para Apache HTTP Server 2.4.7 com intervalo de versões.
const APACHE_NVD_RESPONSE = {
  vulnerabilities: [{
    cve: {
      configurations: [{
        nodes: [{
          cpeMatch: [{
            vulnerable: true,
            criteria: "cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*:*",
            versionStartIncluding: "2.4.0",
            versionEndExcluding:  "2.4.50",
          }],
        }],
      }],
      metrics: {
        cvssMetricV31: [{ cvssData: { baseScore: 7.5 } }],
      },
    },
  }],
};

describe("lookupCveVersionRanges", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    // Desligar DEV_CACHE_DISABLED para que o Redis mock seja usado
    delete process.env.DEV_CACHE_DISABLED;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  // ── Teste 1 ──────────────────────────────────────────────────────────────
  it("retorna resultado correcto quando 429 nas duas primeiras tentativas, 200 na terceira", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(APACHE_NVD_RESPONSE), { status: 200 }));

    const info = await lookupCveVersionRanges("CVE-2021-41773");

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(info.nvdUnavailable).toBeUndefined();
    expect(info.hasRangeData).toBe(true);
    expect(info.affectedProducts).toContain("apache:http_server");
  });

  // ── Teste 2 ──────────────────────────────────────────────────────────────
  it("marca nvdUnavailable=true e não exclui o CVE quando todos os retries retornam 429", async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 429, headers: { "Retry-After": "0" } })
    );

    const info = await lookupCveVersionRanges("CVE-2024-99999");

    expect(fetchSpy).toHaveBeenCalledTimes(3); // MAX_RETRIES
    expect(info.nvdUnavailable).toBe(true);
    expect(info.hasRangeData).toBe(false);
    expect(info.affectedProducts).toHaveLength(0);
    // Garantia: resultado NÃO foi gravado no cache (setEx não deve ter sido chamado)
    const { getRedisClient } = await import("../middlewares/rateLimit");
    const redis = await (getRedisClient as ReturnType<typeof vi.fn>)();
    expect(redis.setEx).not.toHaveBeenCalled();
  });

  // ── Teste 3 ──────────────────────────────────────────────────────────────
  it("exclui CVE quando NVD responde 200 mas produto genuinamente não corresponde", async () => {
    // NVD responde com produto "openssl:openssl" — não é o Apache
    const mismatchResponse = {
      vulnerabilities: [{
        cve: {
          configurations: [{
            nodes: [{
              cpeMatch: [{
                vulnerable: true,
                criteria: "cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*",
                versionStartIncluding: "1.0.0",
                versionEndExcluding:   "3.0.0",
              }],
            }],
          }],
          metrics: {},
        },
      }],
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(mismatchResponse), { status: 200 })
    );

    const info = await lookupCveVersionRanges("CVE-2022-12345");

    expect(info.nvdUnavailable).toBeUndefined();
    expect(info.affectedProducts).toContain("openssl:openssl");
    // afectedProducts não contém apache → filtro em scan-executor excluirá o CVE.
    expect(info.affectedProducts).not.toContain("apache:http_server");
  });

  // ── Teste 4 ──────────────────────────────────────────────────────────────
  it("inclui Apache HTTP Server 2.4.7 dentro do intervalo NVD 2.4.0–2.4.50", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(APACHE_NVD_RESPONSE), { status: 200 })
    );

    const info = await lookupCveVersionRanges("CVE-2021-41773");

    expect(info.nvdUnavailable).toBeUndefined();
    expect(info.hasRangeData).toBe(true);
    expect(info.ranges).toHaveLength(1);
    expect(info.ranges[0].versionStartIncluding).toBe("2.4.0");
    expect(info.ranges[0].versionEndExcluding).toBe("2.4.50");

    // Confirma que isVersionInNvdRanges aceita 2.4.7 no intervalo
    const { isVersionInNvdRanges } = await import("./nvd");
    expect(isVersionInNvdRanges("2.4.7", info.ranges)).toBe(true);
    expect(isVersionInNvdRanges("2.4.51", info.ranges)).toBe(false);
  });
});
