import { Link } from "react-router-dom";
import { PublicNav, PublicFooter } from "../components/PublicChrome";
import { ENABLE_PRICING, ENABLE_COURSE } from "../lib/featureFlags";
import "./Landing.css";
import "./Legal.css";

type QA = { q: string; a: React.ReactNode };

const NIS2_QA: QA[] = [
  {
    q: "A minha empresa é obrigada a cumprir a NIS2?",
    a: "Se tiver 50 ou mais colaboradores e operar num dos sectores abrangidos pelos Anexos I ou II do DL 125/2025 (energia, saúde, transportes, IT, fabrico industrial, etc.), sim. O scanner e o questionário de enquadramento identificam automaticamente a classificação da sua empresa (Entidade Essencial, Entidade Importante ou fora do âmbito).",
  },
  {
    q: "Qual é a diferença entre Entidade Essencial e Entidade Importante?",
    a: "Ambas têm de cumprir a NIS2, mas a supervisão e as coimas diferem: Entidades Essenciais estão sujeitas a supervisão ex-ante (o CNCS pode fiscalizar antes de um incidente) e coimas até €10.000.000 ou 2% do volume de negócios global; Entidades Importantes têm supervisão ex-post (após um incidente ou denúncia) e coimas até €7.000.000 ou 1,4%. O enquadramento da plataforma calcula em que categoria a sua empresa se insere.",
  },
  {
    q: "Tenho de me registar no CNCS?",
    a: "As entidades abrangidas pela NIS2 têm de se registar junto do Centro Nacional de Cibersegurança. A plataforma não faz esse registo por si — mas o guia de enquadramento indica quando e como o fazer.",
  },
];

const PLATFORM_QA: QA[] = [
  {
    q: "O scanner acede à minha infraestrutura interna?",
    a: "Não. O scanner é 100% agentless e analisa apenas dados públicos — o que qualquer atacante ou auditor consegue ver sobre a sua empresa a partir da internet (subdomínios, portas expostas, certificados, CVEs conhecidos). Não é necessário instalar nada nem dar acesso à rede interna.",
  },
  {
    q: "Só posso fazer scan ao domínio da minha própria empresa?",
    a: "Sim. O scanner deve ser usado apenas sobre domínios que são seus ou para os quais tem autorização para testar. Ver a secção de utilização aceitável nos nossos Termos de Serviço.",
  },
  {
    q: "O que é a descoberta de subdomínios?",
    a: "Encontra automaticamente todos os subdomínios ativos de um domínio (via Certificate Transparency e DNS) e analisa-os — útil para não deixar de fora partes da presença digital da empresa que podiam estar esquecidas.",
  },
  {
    q: "Os documentos gerados são prontos a usar?",
    a: "Os documentos técnicos e de governança que a plataforma gera saem preenchidos com os seus dados reais — prontos para rever e assinar. Alguns têm campos que a sua equipa completa ao formalizar processos internos (ex.: quem aprovou, data da revisão). Há também documentos de conformidade que dependem de atos da própria empresa — reuniões, formação, contratos — que a plataforma não gera, mas para os quais o guia e a formação preparam.",
  },
  {
    q: "Como funciona a remediação por IA?",
    a: "Após o scan, um agente de IA analisa as lacunas detectadas e gera um plano de remediação personalizado — com priorização por risco, passos concretos e documentação necessária.",
  },
  ...(ENABLE_COURSE
    ? [{
        q: "O curso NIS2 é obrigatório para usar a plataforma?",
        a: "Não, é um complemento. O scanner, o enquadramento e a geração de documentos funcionam de forma independente do curso.",
      }]
    : []),
];

const SECURITY_QA: QA[] = [
  {
    q: "Que dados pessoais recolhem?",
    a: (
      <>
        O essencial para criar e gerir a sua conta e o perfil de conformidade da sua organização —
        detalhado na nossa <Link to="/privacidade">Política de Privacidade</Link>. Não vendemos dados
        a terceiros nem usamos cookies de publicidade ou de rastreio.
      </>
    ),
  },
  {
    q: "Os resultados do meu scan são visíveis a outras empresas?",
    a: "Não. Os resultados de scans, respostas ao questionário e documentos gerados são privados da sua organização e só visíveis a utilizadores da sua própria conta.",
  },
  {
    q: "Como é guardada a minha password?",
    a: "Nunca em texto simples — é sempre armazenada com hash. A sessão é mantida por um cookie de autenticação httpOnly, que não pode ser lido por scripts no browser.",
  },
];

const BILLING_QA: QA[] = [
  {
    q: "Preciso de cartão de crédito para começar?",
    a: "Não. O plano gratuito não pede dados de pagamento.",
  },
  ...(ENABLE_PRICING
    ? [{
        q: "Posso cancelar a qualquer momento?",
        a: "Sim, sem período de fidelização. O acesso mantém-se até ao final do período já pago.",
      }]
    : []),
  {
    q: "O plano inclui atualizações futuras?",
    a: "Sim. A legislação NIS2 e os requisitos técnicos do CNCS vão evoluir nos próximos anos. Todos os planos pagos têm acesso ao conteúdo atualizado e à plataforma melhorada sem custos adicionais.",
  },
  {
    q: "A CISPLAN serve para consultores que gerem vários clientes?",
    a: "Hoje, a CISPLAN foi desenhada para uma empresa gerir a sua própria conformidade NIS2 de ponta a ponta — do enquadramento aos documentos. O suporte a consultores que gerem múltiplas organizações clientes numa só conta está no nosso roadmap. Se é consultor e tem interesse, fale connosco.",
  },
];

function Category({ title, sub, items }: { title: string; sub: string; items: QA[] }) {
  if (items.length === 0) return null;
  return (
    <div className="legal-faq-cat">
      <h2>{title}</h2>
      <p className="legal-faq-cat-sub">{sub}</p>
      <div className="faq-grid">
        {items.map((item, i) => (
          <div className="faq-item" key={i}>
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Faq() {
  return (
    <div className="lp-page">
      <PublicNav />

      <section className="legal-hero">
        <div className="container">
          <div className="section-label">FAQ</div>
          <h1>Perguntas Frequentes</h1>
          <p className="legal-lede">
            Tudo o que precisa de saber sobre a NIS2, a plataforma e como protegemos os seus dados.
            Não encontrou resposta? <a href="mailto:geral@cisplan.com">Escreva-nos</a>.
          </p>
        </div>
      </section>

      <section className="legal-body">
        <div className="container">
          <Category title="Sobre a NIS2" sub="O enquadramento legal e a quem se aplica" items={NIS2_QA} />
          <Category title="Sobre a plataforma" sub="Scanner, documentos e remediação" items={PLATFORM_QA} />
          <Category title="Segurança e privacidade" sub="Como tratamos os seus dados" items={SECURITY_QA} />
          <Category title="Planos e faturação" sub="Preços, cancelamento e atualizações" items={BILLING_QA} />
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
