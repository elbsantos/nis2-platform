/**
 * backend/integrations/email-security.ts
 *
 * DNS-based email security checks: SPF, DMARC, DKIM
 * Mapped to NIS2 Art. 21(2)(j) — autenticação e comunicações seguras
 */

import { resolveTxt } from "dns/promises";

export interface EmailSecurityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  nis2Article: string;
}

export interface EmailSecurityResult {
  checks: EmailSecurityCheck[];
  score: number;
}

async function checkSPF(domain: string): Promise<EmailSecurityCheck> {
  try {
    const records = await resolveTxt(domain);
    const spf = records.flat().find((r) => r.startsWith("v=spf1"));
    if (!spf) {
      return {
        name: "SPF",
        status: "fail",
        detail: "Sem registo SPF — qualquer servidor pode enviar email em nome do domínio.",
        nis2Article: "Art. 21(2)(j)",
      };
    }
    if (spf.includes("+all") || spf.includes("?all")) {
      const mode = spf.includes("+all") ? "+all" : "?all";
      return {
        name: "SPF",
        status: "warn",
        detail: `SPF permissivo (${mode}) — permite spoofing de email.`,
        nis2Article: "Art. 21(2)(j)",
      };
    }
    return {
      name: "SPF",
      status: "pass",
      detail: `SPF configurado correctamente (${spf.substring(0, 70).trimEnd()}…).`,
      nis2Article: "Art. 21(2)(j)",
    };
  } catch {
    return {
      name: "SPF",
      status: "fail",
      detail: "Erro ao resolver DNS TXT — sem registo SPF ou domínio não responde.",
      nis2Article: "Art. 21(2)(j)",
    };
  }
}

async function checkDMARC(domain: string): Promise<EmailSecurityCheck> {
  try {
    const records = await resolveTxt(`_dmarc.${domain}`);
    const dmarc = records.flat().find((r) => r.startsWith("v=DMARC1"));
    if (!dmarc) {
      return {
        name: "DMARC",
        status: "fail",
        detail: "Sem registo DMARC — phishing em nome do domínio não é bloqueado.",
        nis2Article: "Art. 21(2)(j)",
      };
    }
    if (dmarc.includes("p=none")) {
      return {
        name: "DMARC",
        status: "warn",
        detail: "DMARC em modo monitor (p=none) — emails maliciosos são reportados mas não bloqueados.",
        nis2Article: "Art. 21(2)(j)",
      };
    }
    const policy = dmarc.includes("p=quarantine") ? "quarantine" : "reject";
    return {
      name: "DMARC",
      status: "pass",
      detail: `DMARC configurado com política ${policy} — phishing bloqueado.`,
      nis2Article: "Art. 21(2)(j)",
    };
  } catch {
    return {
      name: "DMARC",
      status: "fail",
      detail: `Sem registo DMARC (_dmarc.${domain}) — protecção anti-phishing inexistente.`,
      nis2Article: "Art. 21(2)(j)",
    };
  }
}

const DKIM_SELECTORS = [
  "default", "google", "mail", "dkim", "k1",
  "selector1", "selector2", "smtp", "mandrill", "mailgun",
];

async function checkDKIM(domain: string): Promise<EmailSecurityCheck> {
  for (const selector of DKIM_SELECTORS) {
    try {
      const records = await resolveTxt(`${selector}._domainkey.${domain}`);
      const found = records.flat().some((r) => r.includes("v=DKIM1") || r.includes("p="));
      if (found) {
        return {
          name: "DKIM",
          status: "pass",
          detail: `DKIM encontrado (selector: ${selector}) — assinaturas digitais de email activas.`,
          nis2Article: "Art. 21(2)(j)",
        };
      }
    } catch {
      // selector not found — continue
    }
  }
  return {
    name: "DKIM",
    status: "warn",
    detail: `DKIM não detectado nos selectores comuns (${DKIM_SELECTORS.slice(0, 5).join(", ")}, …). Pode estar configurado com selector personalizado.`,
    nis2Article: "Art. 21(2)(j)",
  };
}

export async function checkEmailSecurity(domain: string): Promise<EmailSecurityResult> {
  const [spf, dmarc, dkim] = await Promise.all([
    checkSPF(domain),
    checkDMARC(domain),
    checkDKIM(domain),
  ]);

  const checks = [spf, dmarc, dkim];

  let deduction = 0;
  for (const check of checks) {
    if (check.status === "fail") deduction += 30;
    else if (check.status === "warn") deduction += 10;
  }

  return { checks, score: Math.max(0, 100 - deduction) };
}
