import os
os.chdir('/app/frontend/src')
def ed(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p,a[:70]); s=s.replace(a,b)
    open(p,'w').write(s)
ed('lib/api.js',[
('  visitTemplateBase: () => http.get("/visit-templates/base").then((r) => r.data),','  visitTemplateBase: (kind) => http.get("/visit-templates/base", { params: kind ? { kind } : {} }).then((r) => r.data),\n  visitTemplatePending: (id, action) => http.post(`/visit-templates/${id}/pending`, { action }).then((r) => r.data),'),
])
ed('components/account/TemplateFields.jsx',[
('import { inp } from "./ui";','import { inp } from "./ui";\nimport { Switch } from "@/components/ui/switch";'),
('sm:grid-cols-[auto_1.2fr_0.9fr_1.4fr_auto] sm:items-center','sm:grid-cols-[auto_1.2fr_0.9fr_1.4fr_auto_auto] sm:items-center'),
('''          <div className="flex gap-1.5">
            <IconBtn onClick={() => move(i, -1)}''','''          <label className="flex items-center gap-2 text-xs text-[var(--fg2)]" data-testid={`template-field-required-${i}`}>
            <Switch checked={Boolean(f.required)} onCheckedChange={(v) => set(i, { required: v })} aria-label={`Obbligatorio: ${f.titolo || "campo"}`} data-testid={`template-field-required-switch-${i}`} /> Obbligatorio
          </label>
          <div className="flex gap-1.5">
            <IconBtn onClick={() => move(i, -1)}'''),
('{ id: Math.random().toString(36).slice(2, 12), titolo: "", gruppo: "esame_obiettivo", hint: "" }','{ id: Math.random().toString(36).slice(2, 12), titolo: "", gruppo: "esame_obiettivo", hint: "", required: false }'),
])
ed('components/account/VisitTemplatesSection.jsx',[
('fields: t.fields.map(({ titolo, gruppo, hint }) => ({ titolo, gruppo, hint }))','fields: t.fields.map(({ titolo, gruppo, hint, required }) => ({ titolo, gruppo, hint, required: Boolean(required) }))'),
('''    const b = key ? (await api.visitBilanci()).find((x) => x.key === key) : await api.visitTemplateBase();''','''    const b = key ? (await api.visitBilanci()).find((x) => x.key === key) : await api.visitTemplateBase(saved?.kind);'''),
('''  return (
    <Card id="account-visit-templates"''','''  const pend = (action) => run(`pend-${action}`, async () => {
    const t = await api.visitTemplatePending(curId, action);
    setList((xs) => xs.map((x) => (x.id === t.id ? t : x)));
    if (action === "add") setDraft((d) => ({ ...d, fields: [...d.fields, ...saved.pending_fields] }));
    toast.success(action === "add" ? "Nuovi campi aggiunti in fondo al modello" : "Nuovi campi ignorati");
  });

  return (
    <Card id="account-visit-templates"'''),
('''          <TemplateFields fields={draft.fields}''','''          {saved?.pending_fields?.length > 0 && (
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
          <TemplateFields fields={draft.fields}'''),
])
ed('components/dash/useLiveChecklist.js',[
('''// Regola per scegliere il modello dal motivo della visita in agenda
export const pickChecklist = (models, reason = "") => models.find((m) => m.id !== "acuta" && new RegExp(m.match, "i").test(reason)) ?? models.find((m) => m.id === "acuta") ?? models[0];''','''const SECTION = { anamnesi: "Anamnesi", sintomi: "Motivo e sintomi", parametri_vitali: "Parametri vitali", esame_obiettivo: "Esame obiettivo", altro: "Accertamenti e altro" };
export const toChecklist = (t) => ({ id: t.id, name: t.name, fields: (t.fields ?? []).map((f) => ({ id: f.id, section: SECTION[f.gruppo] ?? "Altro", label: f.titolo, required: Boolean(f.required), hint: f.hint })) });

const AGE_RE = /(\\d+)\\s*°?\\s*(mese|mesi|anno|anni)/i;
// Scelta automatica: bilancio per età (dal motivo o dalla data di nascita), altrimenti per tipo di visita
export const autoTemplate = (ts, reason = "", ageM = null) => {
  const bil = ts.filter((t) => t.bilancio);
  if (/bilancio/i.test(reason) && bil.length) {
    const m = reason.match(AGE_RE);
    const months = m ? Number(m[1]) * (/ann/i.test(m[2]) ? 12 : 1) : ageM;
    if (months != null) {
      const dist = (t) => (months >= t.age_from && months < t.age_to ? 0 : Math.min(Math.abs(months - t.age_from), Math.abs(months - t.age_to)));
      return bil.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    }
  }
  const kind = /certificat|sport|idoneit/i.test(reason) ? "certificato" : /ricontroll|controllo|follow/i.test(reason) ? "controllo"
    : /febbre|tosse|otite|mal di|acut|malatt|vomito|diarrea|dolore|raffreddore|faringite|eruzione/i.test(reason) ? "acuta" : "prima";
  return ts.find((t) => t.kind === kind) ?? ts.find((t) => !t.bilancio) ?? ts[0];
};

const DEMO = [[/peso/i, "7,4 kg (50° pc)"], [/lunghezza|altezza/i, "66 cm (50° pc)"], [/cranica/i, "43 cm (75° pc)"], [/vaccin/i, "Esavalente 2ª dose eseguita"],
  [/sviluppo|tappe/i, "Tappe adeguate per l'età"], [/aliment/i, "Allattamento misto, svezzamento iniziato"], [/sonno/i, "Dorme 10 ore"], [/pressione/i, "100/60 mmHg"],
  [/frequenza cardiaca/i, "82 bpm"], [/motivo|sintomo/i, "Febbre da 2 giorni"], [/diagnosi|valutazione/i, "Nella norma"], [/indicazioni|terapia/i, "Vitamina D 400 UI/die"]];
const demoText = (label) => (DEMO.find(([re]) => re.test(label))?.[1] ?? "Nella norma");'''),
('if (next) detected([{ id: next.id, preview: `${next.label}: ${next.demo}` }]);','if (next) detected([{ id: next.id, preview: demoText(next.label) }]);'),
])
ed('components/dash/LiveChecklist.jsx',[
('''        <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Scegli il modello" data-testid="live-model-picker">
          {models.map((m) => (
            <button key={m.id} role="radio" aria-checked={m.id === model} onClick={() => onModel(m.id)} className={`rounded-full px-2.5 py-1 text-xs transition-colors ${m.id === model ? "bg-[var(--sel)] font-semibold text-[var(--ink)]" : "text-[var(--fg2)] hover:text-[var(--ink)]"}`} data-testid={`live-model-${m.id}`}>{m.name}</button>
          ))}
        </div>''','''        <select value={model} onChange={(e) => onModel(e.target.value)} aria-label="Scegli il modello" className="mt-2.5 w-full rounded-lg border border-[var(--hair)] px-2.5 py-1.5 text-xs outline-none" data-testid="live-model-picker">
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>'''),
])
print('ok')
