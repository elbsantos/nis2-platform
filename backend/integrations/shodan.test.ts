/**
 * backend/integrations/shodan.test.ts
 *
 * lookupHost() nunca pode enviar, guardar ou devolver um IP privado —
 * resolveToIp() valida o IP resolvido (interno, não exportado) antes de
 * prosseguir para a InternetDB/API do Shodan ou para o cache Redis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("dns/promises", () => ({ resolve4: vi.fn() }));
vi.mock("../middlewares/rateLimit", () => ({ getRedisClient: vi.fn() }));

import { lookupHost, invalidateCache } from "./shodan";
import { resolve4 } from "dns/promises";
import { getRedisClient } from "../middlewares/rateLimit";

const mockResolve4 = vi.mocked(resolve4);
const mockGetRedisClient = vi.mocked(getRedisClient);

describe("shodan.lookupHost — IP privado nunca chega ao Shodan nem ao cache", () => {
  let fetchSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(global, "fetch");
    // Redis indisponível por omissão — o código já trata isto graciosamente
    // (getCached/setCache engolem o erro), simplifica os testes que não
    // precisam de verificar o cache especificamente.
    mockGetRedisClient.mockRejectedValue(new Error("redis down"));
  });

  const PRIVATE_RANGES: Array<[string, string]> = [
    ["10.0.0.5",    "RFC1918 classe A"],
    ["172.16.0.1",  "RFC1918 classe B"],
    ["192.168.1.1", "RFC1918 classe C"],
    ["127.0.0.1",   "loopback"],
    ["169.254.1.1", "link-local / AWS metadata"],
  ];

  it.each(PRIVATE_RANGES)(
    "hostname que resolve para IP privado (%s — %s) → devolve null, NÃO chama o Shodan",
    async (privateIp) => {
      mockResolve4.mockResolvedValue([privateIp]);

      const result = await lookupHost("vpn.example.com");

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it("alvo já é um IP privado literal (chamado diretamente, sem hostname) → também bloqueado, sem resolver DNS", async () => {
    const result = await lookupHost("10.0.0.5");

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockResolve4).not.toHaveBeenCalled();
  });

  it("hostname que resolve para IP PÚBLICO → comportamento inalterado, consulta a InternetDB normalmente", async () => {
    mockResolve4.mockResolvedValue(["203.0.113.10"]);
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hostnames: ["example.com"], tags: [], cpes: [], vulns: [], ports: [80, 443] }),
      text: async () => "",
    } as any);

    const result = await lookupHost("example.com");

    expect(result).not.toBeNull();
    expect(result?.ip).toBe("203.0.113.10");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("203.0.113.10"),
      expect.anything()
    );
  });

  it("IP público continua a ser guardado em cache Redis (não-regressão)", async () => {
    mockResolve4.mockResolvedValue(["203.0.113.10"]);
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ hostnames: [], tags: [], cpes: [], vulns: [], ports: [] }),
      text: async () => "",
    } as any);
    const setEx = vi.fn();
    mockGetRedisClient.mockResolvedValue({ setEx, get: vi.fn().mockResolvedValue(null) } as any);

    await lookupHost("example.com");

    expect(setEx).toHaveBeenCalledWith("shodan:203.0.113.10", expect.any(Number), expect.any(String));
  });

  it("IP privado NÃO é guardado em cache Redis", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.5"]);
    const setEx = vi.fn();
    mockGetRedisClient.mockResolvedValue({ setEx, get: vi.fn() } as any);

    await lookupHost("vpn.example.com");

    expect(setEx).not.toHaveBeenCalled();
  });

  it("404 na InternetDB para um IP público continua a devolver resultado vazio (não-regressão)", async () => {
    mockResolve4.mockResolvedValue(["203.0.113.20"]);
    fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => ({}), text: async () => "" } as any);

    const result = await lookupHost("semdados.example.com");

    expect(result).toEqual({ ip: "203.0.113.20", hostnames: [], tags: [], ports: [], cpes: [], vulns: [] });
  });

  it("invalidateCache com alvo que resolve para IP privado não tenta apagar nada (ip é null)", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.5"]);
    const del = vi.fn();
    mockGetRedisClient.mockResolvedValue({ del } as any);

    await invalidateCache("vpn.example.com");

    expect(del).not.toHaveBeenCalled();
  });

  it("invalidateCache com alvo público continua a apagar a chave certa (não-regressão)", async () => {
    mockResolve4.mockResolvedValue(["203.0.113.10"]);
    const del = vi.fn();
    mockGetRedisClient.mockResolvedValue({ del } as any);

    await invalidateCache("example.com");

    expect(del).toHaveBeenCalledWith("shodan:203.0.113.10");
  });
});
