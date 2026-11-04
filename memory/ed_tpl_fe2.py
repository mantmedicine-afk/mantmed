import os
os.chdir('/app/frontend/src')
p='components/dash/ConsultationOverlay.jsx'; s=open(p).read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)>=1, a[:80]; s=s.replace(a,b) if cnt==0 else s.replace(a,b,cnt)
rep('import { useLiveChecklist, pickChecklist } from "./useLiveChecklist";','import { useLiveChecklist, toChecklist, autoTemplate } from "./useLiveChecklist";')
rep('''  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
''','')
rep('  const live = useLiveChecklist({ models, model, demo: cfg.demo });','  const models = templates.map(toChecklist);\n  const live = useLiveChecklist({ models, model: tplId, demo: cfg.demo });')
rep('''      api.checklists().then((xs) => { setModels(xs); setModel(pickChecklist(xs, `${patient?.visit_type ?? ""} ${patient?.reason ?? ""}`)?.id ?? ""); }).catch(() => setModels([]));
''','')
rep('''  useEffect(() => { if (models.length) setModel(pickChecklist(models, `${sel?.visit_type ?? ""} ${sel?.reason ?? ""}`)?.id ?? ""); }, [sel?.id, sel?.name, models.length]); // eslint-disable-line react-hooks/exhaustive-deps
''','')
rep('''  const autoPicked = useRef(false);
  useEffect(() => {
    if (suggested && /bilancio/i.test(`${sel?.reason ?? ""} ${sel?.visit_type ?? ""}`)) { setTplId(suggested.id); autoPicked.current = true; }
    else if (autoPicked.current) { setTplId(templates.find((t) => !t.bilancio)?.id ?? templates[0]?.id ?? ""); autoPicked.current = false; }
  }, [suggested?.id, sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickTpl = (id) => { autoPicked.current = false; setTplId(id); };''','''  // Modello scelto in automatico dal motivo in agenda (bilancio per età), finché il medico non lo cambia
  const userPicked = useRef(false);
  useEffect(() => { if (open) userPicked.current = false; }, [open]);
  useEffect(() => {
    if (!templates.length || userPicked.current) return;
    const t = autoTemplate(templates, `${sel?.visit_type ?? ""} ${sel?.reason ?? ""}`, ageM);
    if (t) setTplId(t.id);
  }, [templates.length, sel?.id, sel?.name, ageM]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickTpl = (id) => { userPicked.current = true; setTplId(id); };''')
rep('...(opts.checklist ? { checklist_id: model,','...(opts.checklist ? { checklist_id: "template",')
rep('model={model} onModel={setModel}','model={tplId} onModel={pickTpl}',0)
rep('''picker={<TemplatePicker templates={templates} value={tplId} onChange={pickTpl} suggested={suggested} ageM={ageM} />}''','''picker={<ModelRow tpl={templates.find((t) => t.id === tplId)}><TemplatePicker templates={templates} value={tplId} onChange={pickTpl} suggested={suggested} ageM={ageM} /></ModelRow>}''')
rep('      {manual && picker}\n','      {picker}\n')
rep('''const TplPill = (''','''const ModelRow = ({ tpl, children }) => {
  const [open, setOpen] = useState(false);
  if (!tpl) return null;
  return (
    <div className="space-y-3" data-testid="consult-model-row">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] px-5 py-3">
        <span className="min-w-0"><span className="block text-[11px] uppercase tracking-[0.18em] text-[var(--fg2)]">Modello di visita</span><span className="block truncate font-medium" data-testid="consult-model-name">{tpl.name}</span></span>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="shrink-0 rounded-full border border-[var(--hair)] px-3 py-1.5 text-sm font-medium" data-testid="consult-model-change">{open ? "Chiudi" : "Cambia"}</button>
      </div>
      {open && <div onClick={(e) => e.target.closest("button[data-testid^='consult-template-']") && setOpen(false)}>{children}</div>}
    </div>
  );
};

const TplPill = (''')
open(p,'w').write(s); print('ok')
