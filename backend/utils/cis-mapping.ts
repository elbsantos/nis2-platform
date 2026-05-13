/**
 * backend/utils/cis-mapping.ts
 *
 * CIS Controls v8 mapping for NIS2 findings.
 * Phase 1: enrich existing scan output with CIS Control labels.
 */

// ---------------------------------------------------------------------------
// CIS Controls v8 — 18 main controls (PT labels)
// ---------------------------------------------------------------------------

export const CIS_CONTROLS: Record<number, string> = {
  1:  "Inventário de Activos de Hardware",
  2:  "Inventário de Activos de Software",
  3:  "Protecção de Dados",
  4:  "Configuração Segura de Activos e Software",
  5:  "Gestão de Contas",
  6:  "Gestão de Controlo de Acessos",
  7:  "Gestão Contínua de Vulnerabilidades",
  8:  "Gestão de Registos de Auditoria",
  9:  "Protecções de Email e Browser",
  10: "Defesas contra Malware",
  11: "Recuperação de Dados",
  12: "Gestão de Infraestrutura de Rede",
  13: "Monitorização e Defesa de Rede",
  14: "Formação e Sensibilização em Segurança",
  15: "Gestão de Fornecedores de Serviços",
  16: "Segurança de Aplicações",
  17: "Gestão de Resposta a Incidentes",
  18: "Testes de Penetração",
};

// ---------------------------------------------------------------------------
// NIS2 Article → CIS Controls (primary mapping)
// ---------------------------------------------------------------------------

const NIS2_TO_CIS: Record<string, number[]> = {
  "Art. 21(2)(a)": [4, 17, 18],
  "Art. 21(2)(b)": [17],
  "Art. 21(2)(c)": [11],
  "Art. 21(2)(d)": [15],
  "Art. 21(2)(e)": [7, 16],
  "Art. 21(2)(f)": [18],
  "Art. 21(2)(g)": [1, 2, 4, 14],
  "Art. 21(2)(h)": [3, 12],
  "Art. 21(2)(i)": [5, 6],
  "Art. 21(2)(j)": [6, 9, 12],
};

// ---------------------------------------------------------------------------
// Specific finding prefix → CIS Controls (overrides article fallback)
// ---------------------------------------------------------------------------

const VULN_PREFIX_TO_CIS: Array<[string, number[]]> = [
  ["NIS2-EMAIL-SPF",               [9]],
  ["NIS2-EMAIL-DMARC",             [9]],
  ["NIS2-EMAIL-DKIM",              [9]],
  ["NIS2-EMAIL",                   [9]],
  ["NIS2-HEADER-HSTS",             [3, 12]],
  ["NIS2-HEADER-CSP",              [16]],
  ["NIS2-HEADER-XFRAME",           [16]],
  ["NIS2-HEADER-XCONTENTTYPE",     [16]],
  ["NIS2-HEADER-REFERRERPOLICY",   [3]],
  ["NIS2-HEADER",                  [16]],
  ["NIS2-TLS",                     [3, 12]],
  ["NIS2-BREACH",                  [5, 6]],
  ["NIS2-BLACKLIST",               [13]],
];

// CVE description keywords → CIS Controls
const CVE_KEYWORD_TO_CIS: Array<[RegExp, number[]]> = [
  [/ssl|tls|cipher|encrypt|heartbleed|poodle|rc4|des/i,           [3, 12]],
  [/rdp|ssh|smb|vnc|winrm|credential|privilege|bruteforce/i,      [5, 6, 12]],
  [/inject|xss|rce|execut|deserializ|xxe/i,                       [16]],
  [/telnet|ftp|default.pass|weak.auth|anonymous/i,                [4, 12]],
  [/supply.chain|dependency|third.party/i,                        [15]],
  [/mfa|otp|two.factor|starttls/i,                                [6, 9]],
];

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

export function getCisControls(
  cveId: string,
  nis2Articles: string[],
  description = ""
): string[] {
  // 1. Check specific prefix overrides
  for (const [prefix, controls] of VULN_PREFIX_TO_CIS) {
    if (cveId.startsWith(prefix)) {
      return controls.map((n) => `CIS ${n}`);
    }
  }

  // 2. CVE description keyword match
  const desc = description.toLowerCase();
  for (const [re, controls] of CVE_KEYWORD_TO_CIS) {
    if (re.test(desc)) {
      return [...new Set(controls)].sort((a, b) => a - b).map((n) => `CIS ${n}`);
    }
  }

  // 3. NIS2 article fallback
  const controlNums = new Set<number>();
  for (const article of nis2Articles) {
    for (const n of NIS2_TO_CIS[article] ?? []) {
      controlNums.add(n);
    }
  }
  return [...controlNums].sort((a, b) => a - b).map((n) => `CIS ${n}`);
}

// Convenience: fixed CIS list for known check names
export const CHECK_CIS: Record<string, string[]> = {
  "SPF":                    ["CIS 9"],
  "DMARC":                  ["CIS 9"],
  "DKIM":                   ["CIS 9"],
  "HSTS":                   ["CIS 3", "CIS 12"],
  "CSP":                    ["CIS 16"],
  "X-Frame-Options":        ["CIS 16"],
  "X-Content-Type-Options": ["CIS 16"],
  "Referrer-Policy":        ["CIS 3"],
};
