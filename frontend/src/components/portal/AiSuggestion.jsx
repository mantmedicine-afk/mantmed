import { useState } from "react";
import { Sparkles } from "lucide-react";

export const AiSuggestion = ({ text, onUse, onIgnore }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-3 mt-3 flex items-start gap-2 rounded-2xl border border-dashed border-[var(--hair)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--fg2)]" data-testid="ai-suggestion">
      <Sparkles size={14} className="mt-0.5 shrink-0 text-[var(--fg)]" />
      <button type="button" onClick={() => setOpen(!open)} className={`min-w-0 flex-1 text-left ${open ? "whitespace-pre-wrap" : "truncate"}`} title="Mostra tutto" data-testid="ai-suggestion-text">
        <span className="font-semibold text-[var(--fg)]">Suggerimento MantAI:</span> {text}
      </button>
      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={onUse} className="font-semibold text-[var(--fg)] hover:underline" data-testid="ai-suggestion-use">Usa</button>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={onIgnore} className="hover:text-[var(--fg)] hover:underline" data-testid="ai-suggestion-ignore">Ignora</button>
      </span>
    </div>
  );
};
