/**
 * server/integrations/resend.ts
 *
 * Transactional email via Resend API.
 * All emails are in European Portuguese (PT).
 *
 * Templates:
 *   - welcome          → on first login
 *   - scanComplete     → scan finished, PDF ready
 *   - remediationReady → AI plan generated
 *   - upgradeConfirmed → subscription activated
 *   - paymentFailed    → billing issue
 *   - trialExpiring    → 3 days before trial ends (future)
 */

import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("[Resend] RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM = process.env.EMAIL_FROM ?? "NIS2 Plataforma <noreply@nis2pt.pt>";
const APP_URL = process.env.APP_URL ?? "https://nis2pt.pt";

// ---------------------------------------------------------------------------
// Base send helper
// ---------------------------------------------------------------------------

async function send(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    console.error("[Resend] Failed to send email:", error);
    throw new Error(`[Resend] ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Shared HTML wrapper — clean, minimal, PT branding
// ---------------------------------------------------------------------------

function htmlWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f9fafb; margin: 0; padding: 0; color: #111827; }
    .wrap { max-width: 560px; margin: 40px auto; background: #fff;
            border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #1d4ed8; padding: 24px 32px; }
    .header h1 { color: #fff; font-size: 18px; margin: 0; font-weight: 600; }
    .header p { color: #bfdbfe; font-size: 13px; margin: 4px 0 0; }
    .body { padding: 32px; }
    .body p { font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .cta { display: inline-block; background: #1d4ed8; color: #fff;
           text-decoration: none; padding: 12px 24px; border-radius: 8px;
           font-size: 14px; font-weight: 500; margin: 8px 0 24px; }
    .score-box { background: #f0f9ff; border: 1px solid #bae6fd;
                 border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .score-box .val { font-size: 36px; font-weight: 700; color: #0369a1; }
    .score-box .lbl { font-size: 13px; color: #0c4a6e; }
    .footer { padding: 20px 32px; border-top: 1px solid #e5e7eb;
              font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>NIS2 Plataforma PT</h1>
      <p>Conformidade NIS2 para PMEs portuguesas</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      Este email foi enviado pela NIS2 Plataforma PT. 
      <a href="${APP_URL}/unsubscribe">Cancelar subscrição</a> · 
      <a href="${APP_URL}/privacy">Privacidade</a>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Template: Welcome
// ---------------------------------------------------------------------------

export async function sendWelcome(opts: {
  to: string;
  name: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: "Bem-vindo à NIS2 Plataforma PT",
    html: htmlWrapper(`
      <p>Olá <strong>${opts.name}</strong>,</p>
      <p>A tua conta foi criada com sucesso. Podes agora correr o teu primeiro diagnóstico NIS2 — gratuito, sem instalação de software.</p>
      <a href="${APP_URL}/dashboard" class="cta">Iniciar diagnóstico →</a>
      <p>O diagnóstico demora cerca de 20 minutos e no final tens um relatório PDF com o teu score de conformidade NIS2 e um plano de acção prioritizado.</p>
      <p>Qualquer dúvida, responde a este email.</p>
    `),
  });
}

// ---------------------------------------------------------------------------
// Template: Scan complete
// ---------------------------------------------------------------------------

export async function sendScanComplete(opts: {
  to: string;
  name: string;
  orgName: string;
  score: number;
  criticalCount: number;
  reportUrl: string;
}): Promise<void> {
  const scoreColor =
    opts.score >= 70 ? "#15803d" : opts.score >= 40 ? "#b45309" : "#b91c1c";

  await send({
    to: opts.to,
    subject: `Scan NIS2 concluído — ${opts.orgName}`,
    html: htmlWrapper(`
      <p>Olá <strong>${opts.name}</strong>,</p>
      <p>O scan de conformidade NIS2 de <strong>${opts.orgName}</strong> foi concluído.</p>
      <div class="score-box">
        <div class="val" style="color:${scoreColor}">${opts.score}/100</div>
        <div class="lbl">Score de conformidade NIS2</div>
      </div>
      ${opts.criticalCount > 0 ? `<p>⚠️ Foram encontradas <strong>${opts.criticalCount} vulnerabilidade(s) crítica(s)</strong> que requerem atenção imediata.</p>` : "<p>✅ Nenhuma vulnerabilidade crítica detectada.</p>"}
      <a href="${opts.reportUrl}" class="cta">Ver relatório completo →</a>
      <p>O relatório PDF executivo e técnico estão disponíveis na tua dashboard.</p>
    `),
  });
}

// ---------------------------------------------------------------------------
// Template: Remediation plan ready
// ---------------------------------------------------------------------------

export async function sendRemediationReady(opts: {
  to: string;
  name: string;
  vulnCount: number;
  dashboardUrl: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Plano de remediação NIS2 pronto — ${opts.vulnCount} item(s)`,
    html: htmlWrapper(`
      <p>Olá <strong>${opts.name}</strong>,</p>
      <p>O teu plano de remediação personalizado está pronto. Inclui guias passo-a-passo para corrigir <strong>${opts.vulnCount} vulnerabilidade(s)</strong> identificadas no scan.</p>
      <a href="${opts.dashboardUrl}" class="cta">Ver plano de remediação →</a>
      <p>Cada item inclui estimativa de esforço, instruções por sistema operativo, e mapeamento para os artigos NIS2 aplicáveis.</p>
    `),
  });
}

// ---------------------------------------------------------------------------
// Template: Upgrade confirmed
// ---------------------------------------------------------------------------

export async function sendUpgradeConfirmed(opts: {
  to: string;
  name: string;
  plan: "pro" | "mssp" | "enterprise";
  dashboardUrl: string;
}): Promise<void> {
  const planLabel = opts.plan === "pro" ? "Pro (€89/mês)" : opts.plan === "mssp" ? "MSSP (€199/mês)" : "Enterprise (€499/mês)";

  await send({
    to: opts.to,
    subject: `Plano ${planLabel} activado — NIS2 Plataforma PT`,
    html: htmlWrapper(`
      <p>Olá <strong>${opts.name}</strong>,</p>
      <p>O teu plano <strong>${planLabel}</strong> foi activado com sucesso. Tens agora acesso a todas as funcionalidades ${opts.plan === "mssp" ? "multi-cliente" : "completas"}.</p>
      <a href="${opts.dashboardUrl}" class="cta">Aceder à dashboard →</a>
      <p>Funcionalidades desbloqueadas:</p>
      ${opts.plan === "pro"
        ? "<ul><li>Scans ilimitados</li><li>Score NIS2 detalhado por artigo</li><li>Guias de remediação IA</li><li>Módulo 2 do curso</li><li>Templates CNCS editáveis</li></ul>"
        : "<ul><li>Gestão multi-cliente</li><li>Dashboard consolidado</li><li>Relatórios white-label</li><li>API de resultados</li><li>Suporte prioritário PT</li></ul>"}
    `),
  });
}

// ---------------------------------------------------------------------------
// Template: Payment failed
// ---------------------------------------------------------------------------

export async function sendPaymentFailed(opts: {
  to: string;
  name: string;
  retryUrl: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: "Problema com o teu pagamento — NIS2 Plataforma PT",
    html: htmlWrapper(`
      <p>Olá <strong>${opts.name}</strong>,</p>
      <p>Não foi possível processar o teu pagamento. A tua conta foi mantida activa por 7 dias enquanto resolves o problema.</p>
      <a href="${opts.retryUrl}" class="cta">Actualizar método de pagamento →</a>
      <p>Se não actualizares nos próximos 7 dias, a tua conta passará automaticamente para o plano gratuito.</p>
    `),
  });
}
