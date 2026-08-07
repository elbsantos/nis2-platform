/**
 * backend/integrations/subdomain-discovery.test.ts
 *
 * Testes da descoberta passiva de subdomínios: CT logs (crt.sh) + wordlist DNS.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

vi.mock("dns/promises", () => ({ resolve4: vi.fn() }));
vi.mock("https", () => {
  const get = vi.fn();
  return { get, default: { get } };
});

import { discoverSubdomains } from "./subdomain-discovery";
import { resolve4 } from "dns/promises";
import https from "https";
import { isSafeTarget } from "../middlewares/security";

const mockResolve4 = vi.mocked(resolve4);
const mockHttpsGet = vi.mocked(https.get) as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers — simulam o comportamento real de https.get (EventEmitter em streaming)
// ---------------------------------------------------------------------------

function mockCrtShSuccess(entries: Array<{ name_value: string; common_name?: string }>) {
  mockHttpsGet.mockImplementation((_opts: any, callback: any) => {
    const res = new EventEmitter();
    const req = new EventEmitter() as any;
    req.destroy = vi.fn();
    queueMicrotask(() => {
      callback(res);
      res.emit("data", Buffer.from(JSON.stringify(entries)));
      res.emit("end");
    });
    return req;
  });
}

function mockCrtShError() {
  mockHttpsGet.mockImplementation(() => {
    const req = new EventEmitter() as any;
    req.destroy = vi.fn();
    queueMicrotask(() => req.emit("error", new Error("ECONNREFUSED")));
    return req;
  });
}

function mockCrtShTimeout() {
  mockHttpsGet.mockImplementation(() => {
    const req = new EventEmitter() as any;
    req.destroy = vi.fn();
    queueMicrotask(() => req.emit("timeout"));
    return req;
  });
}

function mockCrtShMalformed() {
  mockHttpsGet.mockImplementation((_opts: any, callback: any) => {
    const res = new EventEmitter();
    const req = new EventEmitter() as any;
    req.destroy = vi.fn();
    queueMicrotask(() => {
      callback(res);
      res.emit("data", Buffer.from("not json{{{"));
      res.emit("end");
    });
    return req;
  });
}

/** Resolve só os hostnames em `alive`; todos os outros falham (ENOTFOUND), como DNS real. */
function mockDnsResolve(alive: string[], ip = "203.0.113.10") {
  mockResolve4.mockImplementation(async (hostname: string) => {
    if (alive.includes(hostname)) return [ip];
    const err: any = new Error("ENOTFOUND");
    err.code = "ENOTFOUND";
    throw err;
  });
}

