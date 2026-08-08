import { Link } from "react-router-dom";

const CARD = "bg-[#152744] border border-[#1e3a5f] rounded-xl";

const STEPS: Array<{ n: number; title: string; text: string }> = [
  {
    n: 1,
    title: "Perfil da organização",
    text: "Comece por preencher os dados da sua empresa. É a base de tudo — os documentos que a plataforma gera usam esta informação.",
  },
  {
    n: 2,
    title: "Enquadramento",
    text: "Descubra se a sua empresa é abrangida pela NIS2 e como se classifica. Nem todas as empresas têm as mesmas obrigações — este passo determina as suas.",
  },
  {
    n: 3,
    title: "Questionário",
    text: "Responda a um questionário sobre a postura de segurança da sua empresa. As respostas medem o seu grau de conformidade com as medidas exigidas.",
  },
  {
    n: 4,
    title: "Scanner",
    text: "A plataforma analisa a sua presença digital (o seu site, os seus domínios) da mesma forma que um atacante a veria de fora — e identifica vulnerabilidades.",
  },
  {
    n: 5,
    title: "Remediação",
    text: "Para cada problema encontrado, a plataforma sugere como o corrigir, por ordem de prioridade.",
  },
  {
    n: 6,
    title: "Documentos",
    text: "Com os passos acima feitos, a plataforma gera os documentos de conformidade preenchidos com os seus dados — prontos a rever e usar.",
  },
];

export default function BemVindo() {
  return (
    <div className="min-h-screen bg-[#0f1e38]">
      <div className="max-w-4xl mx-auto px-8 py-12 space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white">Bem-vindo à CISPLAN</h1>
          <p className="text-xl text-slate-300 mt-4 leading-relaxed">
            A CISPLAN ajuda a sua empresa a cumprir a NIS2 — a diretiva europeia de cibersegurança
            que Portugal transpôs no Decreto-Lei 125/2025. Em vez de contratar consultores caros ou
            tentar decifrar textos legais, a plataforma diagnostica a sua situação e gera os
            documentos por si.
          </p>
        </div>

        <section className={`${CARD} p-6`}>
          <h2 className="text-2xl font-semibold text-white mb-1">Como funciona</h2>
          <p className="text-slate-400 text-lg mb-6">
            A conformidade NIS2 segue uma sequência lógica. Recomendamos fazer por esta ordem —
            cada passo prepara o seguinte:
          </p>
          <ol className="space-y-5">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[#1f3864] border border-[#b8860b] text-[#f0c040] font-bold flex items-center justify-center text-sm">
                  {s.n}
                </div>
                <div>
                  <p className="text-white font-semibold text-lg">{s.title}</p>
                  <p className="text-slate-400 text-lg">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="bg-[#0f1e38] border border-[#b8860b]/40 rounded-xl p-5">
          <p className="text-slate-300 leading-relaxed text-lg">
            <strong className="text-[#f0c040]">Nota honesta.</strong> A CISPLAN gera
            automaticamente os documentos técnicos e de governança que resultam dos seus dados.
            Alguns documentos de conformidade dependem de atos da sua empresa — reuniões, formação,
            contratos — que a plataforma não inventa, mas indica-lhe quais são e como os produzir.
            Nunca geramos evidência de algo que não aconteceu.
          </p>
        </div>

        <div className="flex items-center gap-6 pt-2 flex-wrap">
          <Link
            to="/perfil"
            className="px-6 py-3 bg-blue-700 text-white font-semibold rounded-md hover:bg-blue-800 transition-colors text-lg"
          >
            Começar pelo Perfil →
          </Link>
          <Link to="/scan/start" className="text-slate-400 hover:text-white hover:underline text-base">
            Explorar a plataforma livremente
          </Link>
        </div>
      </div>
    </div>
  );
}
