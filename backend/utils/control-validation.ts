/**
 * backend/utils/control-validation.ts
 *
 * Control Validation — atribui a cada um dos 42 controlos do questionário um estado de
 * verificação, cruzando a resposta de autoavaliação com evidência técnica do scanner.
 *
 * Arquitetura pronta para mais fontes (M365, agente): `source` já é um union type
 * extensível, e `ScanResultData` é um tipo próprio desacoplado do shape interno do
 * scanner (AgentlessScanResult) — o router normaliza os campos relevantes antes de
 * chamar validateControls(), incluindo dados que não vêm de um único scan (ex.:
 * scansLast12Months, que é histórico da organização, não do scan atual).
 *
 * Só 6 dos 42 controlos têm regra técnica hoje. Os outros 36 são sempre "self_declared"
 * — não há hipocrisia nisso: a maioria dos controlos do Art. 21(2) é organizacional
 * (atas, formação, contratos) e não tem, nem terá tão cedo, uma fonte técnica externa
 * que os confirme ou contrarie.
 */

import { NIS2_CONTROLS } from "../services/ai-questionnaire";
import { isEol } from "../integrations/endoflife";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type ValidationState =
  | "verified"        // evidência técnica confirma a resposta
  | "contradicted"    // evidência técnica contraria a resposta
  | "unconfirmed"      // sinal presente mas não conclusivo — mostra evidência, sem veredicto
  | "self_declared";   // sem fonte técnica que o verifique

export interface ControlValidation {
  controlId: string;          // "e-2"
  answer:    string | null;   // resposta do questionário
  state:     ValidationState;
  evidence:  string[];        // frases curtas com o que foi observado
  coverage:  string | null;   // o que a fonte NÃO cobre (honestidade sobre limites)
  source:    "scanner" | null; // preparado para "m365" | "agent" depois
}

/**
 * Fonte de evidência normalizada — o router extrai isto do AgentlessScanResult (+
 * histórico de scans da org) antes de chamar validateControls(). Mantém esta função
 * pura e testável sem depender do shape exato do scanner nem de acesso a BD.
 */
export interface ScanResultData {
  vulnerabilities:      Array<{ cveId: string; cvssScore: number; affectedService: string; port?: number }>;
  tlsIssues:            Array<{ port: number; issue: string }>;
  openPorts:            Array<{ port: number; service: string; product?: string; version?: string }>;
  httpHeaderChecks:     Array<{ name: string; status: string }>;
  emailSecurityChecks:  Array<{ name: string; status: string }>;
  /** null = não foi possível determinar se a porta 80 redireciona para HTTPS. */
  httpRedirectsToHttps: boolean | null;
  scansLast12Months:    number;
}

// ---------------------------------------------------------------------------
// Fallback partilhado
// ---------------------------------------------------------------------------

function selfDeclared(controlId: string, answer: string | null): ControlValidation {
  return { controlId, answer, state: "self_declared", evidence: [], coverage: null, source: null };
}

// ---------------------------------------------------------------------------
// As 6 regras — só avaliam tecnicamente quando a empresa respondeu "yes"
// (exceto f-2, que não depende da resposta). "Só quem afirma pode ser
// contraditado": respostas "no"/"partial"/"na"/ausentes ficam self_declared
// nestes 6 controlos, tal como nos outros 36 — não há regra definida para
// confirmar tecnicamente uma admissão de lacuna.
// ---------------------------------------------------------------------------

function validateE2(answer: string | null, scan: ScanResultData): ControlValidation {
  const coverage = "Apenas software exposto à internet. Sistemas internos não verificados.";
  if (answer !== "yes") return selfDeclared("e-2", answer);

  const highCves = scan.vulnerabilities.filter((v) => v.cvssScore >= 7);
  if (highCves.length > 0) {
    return {
      controlId: "e-2", answer, state: "contradicted", source: "scanner", coverage,
      evidence: highCves.map(
        (v) => `${v.cveId} (CVSS ${v.cvssScore.toFixed(1)}) em ${v.affectedService}${v.port ? ` (porta ${v.port})` : ""}`
      ),
    };
  }
  return {
    controlId: "e-2", answer, state: "verified", source: "scanner", coverage,
    evidence: ["Nenhuma vulnerabilidade crítica/alta (CVSS ≥ 7) detetada nos serviços expostos."],
  };
}

async function validateE3(answer: string | null, scan: ScanResultData): Promise<ControlValidation> {
  const coverage = "Verifica produtos expostos com versão detetável. Sistemas internos e produtos sem dados públicos de fim de suporte não são verificados.";
  if (answer !== "yes") return selfDeclared("e-3", answer);

  const evidence: string[] = [];
  for (const p of scan.openPorts) {
    if (!p.product || !p.version) continue;
    const result = await isEol(p.product, p.version);
    if (result.eol) {
      evidence.push(`${p.product} ${p.version} — suporte terminou em ${result.eolDate ?? "data não especificada"} (porta ${p.port})`);
    }
  }

  if (evidence.length > 0) {
    return { controlId: "e-3", answer, state: "contradicted", source: "scanner", coverage, evidence };
  }
  return {
    controlId: "e-3", answer, state: "verified", source: "scanner", coverage,
    evidence: ["Nenhum serviço em fim de vida (EOL) confirmado pelo endoflife.date nos sistemas expostos."],
  };
}