describe("discoverSubdomains — descoberta passiva via CT logs (crt.sh) + wordlist DNS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("faz parsing correto da resposta real do crt.sh: multi-linha, wildcard, apex e domínio parecido excluídos", async () => {
    mockCrtShSuccess([
      // multi-linha (vários SANs no mesmo certificado, como o crt.sh devolve de facto)
      { name_value: "api.example.com\napp.example.com", common_name: "api.example.com" },
      // wildcard — o "*." tem de ser removido
      { name_value: "*.admin.example.com", common_name: "*.admin.example.com" },
      // o próprio domínio (apex) não é um subdomínio — tem de ser excluído
      { name_value: "example.com", common_name: "example.com" },
      // domínio parecido mas não é subdomínio real (não termina em ".example.com")
      { name_value: "notexample.com", common_name: "notexample.com" },
    ]);
    mockDnsResolve(["api.example.com", "app.example.com", "admin.example.com"]);

    const result = await discoverSubdomains("example.com", 50);
    const names = result.map((r) => r.name).sort();

    expect(names).toEqual(["admin.example.com", "api.example.com", "app.example.com"]);
    expect(names).not.toContain("example.com");
    expect(names).not.toContain("notexample.com");
  });

  it("deduplica subdomínios repetidos entre entradas do crt.sh (e não resolve o mesmo hostname duas vezes)", async () => {
    mockCrtShSuccess([
      { name_value: "www.example.com", common_name: "www.example.com" },
      { name_value: "www.example.com\nwww.example.com", common_name: "www.example.com" },
    ]);
    mockDnsResolve(["www.example.com"]);

    const result = await discoverSubdomains("example.com", 50);
    const wwwEntries = result.filter((r) => r.name === "www.example.com");

    expect(wwwEntries).toHaveLength(1);
    expect(mockResolve4.mock.calls.filter(([h]) => h === "www.example.com")).toHaveLength(1);
  });

  it("wordlist DNS: resolve os prefixos comuns e ignora silenciosamente os que não respondem", async () => {
    mockCrtShSuccess([]); // sem resultados de CT — força o caminho da wordlist
    mockDnsResolve(["www.example.com", "mail.example.com"]);

    const result = await discoverSubdomains("example.com", 50);
    const names = result.map((r) => r.name).sort();

    expect(names).toEqual(["mail.example.com", "www.example.com"]);
    // confirma que tentou muitos prefixos da wordlist, não só os 2 que resolveram
    expect(mockResolve4.mock.calls.length).toBeGreaterThan(10);
  });

  it("crt.sh indisponível (erro de rede) — não rebenta, cai para a wordlist", async () => {
    mockCrtShError();
    mockDnsResolve(["www.example.com"]);

    const result = await discoverSubdomains("example.com", 50);

    expect(result.map((r) => r.name)).toEqual(["www.example.com"]);
  });

  it("crt.sh em timeout — não rebenta, devolve o que a wordlist encontrar", async () => {
    mockCrtShTimeout();
    mockDnsResolve(["mail.example.com"]);

    const result = await discoverSubdomains("example.com", 50);

    expect(result.map((r) => r.name)).toEqual(["mail.example.com"]);
  });

  it("crt.sh devolve JSON inválido — não rebenta, cai para a wordlist", async () => {
    mockCrtShMalformed();
    mockDnsResolve(["www.example.com"]);

    const result = await discoverSubdomains("example.com", 50);

    expect(result.map((r) => r.name)).toEqual(["www.example.com"]);
  });

  it("nenhum candidato resolve — devolve lista vazia sem lançar exceção", async () => {
    mockCrtShSuccess([]);
    mockDnsResolve([]); // nada resolve

    await expect(discoverSubdomains("example.com", 50)).resolves.toEqual([]);
  });

  it("respeita maxResults mesmo com mais candidatos vivos disponíveis", async () => {
    mockCrtShSuccess([
      { name_value: "a.example.com\nb.example.com\nc.example.com", common_name: "a.example.com" },
    ]);
    mockDnsResolve(["a.example.com", "b.example.com", "c.example.com", "www.example.com", "mail.example.com"]);

    const result = await discoverSubdomains("example.com", 2);

    expect(result).toHaveLength(2);
  });

  it("SEGURANÇA — classifica corretamente: IP público mantém {name, ip}; IP privado sai só com {name, isInternal:true}, sem ip", async () => {
    // Simula um subdomínio mal configurado a apontar para uma rede interna
    // (ex.: split-horizon DNS exposto publicamente por engano).
    mockCrtShSuccess([
      { name_value: "app.example.com", common_name: "app.example.com" },
      { name_value: "vpn.example.com", common_name: "vpn.example.com" },
    ]);
    mockResolve4.mockImplementation(async (hostname: string) => {
      if (hostname === "app.example.com") return ["203.0.113.10"]; // IP público
      if (hostname === "vpn.example.com") return ["10.0.0.5"];     // IP privado — RFC 1918
      const err: any = new Error("ENOTFOUND");
      throw err;
    });

    const result = await discoverSubdomains("example.com", 50);
    const pub  = result.find((r) => r.name === "app.example.com");
    const priv = result.find((r) => r.name === "vpn.example.com");

    expect(pub).toEqual({ name: "app.example.com", ip: "203.0.113.10" });
    expect(priv).toEqual({ name: "vpn.example.com", isInternal: true });
    expect(priv).not.toHaveProperty("ip");
    // isSafeTarget confirma, de forma independente, que 10.0.0.5 é mesmo privado.
    expect(isSafeTarget("10.0.0.5")).toBe(false);
  });

  it.each([
    ["172.16.0.1",  "RFC1918 classe B"],
    ["192.168.1.1", "RFC1918 classe C"],
    ["127.0.0.1",   "loopback"],
    ["169.254.1.1", "link-local / AWS metadata"],
  ])("também classifica como interno: %s (%s)", async (ip) => {
    mockCrtShSuccess([{ name_value: "internal.example.com", common_name: "internal.example.com" }]);
    mockResolve4.mockImplementation(async (hostname: string) => {
      if (hostname === "internal.example.com") return [ip];
      const err: any = new Error("ENOTFOUND");
      throw err;
    });

    const result = await discoverSubdomains("example.com", 50);
    const entry = result.find((r) => r.name === "internal.example.com");

    expect(entry).toEqual({ name: "internal.example.com", isInternal: true });
  });
});
