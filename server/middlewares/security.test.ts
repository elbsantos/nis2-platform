/**
 * server/middlewares/security.test.ts
 *
 * Unit tests for SSRF protection and security header middleware.
 */

import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { isSafeTarget, securityHeaders } from "./security";

// ---------------------------------------------------------------------------
// isSafeTarget — SSRF protection
// ---------------------------------------------------------------------------

describe("isSafeTarget", () => {
  // Valid public domains
  it.each([
    "example.com",
    "empresa.pt",
    "sub.domain.co.uk",
    "my-company.org",
    "nis2pt.pt",
    "api.example.com",
  ])("allows public domain: %s", (target) => {
    expect(isSafeTarget(target)).toBe(true);
  });

  // RFC 1918 private ranges
  it.each([
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.168.0.0",
  ])("blocks private IP: %s", (target) => {
    expect(isSafeTarget(target)).toBe(false);
  });

  // Loopback and special addresses
  it.each([
    "127.0.0.1",
    "127.0.0.2",
    "localhost",
    "0.0.0.0",
    "169.254.169.254",        // AWS IMDS
    "metadata.google.internal",
  ])("blocks internal/special address: %s", (target) => {
    expect(isSafeTarget(target)).toBe(false);
  });

  // Bare hostnames (no dot) are rejected
  it.each([
    "intranet",
    "server01",
    "db",
  ])("blocks bare hostname without TLD: %s", (target) => {
    expect(isSafeTarget(target)).toBe(false);
  });

  // Malformed inputs
  it.each([
    "",
    "http://example.com",     // scheme included — not a bare hostname
    "example.com/path",       // path included
    "user@example.com",       // email format
    "..example.com",
  ])("blocks malformed input: %s", (target) => {
    expect(isSafeTarget(target)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// securityHeaders middleware
// ---------------------------------------------------------------------------

function mockResponse() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    headers,
  } as unknown as Response;
  return { res, headers };
}

describe("securityHeaders", () => {
  it("sets X-Frame-Options to DENY", () => {
    const { res, headers } = mockResponse();
    const next: NextFunction = vi.fn();
    securityHeaders({} as Request, res, next);
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(next).toHaveBeenCalledOnce();
  });

  it("sets a Content-Security-Policy header", () => {
    const { res, headers } = mockResponse();
    securityHeaders({} as Request, res, vi.fn() as NextFunction);
    expect(headers["Content-Security-Policy"]).toBeDefined();
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
  });

  it("sets Permissions-Policy to deny camera/mic/geolocation", () => {
    const { res, headers } = mockResponse();
    securityHeaders({} as Request, res, vi.fn() as NextFunction);
    const pp = headers["Permissions-Policy"];
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
  });

  it("calls next()", () => {
    const { res } = mockResponse();
    const next = vi.fn() as unknown as NextFunction;
    securityHeaders({} as Request, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
