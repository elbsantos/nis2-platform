/**
 * backend/integrations/http-headers.ts
 *
 * HTTP security headers scan: HSTS, CSP, X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy
 * Mapped to NIS2 Art. 21(2)(e) and Art. 21(2)(h)
 */

import https from "https";
import http from "http";
import type { IncomingHttpHeaders } from "http";
import { CHECK_CIS } from "../utils/cis-mapping";
import { CHECK_ISO27001, CHECK_NIST } from "../utils/framework-mapping";

export interface HttpHeaderCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  nis2Article: string;
  cisControls?: string[];
  iso27001Controls?: string[];
  nistCsfControls?: string[];
}

export interface HttpHeadersResult {
  checks: HttpHeaderCheck[];
  score: number;
  url: string;
}

function fetchHeaders(url: string, redirectsLeft = 3): Promise<IncomingHttpHeaders> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 NIS2-Scanner/1.0 (+https://nis2.pt)" },
        rejectUnauthorized: false,
      },
      (res) => {
        const location = res.headers["location"];
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && location && redirectsLeft > 0) {
          res.destroy();
          const next = location.startsWith("http") ? location : new URL(location, url).href;
          fetchHeaders(next, redirectsLeft - 1).then(resolve).catch(reject);
          return;
        }
        res.destroy();
        resolve(res.headers);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const val = headers[name.toLowerCase()];
  return Array.isArray(val) ? val.join(", ") : val;
}

function checkHSTS(headers: IncomingHttpHeaders, isHttps: boolean): HttpHeaderCheck {
  if (!isHttps) {
    return {
      name: "HSTS",
      status: "fail",
      detail: "Site não serve HTTPS — configura TLS antes de activar HSTS.",
      nis2Article: "Art. 21(2)(h)",
    };
  }
  const val = headerValue(headers, "strict-transport-security");
  if (!val) {
    return {
      name: "HSTS",
      status: "fail",
      detail: "Strict-Transport-Security ausente — browsers podem aceder via HTTP.",
      nis2Article: "Art. 21(2)(h)",
    };
  }
  const maxAge = parseInt(val.match(/max-age=(\d+)/)?.[1] ?? "0");
  if (maxAge < 15_768_000) {
    return {
      name: "HSTS",
      status: "warn",
      detail: `HSTS max-age demasiado curto (${maxAge}s) — recomendado ≥ 6 meses (15768000s).`,
      nis2Article: "Art. 21(2)(h)",
    };
  }
  return {
    name: "HSTS",
    status: "pass",
    detail: `HSTS activo (max-age=${maxAge}s${val.includes("includeSubDomains") ? " + subdomínios" : ""}).`,
    nis2Article: "Art. 21(2)(h)",
  };
}

function checkCSP(headers: IncomingHttpHeaders): HttpHeaderCheck {
  const val = headerValue(headers, "content-security-policy");
  if (!val) {
    return {
      name: "CSP",
      status: "fail",
      detail: "Content-Security-Policy ausente — risco de XSS e injecção de conteúdo malicioso.",
      nis2Article: "Art. 21(2)(e)",
    };
  }
  if (val.includes("unsafe-inline") || val.includes("unsafe-eval") || /\bscript-src\b[^;]*\*/.test(val)) {
    return {
      name: "CSP",
      status: "warn",
      detail: "CSP presente mas com directivas permissivas (unsafe-inline/unsafe-eval/*) — XSS parcialmente mitigado.",
      nis2Article: "Art. 21(2)(e)",
    };
  }
  return {
    name: "CSP",
    status: "pass",
    detail: "Content-Security-Policy configurada com directivas restritivas.",
    nis2Article: "Art. 21(2)(e)",
  };
}

function checkXFrame(headers: IncomingHttpHeaders): HttpHeaderCheck {
  const val = headerValue(headers, "x-frame-options");
  if (!val) {
    return {
      name: "X-Frame-Options",
      status: "fail",
      detail: "X-Frame-Options ausente — site pode ser embutido em iframes para ataques de clickjacking.",
      nis2Article: "Art. 21(2)(e)",
    };
  }
  return {
    name: "X-Frame-Options",
    status: "pass",
    detail: `X-Frame-Options: ${val} — protecção contra clickjacking activa.`,
    nis2Article: "Art. 21(2)(e)",
  };
}

function checkXContentType(headers: IncomingHttpHeaders): HttpHeaderCheck {
  const val = headerValue(headers, "x-content-type-options");
  if (!val || val.toLowerCase() !== "nosniff") {
    return {
      name: "X-Content-Type-Options",
      status: "fail",
      detail: "X-Content-Type-Options: nosniff ausente — browsers podem interpretar ficheiros com tipo MIME errado.",
      nis2Article: "Art. 21(2)(e)",
    };
  }
  return {
    name: "X-Content-Type-Options",
    status: "pass",
    detail: "X-Content-Type-Options: nosniff activo.",
    nis2Article: "Art. 21(2)(e)",
  };
}

