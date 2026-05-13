/**
 * backend/utils/framework-mapping.ts
 *
 * ISO 27001:2022 Annex A and NIST CSF 2.0 mappings for NIS2 findings.
 * Complements cis-mapping.ts — same pattern, different frameworks.
 */

// ---------------------------------------------------------------------------
// ISO 27001:2022 Annex A — relevant controls (PT labels)
// ---------------------------------------------------------------------------

export const ISO27001_LABELS: Record<string, string> = {
  "5.14": "Transferência de informação",
  "5.16": "Gestão de identidades",
  "5.21": "Segurança na cadeia de fornecimento",
  "6.3":  "Sensibilização e formação",
  "8.5":  "Autenticação segura",
  "8.7":  "Protecção contra malware",
  "8.8":  "Gestão de vulnerabilidades técnicas",
  "8.9":  "Gestão de configuração",
  "8.12": "Prevenção de fuga de dados",
  "8.20": "Segurança de redes",
  "8.21": "Segurança de serviços de rede",
  "8.24": "Utilização de criptografia",
  "8.26": "Requisitos de segurança de aplicações",
  "8.28": "Programação segura",
};

// ---------------------------------------------------------------------------
// NIST CSF 2.0 — relevant categories (EN labels)
// ---------------------------------------------------------------------------

export const NIST_CSF_LABELS: Record<string, string> = {
  "ID.AM-01": "Asset inventory",
  "ID.AM-05": "Network resources catalogued",
  "ID.RA-01": "Vulnerability identification",
  "ID.RA-05": "Threats and vulnerabilities correlated",
  "PR.AA-05": "Access permissions managed",
  "PR.DS-02": "Data-in-transit protected",
  "PR.PS-01": "Security configuration enforced",
  "PR.PS-04": "Log records generated",
  "DE.CM-01": "Network monitored",
  "DE.CM-09": "Computing assets monitored",
  "RS.CO-03": "Information shared per response plan",
};

// ---------------------------------------------------------------------------
// NIS2 Article → ISO 27001 controls (fallback when no prefix match)
// ---------------------------------------------------------------------------

const NIS2_TO_ISO: Record<string, string[]> = {
  "Art. 21(2)(a)": ["8.8", "8.9"],
  "Art. 21(2)(b)": ["6.3"],
  "Art. 21(2)(c)": ["8.8"],
  "Art. 21(2)(d)": ["5.21"],
  "Art. 21(2)(e)": ["8.8", "8.26"],
  "Art. 21(2)(f)": ["8.9"],
  "Art. 21(2)(g)": ["6.3"],
  "Art. 21(2)(h)": ["8.24", "8.20"],
  "Art. 21(2)(i)": ["8.5", "5.16"],
  "Art. 21(2)(j)": ["8.21", "8.24"],
};

// NIS2 Article → NIST CSF categories
const NIS2_TO_NIST: Record<string, string[]> = {
  "Art. 21(2)(a)": ["ID.RA-01", "ID.RA-05"],
  "Art. 21(2)(b)": ["RS.CO-03"],
  "Art. 21(2)(c)": ["PR.DS-02"],
  "Art. 21(2)(d)": ["ID.AM-05"],
  "Art. 21(2)(e)": ["ID.RA-01", "PR.PS-01"],
  "Art. 21(2)(f)": ["PR.PS-01"],
  "Art. 21(2)(g)": ["ID.AM-01"],
  "Art. 21(2)(h)": ["PR.DS-02"],
  "Art. 21(2)(i)": ["PR.AA-05"],
  "Art. 21(2)(j)": ["PR.DS-02", "PR.PS-01"],
};

// ---------------------------------------------------------------------------
// Check name / CVE prefix → ISO 27001 controls (overrides article fallback)
// ---------------------------------------------------------------------------

