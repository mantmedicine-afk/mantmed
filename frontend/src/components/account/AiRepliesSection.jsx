import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Card, Field, SaveBtn, inp } from "./ui";

const area = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-night outline-none focus:border-night";
const Toggle = ({ on, onChange, label, hint, testId }) => (
  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 p-4">
    <span><span className="block text-sm font-medium text-night">{label}</span><span className="block text-xs text-slate-600">{hint}</span></span>
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#0A192F]" data-testid={testId} />
  </label>
);

const SettingsCard = ({ s, def, onSaved }) => {
  const [f, setF] = useState(s);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(s), [s]);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { onSaved(await api.aiSaveSettings(f)); toast.success("Impostazioni MantAI Risposte salvate"); } catch (x) { toast.error(errMsg(x)); }
    setBusy(false);
  };
  return (
    <Card id="ai-settings-card" icon={Sparkles} title={`MantAI Risposte · ${s.clinic}`} text="Bozze di risposta ai messaggi del portale. Le risposte cliniche non partono mai senza la sua approvazione.">
      <form onSubmit={save} className="space-y-3">
        <Toggle on={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="Attiva MantAI Risposte per questo studio" hint="Disattivata: la messaggistica funziona come prima; l'avviso urgenze resta comunque visibile alle famiglie." testId="ai-settings-enabled" />
        <Toggle on={f.auto_admin} onChange={(v) => setF({ ...f, auto_admin: v })} label="Invio automatico risposte amministrative" hint="Solo orari, prenotazioni, costi e uso del portale, usando esclusivamente la Base di conoscenza. Se un'informazione manca, diventa una bozza." testId="ai-settings-auto-admin" />
        <Field label="Avviso urgenze nel portale (sempre visibile sopra il campo di scrittura, anche con MantAI disattivato; [telefono studio] diventa il numero della Base di conoscenza)">
          <textarea rows={4} value={f.notice_text} onChange={(e) => setF({ ...f, notice_text: e.target.value })} className={area} data-testid="ai-settings-notice-text" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <SaveBtn busy={busy} testId="ai-settings-save" disabled={f.notice_text.trim().length < 20} />
          <button type="button" onClick={() => setF({ ...f, notice_text: def })} className="text-sm text-slate-600 underline underline-offset-4" data-testid="ai-settings-notice-reset">Ripristina testo predefinito</button>
        </div>
        <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldAlert size={13} className="mt-0.5 shrink-0" /> Al fornitore AI vengono inviati solo il messaggio, al massimo gli ultimi 5 del thread, l'età del bambino e questa base di conoscenza, con nomi e recapiti sostituiti da segnaposto.</p>
      </form>
    </Card>
  );
};

