/**
 * pdf-chart-helpers.ts
 *
 * Helpers gráficos vetoriais para os relatórios PDF CISPLAN.
 * Funções puras: recebem (doc, x, y, dados, dimensões) → devolvem altura consumida.
 * Não fazem addPage, headers, footers nem lêem estado global.
 * Pré-requisito do chamador: registar "Sans" e "Sans-Bold" (DejaVu) no doc.
 *
 * Paleta local espelha `C` em pdf-report-generator.ts — consolidar num
 * módulo shared em B2.
 */

// ---------------------------------------------------------------------------
// Paleta local (mirrors pdf-report-generator.ts)
// ---------------------------------------------------------------------------

const CH = {
  brand:   "#1d4ed8",
  success: "#10b981",
  warning: "#f59e0b",
  danger:  "#ef4444",
  critical:"#dc2626",
  high:    "#ea580c",
  low:     "#3b82f6",
  text:    "#111827",
  muted:   "#6b7280",
  border:  "#e5e7eb",
  bg:      "#f8fafc",
};

function scoreColor(s: number): string {
  if (s >= 80) return CH.success;
  if (s >= 60) return CH.warning;
  return CH.danger;
}

function severityColor(sev: string): string {
  return (
    ({ critical: CH.critical, high: CH.high, medium: CH.warning, low: CH.low } as Record<string, string>)[sev]
    ?? CH.muted
  );
}

// Ordem fixa dos eixos do radar (a–j), sentido horário a partir das 12h.
const RADAR_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;

// ---------------------------------------------------------------------------
// 1. drawGauge
// ---------------------------------------------------------------------------

/**
 * Arco gauge 0–100, início às 12h, sentido horário.
 * Retorna a altura total consumida (diâmetro + área de label).
 *
 * Casos-limite tratados:
 *  - score = 0   → só arco de fundo, sem arco de valor.
 *  - score ≥ 99.5 → arco completo via doc.circle (evita SVG A degenerado).
 *  - score clampado a [0, 100].
 */
export function drawGauge(
  doc:   PDFKit.PDFDocument,
  x:     number,
  y:     number,
  score: number,
  label: string,
  r     = 52,
): number {
  const s   = Math.max(0, Math.min(100, score));
  const cx  = x + r;
  const cy  = y + r;
  const sw  = 14;
  const col = scoreColor(s);

  // Anel de fundo
  doc.circle(cx, cy, r).lineWidth(sw).strokeColor(CH.border).stroke();

  // Arco de valor
  if (s >= 99.5) {
    doc.circle(cx, cy, r).lineWidth(sw).lineCap("round").strokeColor(col).stroke();
  } else if (s > 0) {
    const angle = (s / 100) * 2 * Math.PI;
    const sx    = cx;
    const sy    = cy - r;
    const ex    = +(cx + r * Math.sin(angle)).toFixed(2);
    const ey    = +(cy - r * Math.cos(angle)).toFixed(2);
    const large = angle > Math.PI ? 1 : 0;
    // SVG arc: M startX startY A rx ry x-rot large sweep endX endY
    doc.path(`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`)
       .lineWidth(sw).lineCap("round").strokeColor(col).stroke();
  }

  // Número ao centro
  doc.fontSize(26).font("Sans-Bold").fillColor(CH.text)
     .text(String(s), cx - r, cy - 16, { width: r * 2, align: "center" });
  doc.fontSize(9).font("Sans").fillColor(CH.muted)
     .text("/100", cx - r, cy + 14, { width: r * 2, align: "center" });

  // Label abaixo do arco
  doc.fontSize(8).font("Sans-Bold").fillColor(col)
     .text(label, cx - r - 10, cy + r + 10, { width: r * 2 + 20, align: "center" });

  return r * 2 + 30; // diâmetro + área de label
}

// ---------------------------------------------------------------------------
// 2. drawSeverityTiles
// ---------------------------------------------------------------------------

