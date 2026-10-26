import { BookOpenText } from "lucide-react";
import { AILabel } from "./AILabel";

/** "In parole semplici" sempre aperto (non chiudibile); con l'etichetta "riassunto" se il testo nasce da MantAI. */
export const SimpleSummary = ({ text, ai, testId, tone = "warm" }) => (
  <section className={`mt-3 rounded-2xl px-4 py-3 text-sm ${tone === "warm" ? "bg-[#FFF9E6]" : "bg-[#F3F6FF]"}`} data-testid={testId}>
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#8A5A00]"><BookOpenText size={13} aria-hidden="true" /> In parole semplici</div>
    {ai && <AILabel variant="riassunto" className="mt-2" testId={`${testId}-ai-label`} />}
    <p className="mt-2 whitespace-pre-line leading-relaxed text-[#0A192F]/80">{text}</p>
  </section>
);
