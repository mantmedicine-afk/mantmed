import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutTemplate, Loader2, Plus, Trash2, RotateCcw, Copy, Baby } from "lucide-react";
import { BilanciDialog } from "./BilanciDialog";
import { api, errMsg } from "@/lib/api";
import { Card, inp } from "./ui";
import { TemplateFields } from "./TemplateFields";
import { MODULE_NAMES } from "@/lib/modules";

/** Modelli Visita: più modelli per medico, ciascuno legato a una cartella di specialità, con campi compilati dall'IA in refertazione. */
export const VisitTemplatesSection = ({ data }) => {
  const [bil, setBil] = useState(false);
  const [list, setList] = useState(null);
  const [curId, setCurId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const [mods, setMods] = useState([]);
  const [defMod, setDefMod] = useState("");
  useEffect(() => { api.moduleSettings().then((r) => { setDefMod(r.module_id); setMods([...new Map((r.visit_options ?? []).map((o) => [o.id, { id: o.id, nome: MODULE_NAMES[o.id] ?? o.nome }])).values()]); }).catch(() => {}); }, []);
  const pick = (t) => { setCurId(t.id); setDraft({ name: t.name, module_id: t.module_id ?? "", fields: t.fields.map((f) => ({ ...f })) }); };
  const saved = list?.find((x) => x.id === curId);
  const sig = (t) => JSON.stringify({ name: t.name, module_id: t.module_id ?? "", fields: t.fields.map(({ titolo, gruppo, hint, required }) => ({ titolo, gruppo, hint, required: Boolean(required) })) });
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
    const t = await api.createVisitTemplate(copy ? { name: `${draft.name} (copia)`, fields: draft.fields, module_id: draft.module_id } : { name: "Nuovo modello", fields: [], module_id: defMod });
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
    const b = key ? (await api.visitBilanci()).find((x) => x.key === key) : await api.visitTemplateBase(saved?.kind);
    setDraft((d) => ({ ...d, fields: b.fields }));
    toast.success(`Campi base di ${key ? b.name : b.specialty} caricati: salvi per confermare`);
  });

  const pend = (action) => run(`pend-${action}`, async () => {
    const t = await api.visitTemplatePending(curId, action);
    setList((xs) => xs.map((x) => (x.id === t.id ? t : x)));
    if (action === "add") setDraft((d) => ({ ...d, fields: [...d.fields, ...saved.pending_fields] }));
    toast.success(action === "add" ? "Nuovi campi aggiunti in fondo al modello" : "Nuovi campi ignorati");
  });

  return (
    <Card id="account-visit-templates" icon={LayoutTemplate} title="Modelli Visita"
      text="Ogni modello appartiene a una cartella di specialità e compare solo nelle visite di quella cartella. La cartella fornisce i campi fissi della specialità; il modello aggiunge i suoi campi personali per un tipo di visita (es. Prima visita, Controllo).">
      {!list || !draft ? <Loader2 className="animate-spin text-[var(--fg)]" data-testid="templates-loading" /> : (
        <div className="space-y-5">
          {[["Modelli", list.filter((t) => !t.bilancio)], ["Bilanci di salute", list.filter((t) => t.bilancio)]].filter(([, xs]) => xs.length).map(([title, xs]) => (
          <div key={title}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fg2)]">{title}</div>
          <div className="flex flex-wrap gap-2" data-testid={title === "Modelli" ? "templates-list" : "templates-bilanci-list"}>
            {xs.map((t) => (
              <button key={t.id} onClick={() => t.id !== curId && leave() && pick(t)} className={`h-10 rounded-full px-4 text-sm font-medium transition-colors ${t.id === curId ? "bg-[var(--accent)] text-[var(--ink)]" : "border border-[var(--hair)] text-[var(--fg)] hover:border-[var(--accent)]"}`} data-testid={`template-pill-${t.id}`}>{(t.id === curId ? draft.name || "Senza nome" : t.name).replace("Bilancio di salute · ", "")} <span className="opacity-60">· {t.id === curId ? draft.fields.length : t.fields.length}</span>{mods.length > 1 && MODULE_NAMES[t.module_id] && <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-70" data-testid={`template-module-${t.id}`}>{MODULE_NAMES[t.module_id]}</span>}{t.id === curId && dirty && <span className="ml-1 text-[var(--fg)]" data-testid="template-dirty-dot">•</span>}{t.pending_fields?.length > 0 && <span className="ml-1.5 rounded-full bg-[var(--sel)] px-1.5 py-0.5 text-[10px] font-semibold" title="Nuovi campi disponibili" data-testid={`template-pending-badge-${t.id}`}>+{t.pending_fields.length}</span>}</button>
            ))}
            {title === "Modelli" && <button onClick={() => leave() && create(false)} disabled={!!busy} className="flex h-10 items-center gap-1.5 rounded-full border border-dashed border-[var(--hair)] px-4 text-sm text-[var(--fg2)] hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="template-new-btn">{busy === "new" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Nuovo modello</button>}
          </div>
          </div>
          ))}
          {(list.some((t) => t.bilancio) || /pediatr|neonatolog/i.test(data?.profile?.specialty ?? "")) && (
            <button onClick={() => leave() && setBil(true)} className="flex h-10 items-center gap-1.5 rounded-full border border-[var(--hair)] bg-[var(--raised)] px-4 text-sm font-medium text-[var(--fg)] hover:border-[var(--accent)]" data-testid="template-bilanci-btn"><Baby size={14} /> Aggiungi bilanci di salute</button>
          )}
          <BilanciDialog open={bil} onClose={() => setBil(false)} onImported={(xs) => { setList(xs); }} />
          <div className="flex flex-wrap items-center gap-2">
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={`${inp} max-w-xs`} aria-label="Nome del modello" data-testid="template-name-input" />
            {mods.length > 1 && !saved?.bilancio && (
              <select value={draft.module_id ?? ""} onChange={(e) => setDraft((d) => ({ ...d, module_id: e.target.value }))} className={`${inp} max-w-[14rem]`} aria-label="Cartella del modello" data-testid="template-module-select">
                {mods.map((m) => <option key={m.id} value={m.id}>Cartella: {m.nome}</option>)}
              </select>
            )}
            <button onClick={() => create(true)} disabled={!!busy} className="flex h-11 items-center gap-1.5 rounded-full border border-[var(--hair)] px-4 text-sm text-[var(--fg)] hover:border-[var(--accent)]" data-testid="template-duplicate-btn"><Copy size={14} /> Duplica</button>
            <button onClick={reset} disabled={!!busy} className="flex h-11 items-center gap-1.5 rounded-full border border-[var(--hair)] px-4 text-sm text-[var(--fg)] hover:border-[var(--accent)]" data-testid="template-reset-btn">{busy === "reset" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Ripristina modello base</button>
            <button onClick={remove} disabled={!!busy || list.length < 2} className="flex h-11 items-center gap-1.5 rounded-full border border-[var(--alert)] px-4 text-sm text-[var(--alert)] hover:border-[var(--alert)] disabled:opacity-40" data-testid="template-delete-btn"><Trash2 size={14} /> Elimina</button>
          </div>
          {saved?.pending_fields?.length > 0 && (
            <div className="rounded-2xl border border-[var(--hair)] bg-[var(--sel)] p-4" data-testid="template-pending">
              <div className="font-semibold text-[var(--fg)]">Sono disponibili nuovi campi per i tuoi modelli</div>
              <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="template-pending-list">
                {saved.pending_fields.map((f) => <li key={f.id} className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs text-[var(--fg)]">{f.titolo}{f.required ? " *" : ""}</li>)}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => pend("add")} disabled={!!busy || dirty} className="h-10 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--ink)] disabled:opacity-50" data-testid="template-pending-add">Aggiungi i nuovi campi</button>
                <button onClick={() => pend("ignore")} disabled={!!busy} className="h-10 rounded-full border border-[var(--hair)] px-4 text-sm text-[var(--fg)]" data-testid="template-pending-ignore">Ignora</button>
              </div>
              {dirty && <p className="mt-2 text-xs text-[var(--fg2)]">Salvi prima le modifiche in corso.</p>}
            </div>
          )}
          <TemplateFields fields={draft.fields} onChange={(fields) => setDraft((d) => ({ ...d, fields }))} />
          <button onClick={save} disabled={!!busy || !draft.name.trim() || draft.fields.some((f) => !f.titolo.trim())} className="flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-50" data-testid="template-save-btn">
            {busy === "save" && <Loader2 size={15} className="animate-spin" />} Salva modello
          </button>
        </div>
      )}
    </Card>
  );
};
