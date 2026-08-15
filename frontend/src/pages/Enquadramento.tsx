/**
 * frontend/src/pages/Enquadramento.tsx
 *
 * Lista de assessments de enquadramento NIS2-PT da organização.
 * Rota: /enquadramento
 */

import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { InfoNote } from "../components/ui/InfoNote";
import { Icon } from "../components/ui/Icon";
import { Plus, Scale, ChevronRight } from "lucide-react";

const CLASS_TONE: Record<string, "ok" | "info" | "warn" | "neutral" | "bad"> = {
  essencial:              "ok",
  importante:             "info",
  a_confirmar:            "warn",
  a_confirmar_contratual: "warn",
  fora_condicional:       "neutral",
  fora_mvp:               "bad",
};

const CLASS_PT: Record<string, string> = {
  essencial:              "Essencial",
  importante:             "Importante",
  a_confirmar:            "A confirmar",
  a_confirmar_contratual: "A confirmar (contratual)",
  fora_condicional:       "Provavelmente fora",
  fora_mvp:               "Fora (Adm. Pública)",
};

export default function Enquadramento() {
  const navigate = useNavigate();
  const { data: items, isLoading } = trpc.enquadramento.list.useQuery();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <InfoNote>
        <p><strong className="text-text">O que é.</strong> Um questionário curto que determina se a sua empresa é abrangida pela NIS2 e como se classifica. A lei portuguesa (DL 125/2025) prevê várias situações — desde empresas claramente abrangidas (como Entidade Essencial ou Importante), a casos que dependem de confirmação do CNCS ou de relações contratuais, até empresas fora do âmbito. O enquadramento diz-lhe exatamente onde a sua se encaixa.</p>
        <p><strong className="text-text">Porque existe.</strong> A NIS2 não se aplica a todas as empresas da mesma forma. Depende do setor, da dimensão e do tipo de atividade. O enquadramento diz-lhe, com base na lei, qual é a sua situação — para não fazer nem a mais nem a menos do que a lei exige.</p>
        <p><strong className="text-text">Quando fazer.</strong> Logo a seguir ao perfil. Determina as suas obrigações antes de avançar.</p>
      </InfoNote>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text">Enquadramento NIS2</h1>
          <p className="text-sm text-dim mt-0.5">
            Classificação ao abrigo do DL 125/2025 (entidade essencial, importante ou fora)
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate("/enquadramento/new")}>
          <Icon as={Plus} />
          Novo enquadramento
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-dim text-sm">A carregar…</div>
      )}

      {!isLoading && items?.length === 0 && (
        <div className="text-center py-16">
          <Icon as={Scale} className="mx-auto mb-4 text-faint" size={32} />
          <p className="text-text font-medium mb-2">Nenhum enquadramento realizado</p>
          <p className="text-sm text-dim mb-6">
            O assistente faz-lhe 3 a 4 perguntas e classifica a sua empresa ao abrigo do DL 125/2025.
            Demora menos de 5 minutos.
          </p>
          <Button variant="primary" onClick={() => navigate("/enquadramento/new")}>
            Iniciar enquadramento
          </Button>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => {
            const done = item.status === "completed";
            const cls  = item.classification ?? null;
            return (
              <Card
                key={item.id}
                onClick={() => navigate(`/enquadramento/${item.id}`)}
                className="p-4 hover:border-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone={done ? "ok" : "info"}>{done ? "Concluído" : "Em curso"}</Badge>
                      <span className="text-xs text-faint">#{item.id}</span>
                    </div>

                    {cls && done && (
                      <Badge tone={CLASS_TONE[cls] ?? "neutral"}>{CLASS_PT[cls] ?? cls}</Badge>
                    )}

                    {!done && (
                      <p className="text-xs text-faint mt-1">Wizard não concluído</p>
                    )}

                    <p className="text-xs text-faint mt-1">
                      {new Date(item.createdAt).toLocaleDateString("pt-PT")}
                    </p>
                  </div>

                  {done && (
                    <Icon as={ChevronRight} className="text-faint shrink-0" />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
