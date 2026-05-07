/**
 * backend/integrations/dark-web.ts
 *
 * Dark web monitoring and reputation checks:
 *  1. Have I Been Pwned (HIBP) — domain credential breach check (requires HIBP_API_KEY)
 *  2. DNS Blacklists — Spamhaus ZEN (IPs) / Spamhaus DBL (domains) / SpamCop (IPs)
 *
 * NIS2 mapping:
 *  - Credential breaches  → Art. 21(2)(i) acesso e autenticação
 *  - Password exposure    → Art. 21(2)(j) MFA e comunicações seguras
 *  - Blacklisted IP/domain → Art. 21(2)(g) ciberhigiene
 */

import https from "https";
import { resolve4 } from "dns/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreachRecord {
  name: string;
  dataClasses: string[];
  hasPasswords: boolean;
}

export interface BlacklistCheck {
  name: string;
  listed: boolean;
  detail: string;
}

export interface DarkWebResult {
  breachesFound: number;
  breaches: BreachRecord[];
  hasPasswordExposure: boolean;
  blacklists: BlacklistCheck[];
  score: number;
  hibpEnabled: boolean;
}

// ---------------------------------------------------------------------------
// HIBP — Have I Been Pwned domain breach check
// ---------------------------------------------------------------------------

function fetchHIBP(
  domain: string,
  apiKey: string
): Promise<Record<string, string[]> | null> {
  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: "haveibeenpwned.com",
        path: `/api/v3/breacheddomain/${encodeURIComponent(domain)}`,
        headers: {
          "hibp-api-key": apiKey,
          "User-Agent": "NIS2-Platform-PT/1.0",
        },
        timeout: 10_000,
      },
      (res) => {
        if (res.statusCode === 404) {
          res.resume();
          resolve({});    // no breaches — good
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);  // API/key error — treat as unavailable
          return;
        }
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk; });
        res.on("end", () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }
    );
    req.on("error",   () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

// ---------------------------------------------------------------------------
// DNS Blacklist — A-record lookup (NXDOMAIN = clean)
// ---------------------------------------------------------------------------

async function isDnsblListed(query: string, list: string): Promise<boolean> {
  try {
    await resolve4(`${query}.${list}`);
    return true;   // resolves = listed
  } catch {
    return false;  // NXDOMAIN = clean
  }
}

function reverseIp(ip: string): string {
  return ip.split(".").reverse().join(".");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function checkDarkWeb(
  target: string,
  isIp: boolean
): Promise<DarkWebResult> {
  const apiKey    = process.env.HIBP_API_KEY;
  const hibpEnabled = !!apiKey && !isIp;

  // ── 1. HIBP domain breach check (domains only) ────────────────────────────
  const breaches: BreachRecord[] = [];

  if (hibpEnabled && apiKey) {
    const data = await fetchHIBP(target, apiKey);
    if (data) {
      for (const [name, dataClasses] of Object.entries(data)) {
        breaches.push({
          name,
          dataClasses,
          hasPasswords: dataClasses.some((c) =>
            /password|credential/i.test(c)
          ),
        });
      }
      // Sort worst-first (password breaches first)
      breaches.sort((a, b) => Number(b.hasPasswords) - Number(a.hasPasswords));
    }
  }

  // ── 2. DNS Blacklists ─────────────────────────────────────────────────────
  const blacklists: BlacklistCheck[] = [];

  if (isIp) {
    const rev = reverseIp(target);
    const [zen, spamcop] = await Promise.all([
      isDnsblListed(rev, "zen.spamhaus.org"),
      isDnsblListed(rev, "bl.spamcop.net"),
    ]);
    blacklists.push({
      name: "Spamhaus ZEN",
      listed: zen,
      detail: zen
        ? `IP ${target} presente na Spamhaus ZEN — associado a spam, malware ou botnets.`
        : `IP ${target} não está na lista negra Spamhaus ZEN.`,
    });
    blacklists.push({
      name: "SpamCop BL",
      listed: spamcop,
      detail: spamcop
        ? `IP ${target} presente na SpamCop — reportado como fonte de spam.`
        : `IP ${target} não está na lista negra SpamCop.`,
    });
  } else {
    const [dbl] = await Promise.all([
      isDnsblListed(target, "dbl.spamhaus.org"),
    ]);
    blacklists.push({
      name: "Spamhaus DBL",
      listed: dbl,
      detail: dbl
        ? `Domínio ${target} presente na Spamhaus Domain Block List — potencialmente comprometido ou usado para phishing/spam.`
        : `Domínio ${target} não está na Spamhaus Domain Block List.`,
    });
  }

  // ── 3. Score ──────────────────────────────────────────────────────────────
  const hasPasswordExposure = breaches.some((b) => b.hasPasswords);
  let deduction = 0;
  for (const b of breaches)    deduction += b.hasPasswords ? 20 : 8;
  for (const bl of blacklists) if (bl.listed) deduction += 20;

  return {
    breachesFound: breaches.length,
    breaches,
    hasPasswordExposure,
    blacklists,
    score: Math.max(0, 100 - deduction),
    hibpEnabled,
  };
}