const PREFIX_TO_ISO: Array<[string, string[]]> = [
  ["SPF",                    ["8.21", "8.24"]],
  ["DMARC",                  ["8.21", "8.24"]],
  ["DKIM",                   ["8.21", "8.24"]],
  ["NIS2-EMAIL",             ["8.21", "8.24"]],
  ["NIS2-HEADER-HSTS",       ["8.24", "8.20"]],
  ["NIS2-HEADER-CSP",        ["8.26", "8.28"]],
  ["NIS2-HEADER-XFRAME",     ["8.26"]],
  ["NIS2-HEADER-XCONTENTTYPE", ["8.26"]],
  ["NIS2-HEADER-REFERRER",   ["8.26", "8.12"]],
  ["NIS2-HEADER",            ["8.26"]],
  ["NIS2-TLS",               ["8.24", "8.20"]],
  ["NIS2-SSH",               ["8.8", "8.9"]],
  ["NIS2-BREACH",            ["8.12", "5.14"]],
  ["NIS2-BLACKLIST",         ["8.7", "8.20"]],
  ["HSTS",                   ["8.24", "8.20"]],
  ["CSP",                    ["8.26", "8.28"]],
  ["X-Frame-Options",        ["8.26"]],
  ["X-Content-Type-Options", ["8.26"]],
  ["Referrer-Policy",        ["8.26", "8.12"]],
];

// Check name / CVE prefix → NIST CSF categories
const PREFIX_TO_NIST: Array<[string, string[]]> = [
  ["SPF",                    ["PR.DS-02", "PR.PS-01"]],
  ["DMARC",                  ["PR.DS-02", "PR.PS-01"]],
  ["DKIM",                   ["PR.DS-02", "PR.PS-01"]],
  ["NIS2-EMAIL",             ["PR.DS-02", "PR.PS-01"]],
  ["NIS2-HEADER-HSTS",       ["PR.DS-02"]],
  ["NIS2-HEADER-CSP",        ["PR.PS-01"]],
  ["NIS2-HEADER-XFRAME",     ["PR.PS-01"]],
  ["NIS2-HEADER-XCONTENTTYPE", ["PR.PS-01"]],
  ["NIS2-HEADER-REFERRER",   ["PR.PS-01", "PR.DS-02"]],
  ["NIS2-HEADER",            ["PR.PS-01"]],
  ["NIS2-TLS",               ["PR.DS-02"]],
  ["NIS2-SSH",               ["PR.PS-01", "ID.RA-01"]],
  ["NIS2-BREACH",            ["DE.CM-09", "ID.RA-01"]],
  ["NIS2-BLACKLIST",         ["DE.CM-09", "DE.CM-01"]],
  ["HSTS",                   ["PR.DS-02"]],
  ["CSP",                    ["PR.PS-01"]],
  ["X-Frame-Options",        ["PR.PS-01"]],
  ["X-Content-Type-Options", ["PR.PS-01"]],
  ["Referrer-Policy",        ["PR.PS-01"]],
];

// ---------------------------------------------------------------------------
// CVE description keywords → ISO 27001 controls
// ---------------------------------------------------------------------------

const CVE_KEYWORD_TO_ISO: Array<[RegExp, string[]]> = [
  [/ssl|tls|cipher|encrypt|heartbleed|poodle|rc4|des/i, ["8.24", "8.20"]],
  [/rdp|ssh|smb|vnc|winrm|credential|privilege/i,       ["8.5", "5.16", "8.20"]],
  [/inject|xss|rce|execut|deserializ|xxe/i,             ["8.26", "8.28"]],
  [/telnet|ftp|default.pass|weak.auth|anonymous/i,      ["8.9", "8.20"]],
  [/supply.chain|dependency|third.party/i,              ["5.21"]],
  [/mfa|otp|two.factor|starttls/i,                      ["8.5", "5.16"]],
];

