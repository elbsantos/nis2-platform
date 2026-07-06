/**
 * backend/services/root-cause-aggregation.ts
 *
 * Aggregation by root cause for PDF reports.
 * PRINCIPLE: presentation layer only — never filters or alters underlying scan data.
 * Chave de agregação: affectedComponent + port (ex.: "apache:80").
 * Findings sintéticos NIS2-* nunca agregam.
 * Grupos com < MIN_GROUP_SIZE findings permanecem individuais.
 */

/** Minimal VulnFinding shape required by this module. Structurally compatible with PdfVuln. */
export interface RcaVuln {
  cveId:             string;
  severity:          string;  // "critical" | "high" | "medium" | "low"
  cvssScore:         string;
  description:       string;
  affectedComponent: string;
  port:              number | null;
  remediation:       string | null;
}

export interface RootCauseCounts {
  critical: number;
  high:     number;
  medium:   number;
  low:      number;
  total:    number;
}

export interface RootCauseGroup {
  key:          string;                                      // "apache:80"
  service:      string;                                      // "apache"
  version:      string | null;                               // "2.4.7"  (openPorts lookup)
  port:         number | null;                               // 80
  counts:       RootCauseCounts;
  topCvss:      number;                                      // para ordenação
  topSeverity:  "critical" | "high" | "medium" | "low";     // routing de secção
  cveIds:       string[];
  findings:     RcaVuln[];                                   // para lista técnica
  // Texto de negócio gerado por template determinístico (sem IA em runtime)
  title:        string;
  summary:      string;
  action:       string;
}

