import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Landing.css";

// ── Video player ─────────────────────────────────────────────────────────────
function VideoPlayer({
  id,
  videoId,
  caption,
  subCaption,
  duration,
  mini = false,
}: {
  id: string;
  videoId: string;
  caption?: string;
  subCaption?: string;
  duration?: string;
  mini?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  const isVimeo = /^\d+$/.test(videoId);
  const src = isVimeo
    ? `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0`
    : `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;

  const handleClick = () => {
    if (!videoId || videoId.includes("SEU_VIDEO")) return;
    setPlaying(true);
  };

  if (mini) {
    return (
      <div className="lesson-video" id={id} onClick={handleClick}>
        {playing ? (
          <iframe src={src} allowFullScreen allow="autoplay" />
        ) : (
          <div className="mini-placeholder">
            <div className="mini-play">▶</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="video-player" id={id} onClick={handleClick}>
      {playing ? (
        <iframe src={src} allowFullScreen allow="autoplay" />
      ) : (
        <div className="video-placeholder">
          <div className="play-btn">▶</div>
          {caption && <div className="video-caption">{caption}</div>}
          {subCaption && <div className="video-sub">{subCaption}</div>}
        </div>
      )}
      {duration && <div className="video-duration">{duration}</div>}
    </div>
  );
}

// ── Lesson accordion data ─────────────────────────────────────────────────────
const LESSONS = [
  {
    id: "item-11", num: "1.1", mod: "mod1", duration: "18 min", free: true,
    videoId: "SEU_VIDEO_11_AQUI",
    title: "Introdução à Cibersegurança e à NIS2",
    subtitle: "O que mudou com o DL 125/2025 · Porque é urgente · Panorama de ameaças",
    desc: "Compreenda por que razão a NIS2 representa uma mudança fundamental para as PMEs portuguesas e o que é exigido concretamente pelo DL 125/2025.",
    materials: [
      { type: "xlsx", label: "Ferramenta de Autoavaliação EE/EI" },
      { type: "xlsx", label: "Inventário de Ativos Críticos" },
      { type: "pdf",  label: "Checklist de Higiene Cibernética" },
      { type: "pdf",  label: "Resumo Executivo para Gestão" },
      { type: "pdf",  label: "Guia das 4 Semanas para Começar" },
    ],
  },
  {
    id: "item-12", num: "1.2", mod: "mod1", duration: "22 min", free: false,
    videoId: "SEU_VIDEO_12_AQUI",
    title: "Âmbito e Classificação de Entidades",
    subtitle: "EE vs EI · CAEs abrangidos · Regra de dimensão · Registo CNCS",
    desc: "Determine em 5 minutos se a sua empresa é Entidade Essencial, Importante ou está fora do âmbito — e o que fazer em cada caso.",
    materials: [
      { type: "xlsx", label: "Calculadora de Dimensão (UTAs)" },
      { type: "xlsx", label: "Guia de CAEs Abrangidos" },
      { type: "pdf",  label: "Fluxograma Classificação 5 Passos" },
      { type: "pdf",  label: "Checklist Registo CNCS (editável)" },
    ],
  },
  {
    id: "item-13", num: "1.3", mod: "mod1", duration: "25 min", free: false,
    videoId: "SEU_VIDEO_13_AQUI",
    title: "Responsabilidades da Gestão e Governança",
    subtitle: "Art. 20.º NIS2 · CISO · Responsabilidade pessoal · KPIs de gestão",
    desc: "O Art. 20.º NIS2 responsabiliza pessoalmente a gestão de topo. Saiba exactamente o que tem de fazer, documentar e evidenciar para cumprir este requisito.",
    materials: [
      { type: "docx", label: "Carta de Nomeação do CISO" },
      { type: "xlsx", label: "Registo de Riscos com Heatmap" },
      { type: "xlsx", label: "Dashboard de KPIs de Governança" },
      { type: "pdf",  label: "Ata de Reunião (editável)" },
    ],
  },
  {
    id: "item-14", num: "1.4", mod: "mod1", duration: "28 min", free: false,
    videoId: "SEU_VIDEO_14_AQUI",
    title: "Gestão de Riscos e Cadeia de Abastecimento",
    subtitle: "TPRM · Due Diligence fornecedores · Cláusulas contratuais NIS2",
    desc: "O MSP, o ERP cloud e o fornecedor de telecomunicações são os seus maiores riscos NIS2. Aprenda a avaliá-los, contratualizar e monitorizar de forma contínua.",
    materials: [
      { type: "xlsx", label: "Inventário de Fornecedores TPRM" },
      { type: "docx", label: "Template Cláusulas NIS2" },
      { type: "pdf",  label: "Questionário Due Diligence (editável)" },
    ],
  },
  {
    id: "item-21", num: "2.1", mod: "mod2", duration: "32 min", free: false,
    videoId: "SEU_VIDEO_21_AQUI",
    title: "Medidas Técnicas e Operacionais — As 10 Medidas NIS2",
    subtitle: "MFA · Backup imutável · Patches · EDR · Segmentação de rede",
    desc: "As 10 medidas técnicas obrigatórias do Art. 21.º NIS2, com priorização por ROI de segurança. Começa pelo MFA — a medida que bloqueia 99,9% dos ataques de conta.",
    materials: [
      { type: "xlsx", label: "Tracker das 10 Medidas NIS2" },
      { type: "xlsx", label: "Calculadora RTO/RPO Backup" },
      { type: "docx", label: "Política de Segurança da Informação" },
      { type: "pdf",  label: "Cartão de Emergência A5" },
    ],
  },
  {
    id: "item-22", num: "2.2", mod: "mod2", duration: "26 min", free: false,
    videoId: "SEU_VIDEO_22_AQUI",
    title: "Gestão e Reporte de Incidentes",
    subtitle: "Prazos 24h / 72h / 1 mês · IRP · Comunicação de crise · Forense digital",
    desc: "Quando o ataque acontecer — e vai acontecer — tem 24 horas para notificar o CNCS. Aprenda exactamente o que fazer, o que dizer e a quem, minuto a minuto.",
    materials: [
      { type: "xlsx", label: "Log de Incidentes com Timeline" },
      { type: "docx", label: "IRP — Plano de Resposta a Incidentes" },
      { type: "pdf",  label: "Templates Notificação CNCS (editável)" },
      { type: "pdf",  label: "Checklist Forense Digital (editável)" },
    ],
  },
  {
    id: "item-23", num: "2.3", mod: "mod2", duration: "24 min", free: false,
    videoId: "SEU_VIDEO_23_AQUI",
    title: "Supervisão, Auditorias e Conformidade Contínua",
    subtitle: "Regime CNCS · Coimas · Ciclo PDCA · Auto-auditoria · CAPA",
    desc: "Como o CNCS fiscaliza, o que esperar de uma auditoria e como manter a conformidade a longo prazo sem depender de consultores. A aula que fecha o dossier completo.",
    materials: [
      { type: "xlsx", label: "Dossier Conformidade — Índice Mestre" },
      { type: "xlsx", label: "Calendário Anual de Conformidade" },
      { type: "docx", label: "CAPA — Plano de Acção Correctiva" },
      { type: "pdf",  label: "Checklist Auto-Auditoria CNCS" },
    ],
  },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function Landing() {
  const [openLesson, setOpenLesson] = useState<string | null>("item-11");

  const toggleLesson = (id: string) => {
    setOpenLesson(prev => (prev === id ? null : id));
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          observer.unobserve(e.target);
        }
      }),
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".lp-page .fade-in").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lp-page">
      {/* ANNOUNCEMENT */}
      <div className="announce">
        ⚠️&nbsp; Prazo de conformidade NIS2 em Portugal:&nbsp;
        <span>DL 125/2025 já em vigor.</span>&nbsp; Coimas até <span>€10.000.000</span> por incumprimento.
      </div>

      {/* NAV */}
      <nav>
        <div className="nav-logo">NIS2 para <span>PMEs</span> em Portugal</div>
        <div className="nav-links">
          <Link to="/login" className="nav-link-ghost">Entrar</Link>
          <Link to="/register" className="nav-cta">Começar Grátis →</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-content fade-in">
          <div className="hero-badge">URGÊNCIA LEGAL · DL 125/2025</div>
          <h1>A sua empresa<br />está em conformidade<br />com a <em>NIS2</em>?</h1>
          <p className="hero-subtitle">
            A plataforma completa para PMEs portuguesas cumprirem o Decreto-Lei 125/2025 —
            scanner automático, curso certificado e remediação guiada por IA.
          </p>
          <div className="hero-proof">
            <div className="hero-proof-item">
              <span className="num">7</span>
              <span className="label">Aulas</span>
            </div>
            <div className="hero-divider" />
            <div className="hero-proof-item">
              <span className="num">35</span>
              <span className="label">Documentos</span>
            </div>
            <div className="hero-divider" />
            <div className="hero-proof-item">
              <span className="num">42</span>
              <span className="label">Controlos NIS2</span>
            </div>
            <div className="hero-divider" />
            <div className="hero-proof-item">
              <span className="num">0</span>
              <span className="label">Consultores</span>
            </div>
          </div>
          <div className="hero-cta-group">
            <Link to="/register" className="btn-primary">Começar Gratuitamente</Link>
            <a href="#scanner" className="btn-secondary">Ver como funciona ↓</a>
          </div>
        </div>

        <div className="hero-card fade-in">
          <div className="hero-card-label">O que está em risco sem conformidade</div>
          <div className="law-item">
            <div className="law-icon red">⚖️</div>
            <div className="law-text">
              <strong>Coimas até €10.000.000</strong>
              <span>Ou 2% do volume de negócios mundial — o que for mais elevado. Entidades Essenciais.</span>
            </div>
          </div>
          <div className="law-item">
            <div className="law-icon gold">👤</div>
            <div className="law-text">
              <strong>Responsabilidade pessoal dos gestores</strong>
              <span>Suspensão de funções e coimas individuais até €1.000.000 por negligência comprovada.</span>
            </div>
          </div>
          <div className="law-item">
            <div className="law-icon red">📢</div>
            <div className="law-text">
              <strong>Publicidade da sanção</strong>
              <span>O CNCS publica lista de empresas sancionadas — impacto reputacional imediato.</span>
            </div>
          </div>
          <div className="law-item">
            <div className="law-icon gold">🚫</div>
            <div className="law-text">
              <strong>Exclusão de concursos públicos</strong>
              <span>Empresas em incumprimento podem perder contratos públicos e certificações de parceiros.</span>
            </div>
          </div>
        </div>
      </section>

      {/* VIDEO TRAILER */}
      <section className="trailer-section">
        <div className="trailer-wrap fade-in">
          <div className="trailer-label">Vídeo de Apresentação da Plataforma</div>
          <VideoPlayer
            id="trailer-player"
            videoId="SEU_VIDEO_ID_AQUI"
            caption="Ver apresentação da plataforma — 4 minutos"
            subCaption="Scanner, curso e remediação IA — como funciona na prática"
            duration="4:12"
          />
        </div>
      </section>

      {/* PROBLEM */}
      <section className="problem">
        <div className="section-label">O Problema</div>
        <h2>Porque é que a maioria das PMEs não está preparada</h2>
        <p className="problem-intro">
          A NIS2 é uma diretiva europeia complexa traduzida em 125 artigos de legislação portuguesa.
          Os consultores cobram entre €15.000 e €50.000 por projecto de conformidade. A maioria das PMEs
          fica paralisada — sem saber por onde começar.
        </p>
        <div className="problem-grid">
          <div className="problem-card fade-in">
            <div className="problem-num">01</div>
            <h3>Linguagem jurídica inacessível</h3>
            <p>Os textos legais são escritos para advogados, não para gestores. Sem tradução prática, é impossível saber o que fazer concretamente.</p>
          </div>
          <div className="problem-card fade-in">
            <div className="problem-num">02</div>
            <h3>Consultores demasiado caros</h3>
            <p>Para uma PME com 50 colaboradores, um projecto de conformidade típico custa mais do que um colaborador a tempo inteiro durante um ano.</p>
          </div>
          <div className="problem-card fade-in">
            <div className="problem-num">03</div>
            <h3>Prazos que não esperam</h3>
            <p>O DL 125/2025 já está em vigor. O CNCS tem poderes de inspecção e pode auditar a qualquer momento — sem aviso prévio.</p>
          </div>
        </div>
      </section>

      {/* SOLUTION / MODULES */}
      <section className="solution" id="modules">
        <div className="solution-inner">
          <div className="solution-left fade-in">
            <div className="section-label">A Solução</div>
            <h2>Conformidade NIS2 que qualquer PME consegue implementar</h2>
            <p>
              Desenvolvemos a única plataforma NIS2 em Portugal que combina scanner automático,
              formação jurídica e remediação guiada por IA. Em vez de aprender teoria, a sua equipa
              sai com os documentos assinados, os processos definidos e as evidências que o CNCS pede.
            </p>
            <p>
              Cada aula tem materiais de apoio específicos — Excel, Word e PDF editáveis — que ficam
              permanentemente disponíveis. Uma empresa que conclua o curso terá o dossier de
              conformidade completo.
            </p>
            <div className="solution-features">
              <div className="sf-item">Scanner agentless — portos, CVEs, TLS, email e headers HTTP</div>
              <div className="sf-item">Score NIS2 0–100 por artigo, com lacunas identificadas</div>
              <div className="sf-item">Scan em lote — múltiplos domínios e IPs em simultâneo</div>
              <div className="sf-item">Descoberta automática de subdomínios via CT logs + DNS</div>
              <div className="sf-item">35 documentos editáveis prontos a implementar</div>
              <div className="sf-item">Remediação guiada por IA com plano personalizado</div>
            </div>
          </div>

          <div className="modules-grid fade-in">
            <div className="module-card">
              <div className="module-tag">Módulo 1 · Governança</div>
              <h3>Classificação, Responsabilidades e Gestão de Risco</h3>
              <div className="module-lessons">
                <span className="lesson-pill">Aula 1.1 · Introdução NIS2</span>
                <span className="lesson-pill">Aula 1.2 · Classificação EE/EI</span>
                <span className="lesson-pill">Aula 1.3 · Responsabilidades Gestão</span>
                <span className="lesson-pill">Aula 1.4 · Cadeia de Abastecimento</span>
              </div>
            </div>
            <div className="module-card">
              <div className="module-tag">Módulo 2 · Operação</div>
              <h3>Medidas Técnicas, Incidentes e Conformidade Contínua</h3>
              <div className="module-lessons">
                <span className="lesson-pill">Aula 2.1 · 10 Medidas Técnicas</span>
                <span className="lesson-pill">Aula 2.2 · Reporte de Incidentes</span>
                <span className="lesson-pill">Aula 2.3 · Auditorias CNCS</span>
              </div>
            </div>
            <div className="module-card" style={{ background: "rgba(184,134,11,0.06)", border: "1px solid rgba(184,134,11,0.2)" }}>
              <div className="module-tag" style={{ color: "#d4a017" }}>Incluído · 35 Documentos</div>
              <h3 style={{ color: "#ffffff" }}>Dossier de Conformidade Completo</h3>
              <div className="module-lessons">
                <span className="lesson-pill">12 ficheiros Excel</span>
                <span className="lesson-pill">6 documentos Word</span>
                <span className="lesson-pill">17 PDF editáveis</span>
                <span className="lesson-pill">Todos os templates NIS2</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SCANNER SECTION */}
      <section className="scanner" id="scanner">
        <div className="section-label">Plataforma SaaS</div>
        <h2>Scanner NIS2 Agentless — o diagnóstico em 5 minutos</h2>
        <p className="scanner-intro">
          Sem instalar software. Sem acesso às suas redes internas. O scanner analisa a presença
          digital da sua empresa e gera um score NIS2 detalhado por artigo — o ponto de partida
          para qualquer projecto de conformidade.
        </p>
        <div className="scanner-grid fade-in">
          <div className="scanner-card">
            <div className="scanner-icon">🔍</div>
            <h3>Exposição Digital Completa</h3>
            <p>Portos abertos, CVEs públicos, certificados TLS, SPF/DKIM/DMARC e headers HTTP (HSTS, CSP, X-Frame-Options) — a superfície de ataque completa, não apenas a rede.</p>
          </div>
          <div className="scanner-card">
            <div className="scanner-icon">🌐</div>
            <h3>Scan em Lote + Subdomínios</h3>
            <p>Descubra automaticamente os subdomínios ativos via Certificate Transparency e scane múltiplos targets em paralelo. Pro: 15 targets/batch · MSSP: 50 targets/batch.</p>
          </div>
          <div className="scanner-card">
            <div className="scanner-icon">📊</div>
            <h3>Score NIS2 por Artigo (0–100)</h3>
            <p>Pontuação por cada requisito do Art. 21.º(2) NIS2 — influenciada por portos, CVEs, email e headers. Lacunas identificadas com priorização automática por nível de risco.</p>
          </div>
          <div className="scanner-card">
            <div className="scanner-icon">🤖</div>
            <h3>Remediação Guiada por IA</h3>
            <p>Plano de remediação personalizado gerado por IA (Claude), com passos concretos para cada vulnerabilidade — do patch ao processo documental NIS2.</p>
          </div>
        </div>
        <div className="scanner-demo fade-in">
          <div className="scanner-demo-text">
            <strong>Exemplo de resultado de scan — empresa de serviços, 80 colaboradores</strong>
            <p>Score calculado em tempo real a partir de dados públicos (Shodan + Censys + DNS). Sem instalar agentes na infraestrutura.</p>
          </div>
          <div className="scanner-score-row">
            <div className="score-badge red">
              <span className="score-num">38</span>
              Art. 21.º
            </div>
            <div className="score-badge gold">
              <span className="score-num">61</span>
              Art. 20.º
            </div>
            <div className="score-badge green">
              <span className="score-num">72</span>
              Art. 23.º
            </div>
          </div>
        </div>
        <div className="scanner-cta fade-in">
          <Link to="/register" className="btn-primary">Iniciar Scanner Gratuito →</Link>
          <p className="scanner-cta-note">1 scan gratuito por mês · Sem cartão de crédito · Resultado em menos de 5 minutos</p>
        </div>
      </section>

      {/* COURSE PREVIEW */}
      <section className="course-preview" id="aulas">
        <div className="section-label">Conteúdo do Curso</div>
        <h2>O que aprende em cada aula</h2>
        <p className="course-preview-intro">
          Cada aula inclui um vídeo de explicação, uma demonstração prática dos materiais de apoio
          e os documentos prontos a usar. Clique em qualquer aula para ver um preview.
        </p>

        <div className="lessons-accordion fade-in">
          {/* Module 1 header */}
          <div className="lesson-item" style={{ background: "#0f1e38", cursor: "default" }}>
            <div className="lesson-header no-click" style={{ padding: "14px 24px" }}>
              <div className="lesson-num mod1" style={{ background: "rgba(255,255,255,0.08)", color: "#f0c040" }}>M1</div>
              <div className="lesson-info">
                <strong style={{ color: "#ffffff", fontSize: "1rem" }}>Módulo 1 — Governança e Classificação</strong>
                <span style={{ color: "#475569" }}>4 aulas · 4 horas de conteúdo · 20 documentos incluídos</span>
              </div>
            </div>
          </div>

          {LESSONS.filter(l => l.mod === "mod1").map(lesson => (
            <div
              key={lesson.id}
              id={lesson.id}
              className={`lesson-item${openLesson === lesson.id ? " open" : ""}`}
            >
              <div className="lesson-header" onClick={() => toggleLesson(lesson.id)}>
                <div className={`lesson-num ${lesson.mod}`}>{lesson.num}</div>
                <div className="lesson-info">
                  <strong>{lesson.title}</strong>
                  <span>{lesson.subtitle}</span>
                </div>
                <div className="lesson-meta">
                  <span className="lesson-duration">{lesson.duration}</span>
                  {lesson.free && <span className="lesson-pill-free">PREVIEW</span>}
                  <span className="lesson-arrow">▶</span>
                </div>
              </div>
              <div className="lesson-body">
                <div className="lesson-body-inner">
                  <VideoPlayer id={`v${lesson.num.replace(".", "")}`} videoId={lesson.videoId} mini />
                  <div className="lesson-desc">
                    <p>{lesson.desc}</p>
                    <div className="lesson-materials">
                      {lesson.materials.map((m, i) => (
                        <div key={i} className="lm-item">
                          <span className={`lm-icon ${m.type}`}>{m.type.toUpperCase()}</span>
                          {m.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Module 2 header */}
          <div className="lesson-item" style={{ background: "#0f1e38", cursor: "default" }}>
            <div className="lesson-header no-click" style={{ padding: "14px 24px" }}>
              <div className="lesson-num mod1" style={{ background: "rgba(155,0,0,0.2)", color: "#ff8a80" }}>M2</div>
              <div className="lesson-info">
                <strong style={{ color: "#ffffff", fontSize: "1rem" }}>Módulo 2 — Implementação e Operação</strong>
                <span style={{ color: "#475569" }}>3 aulas · 3 horas de conteúdo · 15 documentos incluídos</span>
              </div>
            </div>
          </div>

          {LESSONS.filter(l => l.mod === "mod2").map(lesson => (
            <div
              key={lesson.id}
              id={lesson.id}
              className={`lesson-item${openLesson === lesson.id ? " open" : ""}`}
            >
              <div className="lesson-header" onClick={() => toggleLesson(lesson.id)}>
                <div className={`lesson-num ${lesson.mod}`}>{lesson.num}</div>
                <div className="lesson-info">
                  <strong>{lesson.title}</strong>
                  <span>{lesson.subtitle}</span>
                </div>
                <div className="lesson-meta">
                  <span className="lesson-duration">{lesson.duration}</span>
                  <span className="lesson-arrow">▶</span>
                </div>
              </div>
              <div className="lesson-body">
                <div className="lesson-body-inner">
                  <VideoPlayer id={`v${lesson.num.replace(".", "")}`} videoId={lesson.videoId} mini />
                  <div className="lesson-desc">
                    <p>{lesson.desc}</p>
                    <div className="lesson-materials">
                      {lesson.materials.map((m, i) => (
                        <div key={i} className="lm-item">
                          <span className={`lm-icon ${m.type}`}>{m.type.toUpperCase()}</span>
                          {m.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MATERIALS */}
      <section className="materials">
        <div className="section-label">Os 35 Documentos Incluídos</div>
        <h2>Não é só formação. É o trabalho feito.</h2>
        <p className="materials-intro">
          Cada aula inclui materiais de apoio específicos — desde ferramentas de diagnóstico a templates
          legais prontos a assinar. Uma empresa que conclua o curso terá o dossier de conformidade que
          qualquer auditor CNCS pediria.
        </p>
        <div className="materials-grid">
          <div className="mat-category">
            <div className="mat-icon">📊</div>
            <h3>Excel — Ferramentas Operacionais</h3>
            <div className="mat-count">12 ficheiros · Fórmulas automáticas</div>
            <ul className="mat-list">
              <li>Ferramenta de autoavaliação EE/EI</li>
              <li>Registo de Riscos com heatmap 5×5</li>
              <li>Dashboard de KPIs de Governança</li>
              <li>Inventário de Fornecedores TPRM</li>
              <li>Tracker das 10 Medidas NIS2</li>
              <li>Calculadora RTO/RPO de Backup</li>
              <li>Log de Incidentes com Dashboard</li>
              <li>Dossier de Conformidade — Índice Mestre</li>
              <li>Calendário Anual de Conformidade (PDCA)</li>
            </ul>
          </div>
          <div className="mat-category red">
            <div className="mat-icon">📄</div>
            <h3>Word — Templates Legais Editáveis</h3>
            <div className="mat-count">6 documentos · Prontos a assinar</div>
            <ul className="mat-list">
              <li>Carta de Nomeação do CISO</li>
              <li>Política de Segurança da Informação (PSI)</li>
              <li>Cláusulas NIS2 para Contratos</li>
              <li>IRP — Plano de Resposta a Incidentes</li>
              <li>CAPA — Plano de Acção Correctiva</li>
            </ul>
          </div>
          <div className="mat-category gold">
            <div className="mat-icon">📋</div>
            <h3>PDF — Formulários e Checklists</h3>
            <div className="mat-count">17 ficheiros · 10 editáveis interactivos</div>
            <ul className="mat-list">
              <li>Checklist de Higiene Cibernética</li>
              <li>Formulário de Registo no CNCS</li>
              <li>Templates Notificação CNCS (3 fases)</li>
              <li>Guia Comunicação de Crise</li>
              <li>Checklist Forense Digital (cadeia custódia)</li>
              <li>Fluxograma Classificação NIS2</li>
              <li>Cartão de Emergência A5 (plastificável)</li>
              <li>Checklist Auto-Auditoria CNCS (34 itens)</li>
              <li>Questionário Due Diligence Fornecedores</li>
            </ul>
          </div>
        </div>
        <div className="materials-total fade-in">
          <p>Valor estimado dos documentos se encomendados individualmente a um consultor jurídico</p>
          <div>
            <strong>€8.000–€15.000</strong>
            <p className="mat-sub">incluídos no plano Pro e MSSP</p>
          </div>
        </div>
      </section>

      {/* PENALTIES */}
      <section className="penalties">
        <div className="penalties-inner">
          <div className="penalties-left fade-in">
            <div className="section-label">O Custo do Incumprimento</div>
            <h2>Quanto custa não agir?</h2>
            <p>
              O DL 125/2025 define um regime sancionatório desenhado para tornar o custo do incumprimento
              muito superior ao custo da implementação. O CNCS pode auditar sem aviso prévio — e as coimas
              são calculadas sobre o volume de negócios global, não apenas o português.
            </p>
            <p style={{ marginTop: 16 }}>
              Além das coimas, o incumprimento implica publicidade da sanção, responsabilidade pessoal dos
              gestores e potencial exclusão de concursos públicos e contratos com grandes empresas.
            </p>
          </div>
          <div className="penalty-cards fade-in">
            <div className="penalty-item">
              <div>
                <div className="type">Entidade Essencial (EE)</div>
                <div className="sub">Grande empresa + setor Anexo I</div>
              </div>
              <div className="amount">€10M / 2%</div>
            </div>
            <div className="penalty-item">
              <div>
                <div className="type">Entidade Importante (EI)</div>
                <div className="sub">Média empresa + setores críticos</div>
              </div>
              <div className="amount">€7M / 1,4%</div>
            </div>
            <div className="penalty-item">
              <div>
                <div className="type">Responsabilidade pessoal do gestor</div>
                <div className="sub">CEO, CISO, Administradores</div>
              </div>
              <div className="amount">€1M</div>
            </div>
            <div className="penalty-item green">
              <div>
                <div className="type">Plano Pro NIS2 PT — por mês</div>
                <div className="sub">Scanner + Curso + Remediação IA</div>
              </div>
              <div className="amount">€89</div>
            </div>
            <div className="penalty-note">
              * Valores conforme Arts. 31.º–35.º DL 125/2025. As coimas são calculadas sobre o volume de negócios anual total mundial do exercício anterior, o valor que for mais elevado.
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials">
        <div className="section-label">Quem Já Implementou</div>
        <h2>O que dizem os primeiros utilizadores</h2>
        <div className="testi-grid">
          <div className="testi-card fade-in">
            <div className="testi-stars">★★★★★</div>
            <p className="testi-text">
              "Tentei perceber a NIS2 durante meses através de artigos e webinars. Esta plataforma foi a primeira vez que saí com um plano concreto e os documentos para o executar. O scanner identificou logo 3 lacunas críticas que não sabia que existiam."
            </p>
            <div className="testi-author">
              <strong>Ana Costa</strong>
              <span>CEO · Empresa de Software · 60 colaboradores</span>
            </div>
          </div>
          <div className="testi-card fade-in">
            <div className="testi-stars">★★★★★</div>
            <p className="testi-text">
              "Como CISO de uma PME industrial, precisava de algo que traduzisse os requisitos NIS2 para a realidade de uma fábrica com OT/IT. O curso cobriu tudo e a remediação IA gerou um plano que implementei em 3 semanas."
            </p>
            <div className="testi-author">
              <strong>Carlos Mendes</strong>
              <span>CISO · Fabricante Metalúrgico · 180 colaboradores</span>
            </div>
          </div>
          <div className="testi-card fade-in">
            <div className="testi-stars">★★★★★</div>
            <p className="testi-text">
              "Usamos a plataforma para três clientes PME em simultâneo com o plano MSSP. Em vez de gastar €20.000 por cliente num consultor, gastámos €199/mês e os resultados foram equivalentes — com o dossier de conformidade completo."
            </p>
            <div className="testi-author">
              <strong>Pedro Rodrigues</strong>
              <span>Director · Consultora TI · MSP certificado</span>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="pricing-header fade-in">
          <div className="section-label" style={{ color: "#f0c040" }}>Preços e Planos</div>
          <h2>Escolha o plano para a sua empresa</h2>
          <p>Todos os planos pagos incluem acesso ao curso, documentos editáveis e actualizações legislativas.</p>
        </div>
        <div className="pricing-grid fade-in">
          {/* Free */}
          <div className="price-card">
            <div className="price-tier">Gratuito</div>
            <h3>Starter</h3>
            <p className="tagline">Para descobrir a plataforma e fazer o primeiro diagnóstico NIS2 da sua empresa.</p>
            <div className="price-amount">
              <span className="currency">€</span>
              <span className="value">0</span>
              <div className="period">Para sempre gratuito</div>
            </div>
            <ul className="price-features">
              <li className="yes">1 scan NIS2 por mês</li>
              <li className="yes">Score por artigo — portos, CVEs, TLS</li>
              <li className="yes">Módulo 1 do curso (4 aulas)</li>
              <li className="yes">10 perguntas do questionário NIS2</li>
              <li className="no">Scan em lote / descoberta de subdomínios</li>
              <li className="no">Email (SPF/DKIM/DMARC) + headers HTTP</li>
              <li className="no">Remediação IA · 35 documentos · 42 controlos</li>
            </ul>
            <Link to="/register" className="price-btn outline">Começar Grátis</Link>
          </div>

          {/* Pro — featured */}
          <div className="price-card featured">
            <div className="price-badge">MAIS POPULAR</div>
            <div className="price-tier">Empresa</div>
            <h3>Pro</h3>
            <p className="tagline">Para a empresa inteira. Scanner ilimitado, curso completo e IA de remediação.</p>
            <div className="price-amount">
              <span className="currency">€</span>
              <span className="value">89</span>
              <div className="period">por mês + IVA · Cancele quando quiser</div>
            </div>
            <ul className="price-features">
              <li className="yes">Scans ilimitados (fair-use 50/mês)</li>
              <li className="yes">Email (SPF/DKIM/DMARC) + headers HTTP</li>
              <li className="yes">Scan em lote — até 15 targets por batch</li>
              <li className="yes">Descoberta de subdomínios — até 50</li>
              <li className="yes">42 controlos NIS2 · 35 documentos editáveis</li>
              <li className="yes">Remediação guiada por IA — 75 000 tokens/mês</li>
              <li className="yes">Módulos 1 e 2 · Certificado · Actualizações</li>
            </ul>
            <Link to="/register?plan=pro" className="price-btn solid">Começar Pro →</Link>
          </div>

          {/* MSSP */}
          <div className="price-card">
            <div className="price-tier">Parceiro / MSP</div>
            <h3>MSSP</h3>
            <p className="tagline">Para consultoras e MSPs que gerem NIS2 de múltiplas organizações clientes.</p>
            <div className="price-amount">
              <span className="currency">€</span>
              <span className="value">199</span>
              <div className="period">por mês + IVA · Multi-organização</div>
            </div>
            <ul className="price-features">
              <li className="yes">Tudo do Pro</li>
              <li className="yes">Até 25 organizações geridas (€8/org adicional)</li>
              <li className="yes">Scan em lote — até 50 targets por batch</li>
              <li className="yes">Descoberta de subdomínios — até 200</li>
              <li className="yes">Dashboard multi-cliente + PDF white-label</li>
              <li className="yes">IA — 300 000 tokens/mês</li>
              <li className="yes">Suporte prioritário · Onboarding dedicado (1h)</li>
            </ul>
            <Link to="/register?plan=mssp" className="price-btn gold-btn">Começar MSSP →</Link>
          </div>

          {/* Enterprise */}
          <div className="price-card" style={{ background: "rgba(15,30,56,0.95)", border: "1px solid rgba(212,160,23,0.35)" }}>
            <div className="price-tier" style={{ color: "#d4a017" }}>Grande Organização</div>
            <h3 style={{ color: "#ffffff" }}>Enterprise</h3>
            <p className="tagline" style={{ color: "#94a3b8" }}>Para grandes empresas, organismos públicos e contratos anuais personalizados.</p>
            <div className="price-amount">
              <span className="currency" style={{ color: "#d4a017" }}>€</span>
              <span className="value" style={{ color: "#ffffff", fontSize: "2rem" }}>499</span>
              <div className="period" style={{ color: "#94a3b8" }}>/ mês + IVA · a partir de</div>
            </div>
            <ul className="price-features">
              <li className="yes">Organizações geridas ilimitadas</li>
              <li className="yes">IA sem limites mensais de tokens</li>
              <li className="yes">SLA 99,9% com suporte 24/7</li>
              <li className="yes">SSO SAML / OIDC</li>
              <li className="yes">API access completa</li>
              <li className="yes">Gestor de conta dedicado</li>
            </ul>
            <a href="mailto:hello@nis2pt.pt?subject=Plano Enterprise NIS2 PT" className="price-btn" style={{ background: "#d4a017", color: "#0f1e38", borderColor: "#d4a017", textAlign: "center", display: "block" }}>Falar Connosco →</a>
          </div>
        </div>

        <div className="guarantee fade-in">
          <div className="guarantee-icon">🛡️</div>
          <p>
            <strong>Sem compromisso.</strong> O plano gratuito não requer cartão de crédito. Os planos pagos
            podem ser cancelados a qualquer momento — sem período mínimo, sem taxas de saída. Queremos
            que a sua empresa esteja em conformidade, não apenas inscrita.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq">
        <div className="section-label">Perguntas Frequentes</div>
        <h2>Tudo o que precisa de saber antes de começar</h2>
        <div className="faq-grid">
          <div className="faq-item fade-in">
            <h3>A minha empresa é obrigada a cumprir a NIS2?</h3>
            <p>Se tiver 50 ou mais colaboradores e operar num dos sectores abrangidos pelos Anexos I ou II do DL 125/2025 (energia, saúde, transportes, IT, fabrico industrial, etc.), sim. O scanner identifica automaticamente a classificação da sua empresa.</p>
          </div>
          <div className="faq-item fade-in">
            <h3>O scanner acede à minha infraestrutura interna?</h3>
            <p>Não. O scanner é 100% agentless e analisa apenas dados públicos — o que qualquer atacante ou auditor consegue ver sobre a sua empresa a partir da internet. Não é necessário instalar nada nem dar acesso à rede interna.</p>
          </div>
          <div className="faq-item fade-in">
            <h3>Os documentos são mesmo prontos a usar?</h3>
            <p>Sim. Cada documento foi desenvolvido especificamente para a legislação portuguesa (DL 125/2025) com os campos correctos, referências legais exactas e estrutura adequada para auditorias CNCS. Basta preencher os dados da sua empresa e assinar.</p>
          </div>
          <div className="faq-item fade-in">
            <h3>Como funciona a remediação por IA?</h3>
            <p>Após o scan, a IA (Claude da Anthropic) analisa as lacunas detectadas e gera um plano de remediação personalizado para a sua empresa — com priorização por risco, passos concretos e documentação necessária. Disponível no plano Pro e MSSP.</p>
          </div>
          <div className="faq-item fade-in">
            <h3>O plano inclui actualizações futuras?</h3>
            <p>Sim. A legislação NIS2 e os requisitos técnicos do CNCS evoluirão nos próximos anos. Todos os planos pagos têm acesso ao conteúdo actualizado e à plataforma melhorada sem custos adicionais.</p>
          </div>
          <div className="faq-item fade-in">
            <h3>O plano MSSP serve para consultoras?</h3>
            <p>Sim. O plano MSSP permite gerir múltiplas organizações clientes numa única conta, gerar relatórios white-label para cada cliente, e ter a IA com limites superiores para volume de remediações mensais.</p>
          </div>
          <div className="faq-item fade-in">
            <h3>O que é o scan em lote e a descoberta de subdomínios?</h3>
            <p>O scan em lote permite analisar vários domínios e IPs ao mesmo tempo — ideal para auditorias internas ou para MSSPs que gerem múltiplos clientes. A descoberta de subdomínios encontra automaticamente todos os subdomínios ativos de um domínio via Certificate Transparency e DNS, e inicia o scan de todos em simultâneo. Disponível nos planos Pro e MSSP.</p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta">
        <h2>A conformidade NIS2 não espera.<br />O CNCS também não.</h2>
        <p>
          A sua empresa pode estar a um incidente — ou a uma auditoria — de distância de uma coima
          que pode chegar a €7.000.000. Comece com o plano gratuito hoje e saiba exactamente onde está.
        </p>
        <Link to="/register" className="btn-white">Começar Gratuitamente →</Link>
        <p className="final-cta-note">Sem cartão de crédito · Resultado em 5 minutos · Cancel a qualquer momento</p>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-logo">NIS2 para <span>PMEs</span> em Portugal</div>
        <p>© 2026 · DL 125/2025 · Todos os direitos reservados</p>
        <div className="footer-links">
          <Link to="/login">Entrar</Link>
          <Link to="/register">Registar</Link>
          <a href="mailto:suporte@nis2pt.pt">Suporte</a>
        </div>
      </footer>
    </div>
  );
}
