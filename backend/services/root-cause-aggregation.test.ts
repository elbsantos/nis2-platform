/**
 * backend/services/root-cause-aggregation.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  aggregateByRootCause,
  buildMediumIndividualsSummary,
  MIN_GROUP_SIZE,
  type RcaVuln,
} from "./root-cause-aggregation";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeCve(
  partial: Partial<RcaVuln> & { cveId: string }
): RcaVuln {
  return {
    severity:          "high",
    cvssScore:         "7.5",
    description:       `Description of ${partial.cveId}`,
    affectedComponent: "apache",
    port:              80,
    remediation:       null,
    ...partial,
  };
}

function makeApacheCves(n: number, severity = "high"): RcaVuln[] {
  return Array.from({ length: n }, (_, i) =>
    makeCve({ cveId: `CVE-2014-${1000 + i}`, severity, affectedComponent: "apache", port: 80 })
  );
}

const OPEN_PORTS_SCANME = [
  { port: 22,  service: "ssh",    version: "6.6.1p1" },
  { port: 80,  service: "apache", version: "2.4.7"   },
  { port: 123, service: "ntp",    version: undefined  },
];

// ---------------------------------------------------------------------------
// (a) 106 findings apache:80 → 1 grupo com contagens certas
// ---------------------------------------------------------------------------

describe("aggregateByRootCause — (a) grupo grande apache:80", () => {
  it("106 CVEs apache porto 80 formam 1 grupo com contagens correctas", () => {
    const criticals = makeApacheCves(24, "critical");
    const highs     = makeApacheCves(47, "high").map((v, i) => ({ ...v, cveId: `CVE-2015-${i}` }));
    const mediums   = makeApacheCves(34, "medium").map((v, i) => ({ ...v, cveId: `CVE-2016-${i}` }));
    const lows      = makeApacheCves(1, "low").map((v, i)     => ({ ...v, cveId: `CVE-2017-${i}` }));
    const allApache = [...criticals, ...highs, ...mediums, ...lows];
    expect(allApache.length).toBe(106);

    const { groups, individuals } = aggregateByRootCause(allApache, OPEN_PORTS_SCANME);

    expect(groups.length).toBe(1);
    const g = groups[0];
    expect(g.key).toBe("apache:80");
    expect(g.service).toBe("apache");
    expect(g.version).toBe("2.4.7");
    expect(g.port).toBe(80);
    expect(g.counts.critical).toBe(24);
    expect(g.counts.high).toBe(47);
    expect(g.counts.medium).toBe(34);
    expect(g.counts.low).toBe(1);
    expect(g.counts.total).toBe(106);
    expect(g.topSeverity).toBe("critical");
    expect(g.cveIds.length).toBe(106);
    expect(individuals.length).toBe(0);
  });

  it("título e action incluem service e version", () => {
    const { groups } = aggregateByRootCause(makeApacheCves(5), OPEN_PORTS_SCANME);
    expect(groups[0].title).toContain("apache");
    expect(groups[0].title).toContain("2.4.7");
    expect(groups[0].title).toContain("80");
    expect(groups[0].action).toContain("apache");
    expect(groups[0].action).toContain("2.4.7");
  });
});

// ---------------------------------------------------------------------------
// (b) 2 findings do mesmo produto → sem agregação
// ---------------------------------------------------------------------------

describe("aggregateByRootCause — (b) grupo pequeno fica individual", () => {
  it(`${MIN_GROUP_SIZE - 1} CVEs do mesmo produto/porto ficam em individuals`, () => {
    const twoApache = makeApacheCves(MIN_GROUP_SIZE - 1);
    const { groups, individuals } = aggregateByRootCause(twoApache, OPEN_PORTS_SCANME);
    expect(groups.length).toBe(0);
    expect(individuals.length).toBe(MIN_GROUP_SIZE - 1);
  });

  it(`exactamente ${MIN_GROUP_SIZE} CVEs formam um grupo`, () => {
    const threeApache = makeApacheCves(MIN_GROUP_SIZE);
    const { groups } = aggregateByRootCause(threeApache, OPEN_PORTS_SCANME);
    expect(groups.length).toBe(1);
    expect(groups[0].counts.total).toBe(MIN_GROUP_SIZE);
  });
});

// ---------------------------------------------------------------------------
// (c) Sintéticos NIS2-* nunca agregam
// ---------------------------------------------------------------------------

describe("aggregateByRootCause — (c) sintéticos NIS2-* nunca agregam", () => {
  it("10 findings NIS2-HEADER-* com mesmo affectedComponent ficam todos em individuals", () => {
    const synthetics: RcaVuln[] = Array.from({ length: 10 }, (_, i) =>
      makeCve({ cveId: `NIS2-HEADER-CHECK-${i}`, affectedComponent: "http", port: 80 })
    );
    const { groups, individuals } = aggregateByRootCause(synthetics, OPEN_PORTS_SCANME);
    expect(groups.length).toBe(0);
    expect(individuals.length).toBe(10);
  });

  it("mistura CVE (agrupável) + NIS2 (individual) é particionada correctamente", () => {
    const apacheCves = makeApacheCves(5);
    const nis2Headers: RcaVuln[] = [
      makeCve({ cveId: "NIS2-HEADER-CSP",    affectedComponent: "http", port: 80 }),
      makeCve({ cveId: "NIS2-HEADER-HSTS",   affectedComponent: "http", port: 80 }),
      makeCve({ cveId: "NIS2-EMAIL-DMARC",   affectedComponent: "email", port: null }),
    ];
    const { groups, individuals } = aggregateByRootCause([...apacheCves, ...nis2Headers], OPEN_PORTS_SCANME);
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe("apache:80");
    // sintéticos ficam em individuals, não entram no grupo apache
    expect(individuals.length).toBe(3);
    const indivIds = individuals.map(i => i.cveId);
    expect(indivIds).toContain("NIS2-HEADER-CSP");
    expect(indivIds).toContain("NIS2-EMAIL-DMARC");
  });
});

// ---------------------------------------------------------------------------
// (d) Invariante: nada se perde — total grupos + individuais = total findings
// ---------------------------------------------------------------------------

describe("aggregateByRootCause — (d) invariante de contagem", () => {
  it("grupos.findings.total + individuals.length === total findings de entrada", () => {
    const apacheCves  = makeApacheCves(106);
    const sshCves     = Array.from({ length: 5 }, (_, i) =>
      makeCve({ cveId: `CVE-2020-SSH-${i}`, affectedComponent: "SSH (OpenSSH_6.6.1p1)", port: 22 })
    );
    const synthetics: RcaVuln[] = [
      makeCve({ cveId: "NIS2-HEADER-CSP",  affectedComponent: "http",  port: 80 }),
      makeCve({ cveId: "NIS2-EMAIL-DMARC", affectedComponent: "email", port: null }),
    ];
    const all = [...apacheCves, ...sshCves, ...synthetics];
    const { groups, individuals } = aggregateByRootCause(all, OPEN_PORTS_SCANME);

    const groupTotal = groups.reduce((sum, g) => sum + g.counts.total, 0);
    expect(groupTotal + individuals.length).toBe(all.length);
  });

  it("scan com apenas sintéticos: 0 grupos, todos em individuals", () => {
    const synthetics: RcaVuln[] = Array.from({ length: 7 }, (_, i) =>
      makeCve({ cveId: `NIS2-TEST-${i}`, affectedComponent: "http", port: 80 })
    );
    const { groups, individuals } = aggregateByRootCause(synthetics, []);
    expect(groups.length).toBe(0);
    expect(individuals.length).toBe(7);
  });

  it("scan vazio: resultado vazio sem erros", () => {
    const { groups, individuals } = aggregateByRootCause([], []);
    expect(groups.length).toBe(0);
    expect(individuals.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildMediumIndividualsSummary
// ---------------------------------------------------------------------------

describe("buildMediumIndividualsSummary", () => {
  it("lista vazia retorna string vazia", () => {
    expect(buildMediumIndividualsSummary([])).toBe("");
  });

  it("só CVEs → effort 'baixo — actualizações'", () => {
    const cves = makeApacheCves(3, "medium");
    const s = buildMediumIndividualsSummary(cves);
    expect(s).toContain("3 vulnerabilidades");
    expect(s).toContain("actualizações de software");
    expect(s).not.toContain("ajustes de configuração");
  });

  it("só sintéticos → effort 'baixo — ajustes de configuração'", () => {
    const syns: RcaVuln[] = [
      makeCve({ cveId: "NIS2-HEADER-CSP",  severity: "medium", affectedComponent: "http", port: 80 }),
      makeCve({ cveId: "NIS2-EMAIL-DMARC", severity: "medium", affectedComponent: "email", port: null }),
    ];
    const s = buildMediumIndividualsSummary(syns);
    expect(s).toContain("ajustes de configuração");
    expect(s).not.toContain("actualizações de software");
  });

  it("mistura CVE + sintético → effort 'baixo a médio'", () => {
    const mixed: RcaVuln[] = [
      makeCve({ cveId: "CVE-2021-001",    severity: "medium", affectedComponent: "nginx", port: 443 }),
      makeCve({ cveId: "NIS2-HEADER-CSP", severity: "medium", affectedComponent: "http",  port: 80 }),
    ];
    const s = buildMediumIndividualsSummary(mixed);
    expect(s).toContain("baixo a médio");
  });
});