/**
 * 4 cartões em grelha 2×2, um por severidade.
 * Retorna a altura total consumida (2 linhas de tiles + gap).
 */
export function drawSeverityTiles(
  doc:    PDFKit.PDFDocument,
  x:      number,
  y:      number,
  counts: { critical: number; high: number; medium: number; low: number },
  w:      number,
): number {
  const gap   = 8;
  const tileW = (w - gap) / 2;
  const tileH = 58;
  const tiles = [
    { key: "critical", label: "Críticas", count: counts.critical },
    { key: "high",     label: "Altas",    count: counts.high },
    { key: "medium",   label: "Médias",   count: counts.medium },
    { key: "low",      label: "Baixas",   count: counts.low },
  ];

  tiles.forEach(({ key, label, count }, i) => {
    const col   = i % 2;
    const row   = Math.floor(i / 2);
    const tx    = x + col * (tileW + gap);
    const ty    = y + row * (tileH + gap);
    const color = severityColor(key);

    doc.roundedRect(tx, ty, tileW, tileH, 4).fillColor(CH.bg).fill();
    doc.rect(tx, ty, tileW, 4).fillColor(color).fill();
    doc.fontSize(22).font("Sans-Bold").fillColor(color)
       .text(String(count), tx, ty + 10, { width: tileW, align: "center" });
    doc.fontSize(8).font("Sans").fillColor(CH.muted)
       .text(label, tx, ty + 40, { width: tileW, align: "center" });
  });

  return tileH * 2 + gap;
}

// ---------------------------------------------------------------------------
// 3. drawNIS2Radar
// ---------------------------------------------------------------------------

/**
 * Radar com 10 eixos (a–j), sentido horário a partir das 12h.
 * scores: Record com chaves "a"–"j"; null/ausente → vértice no centro (ponto oco).
 * Retorna a altura total consumida (diâmetro + rótulos + legenda se houver nulls).
 */
export function drawNIS2Radar(
  doc:    PDFKit.PDFDocument,
  x:      number,
  y:      number,
  scores: Record<string, number | null>,
  r       = 110,
): number {
  const n   = 10;
  const pad = 20; // margem para rótulos de eixo
  const cx  = x + r + pad;
  const cy  = y + r + pad;

  // Coordenadas de um ponto num eixo a um dado raio
  const pt = (idx: number, radius: number): [number, number] => {
    const angle = (idx / n) * 2 * Math.PI - Math.PI / 2; // 12h, CW
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  };

  // Anéis de grelha a 25 / 50 / 75 / 100 %
  [0.25, 0.5, 0.75, 1].forEach((pct) => {
    const [p0x, p0y] = pt(0, r * pct);
    doc.moveTo(p0x, p0y);
    for (let i = 1; i < n; i++) {
      const [px, py] = pt(i, r * pct);
      doc.lineTo(px, py);
    }
    doc.closePath().lineWidth(0.4).strokeColor(CH.border).stroke();
  });

  // Linhas de eixo (centro → ponta)
  for (let i = 0; i < n; i++) {
    const [ex, ey] = pt(i, r);
    doc.moveTo(cx, cy).lineTo(ex, ey).lineWidth(0.4).strokeColor(CH.border).stroke();
  }

  // Dados: distinguir null (não avaliado) de valor numérico (incluindo 0)
  const ddata = RADAR_KEYS.map((k, i) => {
    const raw  = scores[k] ?? null;
    const val  = raw !== null ? Math.max(0, Math.min(100, raw)) : 0;
    return { xy: pt(i, r * (val / 100)), isNull: raw === null };
  });
  const nullSlugs = RADAR_KEYS.filter((_, i) => ddata[i].isNull);
  const hasNull   = nullSlugs.length > 0;

  // Fill semi-transparente do polígono
  doc.moveTo(ddata[0].xy[0], ddata[0].xy[1]);
  ddata.slice(1).forEach(({ xy: [px, py] }) => doc.lineTo(px, py));
  doc.closePath().fillOpacity(0.15).fillColor(CH.brand).fill();
  doc.fillOpacity(1);

  // Stroke do polígono
  doc.moveTo(ddata[0].xy[0], ddata[0].xy[1]);
  ddata.slice(1).forEach(({ xy: [px, py] }) => doc.lineTo(px, py));
  doc.closePath().lineWidth(1.5).strokeColor(CH.brand).stroke();

  // Pontos nos vértices: cheio azul para medidos; null → sem ponto no vértice
  ddata.forEach(({ xy: [px, py], isNull }) => {
    if (!isNull) {
      doc.circle(px, py, 3).fillColor(CH.brand).fill();
    }
  });

  // Rótulos nas pontas dos eixos: cinzento para não avaliados, escuro para medidos
  RADAR_KEYS.forEach((k, i) => {
    const [lx, ly] = pt(i, r + 14);
    doc.fontSize(8).font("Sans-Bold").fillColor(ddata[i].isNull ? CH.muted : CH.text)
       .text(k, lx - 8, ly - 5, { width: 16, align: "center" });
  });

  // Legenda nominal: lista os slugs não avaliados por ordem, só quando existem
  const legendH = hasNull ? 16 : 0;
  if (hasNull) {
    doc.fontSize(7).font("Sans").fillColor(CH.muted)
       .text(
         `Não avaliado (sem respostas): ${nullSlugs.join(", ")}`,
         x, y + (r + pad) * 2 + 2,
         { width: (r + pad) * 2 },
       );
  }

  return (r + pad) * 2 + legendH;
}

