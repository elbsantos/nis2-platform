/**
 * server/middlewares/security.ts
 *
 * HTTP security headers and SSRF protection utilities.
 */

import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Security headers middleware
// ---------------------------------------------------------------------------

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  // Already set in index.ts: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy

  // Prevent MIME sniffing on uploaded/served content
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Block clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Stop cross-origin information leakage
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Deny sensitive hardware APIs
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // Content Security Policy
  // - default-src 'self': only load resources from same origin
  // - style-src 'unsafe-inline': Tailwind injects styles at runtime
  // - img-src data: blob:: charts (Recharts uses SVG/data URIs)
  // - connect-src 'self': tRPC/API calls to same origin only
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Vite HMR in dev; bundled JS in prod
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' wss: ws:",       // wss for Vite HMR WebSocket
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  next();
}

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = new Set([
  process.env.APP_URL ?? "http://localhost:3000",
  "http://localhost:5173", // Vite dev server
]);

export function corsHeaders(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && (ALLOWED_ORIGINS.has(origin) || process.env.NODE_ENV !== "production")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 h preflight cache

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// SSRF protection — validates scan targets
// ---------------------------------------------------------------------------

// RFC 1918 private ranges, loopback, link-local, AWS metadata, IPv6 special
const PRIVATE_IP_RE = new RegExp(
  [
    "^10\\.",                          // 10.0.0.0/8
    "^172\\.(1[6-9]|2[0-9]|3[01])\\.", // 172.16.0.0/12
    "^192\\.168\\.",                   // 192.168.0.0/16
    "^127\\.",                         // loopback
    "^169\\.254\\.",                   // link-local / AWS metadata
    "^0\\.0\\.0\\.0",                  // unspecified
    "^::1$",                           // IPv6 loopback
    "^fc[0-9a-f]{2}:",                 // IPv6 ULA
    "^fd[0-9a-f]{2}:",                 // IPv6 ULA
    "^fe80:",                          // IPv6 link-local
  ].join("|"),
  "i"
);

// Only allow valid public hostnames (letters, digits, hyphens, dots)
// Must have at least one dot (rejects bare hostnames like "localhost")
const VALID_HOSTNAME_RE =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// Blocked hostnames regardless of IP
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254", // AWS IMDS
]);

export function isSafeTarget(target: string): boolean {
  const lower = target.toLowerCase().trim();

  if (BLOCKED_HOSTNAMES.has(lower)) return false;
  if (PRIVATE_IP_RE.test(lower)) return false;
  if (!VALID_HOSTNAME_RE.test(lower)) return false;

  return true;
}

export function assertSafeTarget(target: string): void {
  if (!isSafeTarget(target)) {
    throw new Error(
      `Target inválido: "${target}". Apenas domínios públicos são permitidos.`
    );
  }
}
