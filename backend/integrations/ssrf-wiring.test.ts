/**
 * backend/integrations/ssrf-wiring.test.ts
 *
 * Testes de CONTRATO — formalizam o ponto 3 da auditoria SSRF (Fase 1):
 * todos os detectores que ligam directamente ao alvo do utilizador têm de
 * usar `lookup: safeLookup`. Não testam o resultado do scan (isso já está
 * coberto noutros ficheiros) — testam que a OPÇÃO `lookup` passada ao módulo
 * nativo do Node (`http`/`https`/`net`/`tls`) é literalmente a função
 * `safeLookup` exportada de security.ts. Se alguém remover essa opção de um
 * destes pontos de conexão, o teste correspondente falha.
 *
 * Como isto é testado: espiar os métodos nativos do Node ANTES de chamar a
 * função exportada real do integration file (nunca mockamos o integration
 * file em si), forçar uma resposta/erro imediato para não depender de rede
 * real, e inspeccionar os argumentos capturados pelo spy.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import https from "https";
import net from "net";
import tls from "tls";
import { EventEmitter } from "events";
import { safeLookup } from "../middlewares/security";

afterEach(() => {
  vi.restoreAllMocks();
});

/** http.get/https.get suportam (url, cb) | (url, opts, cb) | (opts, cb) — devolve o objecto opts. */
function extractOptions(args: unknown[]): any {
  return args.find((a) => typeof a === "object" && a !== null && !(a instanceof Function));
}

describe("ssrf-wiring — checkHttpHeaders (http-headers.ts) liga sempre com lookup:safeLookup", () => {
  it("fetchHeaders/checkHttpToHttps passam lookup:safeLookup ao http.get/https.get", async () => {
    const capturedOptions: any[] = [];

    function fakeGet(...args: unknown[]) {
      const opts = extractOptions(args);
      if (opts) capturedOptions.push(opts);
      const req = new EventEmitter() as any;
      req.destroy = () => {};
      process.nextTick(() => req.emit("error", new Error("mock: sem rede real")));
      return req;
    }

    vi.spyOn(http, "get").mockImplementation(fakeGet as any);
    vi.spyOn(https, "get").mockImplementation(fakeGet as any);

    const { checkHttpHeaders } = await import("./http-headers");
    await checkHttpHeaders("example-wiring-test.invalid");

    expect(capturedOptions.length).toBeGreaterThan(0);
    for (const opts of capturedOptions) {
      expect(opts.lookup).toBe(safeLookup);
    }
  });
});

describe("ssrf-wiring — checkDirectTls (direct-tls.ts) liga sempre com lookup:safeLookup", () => {
  it("checkPortOpen (net.Socket), detectCdn (https.request) e tlsHandshake (tls.connect) passam lookup:safeLookup", async () => {
    const socketOptions: any[] = [];
    const requestOptions: any[] = [];
    const tlsOptions: any[] = [];

    vi.spyOn(net.Socket.prototype, "connect").mockImplementation(function (this: any, ...args: any[]) {
      const opts = extractOptions(args);
      if (opts) socketOptions.push(opts);
      // Porta 443 "aberta" (chama o callback de sucesso) para também exercitar tlsHandshake;
      // as restantes portas falham — não interessa para este teste, só a opção lookup.
      const cb = args.find((a) => typeof a === "function");
      if (opts?.port === 443 && cb) {
        process.nextTick(() => cb());
      } else {
        process.nextTick(() => this.emit("error", new Error("mock: porta fechada")));
      }
      return this;
    } as any);

    vi.spyOn(https, "request").mockImplementation(((...args: unknown[]) => {
      const opts = extractOptions(args);
      if (opts) requestOptions.push(opts);
      const req = new EventEmitter() as any;
      req.destroy = () => {};
      req.end = () => {};
      process.nextTick(() => req.emit("error", new Error("mock: sem rede real")));
      return req;
    }) as any);

    vi.spyOn(tls, "connect").mockImplementation(((...args: unknown[]) => {
      const opts = extractOptions(args);
      if (opts) tlsOptions.push(opts);
      const socket = new EventEmitter() as any;
      socket.destroy = () => {};
      socket.setTimeout = () => {};
      process.nextTick(() => socket.emit("error", new Error("mock: sem rede real")));
      return socket;
    }) as any);

    const { checkDirectTls } = await import("./direct-tls");
    await checkDirectTls("example-wiring-test.invalid");

    expect(socketOptions.length).toBeGreaterThan(0);
    for (const opts of socketOptions) expect(opts.lookup).toBe(safeLookup);

    expect(requestOptions.length).toBeGreaterThan(0);
    for (const opts of requestOptions) expect(opts.lookup).toBe(safeLookup);

    // tlsHandshake só corre se a porta 443 "abrir" no mock acima — confirma que aconteceu.
    expect(tlsOptions.length).toBeGreaterThan(0);
    for (const opts of tlsOptions) expect(opts.lookup).toBe(safeLookup);
  });
});

describe("ssrf-wiring — checkSsh (ssh-check.ts) liga sempre com lookup:safeLookup", () => {
  it("grabSshBanner passa lookup:safeLookup a socket.connect", async () => {
    const socketOptions: any[] = [];

    vi.spyOn(net.Socket.prototype, "connect").mockImplementation(function (this: any, ...args: any[]) {
      const opts = extractOptions(args);
      if (opts) socketOptions.push(opts);
      process.nextTick(() => this.emit("error", new Error("mock: sem rede real")));
      return this;
    } as any);

    const { checkSsh } = await import("./ssh-check");
    await checkSsh("example-wiring-test.invalid", 22);

    expect(socketOptions.length).toBeGreaterThan(0);
    for (const opts of socketOptions) expect(opts.lookup).toBe(safeLookup);
  });
});

describe("ssrf-wiring — verifyOwnership/fetchWellKnownToken (scan-executor.ts) liga sempre com lookup:safeLookup", () => {
  it("fetchWellKnownToken (alvo IP) passa lookup:safeLookup a http.get", async () => {
    vi.doMock("../db", () => ({
      getOrganizationById: vi.fn().mockRejectedValue(new Error("sem BD real neste teste")),
    }));

    const capturedOptions: any[] = [];
    vi.spyOn(http, "get").mockImplementation(((...args: unknown[]) => {
      const opts = extractOptions(args);
      if (opts) capturedOptions.push(opts);
      const req = new EventEmitter() as any;
      req.destroy = () => {};
      process.nextTick(() => req.emit("error", new Error("mock: sem rede real")));
      return req;
    }) as any);

    const { verifyOwnership } = await import("../services/scan-executor");
    await verifyOwnership("203.0.113.10", 1);

    expect(capturedOptions.length).toBeGreaterThan(0);
    for (const opts of capturedOptions) expect(opts.lookup).toBe(safeLookup);

    vi.doUnmock("../db");
  });
});
