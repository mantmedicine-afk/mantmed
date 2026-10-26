import { useState } from "react";
import { Sparkles } from "lucide-react";
import { MantAIDialog } from "./MantAI";
import { LabelPill, VARIANTS, variantFor } from "./aiLabels";

/** Etichetta unica dei contenuti AI: testo sempre visibile, apre "Cos'è MantAI". Non nascondibile. */
export const AILabel = ({ variant, provenance, reviewer, view = "patient", originalHref, testId, className = "" }) => {
  const [open, setOpen] = useState(false);
  const v = variant ?? variantFor(provenance);
  if (!v) return null;
  const name = reviewer ?? provenance?.reviewer_name;
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 ${className}`} data-testid={testId ?? `ai-label-${v}`}>
      <LabelPill as="button" type="button" variant={v} reviewer={name} onClick={() => setOpen(true)}
        aria-label={`${VARIANTS[v].text(name)}. Apri la spiegazione di MantAI`} data-variant={v}
        className="cursor-pointer transition-shadow hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A192F]" />
      {v === "traduzione" && originalHref && <a href={originalHref} className="text-xs font-medium text-[#3B6CF6] underline underline-offset-2" data-testid="ai-label-original-link">Leggi il testo originale</a>}
      <MantAIDialog open={open} onOpenChange={setOpen} view={view} />
    </span>
  );
};

/** Indicatore accanto al singolo campo compilato da MantAI, finché il medico non lo conferma o lo modifica. */
export const AIFieldMark = ({ testId }) => (
  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#FFF1CC] px-2 py-0.5 align-middle text-[10px] font-semibold normal-case tracking-normal text-[#5C3A00] ring-1 ring-[#E3A92B]"
    role="note" aria-label="Campo compilato da MantAI, da verificare" title="Compilato da MantAI: scompare quando lo modifica o firma la nota" data-testid={testId}>
    <Sparkles size={10} aria-hidden="true" /> MantAI · da verificare
  </span>
);
