import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutTemplate, Loader2, Plus, Trash2, RotateCcw, Copy, Baby } from "lucide-react";
import { BilanciDialog } from "./BilanciDialog";
import { api, errMsg } from "@/lib/api";
import { Card, inp } from "./ui";
import { TemplateFields } from "./TemplateFields";

/** Modelli Visita: più modelli per medico, ciascuno con campi illimitati compilati dall'IA in refertazione. */
export const VisitTemplatesSection = ({ data }) => {
  const [bil, setBil] = useState(false);
  const [list, setList] = useState(null);
  const [curId, setCurId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const pick = (t) => { setCurId(t.id); setDraft({ name: t.name, fields: t.fields.map((f) => ({ ...f })) }); };
  const saved = list?.find((x) => x.id === curId);
  const sig = (t) => JSON.stringify({ name: t.name, fields: t.fields.map(({ titolo, gruppo, hint }) => ({ titolo, gruppo, hint })) });
  const dirty = Boolean(saved && draft && sig(saved) !== sig(draft));
  const leave = () => !dirty || window.confirm("Ci sono modifiche non salvate a questo modello: vuole scartarle?");
  useEffect(() => { api.visitTemplates().then((xs) => { setList(xs); if (xs[0]) pick(xs[0]); }).catch((e) => toast.error(errMsg(e))); }, []);

  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  const save = () => run("save", async () => {
    const t = await api.saveVisitTemplate(curId, draft);
    setList((xs) => xs.map((x) => (x.id === t.id ? t : x)));
    toast.success("Modello salvato: verrà usato dall'IA nelle prossime visite");
  });
  const create = (copy) => run("new", async () => {
    const t = await api.createVisitTemplate(copy ? { name: `${draft.name} (copia)`, fields: draft.fields } : { name: "Nuovo modello" });
    setList((xs) => [...xs, t]);
    pick(t);
  });
  const remove = () => run("del", async () => {
    if (!window.confirm(`Eliminare il modello «${draft.name}»?`)) return;
    await api.deleteVisitTemplate(curId);
    const rest = list.filter((x) => x.id !== curId);
    setList(rest);
    pick(rest[0]);
    toast.success("Modello eliminato");
  });
  const reset = () => run("reset", async () => {
    const key = saved?.bilancio;
    const b = key ? (await api.visitBilanci()).find((x) => x.key === key) : await api.visitTemplateBase();
    setDraft((d) => ({ ...d, fields: b.fields }));
    toast.success(`Campi base di ${key ? b.name : b.specialty} caricati: salvi per confermare`);
  });

  return (
    <Card id="account-visit-templates" icon={LayoutTemplate} title="Modelli Visita"
      text="Crei più modelli (es. Prima visita, Controllo, Bilancio di salute) e scelga quale usare all'avvio di ogni consultazione: l'IA compila ogni campo del modello nell'ordine indicato.">
      {!list || !draft ? <Loader2 className="animate-spin text-night" data-testid="templates-loading" /> : (
        <div className="space-y-5">
          {[["Modelli", list.filter((t) => !t.bilancio)], ["Bilanci di salute", list.filter((t) => t.bilancio)]].filter(([, xs]) => xs.length).map(([title, xs]) => (
          <div key={title}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
          <div className="flex flex-wrap gap-2" data-testid={title === "Modelli" ? "templates-list" : "templates-bilanci-list"}>
            {xs.map((t) => (
              <button key={t.id} onClick={() => t.id !== curId && leave() && pick(t)} className={`h-10 rounded-full px-4 text-sm font-medium transition-colors ${t.id === curId ? "bg-night text-white" : "border border-slate-200 text-night hover:border-night"}`} data-testid={`template-pill-${t.id}`}>{(t.id === curId ? draft.name || "Senza nome" : t.name).replace("Bilancio di salute · ", "")} <span className="opacity-60">· {t.id === curId ? draft.fields.length : t.fields.length}</span>{t.id === curId && dirty && <span className="ml-1 text-amber-300" data-testid="template-dirty-dot">•</span>}</button>
            ))}
            {title === "Modelli" && <button onClick={() => leave() && create(false)} disabled={!!busy} className="flex h-10 items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-4 text-sm text-slate-600 hover:border-night hover:text-night" data-testid="template-new-btn">{busy === "new" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Nuovo modello</button>}
          </div>
          </div>
          ))}
          {(list.some((t) => t.bilancio) || /pediatr|neonatolog/i.test(data?.profile?.specialty ?? "")) && (
            <button onClick={() => leave() && setBil(true)} className="flex h-10 items-center gap-1.5 rounded-full border border-[#C9D6FF] bg-[#F3F6FF] px-4 text-sm font-medium text-night hover:border-night" data-testid="template-bilanci-btn"><Baby size={14} /> Aggiungi bilanci di salute</button>
          )}
          <BilanciDialog open={bil} onClose={() => setBil(false)} onImported={(xs) => { setList(xs); }} />
          <div className="flex flex-wrap items-center gap-2">
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={`${inp} max-w-xs`} aria-label="Nome del modello" data-testid="template-name-input" />
            <button onClick={() => create(true)} disabled={!!busy} className="flex h-11 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm text-night hover:border-night" data-testid="template-duplicate-btn"><Copy size={14} /> Duplica</button>
            <button onClick={reset} disabled={!!busy} className="flex h-11 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm text-night hover:border-night" data-testid="template-reset-btn">{busy === "reset" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Ripristina modello base</button>
            <button onClick={remove} disabled={!!busy || list.length < 2} className="flex h-11 items-center gap-1.5 rounded-full border border-rose-200 px-4 text-sm text-rose-700 hover:border-rose-500 disabled:opacity-40" data-testid="template-delete-btn"><Trash2 size={14} /> Elimina</button>
          </div>
          <TemplateFields fields={draft.fields} onChange={(fields) => setDraft((d) => ({ ...d, fields }))} />
          <button onClick={save} disabled={!!busy || !draft.name.trim() || draft.fields.some((f) => !f.titolo.trim())} className="flex h-11 items-center gap-2 rounded-full bg-night px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50" data-testid="template-save-btn">
            {busy === "save" && <Loader2 size={15} className="animate-spin" />} Salva modello
          </button>
        </div>
      )}
    </Card>
  );
};
