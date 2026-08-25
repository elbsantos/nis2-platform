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
  | "verified"               // afirma cumprir + evidência confirma
  | "verified_noncompliant"  // afirma NÃO cumprir + evidência confirma que não cumpre
  | "contradicted"           // afirma cumprir + evidência contraria
  | "unconfirmed"             // sinal presente mas não conclusivo — mostra evidência, sem veredicto
  | "self_declared";          // sem fonte técnica que o verifique

export interface ControlValidation {
  controlId: string;          // "e-2"
  answer:    string | null;   // resposta do questionário
  state:     ValidationState;
  evidence:  string[];        // frases curtas com o que foi observado
  coverage:  string | null;   // o que a fonte NÃO cobre (honestidade sobre limites)
  source:    "scanner" | null; // preparado para "m365" | "agent" depois
  /**
   * Só presente quando self_declared por resposta "no"/"partial" SEM evidência de
   * falha (a empresa admite a lacuna, mas nada a confirma tecnicamente) — distingue
   * este caso dos 36 controlos estruturalmente sem regra técnica, cujo número não
   * varia de alvo para alvo. Ausente nesses e nos casos "na"/sem resposta.
   */
  inconclusiveReason?: string;
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

function selfDeclared(controlId: string, answer: string | null, inconclusiveReason?: string): ControlValidation {
  return { controlId, answer, state: "self_declared", evidence: [], coverage: null, source: null, inconclusiveReason };
}

// Texto fixo para o caso "no"/"partial" sem evidência de falha — a empresa admite a
// lacuna, mas a análise externa não encontrou nada que a confirme (pode ser um sistema
// que não verificamos, não uma prova de que a lacuna não existe).
const INCONCLUSIVE_NO_EVIDENCE_REASON =
  "Declarou não cumprir e a análise externa não encontrou problemas — pode referir-se a sistemas que não verificamos.";

/**
 * Classifica um controlo com "evidência de falha" (e-2, e-3, h-2, j-5) cruzando a
 * resposta com a presença ou ausência dessa evidência:
 *   - "yes"              + evidência de falha     → contradicted
 *   - "yes"              + sem evidência de falha  → verified
 *   - "no"/"partial"     + evidência de falha      → verified_noncompliant (a empresa
 *     admitiu a lacuna E a evidência confirma-a — é verificação, não só declaração)
 *   - "no"/"partial"     + sem evidência de falha   → self_declared (a empresa diz que
 *     não cumpre, mas nada o confirma tecnicamente — não há prova, só a palavra dela)
 *   - "na"/null                                     → self_declared
 */
function classify(answer: string | null, hasFailureEvidence: boolean): ValidationState {
  if (answer === "yes") return hasFailureEvidence ? "contradicted" : "verified";
  if (answer === "no" || answer === "partial") return hasFailureEvidence ? "verified_noncompliant" : "self_declared";
  return "self_declared";
}

/**
 * Garante no máximo `max` linhas de evidência — nenhuma regra deve produzir uma parede
 * de texto (a lista completa já existe na secção Vulnerabilidades). Quando há mais
 * achados do que cabem, mantém os primeiros e agrega o resto numa última linha.
 * e-2 tem o seu próprio formato agregado (conta + top 3 por CVSS); esta função serve
 * as restantes regras, cuja lista de achados não tem uma ordenação natural por severidade.
 */
function capEvidence(lines: string[], max = 5): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max - 1);
  const rest = lines.length - kept.length;
  return [...kept, `... e mais ${rest} achado${rest === 1 ? "" : "s"}.`];
}

// ---------------------------------------------------------------------------
// As 6 regras — e-2, e-3, h-2, j-5 avaliam evidência de falha e classificam via
// classify() acima (só reagem a "yes"/"no"/"partial" — "na"/ausente ficam
// self_declared sem gastar trabalho a computar evidência). f-2 e i-5 não seguem
// este padrão: f-2 é auto-evidência (não depende da resposta), i-5 usa sinal
// indireto e nunca é conclusivo (nunca gera verified_noncompliant nem contradicted).
// ---------------------------------------------------------------------------

function validateE2(answer: string | null, scan: ScanResultData): ControlValidation {
  const coverage = "Apenas software exposto à internet. Sistemas internos não verificados.";
  if (answer !== "yes" && answer !== "no" && answer !== "partial") return selfDeclared("e-2", answer);

  const highCves = scan.vulnerabilities
    .filter((v) => v.cvssScore >= 7)
    .sort((a, b) => b.cvssScore - a.cvssScore);
  const hasFailureEvidence = highCves.length > 0;
  const state = classify(answer, hasFailureEvidence);
  if (state === "self_declared") return selfDeclared("e-2", answer, INCONCLUSIVE_NO_EVIDENCE_REASON);

  let evidence: string[];
  if (hasFailureEvidence) {
    const n = highCves.length;
    // Agregado + top 3 por CVSS — nunca a lista completa (pode ter dezenas). O detalhe
    // integral já vive na secção Vulnerabilidades; aqui é só o suficiente para justificar
    // o estado do controlo.
    evidence = [`${n} vulnerabilidade${n === 1 ? "" : "s"} de severidade alta ou crítica em serviços expostos`];
    evidence.push(
      ...highCves.slice(0, 3).map(
        (v) => `${v.cveId} (CVSS ${v.cvssScore.toFixed(1)}) em ${v.affectedService}${v.port ? ` (porta ${v.port})` : ""}`
      )
    );
    if (n > 3) {
      evidence.push(`... e mais ${n - 3}. Ver a secção Vulnerabilidades para a lista completa.`);
    }
  } else {
    evidence = ["Nenhuma vulnerabilidade crítica/alta (CVSS ≥ 7) detetada nos serviços expostos."];
  }

  return { controlId: "e-2", answer, state, source: "scanner", coverage, evidence };
}