export interface AggregationResult {
  /** Grupos com >= MIN_GROUP_SIZE findings CVE reais, ordenados por topCvss desc. */
  groups:      RootCauseGroup[];
  /** Findings não agrupados: sintéticos NIS2-* + grupos abaixo do limiar. */
  individuals: RcaVuln[];
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Número mínimo de findings para que um grupo agregue (em vez de apresentar individualmente). */
export const MIN_GROUP_SIZE = 3;

// ---------------------------------------------------------------------------
// Template text helpers (determinístico, sem IA)
// ---------------------------------------------------------------------------

function fmtCounts(counts: RootCauseCounts): string {
  const parts: string[] = [];
  if (counts.critical > 0) parts.push(`${counts.critical} crítica${counts.critical !== 1 ? "s" : ""}`);
  if (counts.high > 0)     parts.push(`${counts.high} alta${counts.high !== 1 ? "s" : ""}`);
  if (counts.medium > 0)   parts.push(`${counts.medium} média${counts.medium !== 1 ? "s" : ""}`);
  if (counts.low > 0)      parts.push(`${counts.low} baixa${counts.low !== 1 ? "s" : ""}`);
  return parts.join(", ");
}

function buildTitle(service: string, version: string | null, port: number | null): string {
  const ver  = version ? ` ${version}` : "";
  const prt  = port !== null ? ` (porto ${port})` : "";
  return `Software ${service}${ver} desatualizado${prt}`;
}

function buildSummary(service: string, version: string | null, counts: RootCauseCounts): string {
  const ver = version ? ` ${version}` : "";
  return (
    `${counts.total} vulnerabilidade${counts.total !== 1 ? "s" : ""} identificada${counts.total !== 1 ? "s" : ""} ` +
    `no serviço ${service}${ver} (${fmtCounts(counts)}). ` +
    `Software sem atualizações acumula falhas conhecidas e publicamente documentadas ` +
    `que podem permitir, entre outros, execução remota de código, escalada de privilégios ` +
    `e desvio de autenticação.`
  );
}

function buildAction(service: string, version: string | null): string {
  const ver = version ? ` (versão atual: ${version})` : "";
  return `Atualizar ${service}${ver} para a versão corrente e aplicar todos os patches de segurança disponíveis.`;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function calcTopSeverity(counts: RootCauseCounts): "critical" | "high" | "medium" | "low" {
  if (counts.critical > 0) return "critical";
  if (counts.high > 0)     return "high";
  if (counts.medium > 0)   return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// aggregateByRootCause
// ---------------------------------------------------------------------------

export function aggregateByRootCause(
  findings: RcaVuln[],
  openPorts: Array<{ port: number; service?: string; version?: string }>
): AggregationResult {
  // Lookup: port → version string
  const versionByPort = new Map<number, string>();
  for (const p of openPorts) {
    if (p.version) versionByPort.set(p.port, p.version);
  }

  // Partition: sintéticos NIS2-* nunca entram em buckets de agregação
  const synthetics: RcaVuln[] = [];
  const cveFull:    RcaVuln[] = [];
  for (const f of findings) {
    if (f.cveId.startsWith("NIS2-")) synthetics.push(f);
    else cveFull.push(f);
  }

  // Agrupar CVEs por (affectedComponent, port)
  const buckets = new Map<string, RcaVuln[]>();
  for (const v of cveFull) {
    const key = `${v.affectedComponent}:${v.port ?? ""}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(v);
  }

  const groups:       RootCauseGroup[] = [];
  const ungroupedCve: RcaVuln[]        = [];

  for (const [key, members] of buckets) {
    if (members.length < MIN_GROUP_SIZE) {
      ungroupedCve.push(...members);
      continue;
    }

    const first   = members[0];
    const service = first.affectedComponent;
    const port    = first.port;
    const version = port !== null ? (versionByPort.get(port) ?? null) : null;

    const counts: RootCauseCounts = { critical: 0, high: 0, medium: 0, low: 0, total: members.length };
    let topCvss = 0;
    const cveIds: string[] = [];

    for (const m of members) {
      if (m.severity === "critical")     counts.critical++;
      else if (m.severity === "high")    counts.high++;
      else if (m.severity === "medium")  counts.medium++;
      else if (m.severity === "low")     counts.low++;
      const cvss = parseFloat(m.cvssScore);
      if (cvss > topCvss) topCvss = cvss;
      cveIds.push(m.cveId);
    }

    const ts = calcTopSeverity(counts);

    groups.push({
      key,
      service,
      version,
      port,
      counts,
      topCvss,
      topSeverity: ts,
      cveIds,
      findings: members,
      title:   buildTitle(service, version, port),
      summary: buildSummary(service, version, counts),
      action:  buildAction(service, version),
    });
  }

  // Ordenar grupos por topCvss desc
  groups.sort((a, b) => b.topCvss - a.topCvss);

  return {
    groups,
    individuals: [...synthetics, ...ungroupedCve],
  };
}

// ---------------------------------------------------------------------------
// Helper for medium-severity individual summary (PDF executive section)
// ---------------------------------------------------------------------------

/**
 * Builds a prose paragraph summarising medium-severity individual findings
 * (non-grouped). Replaces the old groupByTheme-based buildMediumSummary.
 */
export function buildMediumIndividualsSummary(medIndividuals: RcaVuln[]): string {
  const n = medIndividuals.length;
  if (n === 0) return "";
  const hasCves   = medIndividuals.some(v => !v.cveId.startsWith("NIS2-"));
  const hasConfig = medIndividuals.some(v => v.cveId.startsWith("NIS2-"));
  const effort = (hasCves && hasConfig)
    ? "baixo a médio — combinação de actualizações de software e ajustes de configuração"
    : hasCves
      ? "baixo — actualizações de software e aplicação de patches disponíveis"
      : "baixo — ajustes de configuração nos sistemas afectados";
  return (
    `${n} vulnerabilidade${n !== 1 ? "s" : ""} de severidade média detectada${n !== 1 ? "s" : ""}. ` +
    `O nível de risco é moderado — não representam exposição imediata, mas aumentam a superfície de ataque ` +
    `caso não sejam corrigidas. ` +
    `Esforço de correcção estimado: ${effort}. ` +
    `Resolução recomendada no prazo de 30 dias.`
  );
}
