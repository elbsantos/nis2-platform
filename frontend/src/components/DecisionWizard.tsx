/**
 * frontend/src/components/DecisionWizard.tsx
 *
 * Wizard genérico passo-a-passo que consome uma DecisionTree.
 * Ramificação real (não linear): cada resposta ao nó A determina o próximo nó.
 * Nó D tem formulário especial para os 3 valores de dimensão.
 */

import { useState } from "react";
import type { DecisionTree, Answers } from "../../../backend/utils/decision-engine";

// ── Lógica de navegação ───────────────────────────────────────────────────────

/** Sequência de nós a mostrar dado o estado actual das respostas. */
function getWizardPath(answers: Answers): string[] {
  const setor = answers["A.setor"];
  if (!setor)                            return ["A"];
  if (setor === "admin_publica")         return ["A"];          // terminal
  if (setor === "outro")                 return ["A", "B"];
  return                                         ["A", "C", "D"];
}

/** Mapeamento nodeId → chave primária da resposta. */
const NODE_KEY: Record<string, string> = {
  A: "A.setor",
  B: "B.excecao",
  C: "C.estrutura",
};

function isNodeAnswered(nodeId: string, answers: Answers): boolean {
  const key = NODE_KEY[nodeId];
  if (key) return key in answers && answers[key] !== "";
  if (nodeId === "D") return "D.n" in answers && "D.vn" in answers;
  return false;
}

function clearNodeAnswers(nodeId: string, a: Answers): Answers {
  const copy = { ...a };
  if (nodeId === "A") delete copy["A.setor"];
  if (nodeId === "B") delete copy["B.excecao"];
  if (nodeId === "C") delete copy["C.estrutura"];
  if (nodeId === "D") {
    for (const k of ["D.n", "D.vn", "D.b", "D.grupo_n", "D.grupo_vn", "D.grupo_b"]) {
      delete copy[k];
    }
  }
  return copy;
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  tree:       DecisionTree;
  onComplete: (answers: Answers) => void;
}

