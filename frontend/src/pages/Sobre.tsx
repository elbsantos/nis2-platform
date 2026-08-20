import { Link } from "react-router-dom";
import { PublicNav, PublicFooter } from "../components/PublicChrome";
import "./Landing.css";
import "./Legal.css";

export default function Sobre() {
  return (
    <div className="lp-page">
      <PublicNav />

      <section className="legal-hero">
        <div className="container">
          <div className="section-label">Sobre a CISPLAN</div>
          <h1>Conformidade NIS2 sem precisar de uma equipa de compliance dedicada.</h1>
          <p className="legal-lede">
            Somos uma plataforma portuguesa criada para que PMEs abrangidas pelo DL 125/2025
            consigam perceber a sua exposição, corrigir as lacunas e documentar a conformidade
            — sem contratar uma consultora para o fazer por elas.
          </p>
        </div>
      </section>

      <section className="legal-body">
        <div className="container">
          <h2>Porque existimos</h2>
          <p>
            A transposição da diretiva NIS2 para Portugal, através do DL 125/2025, alargou
            drasticamente o número de empresas obrigadas a cumprir requisitos formais de
            cibersegurança — de grandes operadores de infraestrutura crítica a PMEs de sectores
            como energia, saúde, transportes, fabrico industrial e tecnologia. A maioria destas
            empresas não tem uma equipa de segurança dedicada nem orçamento para uma auditoria
            externa recorrente, mas enfrenta coimas que podem chegar aos €10.000.000 em caso de
            incumprimento.
          </p>
          <p>
            A CISPLAN nasceu para preencher essa lacuna: uma ferramenta acessível que faz o
            diagnóstico, aponta o que falta e ajuda a produzir os documentos exigidos — em vez de
            deixar cada empresa a decifrar sozinha um regulamento extenso e técnico.
          </p>

          <h2>O que fazemos</h2>
          <div className="legal-pillars">
            <div className="legal-pillar">
              <h3>Diagnóstico</h3>
              <p>
                Um scanner agentless analisa apenas dados públicos do domínio da empresa
                (subdomínios, portas expostas, certificados, CVEs conhecidos) para mostrar
                exatamente o que um atacante — ou um auditor — veria a partir de fora.
              </p>
            </div>
            <div className="legal-pillar">
              <h3>Enquadramento</h3>
              <p>
                Um questionário guiado determina se a empresa é Entidade Essencial, Entidade
                Importante ou está fora do âmbito da NIS2, e mapeia as respostas aos 42 controlos
                da diretiva.
              </p>
            </div>
            <div className="legal-pillar">
              <h3>Remediação e documentos</h3>
              <p>
                A partir das lacunas detetadas, geramos um plano de remediação priorizado por
                risco e os documentos técnicos e de governança preenchidos com os dados reais da
                empresa, prontos para rever e assinar.
              </p>
            </div>
          </div>

          <h2>Como olhamos para a IA</h2>
          <p>
            Usamos inteligência artificial para acelerar a análise de vulnerabilidades e a geração
            de planos de remediação — não para substituir aconselhamento jurídico. Os resultados
            gerados devem ser revistos por alguém responsável na empresa antes de serem
            formalizados. Mais detalhes em <Link to="/privacidade">como tratamos os dados</Link>
            {" "}usados nesse processo.
          </p>

          <h2>Para quem é a CISPLAN</h2>
          <p>
            Hoje a plataforma foi desenhada para uma empresa gerir a sua própria conformidade NIS2
            de ponta a ponta — do enquadramento aos documentos. O suporte a consultores e MSSPs que
            gerem a conformidade de múltiplos clientes numa só conta está no nosso roadmap.
          </p>

          <h2>Fale connosco</h2>
          <p>
            Dúvidas sobre a plataforma, parcerias ou imprensa:{" "}
            <a href="mailto:geral@cisplan.com">geral@cisplan.com</a>. Suporte a clientes:{" "}
            <a href="mailto:geral@cisplan.com">geral@cisplan.com</a>. Consulte também a nossa{" "}
            <Link to="/faq">FAQ</Link>.
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