function validateH2(answer: string | null, scan: ScanResultData): ControlValidation {
  const coverage = "Apenas a superfície web pública. VPN e comunicações internas não verificadas.";
  if (answer !== "yes") return selfDeclared("h-2", answer);

  const evidence: string[] = [];
  // A porta 80 só conta como evidência quando SABEMOS que não redireciona para HTTPS.
  // Se redireciona (true), é boa prática, não problema. Se for null (não foi possível
  // determinar), não se usa o sinal — não inventar contradição por falta de dados.
  if (scan.openPorts.some((p) => p.port === 80) && scan.httpRedirectsToHttps === false) {
    evidence.push("Porta 80 (HTTP em claro) aberta e sem redirecionamento para HTTPS.");
  }
  for (const issue of scan.tlsIssues) {
    evidence.push(`${issue.issue} (porta ${issue.port})`);
  }
  const hsts = scan.httpHeaderChecks.find((c) => c.name === "HSTS");
  if (hsts && hsts.status === "fail") {
    evidence.push("Header HSTS ausente ou mal configurado.");
  }

  if (evidence.length > 0) {
    return { controlId: "h-2", answer, state: "contradicted", source: "scanner", coverage, evidence };
  }
  return {
    controlId: "h-2", answer, state: "verified", source: "scanner", coverage,
    evidence: ["Sem problemas de TLS detetados e HSTS ativo."],
  };
}

function validateJ5(answer: string | null, scan: ScanResultData): ControlValidation {
  const coverage = "Apenas correio e protocolos expostos. Mensagens internas não verificadas.";
  if (answer !== "yes") return selfDeclared("j-5", answer);

  const evidence: string[] = [];
  for (const port of [25, 110, 143]) {
    if (scan.openPorts.some((p) => p.port === port)) {
      evidence.push(`Porta ${port} aberta sem confirmação de encriptação TLS.`);
    }
  }
  const spf = scan.emailSecurityChecks.find((c) => c.name === "SPF");
  if (spf && spf.status === "fail") evidence.push("Registo SPF ausente ou inválido.");
  const dmarc = scan.emailSecurityChecks.find((c) => c.name === "DMARC");
  if (dmarc && dmarc.status === "fail") evidence.push("Registo DMARC ausente ou inválido.");

  if (evidence.length > 0) {
    return { controlId: "j-5", answer, state: "contradicted", source: "scanner", coverage, evidence };
  }
  return {
    controlId: "j-5", answer, state: "verified", source: "scanner", coverage,
    evidence: ["Portas de email em claro fechadas e SPF/DMARC configurados."],
  };
}

function validateF2(answer: string | null, scan: ScanResultData): ControlValidation {
  const coverage = "Verifica a superfície externa. Não substitui teste de intrusão.";
  if (scan.scansLast12Months < 1) return selfDeclared("f-2", answer);

  return {
    controlId: "f-2", answer, state: "verified", source: "scanner", coverage,
    evidence: [`${scan.scansLast12Months} análise${scan.scansLast12Months === 1 ? "" : "s"} realizada${scan.scansLast12Months === 1 ? "" : "s"} nos últimos 12 meses.`],
  };
}

function validateI5(answer: string | null, scan: ScanResultData): ControlValidation {
  const coverage = "Sinal indireto. Não verifica a gestão de contas em si.";
  if (answer !== "yes") return selfDeclared("i-5", answer);

  const adminPorts = [3389, 5900, 445, 5985];
  const exposed = scan.openPorts.filter((p) => adminPorts.includes(p.port));

  if (exposed.length > 0) {
    // Nunca "contradicted" — pode haver VPN legítima à frente destas portas.
    return {
      controlId: "i-5", answer, state: "unconfirmed", source: "scanner", coverage,
      evidence: exposed.map((p) => `Serviço de administração remota exposto (porta ${p.port}). Confirme se está protegido por VPN.`),
    };
  }
  return {
    controlId: "i-5", answer, state: "verified", source: "scanner", coverage,
    evidence: ["Nenhuma porta de administração remota exposta diretamente à internet."],
  };
}

// ---------------------------------------------------------------------------
// validateControls — função pública
// ---------------------------------------------------------------------------

type Rule = (answer: string | null, scan: ScanResultData) => ControlValidation | Promise<ControlValidation>;

const RULES: Record<string, Rule> = {
  "e-2": validateE2,
  "e-3": validateE3, // única regra assíncrona (endoflife.date) — as outras são síncronas
  "h-2": validateH2,
  "j-5": validateJ5,
  "f-2": validateF2,
  "i-5": validateI5,
};

export async function validateControls(
  answers: Record<string, string>,
  scan:    ScanResultData | null
): Promise<ControlValidation[]> {
  return Promise.all(
    NIS2_CONTROLS.map(async (control) => {
      const answer = answers[control.id] ?? null;
      const rule    = RULES[control.id];
      if (!rule || !scan) return selfDeclared(control.id, answer);
      return rule(answer, scan);
    })
  );
}

// ---------------------------------------------------------------------------
// summarizeValidations — contagens para o resumo do ecrã
// ---------------------------------------------------------------------------

export interface ValidationSummary {
  verified:      number;
  contradicted:  number;
  unconfirmed:   number;
  selfDeclared:  number;
}

export function summarizeValidations(validations: ControlValidation[]): ValidationSummary {
  const summary: ValidationSummary = { verified: 0, contradicted: 0, unconfirmed: 0, selfDeclared: 0 };
  for (const v of validations) {
    if (v.state === "verified") summary.verified++;
    else if (v.state === "contradicted") summary.contradicted++;
    else if (v.state === "unconfirmed") summary.unconfirmed++;
    else summary.selfDeclared++;
  }
  return summary;
}
