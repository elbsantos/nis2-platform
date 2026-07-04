/**
 * backend/integrations/nvd.test.ts
 *
 * Testa lookupCveVersionRanges: retry em 429, marcação nvdUnavailable,
 * e distinção entre NVD indisponível vs produto genuinamente não correspondente.
 * FASE 2: API key + throttle global + teto de tempo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Redis mock — lookupCveVersionRanges lê DEV_CACHE_DISABLED e chama getRedisClient
vi.mock("../middlewares/rateLimit", () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get:   vi.fn().mockResolvedValue(null),  // cache miss — vai à API
    setEx: vi.fn().mockResolvedValue("OK"),
  }),
}));

// As funções são importadas DEPOIS dos mocks para que os vi.mock acima estejam activos.
const { lookupCveVersionRanges, batchLookupCveVersionRanges, _resetNvdRateLimiter } = await import("./nvd");

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
    // Desligar atraso de throttle nos testes (sem espera real entre pedidos)
    process.env.NVD_MIN_INTERVAL_MS = "0";
    _resetNvdRateLimiter();
    fetchSpy = vi.spyOn(globalThis, "fetch");
    delete process.env.DEV_CACHE_DISABLED;
    delete process.env.NVD_API_KEY;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
    delete process.env.NVD_MIN_INTERVAL_MS;
    delete process.env.NVD_API_KEY;
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

// ── FASE 2: API key + throttle global + teto de tempo ──────────────────────

describe("FASE 2: API key + throttle + teto de tempo", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NVD_MIN_INTERVAL_MS = "0";
    _resetNvdRateLimiter();
    fetchSpy = vi.spyOn(globalThis, "fetch");
    delete process.env.DEV_CACHE_DISABLED;
    delete process.env.NVD_API_KEY;
    delete process.env.NVD_BATCH_TIMEOUT_MS;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
    delete process.env.NVD_MIN_INTERVAL_MS;
    delete process.env.NVD_API_KEY;
    delete process.env.NVD_BATCH_TIMEOUT_MS;
  });

  // ── Teste 5: header apiKey presente quando key definida ──────────────────
  it("inclui header apiKey no fetch quando NVD_API_KEY está definida", async () => {
    process.env.NVD_API_KEY = "test-key-12345";
    _resetNvdRateLimiter();

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(APACHE_NVD_RESPONSE), { status: 200 })
    );

    await lookupCveVersionRanges("CVE-APIKEY-PRESENT");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["apiKey"]).toBe("test-key-12345");
  });

  // ── Teste 6: header apiKey ausente quando key não definida ───────────────
  it("não inclui header apiKey quando NVD_API_KEY não está definida", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(APACHE_NVD_RESPONSE), { status: 200 })
    );

    await lookupCveVersionRanges("CVE-APIKEY-ABSENT");

    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["apiKey"]).toBeUndefined();
  });

  // ── Teste 7: throttle serializa pedidos com espaçamento mínimo ───────────
  it("throttle espaca 3 pedidos concorrentes pelo intervalo mínimo configurado", async () => {
    // Usar 80ms de intervalo para que o teste corra em ~160ms sem stress
    process.env.NVD_MIN_INTERVAL_MS = "80";
    _resetNvdRateLimiter();

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(APACHE_NVD_RESPONSE), { status: 200 })
    );

    const dispatchTimes: number[] = [];

    // Sobrepor fetch para registar quando cada pedido é realmente enviado
    fetchSpy.mockImplementation(async () => {
      dispatchTimes.push(Date.now());
      return new Response(JSON.stringify(APACHE_NVD_RESPONSE), { status: 200 });
    });

    // Lançar 3 lookups em simultâneo — o throttle deve serializar
    await Promise.all([
      lookupCveVersionRanges("CVE-T1"),
      lookupCveVersionRanges("CVE-T2"),
      lookupCveVersionRanges("CVE-T3"),
    ]);

    expect(dispatchTimes).toHaveLength(3);
    dispatchTimes.sort((a, b) => a - b);
    // Cada pedido deve ter sido despachado pelo menos 70ms depois do anterior (margem -10ms)
    expect(dispatchTimes[1] - dispatchTimes[0]).toBeGreaterThanOrEqual(70);
    expect(dispatchTimes[2] - dispatchTimes[1]).toBeGreaterThanOrEqual(70);
  }, 10_000);

  // ── Teste 8: valor da API key nunca aparece em logs ──────────────────────
  it("valor da API key nunca aparece em nenhum log mesmo após 429", async () => {
    const secretKey = "SUPER-SECRET-NVD-KEY-XYZ";
    process.env.NVD_API_KEY = secretKey;
    _resetNvdRateLimiter();

    // Simular 3 retries com 429 para que os logs de erro sejam emitidos
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 429, headers: { "Retry-After": "0" } })
    );

    const logSpy   = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy  = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await lookupCveVersionRanges("CVE-KEY-LEAK-TEST");

    const allLoggedText = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ].map((args) => args.map(String).join(" "));

    expect(allLoggedText.some((line) => line.includes(secretKey))).toBe(false);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── Teste 9: teto de tempo marca CVEs restantes como indeterminados ───────
  it("teto de tempo atingido: CVEs não resolvidos ficam nvdUnavailable=true", async () => {
    process.env.NVD_BATCH_TIMEOUT_MS = "100"; // teto de 100ms
    process.env.NVD_MIN_INTERVAL_MS  = "0";
    _resetNvdRateLimiter();

    // fetch nunca resolve dentro de 100ms
    fetchSpy.mockImplementation(() => new Promise<Response>(() => {}));

    const result = await batchLookupCveVersionRanges([
      "CVE-TM-1", "CVE-TM-2", "CVE-TM-3", "CVE-TM-4", "CVE-TM-5",
    ]);

    const indeterminate = [...result.values()].filter((v) => v.nvdUnavailable);
    // Com fetch bloqueado e teto de 100ms, todos devem ficar indeterminados
    expect(indeterminate.length).toBeGreaterThan(0);
    // Nenhum deve ter chegado a hasRangeData=true
    expect([...result.values()].some((v) => v.hasRangeData)).toBe(false);
  }, 10_000);
});
