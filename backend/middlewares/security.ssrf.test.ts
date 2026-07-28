/**
 * backend/middlewares/security.ssrf.test.ts
 *
 * Testes unitários para isPrivateOrBlockedIp, safeLookup e assertSafeRedirect (A2).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import dns from "dns";

// Importar após qualquer mock de módulo (vi.mock é hoisted automaticamente pelo Vitest)
import { isPrivateOrBlockedIp, safeLookup, assertSafeRedirect } from "./security";

// ---------------------------------------------------------------------------
// isPrivateOrBlockedIp
// ---------------------------------------------------------------------------

describe("isPrivateOrBlockedIp", () => {
  it.each([
    ["127.0.0.1"],
    ["127.1.2.3"],
    ["10.0.0.1"],
    ["10.255.255.255"],
    ["172.16.0.1"],
    ["172.31.255.255"],
    ["192.168.0.1"],
    ["192.168.255.254"],
    ["169.254.0.1"],
    ["169.254.169.254"],
    ["::1"],
    ["fc00::1"],
    ["fd00::1"],
    ["fe80::1"],
    ["localhost"],
    ["metadata.google.internal"],
  ])("bloqueia %s", (ip) => {
    expect(isPrivateOrBlockedIp(ip)).toBe(true);
  });

  it.each([
    ["8.8.8.8"],
    ["1.1.1.1"],
    ["185.1.2.3"],
    ["203.0.113.1"],
    ["2001:db8::1"],
  ])("permite %s (IP público)", (ip) => {
    expect(isPrivateOrBlockedIp(ip)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// safeLookup — dns.lookup stubado
// ---------------------------------------------------------------------------

describe("safeLookup", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("bloqueia localhost via fast-path (sem DNS)", () => {
    const spy = vi.spyOn(dns, "lookup");
    const cb = vi.fn();
    safeLookup("localhost", {}, cb);
    expect(spy).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledOnce();
    const [err] = cb.mock.calls[0] as [NodeJS.ErrnoException, string, number];
    expect(err).not.toBeNull();
    expect((err as NodeJS.ErrnoException).code).toBe("SSRF_BLOCKED");
  });

  it("bloqueia IP literal privado 127.0.0.1 via fast-path", () => {
    const spy = vi.spyOn(dns, "lookup");
    const cb = vi.fn();
    safeLookup("127.0.0.1", {}, cb);
    expect(spy).not.toHaveBeenCalled();
    const [err] = cb.mock.calls[0] as [NodeJS.ErrnoException, string, number];
    expect((err as NodeJS.ErrnoException).code).toBe("SSRF_BLOCKED");
  });

  it("bloqueia hostname cujo DNS resolve para IP privado", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(null, [{ address: "192.168.1.10", family: 4 }]);
    }) as any);
    const cb = vi.fn();
    safeLookup("evil.example.com", { all: true }, cb);
    const [err] = cb.mock.calls[0] as [NodeJS.ErrnoException, string, number];
    expect((err as NodeJS.ErrnoException).code).toBe("SSRF_BLOCKED");
  });

  it("devolve IP público quando DNS resolve para IP público", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(null, [{ address: "93.184.216.34", family: 4 }]);
    }) as any);
    const cb = vi.fn();
    safeLookup("example.com", {}, cb);
    const [err, address, family] = cb.mock.calls[0] as [NodeJS.ErrnoException | null, string, number];
    expect(err).toBeNull();
    expect(address).toBe("93.184.216.34");
    expect(family).toBe(4);
  });

  it("propaga erro de DNS (ex.: NXDOMAIN)", () => {
    const dnsError = Object.assign(new Error("NXDOMAIN"), { code: "ENOTFOUND" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(dnsError, []);
    }) as any);
    const cb = vi.fn();
    safeLookup("nxdomain.invalid", {}, cb);
    const [err] = cb.mock.calls[0] as [NodeJS.ErrnoException, string, number];
    expect((err as NodeJS.ErrnoException).code).toBe("ENOTFOUND");
  });

  // ---------------------------------------------------------------------------
  // Regressão Railway: DNS devolve AAAA (IPv6) antes de A (IPv4).
  // Sem preferência de family, addresses[0] é IPv6 → ligações falham em Railway.
  // Após o fix: safeLookup prefere IPv4 quando family não é especificado.
  // ---------------------------------------------------------------------------

  it("REGRESSÃO — DNS [IPv6, IPv4] sem family → deve devolver IPv4 (não IPv6 cego)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(null, [
        { address: "2001:db8::1",    family: 6 }, // IPv6 público — chega primeiro do DNS
        { address: "93.184.216.34",  family: 4 }, // IPv4 público — chega segundo
      ]);
    }) as any);
    const cb = vi.fn();
    safeLookup("example.com", {}, cb); // sem family = preferência indefinida
    const [err, address, family] = cb.mock.calls[0] as [NodeJS.ErrnoException | null, string, number];
    expect(err).toBeNull();
    expect(family).toBe(4);                 // deve escolher IPv4
    expect(address).toBe("93.184.216.34");  // não "2001:db8::1"
  });

  it("REGRESSÃO — DNS [IPv6, IPv4] com family:0 → deve devolver IPv4 (family=0 é falsy em JS)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(null, [
        { address: "2001:db8::1",    family: 6 },
        { address: "93.184.216.34",  family: 4 },
      ]);
    }) as any);
    const cb = vi.fn();
    safeLookup("example.com", { family: 0 }, cb); // family=0 = "qualquer" no Node.js
    const [err, address, family] = cb.mock.calls[0] as [NodeJS.ErrnoException | null, string, number];
    expect(err).toBeNull();
    expect(family).toBe(4);
    expect(address).toBe("93.184.216.34");
  });

  // family explícita: deve ser respeitada independentemente da ordem do DNS
  it("family:4 explícito → escolhe IPv4 mesmo que DNS devolva IPv6 primeiro", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(null, [
        { address: "2001:db8::1",   family: 6 },
        { address: "93.184.216.34", family: 4 },
      ]);
    }) as any);
    const cb = vi.fn();
    safeLookup("example.com", { family: 4 }, cb);
    const [err, address, family] = cb.mock.calls[0] as [NodeJS.ErrnoException | null, string, number];
    expect(err).toBeNull();
    expect(family).toBe(4);
    expect(address).toBe("93.184.216.34");
  });

  it("family:6 explícito → escolhe IPv6", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(null, [
        { address: "2001:db8::1",   family: 6 },
        { address: "93.184.216.34", family: 4 },
      ]);
    }) as any);
    const cb = vi.fn();
    safeLookup("example.com", { family: 6 }, cb);
    const [err, address, family] = cb.mock.calls[0] as [NodeJS.ErrnoException | null, string, number];
    expect(err).toBeNull();
    expect(family).toBe(6);
    expect(address).toBe("2001:db8::1");
  });

  it("sem IPv4 disponível e sem family preference → devolve IPv6 (fallback correto)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(null, [{ address: "2001:db8::1", family: 6 }]);
    }) as any);
    const cb = vi.fn();
    safeLookup("ipv6only.example.com", {}, cb);
    const [err, address, family] = cb.mock.calls[0] as [NodeJS.ErrnoException | null, string, number];
    expect(err).toBeNull();
    expect(family).toBe(6);
    expect(address).toBe("2001:db8::1");
  });

  it("bloqueia se QUALQUER IP for privado, mesmo com IPs públicos na lista", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(dns, "lookup").mockImplementation(((h: string, o: unknown, cb: any) => {
      cb(null, [
        { address: "93.184.216.34", family: 4 }, // público — mas há um privado abaixo
        { address: "10.0.0.1",      family: 4 }, // privado → deve bloquear tudo
      ]);
    }) as any);
    const cb = vi.fn();
    safeLookup("mixed.example.com", {}, cb);
    const [err] = cb.mock.calls[0] as [NodeJS.ErrnoException, string, number];
    expect((err as NodeJS.ErrnoException).code).toBe("SSRF_BLOCKED");
  });
});

// ---------------------------------------------------------------------------
// assertSafeRedirect
// ---------------------------------------------------------------------------

describe("assertSafeRedirect", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("rejeita redirect para IP literal 127.0.0.1", async () => {
    await expect(assertSafeRedirect("http://127.0.0.1/secret")).rejects.toThrow("SSRF bloqueado");
  });

  it("rejeita redirect para localhost", async () => {
    await expect(assertSafeRedirect("http://localhost/secret")).rejects.toThrow("SSRF bloqueado");
  });

  it("rejeita URL inválido", async () => {
    await expect(assertSafeRedirect("nao-e-uma-url")).rejects.toThrow("SSRF bloqueado");
  });

  it("rejeita hostname cujo DNS resolve para IP privado", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue(
      [{ address: "10.0.0.1", family: 4 }] as any
    );
    await expect(assertSafeRedirect("http://evil.example.com/")).rejects.toThrow("SSRF bloqueado");
  });

  it("permite redirect para hostname com IP público", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue(
      [{ address: "93.184.216.34", family: 4 }] as any
    );
    await expect(assertSafeRedirect("https://example.com/page")).resolves.toBeUndefined();
  });
});