// ---------------------------------------------------------------------------
// 4. drawServiceBars
// ---------------------------------------------------------------------------

/**
 * Barras horizontais empilhadas por serviço.
 * Escala comum ao maior total; rótulo à esquerda, total à direita.
 * Retorna a altura total consumida (rows.length × 30).
 */
export function drawServiceBars(
  doc:  PDFKit.PDFDocument,
  x:    number,
  y:    number,
  rows: Array<{ label: string; counts: { critical: number; high: number; medium: number; low: number } }>,
  w:    number,
): number {
  const rowH    = 30;
  const labelW  = 90;
  const totW    = 28;
  const barMaxW = w - labelW - totW - 12;

  const maxTotal = Math.max(
    1,
    ...rows.map(r => r.counts.critical + r.counts.high + r.counts.medium + r.counts.low),
  );

  rows.forEach((row, i) => {
    const ry    = y + i * rowH;
    const barX  = x + labelW + 6;
    const total = row.counts.critical + row.counts.high + row.counts.medium + row.counts.low;

    doc.fontSize(8).font("Sans").fillColor(CH.text)
       .text(row.label, x, ry + 9, { width: labelW });

    // Fundo da barra
    doc.rect(barX, ry + 8, barMaxW, 14).fillColor(CH.border).fill();

    // Segmentos empilhados
    let segX = barX;
    ([ ["critical", row.counts.critical],
       ["high",     row.counts.high],
       ["medium",   row.counts.medium],
       ["low",      row.counts.low],
    ] as [string, number][]).forEach(([sev, cnt]) => {
      if (cnt === 0) return;
      const segW = (cnt / maxTotal) * barMaxW;
      doc.rect(segX, ry + 8, segW, 14).fillColor(severityColor(sev)).fill();
      segX += segW;
    });

    doc.fontSize(8).font("Sans-Bold").fillColor(CH.text)
       .text(String(total), barX + barMaxW + 4, ry + 9, { width: totW });

    if (i < rows.length - 1) {
      doc.moveTo(x, ry + rowH - 1).lineTo(x + w, ry + rowH - 1)
         .lineWidth(0.3).strokeColor(CH.border).stroke();
    }
  });

  return rows.length * rowH;
}
