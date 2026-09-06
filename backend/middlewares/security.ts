/**
 * server/middlewares/security.ts
 *
 * HTTP security headers and SSRF protection utilities.
 */

import type { Request, Response, NextFunction } from "express";
import dns from "dns";
import net from "net";

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

// Public IPv4 — each octet 0–255
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// Blocked hostnames regardless of IP
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254", // AWS IMDS
]);

export function isValidPublicIpv4(target: string): boolean {
  const m = IPV4_RE.exec(target);
  if (!m) return false;
  if ([m[1], m[2], m[3], m[4]].some((o) => parseInt(o) > 255)) return false;
  return !PRIVATE_IP_RE.test(target);
}

export function isSafeTarget(target: string): boolean {
  const lower = target.toLowerCase().trim();

  if (isPrivateOrBlockedIp(lower)) return false;

  // Accept valid public IPv4 (e.g. 185.1.2.3) — verified via HTTP .well-known
  if (IPV4_RE.test(lower)) return isValidPublicIpv4(lower);

  // Accept standard public domain
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

// ---------------------------------------------------------------------------
// SSRF connection-time guards — aplicar a TODOS os pontos de conexão (A2)
// ---------------------------------------------------------------------------

/**
 * Canonicaliza um literal IPv6 para a forma comprimida (RFC 5952), reutilizando
 * o parser de URL do próprio Node (WHATWG URL Standard) em vez de reimplementar
 * expansão/compressão de IPv6 à mão. Cobre variações de escrita do mesmo
 * endereço — ex. "0:0:0:0:0:0:0:1" e "::1" ficam ambos "::1".
 * Devolve null se `address` não for um IPv6 válido (não deve acontecer, o
 * chamador já filtra com net.isIPv6, mas falha de forma segura).
 */
function canonicalizeIpv6(address: string): string | null {
  try {
    // new URL exige parênteses para hosts IPv6; .hostname devolve em
    // minúsculas e já na forma comprimida canónica, mas MANTÉM os parênteses
    // (confirmado empiricamente nesta versão do Node) — removê-los aqui.
    return new URL(`http://[${address}]`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

/**
 * Se `address` for um IPv4 mapeado em IPv6 (RFC 4291 — ex. "::ffff:169.254.169.254"
 * ou a sua forma canónica em hex "::ffff:a9fe:a9fe"), devolve o IPv4 embutido em
 * notação decimal. Caso contrário, null. Aceita as duas formas para não depender
 * só da canonicalização ter tido sucesso.
 */
function extractMappedIpv4(address: string): string | null {
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(".");
  }
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address);
  return dotted ? dotted[1] : null;
}

/**
 * Verifica se um IP resolvido é privado ou bloqueado — reutiliza os ranges
 * existentes (PRIVATE_IP_RE). Fonte única partilhada por isSafeTarget,
 * safeLookup e assertSafeRedirect.
 *
 * IPv6: normaliza para a forma canónica primeiro (cobre variações de escrita
 * do mesmo endereço, ex. loopback expandido), depois desembrulha um eventual
 * IPv4 mapeado (::ffff:x.x.x.x) e revalida-o com a MESMA regra IPv4
 * (PRIVATE_IP_RE) que já protege 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 * 127.0.0.0/8 e 169.254.0.0/16 — cobre a classe inteira de endereços
 * IPv4-mapeados privados, não só exemplos avulsos.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  const lower = ip.toLowerCase().trim();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;

  if (net.isIPv6(lower)) {
    const canonical = canonicalizeIpv6(lower) ?? lower;
    const mappedIpv4 = extractMappedIpv4(canonical) ?? extractMappedIpv4(lower);
    if (mappedIpv4) return PRIVATE_IP_RE.test(mappedIpv4);
    return PRIVATE_IP_RE.test(canonical);
  }

  return PRIVATE_IP_RE.test(lower);
}

/**
 * lookup function para http/https/net/tls: resolve o hostname, valida TODOS
 * os IPs devolvidos antes de conectar. Fecha a janela de DNS rebinding.
 *
 * Assinatura compatível com a opção `lookup` do Node.js (http.RequestOptions,
 * net.TcpNetConnectOpts, tls.ConnectionOptions).
 */
export function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
): void {
  // Caminho rápido: hostname conhecido como bloqueado ou IP literal privado
  const lower = hostname.toLowerCase();
  if (isPrivateOrBlockedIp(lower)) {
    callback(
      Object.assign(new Error(`SSRF bloqueado: ${hostname}`), { code: "SSRF_BLOCKED" }) as NodeJS.ErrnoException,
      "", 0
    );
    return;
  }

  // Resolver todos os IPs e validar cada um
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);

    for (const { address } of addresses) {
      if (isPrivateOrBlockedIp(address)) {
        callback(
          Object.assign(
            new Error(`SSRF bloqueado: ${hostname} → ${address} (IP privado/bloqueado)`),
            { code: "SSRF_BLOCKED" }
          ) as NodeJS.ErrnoException,
          "", 0
        );
        return;
      }
    }

    // Escolher um IP respeitando a preferência de family.
    // family=4 ou 6: filtrar estritamente por essa família.
    // family=0 ou undefined: sem preferência — preferir IPv4 para evitar falhas
    // em ambientes com routing IPv6 incompleto (Railway em produção).
    // Nota: family=0 é falsy em JS, pelo que `options.family ? ...` era incorrecto.
    const preferred = (options.family === 4 || options.family === 6)
      ? (addresses.find((a) => a.family === options.family) ?? addresses[0])
      : (addresses.find((a) => a.family === 4) ?? addresses[0]);

    if (!preferred) {
      callback(
        Object.assign(new Error(`SSRF bloqueado: sem endereço para ${hostname}`), { code: "SSRF_BLOCKED" }) as NodeJS.ErrnoException,
        "", 0
      );
      return;
    }

    // Node.js >=22 com autoSelectFamily (Happy Eyeballs) chama o lookup com
    // options.all=true e espera callback(null, LookupAddress[]). Devolver uma
    // string faz o Node iterar os caracteres dela → char.address = undefined →
    // ERR_INVALID_IP_ADDRESS. Quando all=true: devolver [preferred] (Opção B —
    // array com o IPv4 escolhido, evitando tentativa IPv6 desnecessária no Railway).
    // Quando all=false/undefined: manter contrato single-address para compatibilidade.
    if (options.all) {
      callback(null, [preferred], preferred.family);
    } else {
      callback(null, preferred.address, preferred.family);
    }
  });
}

/**
 * Valida o destino de um redirect antes de o seguir.
 * Rejeita hostnames/IPs privados (inclui resolução DNS).
 */
export async function assertSafeRedirect(url: string): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`SSRF bloqueado: URL de redirect inválido: ${url}`);
  }

  // IP literal ou hostname bloqueado — sem DNS
  if (isPrivateOrBlockedIp(hostname)) {
    throw new Error(`SSRF bloqueado: redirect para ${hostname} não permitido`);
  }

  // Hostname — resolver e validar todos os IPs
  const addresses = await dns.promises.lookup(hostname, { all: true } as dns.LookupAllOptions) as dns.LookupAddress[];
  for (const { address } of addresses) {
    if (isPrivateOrBlockedIp(address)) {
      throw new Error(`SSRF bloqueado: ${hostname} resolve para IP privado (${address})`);
    }
  }
}
