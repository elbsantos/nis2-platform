/**
 * backend/integrations/ssh-check.ts
 *
 * Lê o banner SSH do porto 22, extrai a versão OpenSSH e sinaliza CVEs
 * conhecidos com base em limiares de versão.
 * Não requer API key — usa TCP directo.
 */

import net from "net";
import { getCisControls } from "../utils/cis-mapping";
import { getIso27001Controls, getNistCsfControls } from "../utils/framework-mapping";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SshVuln {
  cveId: string;
  cvssScore: number;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  nis2Articles: string[];
  cisControls: string[];
  iso27001Controls: string[];
  nistCsfControls: string[];
  remediationHint: string;
}

export interface SshCheckResult {
  port: number;
  banner: string;
  software: string;       // ex: "OpenSSH_6.6.1p1 Ubuntu-2ubuntu2.13"
  version: string | null; // ex: "6.6.1"
  vulns: SshVuln[];
}

// ---------------------------------------------------------------------------
// Banner grab via TCP
// ---------------------------------------------------------------------------

function grabSshBanner(host: string, port: number, timeoutMs = 5_000): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = "";

    socket.setTimeout(timeoutMs);
    socket.connect(port, host);

    socket.on("data", (chunk) => {
      banner += chunk.toString("utf8");
      if (banner.includes("\n")) {
        socket.destroy();
        resolve(banner.trim());
      }
    });
    socket.on("error", () => { socket.destroy(); resolve(null); });
    socket.on("timeout", () => { socket.destroy(); resolve(banner.trim() || null); });
  });
}

// ---------------------------------------------------------------------------
// Version parsing
// ---------------------------------------------------------------------------

function parseOpenSshVersion(banner: string): string | null {
  // "SSH-2.0-OpenSSH_6.6.1p1 Ubuntu-2ubuntu2.13" → "6.6.1"
  const m = banner.match(/OpenSSH[_\s](\d+\.\d+(?:\.\d+)?)/i);
  return m ? m[1] : null;
}

function versionLessThan(version: string, threshold: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const m = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) return [0, 0, 0];
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3] ?? "0")];
  };
  const [ma, mi, pa] = parse(version);
  const [ta, ti, tp] = parse(threshold);
  if (ma !== ta) return ma < ta;
  if (mi !== ti) return mi < ti;
  return pa < tp;
}

// ---------------------------------------------------------------------------
// CVE rules — ordem: mais recente primeiro
// ---------------------------------------------------------------------------

interface VulnRule {
  cveId: string;
  maxVersion: string;   // afecta OpenSSH < maxVersion
  minVersion?: string;  // só se versão >= minVersion (para regressões)
  cvssScore: number;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  nis2Articles: string[];
  remediationHint: string;
}

const OPENSSH_RULES: VulnRule[] = [
  {
    cveId: "CVE-2024-6387",
    maxVersion: "9.8",
    minVersion: "8.5",
    cvssScore: 8.1,
    severity: "critical",
    description:
      'OpenSSH "regreSSHion" (CVE-2024-6387) — race condition no signal handler permite execução remota de código não autenticado em servidores Linux com glibc. Afecta OpenSSH 8.5p1–9.7p1.',
    nis2Articles: ["Art. 21(2)(h)", "Art. 21(2)(i)"],
    remediationHint: "Actualiza OpenSSH para versão 9.8p1 ou superior.",
  },
  {
    cveId: "CVE-2023-51385",
    maxVersion: "9.6",
    cvssScore: 9.8,
    severity: "critical",
    description:
      "OpenSSH < 9.6 — injecção de comandos OS via hostname controlado pelo utilizador em configurações ProxyCommand/ssh_config com expansão de tokens.",
    nis2Articles: ["Art. 21(2)(e)", "Art. 21(2)(i)"],
    remediationHint: "Actualiza OpenSSH para 9.6p1 ou superior.",
  },
  {
    cveId: "CVE-2021-41617",
    maxVersion: "8.8",
    cvssScore: 7.0,
    severity: "high",
    description:
      "OpenSSH < 8.8 — escalonamento de privilégios em sessões multiplexadas. Processos auxiliares herdam grupos incorrectos quando AuthorizedKeysCommand ou AuthorizedPrincipalsCommand estão activos.",
    nis2Articles: ["Art. 21(2)(i)"],
    remediationHint: "Actualiza OpenSSH para 8.8p1 ou superior.",
  },
  {
    cveId: "CVE-2018-15473",
    maxVersion: "7.7",
    cvssScore: 5.3,
    severity: "medium",
    description:
      "OpenSSH < 7.7 — enumeração de utilizadores válidos via diferenças de tempo de resposta na autenticação por chave pública. Facilita ataques de força bruta direccionados.",
    nis2Articles: ["Art. 21(2)(i)"],
    remediationHint: "Actualiza OpenSSH para 7.7p1 ou superior.",
  },
  {
    cveId: "CVE-2016-0777",
    maxVersion: "7.1",
    cvssScore: 8.1,
    severity: "high",
    description:
      "OpenSSH < 7.1p2 — a funcionalidade UseRoaming vaza conteúdo de memória do processo para servidores maliciosos, podendo expor chaves privadas SSH e outros dados sensíveis.",
    nis2Articles: ["Art. 21(2)(h)", "Art. 21(2)(i)"],
    remediationHint: "Actualiza OpenSSH para 7.1p2 ou superior. Adiciona 'UseRoaming no' em /etc/ssh/ssh_config como medida imediata.",
  },
];