const KbCard = ({ k, onSaved }) => {
  const [f, setF] = useState(k);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(k), [k]);
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const faq = (i, key, v) => setF({ ...f, faqs: f.faqs.map((x, j) => (j === i ? { ...x, [key]: v } : x)) });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { onSaved(await api.aiSaveKb({ ...f, faqs: f.faqs.filter((x) => x.q.trim() && x.a.trim()) })); toast.success("Base di conoscenza salvata"); } catch (x) { toast.error(errMsg(x)); }
    setBusy(false);
  };
  const rows = [["hours", "Orari", "Lun–Ven 9:00–13:00 e 15:00–19:00"], ["address", "Indirizzo", "Via Roma 1, Reggio Calabria"], ["phone", "Telefono per le urgenze negli orari dello studio", "0965 123456"], ["booking", "Come prenotare, spostare o annullare", "Dal Portale Paziente › Trova Specialista, oppure telefonando…"],
    ["fees", "Tariffe delle prestazioni private", "Visita specialistica 100 €…"], ["cancellation", "Politica di cancellazione", "Disdetta gratuita fino a 24 ore prima…"]];
  return (
    <Card id="ai-kb-card" icon={BookOpen} title={`Base di conoscenza · ${k.clinic}`} text="MantAI usa solo queste informazioni per le risposte amministrative. Ciò che non è scritto qui non viene mai inventato.">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {rows.map(([key, label, ph]) => <Field key={key} label={label} wide={!["address", "phone"].includes(key)}><textarea rows={["address", "phone"].includes(key) ? 2 : 3} value={f[key]} onChange={set(key)} placeholder={ph} className={area} data-testid={`ai-kb-${key}`} /></Field>)}
        <Field label="Tono"><select value={f.tone} onChange={set("tone")} className={inp} data-testid="ai-kb-tone"><option value="formale">Formale</option><option value="cordiale">Cordiale</option></select></Field>
        <Field label="Forma"><select value={f.address_form} onChange={set("address_form")} className={inp} data-testid="ai-kb-address-form"><option value="lei">Dare del Lei</option><option value="tu">Dare del tu</option></select></Field>
        <Field label="Firma in fondo alle risposte" wide><input value={f.signature} onChange={set("signature")} placeholder="Dott.ssa Rossi · Studio Pediatrico" className={inp} data-testid="ai-kb-signature" /></Field>
        <div className="space-y-2 sm:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">FAQ libere</div>
          {f.faqs.map((x, i) => (
            <div key={i} className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]" data-testid={`ai-kb-faq-${i}`}>
              <input value={x.q} onChange={(e) => faq(i, "q", e.target.value)} placeholder="Domanda" className={inp} data-testid={`ai-kb-faq-q-${i}`} />
              <input value={x.a} onChange={(e) => faq(i, "a", e.target.value)} placeholder="Risposta" className={inp} data-testid={`ai-kb-faq-a-${i}`} />
              <button type="button" onClick={() => setF({ ...f, faqs: f.faqs.filter((_, j) => j !== i) })} className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 text-rose-700" aria-label="Rimuovi FAQ" data-testid={`ai-kb-faq-del-${i}`}><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setF({ ...f, faqs: [...f.faqs, { q: "", a: "" }] })} className="flex h-10 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm text-night hover:border-night" data-testid="ai-kb-faq-add"><Plus size={14} /> Aggiungi FAQ</button>
        </div>
        <div className="sm:col-span-2"><SaveBtn busy={busy} testId="ai-kb-save">Salva base di conoscenza</SaveBtn></div>
      </form>
    </Card>
  );
};

export const AiRepliesSection = () => {
  const [st, setSt] = useState(null);
  const [kb, setKb] = useState(null);
  const [clinic, setClinic] = useState("");
  useEffect(() => {
    Promise.all([api.aiSettings(), api.aiKb()]).then(([s, k]) => { setSt(s); setKb(k.clinics); setClinic(s.clinics[0]?.clinic || ""); }).catch((e) => toast.error(errMsg(e)));
  }, []);
  if (!st || !kb) return <div className="h-40 animate-pulse rounded-[28px] bg-slate-100" />;
  const s = st.clinics.find((c) => c.clinic === clinic);
  const k = kb.find((c) => c.clinic === clinic);
  return (
    <div className="space-y-5" data-testid="ai-replies-section">
      {st.clinics.length > 1 && <div className="flex flex-wrap gap-2" role="tablist">{st.clinics.map((c) => (
        <button key={c.clinic} role="tab" aria-selected={c.clinic === clinic} onClick={() => setClinic(c.clinic)} className={`h-10 rounded-full px-4 text-sm transition-colors ${c.clinic === clinic ? "bg-night text-white" : "border border-slate-200 bg-white text-night hover:border-night"}`} data-testid={`ai-clinic-tab-${c.clinic}`}>
          {c.clinic} {c.enabled ? "· attiva" : ""}</button>))}</div>}
      {s && <SettingsCard s={s} def={st.default_notice} onSaved={(x) => setSt({ ...st, clinics: st.clinics.map((c) => (c.clinic === x.clinic ? x : c)) })} />}
      {k && <KbCard k={k} onSaved={(x) => setKb(kb.map((c) => (c.clinic === x.clinic ? x : c)))} />}
    </div>
  );
};
