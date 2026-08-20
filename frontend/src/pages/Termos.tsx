import { Link } from "react-router-dom";
import { PublicNav, PublicFooter } from "../components/PublicChrome";
import "./Landing.css";
import "./Legal.css";

const SECTIONS = [
  ["objeto", "1. Objeto e aceitação"],
  ["servico", "2. Descrição do serviço"],
  ["conta", "3. Conta e registo"],
  ["planos", "4. Planos e pagamento"],
  ["uso", "5. Utilização aceitável do scanner"],
  ["conteudo", "6. Conteúdo e documentos gerados"],
  ["responsabilidade", "7. Limitação de responsabilidade"],
  ["propriedade", "8. Propriedade intelectual"],
  ["rescisao", "9. Suspensão e rescisão"],
  ["alteracoes", "10. Alterações a estes termos"],
  ["lei", "11. Lei aplicável e foro"],
  ["contacto", "12. Contacto"],
] as const;

export default function Termos() {
  return (
    <div className="lp-page">
      <PublicNav />

      <section className="legal-hero">
        <div className="container">
          <div className="section-label">Legal</div>
          <h1>Termos de Serviço</h1>
          <p className="legal-lede">
            Estes termos regulam a utilização da plataforma CISPLAN pela sua empresa. Ao criar uma
            conta, está a aceitá-los em nome da organização que representa.
          </p>
          <p className="legal-updated">Última atualização: 20 de agosto de 2026</p>
          <div className="legal-toc">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>{label}</a>
            ))}
          </div>
        </div>
      </section>

      <section className="legal-body">
        <div className="container">
          <div className="legal-note">
            <p>
              <strong>Nota:</strong> a CISPLAN encontra-se em fase de demonstração e avaliação.
              Não é comercializada e não são cobrados quaisquer valores. Estes termos serão
              revistos aquando do lançamento comercial.
            </p>
          </div>

          <h2 id="objeto">1. Objeto e aceitação</h2>
          <p>
            A CISPLAN ("nós", "a plataforma") é operada por MAEM Tech — marca sob a qual opera um
            projeto em nome individual, Portugal — e disponibiliza um serviço online de apoio à
            conformidade com a Diretiva NIS2, transposta para o ordenamento jurídico português
            pelo Decreto-Lei n.º 125/2025. Estes Termos de Serviço, juntamente com a nossa{" "}
            <Link to="/privacidade">Política de Privacidade</Link>, formam o acordo entre a
            CISPLAN e a organização que cria uma conta ("o cliente", "a empresa", "o utilizador").
          </p>
          <p>
            Ao registar uma conta, confirma que tem poderes para vincular a organização que
            representa a estes termos. Se não concordar com algum ponto, não deve utilizar a
            plataforma.
          </p>

          <h2 id="servico">2. Descrição do serviço</h2>
          <p>A plataforma disponibiliza:</p>
          <ul>
            <li>
              <strong>Scanner de exposição digital</strong> — análise agentless de dados
              publicamente disponíveis sobre o domínio indicado pelo cliente (subdomínios, portas
              expostas, certificados TLS, vulnerabilidades conhecidas/CVEs).
            </li>
            <li>
              <strong>Questionário de enquadramento</strong> — classificação da empresa como
              Entidade Essencial, Entidade Importante ou fora do âmbito da NIS2, com mapeamento a
              controlos da diretiva.
            </li>
            <li>
              <strong>Plano de remediação assistido por IA</strong> — priorização e passos
              concretos para corrigir lacunas detetadas.
            </li>
            <li>
              <strong>Geração de documentos</strong> — modelos de políticas e registos de
              governança preenchidos com os dados fornecidos pelo cliente.
            </li>
          </ul>
          <p>
            O serviço é prestado "como está" e pode evoluir ao longo do tempo — incluindo
            funcionalidades novas, alterações a funcionalidades existentes ou descontinuação de
            funcionalidades com aviso prévio razoável.
          </p>

          <h2 id="conta">3. Conta e registo</h2>
          <p>
            Para usar a plataforma é necessário criar uma conta associada a uma organização,
            fornecendo pelo menos nome, email profissional e password. É responsável por manter a
            confidencialidade das suas credenciais e por toda a atividade realizada através da sua
            conta. Deve notificar-nos imediatamente através de{" "}
            <a href="mailto:geral@cisplan.com">geral@cisplan.com</a> em caso de uso não
            autorizado.
          </p>
          <p>
            Os dados fornecidos no registo e no perfil da organização (denominação social, NIF,
            sector de atividade, representante legal, responsável de segurança, entre outros)
            devem ser verdadeiros e mantidos atualizados, na medida em que são usados para gerar a
            classificação NIS2 da empresa e os documentos de conformidade.
          </p>

          <h2 id="planos">4. Planos e pagamento</h2>
          <p>
            Na fase atual de demonstração, o acesso à plataforma é gratuito e não são cobrados
            quaisquer valores. Não são recolhidos dados de pagamento nem processados através de
            qualquer prestador de pagamentos.
          </p>
          <p>
            Quando existirem planos pagos, esta secção será atualizada com as condições de
            faturação, cancelamento e o prestador de pagamentos utilizado, e os clientes serão
            notificados com antecedência razoável antes de qualquer cobrança.
          </p>

          <h2 id="uso">5. Utilização aceitável do scanner</h2>
          <p>
            O scanner só pode ser usado sobre domínios que sejam propriedade da organização
            registada na conta, ou sobre domínios de terceiros para os quais tenha obtido
            autorização expressa para realizar testes de segurança. É expressamente proibido usar
            a plataforma para:
          </p>
          <ul>
            <li>Analisar domínios ou infraestrutura de terceiros sem autorização;</li>
            <li>Tentar contornar limites de utilização, quotas ou controlos de acesso da plataforma;</li>
            <li>Usar os resultados do scanner para preparar ou facilitar ataques informáticos;</li>
            <li>Submeter a plataforma a engenharia inversa, exceto na medida permitida por lei imperativa.</li>
          </ul>
          <p>
            Reservamo-nos o direito de suspender contas que violem esta secção, sem prejuízo de
            outras medidas legais aplicáveis.
          </p>

          <h2 id="conteudo">6. Conteúdo e documentos gerados</h2>
          <p>
            Os documentos, planos de remediação e relatórios gerados pela plataforma são
            ferramentas de apoio, produzidos com base nos dados fornecidos pelo cliente e, quando
            aplicável, com o auxílio de modelos de inteligência artificial. Não constituem
            aconselhamento jurídico nem garantia de conformidade integral com a NIS2 ou com
            qualquer outra legislação, e devem ser revistos por uma pessoa responsável na empresa
            antes de serem formalizados, assinados ou submetidos a uma autoridade.
          </p>
          <p>
            A precisão dos resultados do scanner depende de fontes de dados públicas e de
            terceiros (por exemplo, bases de vulnerabilidades e serviços de análise de rede) e
            pode não refletir o estado real da infraestrutura em cada momento.
          </p>

          <h2 id="responsabilidade">7. Limitação de responsabilidade</h2>
          <p>
            Na máxima medida permitida por lei, a CISPLAN não garante que a utilização da
            plataforma resulte, por si só, no cumprimento integral da NIS2 ou na isenção de
            coimas, e não se responsabiliza por decisões tomadas exclusivamente com base nos
            resultados do scanner, do questionário ou dos documentos gerados, sem revisão humana
            adequada. A responsabilidade da CISPLAN por danos diretos comprovadamente causados por
            incumprimento destes termos está limitada ao montante pago pelo cliente nos 12 meses
            anteriores ao facto que originou o dano.
          </p>

          <h2 id="propriedade">8. Propriedade intelectual</h2>
          <p>
            O software, o design, os modelos de documentos e o conteúdo formativo da plataforma
            são propriedade da CISPLAN ou dos seus licenciadores. Os dados que o cliente carrega
            (respostas ao questionário, dados da organização, documentos preenchidos) mantêm-se
            propriedade do cliente; a CISPLAN utiliza-os apenas para prestar o serviço, nos termos
            da <Link to="/privacidade">Política de Privacidade</Link>.
          </p>

          <h2 id="rescisao">9. Suspensão e rescisão</h2>
          <p>
            Pode encerrar a sua conta a qualquer momento através de{" "}
            <a href="mailto:geral@cisplan.com">geral@cisplan.com</a>. Podemos suspender ou
            encerrar contas em caso de violação destes termos, falta de pagamento em planos pagos,
            ou por razões legais ou de segurança, com notificação prévia sempre que possível.
          </p>

          <h2 id="alteracoes">10. Alterações a estes termos</h2>
          <p>
            Podemos atualizar estes termos para refletir alterações legislativas (nomeadamente à
            NIS2 ou ao DL 125/2025), novas funcionalidades ou correções. Alterações materiais
            serão comunicadas por email ou através da plataforma com antecedência razoável. O uso
            continuado da plataforma após a entrada em vigor das alterações constitui aceitação
            das mesmas.
          </p>

          <h2 id="lei">11. Lei aplicável e foro</h2>
          <p>
            Estes termos regem-se pela lei portuguesa. Para a resolução de qualquer litígio
            emergente destes termos, é competente o foro da comarca da sede da CISPLAN, com
            renúncia expressa a qualquer outro.
          </p>

          <h2 id="contacto">12. Contacto</h2>
          <p>
            Questões sobre estes termos: <a href="mailto:geral@cisplan.com">geral@cisplan.com</a>.
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
