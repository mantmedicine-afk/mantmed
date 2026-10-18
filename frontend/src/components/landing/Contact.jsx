import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Send, Check } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const KINDS = [{ id: "beta", label: "Accesso alla beta sul campo" }, { id: "commerciale", label: "Informazioni commerciali" }];
const EMPTY = { name: "", email: "", specialty: "", city: "", message: "", consent: false, website: "" };
const input = "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-[#0A192F] outline-none transition-colors placeholder:text-slate-400 focus:border-[#0A192F]";

const Field = ({ label, children }) => (
  <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{label}</span>{children}</label>
);

const Sent = ({ onReset }) => (
  <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} className="flex min-h-[420px] flex-col items-center justify-center text-center" data-testid="lead-success">
    <span className="grid h-16 w-16 place-items-center rounded-full bg-[#0A192F] text-white"><Check size={28} /></span>
    <h3 className="mt-6 font-display text-4xl text-[#0A192F]">Richiesta ricevuta.</h3>
    <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">Grazie per l'interesse. La ricontatteremo personalmente entro pochi giorni lavorativi.</p>
    <button onClick={onReset} className="mt-6 text-sm font-medium text-[#0A192F] underline underline-offset-4" data-testid="lead-new-btn">Invia un'altra richiesta</button>
  </motion.div>
);

export const LandingContact = ({ kind, setKind }) => {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.consent) return toast.error("Serve il consenso al trattamento dei dati");
    setBusy(true);
    try { await api.sendLead({ ...f, kind }); setSent(true); setF(EMPTY); }
    catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };

  return (
    <section id="contatti" className="scroll-mt-20 bg-[#F4F5F7]" data-testid="landing-contact">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-14 px-5 py-24 lg:grid-cols-[1fr_1.3fr] lg:px-10 lg:py-32">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">Per medici specialisti</div>
          <h2 className="mt-3 font-display text-4xl leading-tight text-[#0A192F] sm:text-5xl">Porti MantMed <span className="italic text-slate-500">nel suo studio.</span></h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">Stiamo selezionando un piccolo gruppo di specialisti per la fase di test sul campo. Ci racconti come lavora: le risponderemo personalmente.</p>
          <ul className="mt-8 space-y-3 text-sm text-[#0A192F]">
            {["Configurazione guidata con i suoi studi e la sua intestazione", "Affiancamento durante le prime visite reali", "Accesso anticipato alle nuove funzioni"].map((t) => (
              <li key={t} className="flex gap-3"><Check size={16} className="mt-0.5 shrink-0" /> {t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {sent ? <Sent onReset={() => setSent(false)} /> : (
            <form onSubmit={submit} className="space-y-5" data-testid="lead-form">
              <div className="grid grid-cols-1 gap-1 rounded-full bg-[#F4F5F7] p-1 sm:grid-cols-2" role="radiogroup" aria-label="Tipo di richiesta">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)} className={`relative h-11 rounded-full px-4 text-sm font-medium transition-colors ${kind === k.id ? "text-white" : "text-slate-600 hover:text-[#0A192F]"}`} data-testid={`lead-kind-${k.id}`}>
                    {kind === k.id && <motion.span layoutId="lead-kind-pill" className="absolute inset-0 rounded-full bg-[#0A192F]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                    <span className="relative">{k.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome e cognome"><input required minLength={2} value={f.name} onChange={set("name")} className={input} placeholder="Dott. Mario Rossi" data-testid="lead-name-input" /></Field>
                <Field label="Email"><input required type="email" value={f.email} onChange={set("email")} className={input} placeholder="nome@studio.it" data-testid="lead-email-input" /></Field>
                <Field label="Specializzazione"><input required minLength={2} value={f.specialty} onChange={set("specialty")} className={input} placeholder="Pediatria, Cardiologia…" data-testid="lead-specialty-input" /></Field>
                <Field label="Città"><input value={f.city} onChange={set("city")} className={input} placeholder="Reggio Calabria" data-testid="lead-city-input" /></Field>
              </div>
              <Field label="Messaggio"><textarea rows={4} value={f.message} onChange={set("message")} maxLength={3000} className={`${input} h-auto resize-none py-3`} placeholder="Quanti studi gestisce, quante visite al giorno, cosa vorrebbe semplificare…" data-testid="lead-message-input" /></Field>
              <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} className="hidden" aria-hidden="true" name="website" />
              <label className="flex items-start gap-3 text-xs leading-relaxed text-slate-600">
                <input type="checkbox" checked={f.consent} onChange={set("consent")} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0A192F]" data-testid="lead-consent-checkbox" />
                <span>Acconsento al trattamento dei miei dati personali al solo fine di essere ricontattato in merito a questa richiesta (Reg. UE 2016/679). I dati sono conservati cifrati e non vengono ceduti a terzi.</span>
              </label>
              <button type="submit" disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0A192F] text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="lead-submit-btn">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Invia richiesta
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};