function checkReferrerPolicy(headers: IncomingHttpHeaders): HttpHeaderCheck {
  const val = headerValue(headers, "referrer-policy");
  if (!val) {
    return {
      name: "Referrer-Policy",
      status: "warn",
      detail: "Referrer-Policy ausente — URL completo pode ser partilhado com sites de terceiros.",
      nis2Article: "Art. 21(2)(h)",
    };
  }
  const safe = [
    "no-referrer",
    "no-referrer-when-downgrade",
    "strict-origin",
    "strict-origin-when-cross-origin",
    "same-origin",
  ];
  if (safe.some((p) => val.toLowerCase().includes(p))) {
    return {
      name: "Referrer-Policy",
      status: "pass",
      detail: `Referrer-Policy: ${val} — partilha de URL controlada.`,
      nis2Article: "Art. 21(2)(h)",
    };
  }
  return {
    name: "Referrer-Policy",
    status: "warn",
    detail: `Referrer-Policy permissivo (${val}) — considerar strict-origin-when-cross-origin.`,
    nis2Article: "Art. 21(2)(h)",
  };
}

// Site inacessível = warn (não fail) — ausência de resposta HTTP não confirma ausência dos headers;
// pode ser firewall, CDN ou down temporário. Não gera vulnerabilidades no pipeline.
const UNREACHABLE_CHECKS: HttpHeaderCheck[] = [
  { name: "HSTS",                  status: "warn", detail: "Site inacessível — não foi possível verificar headers de segurança HTTP.", nis2Article: "Art. 21(2)(h)", cisControls: CHECK_CIS["HSTS"] ?? [], iso27001Controls: CHECK_ISO27001["HSTS"] ?? ["ISO A.8.26"], nistCsfControls: CHECK_NIST["HSTS"] ?? ["NIST PR.PS-01"] },
  { name: "CSP",                   status: "warn", detail: "Site inacessível — não foi possível verificar headers de segurança HTTP.", nis2Article: "Art. 21(2)(e)", cisControls: CHECK_CIS["CSP"] ?? [], iso27001Controls: CHECK_ISO27001["CSP"] ?? ["ISO A.8.26"], nistCsfControls: CHECK_NIST["CSP"] ?? ["NIST PR.PS-01"] },
  { name: "X-Frame-Options",       status: "warn", detail: "Site inacessível — verificação de headers não concluída.", nis2Article: "Art. 21(2)(e)", cisControls: CHECK_CIS["X-Frame-Options"] ?? [], iso27001Controls: CHECK_ISO27001["X-Frame-Options"] ?? ["ISO A.8.26"], nistCsfControls: CHECK_NIST["X-Frame-Options"] ?? ["NIST PR.PS-01"] },
  { name: "X-Content-Type-Options",status: "warn", detail: "Site inacessível — verificação de headers não concluída.", nis2Article: "Art. 21(2)(e)", cisControls: CHECK_CIS["X-Content-Type-Options"] ?? [], iso27001Controls: CHECK_ISO27001["X-Content-Type-Options"] ?? ["ISO A.8.26"], nistCsfControls: CHECK_NIST["X-Content-Type-Options"] ?? ["NIST PR.PS-01"] },
  { name: "Referrer-Policy",       status: "warn", detail: "Site inacessível — verificação de headers não concluída.", nis2Article: "Art. 21(2)(h)", cisControls: CHECK_CIS["Referrer-Policy"] ?? [], iso27001Controls: CHECK_ISO27001["Referrer-Policy"] ?? ["ISO A.8.26"], nistCsfControls: CHECK_NIST["Referrer-Policy"] ?? ["NIST PR.PS-01"] },
];

export async function checkHttpHeaders(target: string): Promise<HttpHeadersResult> {
  const httpsUrl = `https://${target}`;
  const httpUrl  = `http://${target}`;

  let headers: IncomingHttpHeaders = {};
  let usedUrl = httpsUrl;
  let isHttps = true;

  try {
    headers = await fetchHeaders(httpsUrl);
  } catch {
    try {
      headers = await fetchHeaders(httpUrl);
      usedUrl = httpUrl;
      isHttps = false;
    } catch {
      return { checks: UNREACHABLE_CHECKS, score: 0, url: httpsUrl };
    }
  }

  const checks: HttpHeaderCheck[] = [
    checkHSTS(headers, isHttps),
    checkCSP(headers),
    checkXFrame(headers),
    checkXContentType(headers),
    checkReferrerPolicy(headers),
  ].map((c) => ({
    ...c,
    cisControls:      CHECK_CIS[c.name]      ?? ["CIS 16"],
    iso27001Controls: CHECK_ISO27001[c.name] ?? ["ISO A.8.26"],
    nistCsfControls:  CHECK_NIST[c.name]     ?? ["NIST PR.PS-01"],
  }));

  let deduction = 0;
  for (const check of checks) {
    if (check.status === "fail") deduction += 15;
    else if (check.status === "warn") deduction += 5;
  }

  return { checks, score: Math.max(0, 100 - deduction), url: usedUrl };
}
