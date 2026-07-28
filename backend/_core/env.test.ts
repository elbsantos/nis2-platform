/**
 * Testes para getJwtSecret (B1 — getter partilhado fail-closed em produção).
 */
import { describe, it, expect, afterEach } from "vitest";
import { getJwtSecret } from "./env";

describe("getJwtSecret", () => {
  const _JWT_SECRET  = process.env.JWT_SECRET;
  const _NODE_ENV    = process.env.NODE_ENV;

  afterEach(() => {
    process.env.JWT_SECRET = _JWT_SECRET;
    process.env.NODE_ENV   = _NODE_ENV;
  });

  it("lança em produção se JWT_SECRET não está definido", () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "production";
    expect(() => getJwtSecret()).toThrow("[Auth] JWT_SECRET is not set in production");
  });

  it("usa segredo dev fora de produção quando JWT_SECRET está ausente", () => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";
    const result = getJwtSecret();
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("devolve Uint8Array do segredo quando JWT_SECRET está definido", () => {
    process.env.JWT_SECRET = "test-secret-de-teste-com-32-chars!!";
    const result = getJwtSecret();
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toBe("test-secret-de-teste-com-32-chars!!");
  });
});
