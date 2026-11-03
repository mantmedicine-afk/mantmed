import { AudioLines, BadgeCheck, Bot, BookOpenText, Languages, Sparkles } from "lucide-react";

const by = (n) => (n ? `${/^dott\.?\s*ssa/i.test(n) ? "dalla" : "dal"} ${n}` : "dal medico");

export const VARIANTS = {
  bozza: { icon: Sparkles, cls: "bg-[var(--sel)] text-[var(--fg)] ring-[var(--hair)]", text: () => "Bozza generata da MantAI, da verificare",
    info: "Contenuto proposto da MantAI e non ancora controllato: il medico lo rilegge, lo corregge e lo firma prima che arrivi alla famiglia." },
  verificato: { icon: BadgeCheck, cls: "bg-[var(--sel)] text-[var(--fg)] ring-[var(--hair)]", text: (n) => `Redatto con il supporto di MantAI, verificato ${by(n)}`,
    info: "Il testo è nato con l'aiuto di MantAI ed è stato riletto e approvato dal medico indicato, che ne è responsabile." },
  automatico: { icon: Bot, cls: "bg-[var(--sel)] text-[var(--fg)] ring-[var(--hair)]", text: () => "Risposta automatica di MantAI",
    info: "Risposta a domande pratiche (orari, prenotazioni, costi) scritta da MantAI con le sole informazioni fornite dallo studio, senza revisione del medico." },
  trascrizione: { icon: AudioLines, cls: "bg-[var(--raised)] text-[var(--fg)] ring-[var(--hair)]", text: () => "Trascrizione automatica, può contenere errori",
    info: "Testo ricavato in automatico dall'audio della visita: serve al medico come base di lavoro e può contenere parole trascritte male." },
  traduzione: { icon: Languages, cls: "bg-[var(--raised)] text-[var(--fg)] ring-[var(--hair)]", text: () => "Traduzione automatica di MantAI, fa fede il testo originale firmato",
    info: "Versione tradotta in automatico: in caso di differenze vale sempre il documento originale firmato dal medico." },
  riassunto: { icon: BookOpenText, cls: "bg-[var(--sel)] text-[var(--fg)] ring-[var(--hair)]", text: () => "Spiegazione semplificata generata da MantAI, non sostituisce il referto né il parere del medico",
    info: "Spiegazione in parole semplici ricavata dal referto: aiuta la lettura, ma il riferimento resta il referto firmato e il suo medico." },
};

/** Variante dell'etichetta a partire da ai_provenance (null = nessuna etichetta). */
export const variantFor = (p) => {
  if (!p || p.ai_generated !== true) return null;
  if (p.stato_revisione === "bozza_non_verificata") return p.tipo === "trascrizione" ? "trascrizione" : "bozza";
  if (p.stato_revisione === "verificato_dal_medico") return "verificato";
  if (p.stato_revisione === "invio_automatico") return p.tipo === "risposta_messaggio" ? "automatico" : "riassunto";
  return null;
};

export const LabelPill = ({ variant, reviewer, as: Tag = "span", className = "", ...rest }) => {
  const v = VARIANTS[variant];
  const Icon = v.icon;
  return (
    <Tag className={`inline-flex max-w-full items-start gap-1.5 rounded-2xl px-3 py-1.5 text-left text-xs font-semibold leading-snug ring-1 ${v.cls} ${className}`} {...rest}>
      <Icon size={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{v.text(reviewer)}</span>
    </Tag>
  );
};
