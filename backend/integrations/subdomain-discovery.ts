/**
 * backend/integrations/subdomain-discovery.ts
 *
 * Passive subdomain discovery via:
 *  1. Certificate Transparency logs (crt.sh) — free, no auth
 *  2. DNS brute-force with a common subdomain wordlist
 * Each candidate is resolved to verify it's alive.
 */

import https from "https";
import { resolve4 } from "dns/promises";

export interface DiscoveredSubdomain {
  name: string;
  ip?: string;
}

// ---------------------------------------------------------------------------
// Wordlist — common subdomain prefixes
// ---------------------------------------------------------------------------

const WORDLIST = [
  "www", "mail", "smtp", "pop", "imap",
  "api", "app", "apps", "v1", "v2",
  "admin", "portal", "dashboard", "backoffice",
  "dev", "staging", "test", "beta", "demo", "pre",
  "cdn", "static", "assets", "media", "img", "files", "s3",
  "vpn", "remote", "gateway", "ns1", "ns2",
  "webmail", "autodiscover", "autoconfig",
  "ftp", "sftp", "ssh",
  "shop", "store", "m", "mobile",
  "support", "help", "docs", "wiki", "blog", "news",
  "secure", "login", "sso", "auth", "oauth",
  "intranet", "internal", "corp",
  "monitor", "status", "health",
  "api2", "api3", "backend",
];

// ---------------------------------------------------------------------------
// crt.sh — Certificate Transparency log query
// ---------------------------------------------------------------------------

interface CrtShEntry {
  name_value: string;
  common_name: string;
}

function fetchCrtSh(domain: string): Promise<string[]> {
  return new Promise((resolve) => {
    const path = `/?q=%.${encodeURIComponent(domain)}&output=json`;
    const req = https.get(
      { hostname: "crt.sh", path, timeout: 12000 },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk; });
        res.on("end", () => {
          try {
            const entries: CrtShEntry[] = JSON.parse(body);
            const names = new Set<string>();
            for (const entry of entries) {
              for (const raw of [entry.name_value ?? "", entry.common_name ?? ""]) {
                for (const name of raw.split("\n")) {
                  const clean = name.trim().toLowerCase().replace(/^\*\./, "");
                  if (
                    clean.endsWith(`.${domain}`) &&
                    !clean.includes("*") &&
                    clean !== domain
                  ) {
                    names.add(clean);
                  }
                }
              }
            }
            resolve([...names]);
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
  });
}

// ---------------------------------------------------------------------------
// DNS resolution — verify a hostname is alive
// ---------------------------------------------------------------------------

async function resolveAlive(hostname: string): Promise<string | null> {
  try {
    const addrs = await resolve4(hostname);
    return addrs[0] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function discoverSubdomains(
  domain: string,
  maxResults = 50
): Promise<DiscoveredSubdomain[]> {
  // 1. Certificate Transparency (passive — no noise on target)
  const ctNames = await fetchCrtSh(domain);

  // 2. Wordlist candidates
  const wordlistNames = WORDLIST.map((w) => `${w}.${domain}`);

  // 3. Deduplicate — CT first (more likely accurate), wordlist second
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const n of [...ctNames, ...wordlistNames]) {
    if (!seen.has(n)) { seen.add(n); candidates.push(n); }
  }

  // 4. Resolve in batches of 15 (avoid DNS flooding)
  const BATCH = 15;
  const alive: DiscoveredSubdomain[] = [];

  for (let i = 0; i < candidates.length && alive.length < maxResults; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const resolved = await Promise.all(
      batch.map(async (name) => {
        const ip = await resolveAlive(name);
        return ip ? { name, ip } : null;
      })
    );
    for (const r of resolved) {
      if (r && alive.length < maxResults) alive.push(r);
    }
  }

  return alive;
}