// CVE description keywords → NIST CSF categories
const CVE_KEYWORD_TO_NIST: Array<[RegExp, string[]]> = [
  [/ssl|tls|cipher|encrypt|heartbleed|poodle|rc4|des/i, ["PR.DS-02"]],
  [/rdp|ssh|smb|vnc|winrm|credential|privilege/i,       ["PR.AA-05", "ID.AM-01"]],
  [/inject|xss|rce|execut|deserializ|xxe/i,             ["PR.PS-01", "ID.RA-01"]],
  [/telnet|ftp|default.pass|weak.auth|anonymous/i,      ["PR.PS-01", "ID.AM-01"]],
  [/supply.chain|dependency|third.party/i,              ["ID.AM-05"]],
  [/mfa|otp|two.factor|starttls/i,                      ["PR.AA-05", "PR.DS-02"]],
];

// ---------------------------------------------------------------------------
// Quick lookup for named checks (used in email/header modules)
// ---------------------------------------------------------------------------

export const CHECK_ISO27001: Record<string, string[]> = {
  "SPF":                    ["ISO A.8.21", "ISO A.8.24"],
  "DMARC":                  ["ISO A.8.21", "ISO A.8.24"],
  "DKIM":                   ["ISO A.8.21", "ISO A.8.24"],
  "HSTS":                   ["ISO A.8.24", "ISO A.8.20"],
  "CSP":                    ["ISO A.8.26", "ISO A.8.28"],
  "X-Frame-Options":        ["ISO A.8.26"],
  "X-Content-Type-Options": ["ISO A.8.26"],
  "Referrer-Policy":        ["ISO A.8.26", "ISO A.8.12"],
};

export const CHECK_NIST: Record<string, string[]> = {
  "SPF":                    ["NIST PR.DS-02", "NIST PR.PS-01"],
  "DMARC":                  ["NIST PR.DS-02", "NIST PR.PS-01"],
  "DKIM":                   ["NIST PR.DS-02", "NIST PR.PS-01"],
  "HSTS":                   ["NIST PR.DS-02"],
  "CSP":                    ["NIST PR.PS-01"],
  "X-Frame-Options":        ["NIST PR.PS-01"],
  "X-Content-Type-Options": ["NIST PR.PS-01"],
  "Referrer-Policy":        ["NIST PR.PS-01", "NIST PR.DS-02"],
};

// ---------------------------------------------------------------------------
// Public functions — same signature pattern as getCisControls
// ---------------------------------------------------------------------------

export function getIso27001Controls(
  cveId: string,
  nis2Articles: string[],
  description = ""
): string[] {
  for (const [prefix, controls] of PREFIX_TO_ISO) {
    if (cveId.startsWith(prefix)) {
      return controls.map((n) => `ISO A.${n}`);
    }
  }

  const desc = description.toLowerCase();
  for (const [re, controls] of CVE_KEYWORD_TO_ISO) {
    if (re.test(desc)) {
      return [...new Set(controls)].map((n) => `ISO A.${n}`);
    }
  }

  const result = new Set<string>();
  for (const article of nis2Articles) {
    for (const n of NIS2_TO_ISO[article] ?? []) {
      result.add(`ISO A.${n}`);
    }
  }
  return [...result];
}

export function getNistCsfControls(
  cveId: string,
  nis2Articles: string[],
  description = ""
): string[] {
  for (const [prefix, cats] of PREFIX_TO_NIST) {
    if (cveId.startsWith(prefix)) {
      return cats.map((c) => `NIST ${c}`);
    }
  }

  const desc = description.toLowerCase();
  for (const [re, cats] of CVE_KEYWORD_TO_NIST) {
    if (re.test(desc)) {
      return [...new Set(cats)].map((c) => `NIST ${c}`);
    }
  }

  const result = new Set<string>();
  for (const article of nis2Articles) {
    for (const c of NIS2_TO_NIST[article] ?? []) {
      result.add(`NIST ${c}`);
    }
  }
  return [...result];
}
