import { Link } from "react-router-dom";
import { PublicNav, PublicFooter } from "../components/PublicChrome";
import "./Landing.css";
import "./Legal.css";

const SECTIONS = [
  ["responsavel", "1. Quem é o responsável pelo tratamento"],
  ["dados", "2. Que dados recolhemos"],
  ["cookies", "3. Cookies"],
  ["finalidades", "4. Para que usamos os dados e base legal"],
  ["subcontratantes", "5. Com quem partilhamos dados"],
  ["transferencias", "6. Transferências internacionais"],
  ["retencao", "7. Durante quanto tempo guardamos os dados"],
  ["seguranca", "8. Segurança"],
  ["direitos", "9. Os seus direitos"],
  ["menores", "10. Menores de idade"],
  ["alteracoes", "11. Alterações a esta política"],
  ["contacto", "12. Contacto"],
] as const;

export default function Privacidade() {
  return (
    <div className="lp-page">
      <PublicNav />

      <section className="legal-hero">
        <div className="container">
          <div className="section-label">Legal</div>
          <h1>Política de Privacidade</h1>
          <p className="legal-lede">
            Como recolhemos, usamos e protegemos os dados da sua conta e da sua organização,
            em conformidade com o RGPD.
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

          <h2 id="responsavel">1. Quem é o responsável pelo tratamento</h2>
          <p>
            A plataforma CISPLAN é operada por MAEM Tech — marca sob a qual opera um projeto em
            nome individual, Portugal — responsável pelo tratamento dos dados pessoais recolhidos
            através da plataforma disponível em cisplan.com. Para qualquer questão sobre esta
            política ou sobre os seus dados, contacte-nos através de{" "}
            <a href="mailto:geral@cisplan.com">geral@cisplan.com</a>.
          </p>

          <h2 id="dados">2. Que dados recolhemos</h2>
          <p>Recolhemos os dados que nos fornece diretamente e os que resultam do uso do serviço:</p>
          <table>
            <thead>
              <tr><th>Categoria</th><th>Exemplos</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Conta</td>
                <td>Nome, email profissional, password (guardada com hash), nome da empresa</td>
              </tr>
              <tr>
                <td>Perfil da organização</td>
                <td>
                  Denominação social, NIF/NIPC, morada da sede, sector de atividade e código CAE,
                  dimensão e volume de negócios, país(es) de operação, nome e contacto do
                  representante legal, da gestão de topo e do responsável de segurança (CISO)
                </td>
              </tr>
              <tr>
                <td>Dados de exposição digital</td>
                <td>
                  Domínio submetido para análise e resultados do scan (subdomínios, portas
                  expostas, certificados, CVEs) — dados sobre a infraestrutura da empresa, não
                  dados pessoais de terceiros
                </td>
              </tr>
              <tr>
                <td>Respostas de conformidade</td>
                <td>Respostas ao questionário de enquadramento NIS2 e estado dos itens de remediação</td>
              </tr>
              <tr>
                <td>Faturação</td>
                <td>Não aplicável na fase atual de demonstração — não são recolhidos dados de pagamento</td>
              </tr>
              <tr>
                <td>Comunicações</td>
                <td>Mensagens trocadas com o suporte e emails transacionais (confirmação de conta, recuperação de password)</td>
              </tr>
              <tr>
                <td>Dados técnicos</td>
                <td>Endereço IP, tipo de dispositivo/browser e registos de acesso, para efeitos de segurança</td>
              </tr>
            </tbody>
          </table>

          <h2 id="cookies">3. Cookies</h2>
          <p>
            Usamos apenas um cookie estritamente necessário: <code>auth_token</code>, um cookie de
            sessão <strong>httpOnly</strong> (não acessível por JavaScript no browser), com validade
            de 7 dias, usado exclusivamente para manter a sua sessão autenticada. Não usamos
            cookies de publicidade, redes sociais ou análise de terceiros, e não fazemos
            rastreamento entre sites.
          </p>

          <h2 id="finalidades">4. Para que usamos os dados e base legal</h2>
          <ul>
            <li>
              <strong>Execução do contrato</strong> (art. 6.º/1/b do RGPD) — criar e gerir a sua
              conta, executar scans, gerar o enquadramento NIS2, planos de remediação e documentos,
              prestar suporte.
            </li>
            <li>
              <strong>Obrigação legal</strong> (art. 6.º/1/c) — emissão e conservação de faturas,
              resposta a pedidos de autoridades competentes.
            </li>
            <li>
              <strong>Interesse legítimo</strong> (art. 6.º/1/f) — segurança da plataforma, prevenção
              de fraude e abuso, melhoria do serviço com dados agregados.
            </li>
            <li>
              <strong>Consentimento</strong> (art. 6.º/1/a) — comunicações de marketing opcionais,
              quando aplicável; pode retirar o consentimento a qualquer momento.
            </li>
          </ul>

          <h2 id="subcontratantes">5. Com quem partilhamos dados</h2>
          <p>
            Partilhamos dados apenas com subcontratantes estritamente necessários à prestação do
            serviço, sob contrato e com as garantias exigidas pelo RGPD:
          </p>
          <ul>
            <li>
              <strong>Railway Corporation</strong> (Estados Unidos) — alojamento da aplicação e da
              base de dados. A infraestrutura do prestador assenta em Google Cloud Platform.
            </li>
            <li>
              <strong>Anthropic</strong> (Estados Unidos) — geração de planos de remediação por
              inteligência artificial. São transmitidos os dados técnicos das vulnerabilidades
              detetadas (identificador CVE, descrição, serviço afetado), não sendo transmitidos
              dados pessoais da conta nem dados identificativos da organização.
            </li>
            <li>
              <strong>Shodan (InternetDB) e NVD/NIST</strong> — consulta de dados públicos sobre
              vulnerabilidades. Apenas o domínio ou endereço IP submetido para análise é enviado a
              estes serviços.
            </li>
            <li>
              <strong>Resend</strong> — envio de emails transacionais (confirmação de conta,
              recuperação de palavra-passe).
            </li>
          </ul>
          <p>
            Esta lista reflete os subcontratantes em utilização à data indicada. Na evolução da
            plataforma poderão ser adicionados outros prestadores — por exemplo, para armazenamento
            de documentos ou fontes adicionais de dados de segurança — sempre com as garantias
            exigidas pelo RGPD e com atualização prévia desta política.
          </p>
          <p>
            Não vendemos os seus dados pessoais nem os partilhamos para fins de publicidade de
            terceiros.
          </p>

          <h2 id="transferencias">6. Transferências internacionais</h2>
          <p>
            A plataforma está atualmente alojada em infraestrutura do prestador Railway
            Corporation, localizada nos Estados Unidos da América. O processamento por
            inteligência artificial dos dados técnicos de vulnerabilidades é efetuado pela
            Anthropic, também sediada nos Estados Unidos. Existem, por isso, transferências de
            dados pessoais para fora do Espaço Económico Europeu.
          </p>
          <p>
            Estas transferências são realizadas ao abrigo dos mecanismos previstos no Capítulo V
            do RGPD — designadamente o EU-U.S. Data Privacy Framework, quando o prestador se
            encontre certificado, ou as Cláusulas Contratuais-Tipo aprovadas pela Comissão
            Europeia (Decisão 2021/914), conforme previsto nos acordos de tratamento de dados
            disponibilizados por cada prestador.
          </p>
          <div className="legal-note">
            <p>
              <strong>Migração planeada:</strong> está prevista a migração da infraestrutura para
              um prestador com alojamento na União Europeia aquando da entrada em produção
              comercial da plataforma. Esta política será atualizada em conformidade.
            </p>
          </div>

          <h2 id="retencao">7. Durante quanto tempo guardamos os dados</h2>
          <ul>
            <li>Dados de conta e da organização: enquanto a conta estiver ativa, e até 30 dias após o pedido de eliminação, salvo prazo legal superior aplicável.</li>
            <li>Resultados de scans e planos de remediação: enquanto a conta existir, elimináveis a pedido do cliente.</li>
            <li>Registos técnicos de segurança: tipicamente até 12 meses, salvo necessidade de investigação de incidente.</li>
          </ul>

          <h2 id="seguranca">8. Segurança</h2>
          <p>
            Aplicamos medidas técnicas e organizativas adequadas ao risco, incluindo: encriptação
            em trânsito (HTTPS/TLS), cookie de sessão httpOnly, passwords guardadas com hash
            (nunca em texto simples), controlo de acesso por organização (os dados de uma empresa
            não são visíveis a outras), e acesso interno restrito à equipa que precisa dele para
            prestar o serviço.
          </p>

          <h2 id="direitos">9. Os seus direitos</h2>
          <p>Nos termos do RGPD, tem direito a:</p>
          <ul>
            <li>Aceder aos dados pessoais que temos sobre si;</li>
            <li>Solicitar a retificação de dados incorretos ou incompletos;</li>
            <li>Solicitar o apagamento dos seus dados ("direito a ser esquecido"), salvo obrigação legal de conservação;</li>
            <li>Solicitar a limitação ou opor-se ao tratamento em certas circunstâncias;</li>
            <li>Solicitar a portabilidade dos seus dados num formato estruturado;</li>
            <li>Retirar o consentimento a qualquer momento, quando o tratamento se baseie em consentimento;</li>
            <li>
              Apresentar reclamação à <strong>Comissão Nacional de Proteção de Dados (CNPD)</strong>,
              em <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer">www.cnpd.pt</a>.
            </li>
          </ul>
          <p>
            Para exercer qualquer destes direitos, contacte-nos através de{" "}
            <a href="mailto:geral@cisplan.com">geral@cisplan.com</a>. Respondemos no prazo máximo
            de um mês, conforme exigido pelo RGPD.
          </p>

          <h2 id="menores">10. Menores de idade</h2>
          <p>
            A plataforma destina-se a uso profissional por representantes de empresas e não é
            direcionada a menores de idade. Não recolhemos intencionalmente dados de menores.
          </p>

          <h2 id="alteracoes">11. Alterações a esta política</h2>
          <p>
            Podemos atualizar esta política para refletir alterações legais ou ao serviço.
            Alterações materiais serão comunicadas por email ou através da plataforma antes de
            entrarem em vigor. A data no topo desta página indica a versão mais recente.
          </p>

          <h2 id="contacto">12. Contacto</h2>
          <p>
            Questões sobre privacidade e proteção de dados:{" "}
            <a href="mailto:geral@cisplan.com">geral@cisplan.com</a>. Consulte também os nossos{" "}
            <Link to="/termos">Termos de Serviço</Link>.
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