export default function DecisionWizard({ tree, onComplete }: Props) {
  const [answers, setAnswers] = useState<Answers>({});

  const path         = getWizardPath(answers);
  const currentIdx   = path.findIndex(id => !isNodeAnswered(id, answers));
  const isTerminal   = currentIdx === -1;
  const currentId    = isTerminal ? null : path[currentIdx];
  const currentNode  = currentId ? tree.nodes[currentId] : null;

  // Barra de progresso: passos concluídos / (passos da via + 1 para resultado)
  const totalSteps   = path.length + 1;
  const doneSteps    = isTerminal ? totalSteps : currentIdx;
  const progressPct  = Math.round((doneSteps / totalSteps) * 100);

  function handleOptionSelect(nodeId: string, optionId: string) {
    const key         = NODE_KEY[nodeId];
    if (!key) return;
    const newAnswers  = { ...answers, [key]: optionId };
    const newPath     = getWizardPath(newAnswers);
    const allAnswered = newPath.every(id => isNodeAnswered(id, newAnswers));
    setAnswers(newAnswers);
    if (allAnswered) onComplete(newAnswers);
  }

  function handleDimensionSubmit(dimensionFields: Record<string, string>) {
    const newAnswers  = { ...answers, ...dimensionFields };
    setAnswers(newAnswers);
    const newPath     = getWizardPath(newAnswers);
    const allAnswered = newPath.every(id => isNodeAnswered(id, newAnswers));
    if (allAnswered) onComplete(newAnswers);
  }

  function handleBack() {
    if (currentIdx <= 0) return;
    // Apaga respostas do nó anterior e todos os seguintes
    let updated = { ...answers };
    path.slice(currentIdx - 1).forEach(id => { updated = clearNodeAnswers(id, updated); });
    setAnswers(updated);
  }

  // Quando admin_publica é respondida, o wizard é terminal e chama onComplete
  // na próxima renderização. Chamamos onComplete aqui de forma síncrona.
  if (isTerminal) {
    // Evita chamar em loop — o pai navega ao receber onComplete
    return (
      <div className="text-center py-8 text-slate-400 text-sm">A calcular…</div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Barra de progresso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Passo {doneSteps + 1} de {totalSteps}</span>
          <span>{progressPct}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Pergunta actual */}
      {currentNode && (
        <div className="bg-[#0f1e38] border border-[#1e3a5f] rounded-xl p-6 space-y-4">
          <div>
            <p className="text-xs font-mono text-slate-500 mb-1">Nó {currentId}</p>
            <h2 className="text-base font-semibold text-white leading-snug">
              {currentNode.question}
            </h2>
            <p className="text-xs text-slate-500 mt-1">{currentNode.legalRef}</p>
          </div>

          {/* Nó D — formulário de dimensão */}
          {currentId === "D" ? (
            <DimensionForm
              estrutura={answers["C.estrutura"]}
              onSubmit={handleDimensionSubmit}
            />
          ) : (
            /* Opções de resposta */
            <div className="space-y-2">
              {currentNode.options.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleOptionSelect(currentId!, opt.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-[#1e3a5f] text-sm text-slate-200 hover:bg-[#1e3a5f] hover:border-blue-600 transition-colors"
                >
                  <span className="block font-medium">{opt.label}</span>
                  {opt.legalRef && (
                    <span className="text-xs text-slate-500 mt-0.5 block">{opt.legalRef}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Botão voltar */}
      {currentIdx > 0 && (
        <div>
          <button
            onClick={handleBack}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Voltar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Formulário de dimensão (Nó D) ────────────────────────────────────────────

interface DimensionFormProps {
  estrutura?: string;
  onSubmit:   (fields: Record<string, string>) => void;
}

function DimensionForm({ estrutura, onSubmit }: DimensionFormProps) {
  const [n,  setN]  = useState("");
  const [vn, setVn] = useState("");
  const [b,  setB]  = useState("");

  // Campos do grupo — só visíveis quando estrutura = "associada_total"
  const isGrupo = estrutura === "associada_total";
  const [gn,  setGn]  = useState("");
  const [gvn, setGvn] = useState("");
  const [gb,  setGb]  = useState("");

  const canSubmit = n.trim() !== "" && vn.trim() !== "" && !isNaN(Number(n)) && !isNaN(Number(vn));

  function handleSubmit() {
    if (!canSubmit) return;
    const fields: Record<string, string> = { "D.n": n.trim(), "D.vn": vn.trim() };
    if (b.trim()) fields["D.b"] = b.trim();
    if (isGrupo) {
      if (gn.trim())  fields["D.grupo_n"]  = gn.trim();
      if (gvn.trim()) fields["D.grupo_vn"] = gvn.trim();
      if (gb.trim())  fields["D.grupo_b"]  = gb.trim();
    }
    onSubmit(fields);
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        Introduza os valores da sua organização. O balanço total é opcional — se não souber, deixe em branco e o motor assume o pior caso (resultado pode ficar condicional).
      </p>

      {/* Campos próprios */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Trabalhadores" sub="n.º total" value={n} onChange={setN} placeholder="ex. 85" />
        <Field label="Vol. de negócios" sub="M€/ano" value={vn} onChange={setVn} placeholder="ex. 12.5" />
        <Field label="Balanço total" sub="M€ (opcional)" value={b} onChange={setB} placeholder="ex. 9.0" />
      </div>

      {/* Campos do grupo */}
      {isGrupo && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
            Grupo (empresa controladora / subsidiárias — adicionar aos valores acima)
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Trab. grupo" sub="adicionais" value={gn}  onChange={setGn}  placeholder="ex. 20" />
            <Field label="VN grupo"   sub="M€ adicionais" value={gvn} onChange={setGvn} placeholder="ex. 8" />
            <Field label="Balanço gr." sub="M€ (opcional)" value={gb}  onChange={setGb}  placeholder="ex. 5" />
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors"
      >
        Calcular enquadramento →
      </button>
    </div>
  );
}

function Field({
  label, sub, value, onChange, placeholder,
}: {
  label: string; sub: string; value: string;
  onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      <p className="text-xs text-slate-500">{sub}</p>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-[#0b1526] border border-[#1e3a5f] rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-600 transition-colors"
      />
    </div>
  );
}