async function validateE3(answer: string | null, scan: ScanResultData): Promise<ControlValidation> {
  const coverage = "Verifica produtos expostos com versão detetável. Sistemas internos e produtos sem dados públicos de fim de suporte não são verificados.";
  if (answer !== "yes" && answer !== "no" && answer !== "partial") return selfDeclared("e-3", answer);

  const failureEvidence: string[] = [];
  for (const p of scan.openPorts) {
    if (!p.product || !p.version) continue;
    const result = await isEol(p.product, p.version);
    if (result.eol) {
      failureEvidence.push(`${p.product} ${p.version} — suporte terminou em ${result.eolDate ?? "data não especificada"} (porta ${p.port})`);
    }
  }
  const hasFailureEvidence = failureEvidence.length > 0;
  const state = classify(answer, hasFailureEvidence);
  if (state === "self_declared") return selfDeclared("e-3", answer, INCONCLUSIVE_NO_EVIDENCE_REASON);

  const evidence = hasFailureEvidence
    ? capEvidence(failureEvidence)
    : ["Nenhum serviço em fim de vida (EOL) confirmado pelo endoflife.date nos sistemas expostos."];

  return { controlId: "e-3", answer, state, source: "scanner", coverage, evidence };
}

function validateH2(answer: string | null, scan: ScanResultData): ControlValidation {
  const coverage = "Apenas a superfície web pública. VPN e comunicações internas não verificadas.";
  if (answer !== "yes" && answer !== "no" && answer !== "partial") return selfDeclared("h-2", answer);

  const failureEvidence: string[] = [];
  // A porta 80 só conta como evidência quando SABEMOS que não redireciona para HTTPS.
  // Se redireciona (true), é boa prática, não problema. Se for null (não foi possível
  // determinar), não se usa o sinal — não inventar contradição por falta de dados.
  if (scan.openPorts.some((p) => p.port === 80) && scan.httpRedirectsToHttps === false) {
    failureEvidence.push("Porta 80 (HTTP em claro) aberta e sem redirecionamento para HTTPS.");
  }
  // issue.port é sempre 443 (único endpoint TLS verificado) e o texto do issue já é
  // autoexplicativo — não repetir a porta aqui (ficava "... (porta 443)" duplicado
  // quando o próprio issue já a menciona).
  for (const issue of scan.tlsIssues) {
    failureEvidence.push(issue.issue);
  }
  const hsts = scan.httpHeaderChecks.find((c) => c.name === "HSTS");
  if (hsts && hsts.status === "fail") {
    failureEvidence.push("Header HSTS ausente ou mal configurado.");
  }

  const hasFailureEvidence = failureEvidence.length > 0;
  const state = classify(answer, hasFailureEvidence);
  if (state === "self_declared") return selfDeclared("h-2", answer, INCONCLUSIVE_NO_EVIDENCE_REASON);

  const evidence = hasFailureEvidence ? capEvidence(failureEvidence) : ["Sem problemas de TLS detetados e HSTS ativo."];

  return { controlId: "h-2", answer, state, source: "scanner", coverage, evidence };
}

function validateJ5(answer: string | null, scan: ScanResultData): ControlValidation {
  const coverage = "Apenas correio e protocolos expostos. Mensagens internas não verificadas.";
  if (answer !== "yes" && answer !== "no" && answer !== "partial") return selfDeclared("j-5", answer);

  const failureEvidence: string[] = [];
  for (const port of [25, 110, 143]) {
    if (scan.openPorts.some((p) => p.port === port)) {
      failureEvidence.push(`Porta ${port} aberta sem confirmação de encriptação TLS.`);
    }
  }
  const spf = scan.emailSecurityChecks.find((c) => c.name === "SPF");
  if (spf && spf.status === "fail") failureEvidence.push("Registo SPF ausente ou inválido.");
  const dmarc = scan.emailSecurityChecks.find((c) => c.name === "DMARC");
  if (dmarc && dmarc.status === "fail") failureEvidence.push("Registo DMARC ausente ou inválido.");

  const hasFailureEvidence = failureEvidence.length > 0;
  const state = classify(answer, hasFailureEvidence);
  if (state === "self_declared") return selfDeclared("j-5", answer, INCONCLUSIVE_NO_EVIDENCE_REASON);

  const evidence = hasFailureEvidence ? capEvidence(failureEvidence) : ["Portas de email em claro fechadas e SPF/DMARC configurados."];

  return { controlId: "j-5", answer, state, source: "scanner", coverage, evidence };
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
      evidence: capEvidence(exposed.map((p) => `Serviço de administração remota exposto (porta ${p.port}). Confirme se está protegido por VPN.`)),
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
  verified:             number;
  verifiedNoncompliant: number;
  contradicted:         number;
  unconfirmed:          number;
  selfDeclared:         number;
  /** Subconjunto de selfDeclared com inconclusiveReason — "no"/"partial" sem evidência
   *  de falha. Os restantes selfDeclared são estruturais (sem regra técnica nenhuma). */
  inconclusive:         number;
}

export function summarizeValidations(validations: ControlValidation[]): ValidationSummary {
  const summary: ValidationSummary = {
    verified: 0, verifiedNoncompliant: 0, contradicted: 0, unconfirmed: 0, selfDeclared: 0, inconclusive: 0,
  };
  for (const v of validations) {
    if (v.state === "verified") summary.verified++;
    else if (v.state === "verified_noncompliant") summary.verifiedNoncompliant++;
    else if (v.state === "contradicted") summary.contradicted++;
    else if (v.state === "unconfirmed") summary.unconfirmed++;
    else summary.selfDeclared++;

    if (v.inconclusiveReason) summary.inconclusive++;
  }
  return summary;
}