// ---------------------------------------------------------------------------
// Alerta genérico para versões muito antigas (< 8.0)
// ---------------------------------------------------------------------------

function buildOutdatedFinding(version: string): SshVuln | null {
  if (!versionLessThan(version, "8.0")) return null;
  const nis2Articles = ["Art. 21(2)(h)", "Art. 21(2)(i)"];
  const cveId = "NIS2-SSH-OUTDATED";
  return {
    cveId,
    cvssScore: 7.5,
    severity: "high",
    description: `OpenSSH ${version} é uma versão desactualizada (anterior a 2019). Não recebe correcções de segurança activas e acumula vulnerabilidades conhecidas.`,
    nis2Articles,
    cisControls:      getCisControls(cveId, nis2Articles),
    iso27001Controls: getIso27001Controls(cveId, nis2Articles),
    nistCsfControls:  getNistCsfControls(cveId, nis2Articles),
    remediationHint:
      "Actualiza o servidor SSH para a versão actual (9.x). Em Debian/Ubuntu: sudo apt update && sudo apt upgrade openssh-server",
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function checkSsh(host: string, port = 22): Promise<SshCheckResult | null> {
  try {
    const banner = await grabSshBanner(host, port);
    if (!banner || !banner.startsWith("SSH-")) return null;

    // "SSH-2.0-OpenSSH_6.6.1p1 Ubuntu-2ubuntu2.13" → "OpenSSH_6.6.1p1 Ubuntu-2ubuntu2.13"
    // Remove "SSH-<proto>-" (ex: "SSH-2.0-") do início do banner
    const software = banner.replace(/^SSH-\d+\.\d+-/, "").trim();
    const version  = parseOpenSshVersion(banner);

    const vulns: SshVuln[] = [];

    if (version) {
      for (const rule of OPENSSH_RULES) {
        const belowMax = versionLessThan(version, rule.maxVersion);
        const aboveMin = !rule.minVersion || !versionLessThan(version, rule.minVersion);
        if (belowMax && aboveMin) {
          vulns.push({
            cveId:            rule.cveId,
            cvssScore:        rule.cvssScore,
            severity:         rule.severity,
            description:      rule.description,
            nis2Articles:     rule.nis2Articles,
            cisControls:      getCisControls(rule.cveId, rule.nis2Articles),
            iso27001Controls: getIso27001Controls(rule.cveId, rule.nis2Articles),
            nistCsfControls:  getNistCsfControls(rule.cveId, rule.nis2Articles),
            remediationHint:  rule.remediationHint,
          });
        }
      }

      const outdated = buildOutdatedFinding(version);
      if (outdated) vulns.push(outdated);
    }

    console.log(`[SSH] ${host}:${port} — ${software} — ${vulns.length} vulnerabilidades`);
    return { port, banner, software, version, vulns };
  } catch (err) {
    console.error("[SSH] Check failed:", err);
    return null;
  }
}
