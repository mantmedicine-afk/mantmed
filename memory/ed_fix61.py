import os, re
os.chdir('/app')
def ed(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p,a[:70]); s=s.replace(a,b)
    open(p,'w').write(s)
ed('frontend/src/components/dash/useLiveChecklist.js',[
('''  if (/bilancio/i.test(reason) && bil.length) {
    const m = reason.match(AGE_RE);
    const months = m ? Number(m[1]) * (/ann/i.test(m[2]) ? 12 : 1) : ageM;
    if (months != null) {
      const dist = (t) => (months >= t.age_from && months < t.age_to ? 0 : Math.min(Math.abs(months - t.age_from), Math.abs(months - t.age_to)));
      return bil.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    }
  }''','''  if (/bilancio/i.test(reason) && bil.length) {
    const m = reason.match(AGE_RE);
    const months = m ? Number(m[1]) * (/ann/i.test(m[2]) ? 12 : 1) : ageM;
    if (months == null) return bil[0];
    const dist = (t) => (months >= t.age_from && months < t.age_to ? -1 : Math.min(Math.abs(months - t.age_from), Math.abs(months - t.age_to)));
    return bil.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  }'''),
('dolore|raffreddore','dolor|raffreddore'),
])
ed('frontend/src/components/dash/LiveChecklist.jsx',[
('  const sections = [...new Set(live.fields.map((f) => f.section))];','  const sections = [...new Set(live.fields.map((f) => f.section))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));'),
('const strip = (','const ORDER = ["Motivo e sintomi", "Anamnesi", "Parametri vitali", "Esame obiettivo", "Accertamenti e altro", "Altro"];\n\nconst strip = ('),
])
ed('frontend/src/components/account/VisitTemplatesSection.jsx',[
(': { name: "Nuovo modello" });',': { name: "Nuovo modello", fields: [] });'),
('''{t.id === curId && dirty && <span className="ml-1 text-[var(--fg)]" data-testid="template-dirty-dot">•</span>}''','''{t.id === curId && dirty && <span className="ml-1 text-[var(--fg)]" data-testid="template-dirty-dot">•</span>}{t.pending_fields?.length > 0 && <span className="ml-1.5 rounded-full bg-[var(--sel)] px-1.5 py-0.5 text-[10px] font-semibold" title="Nuovi campi disponibili" data-testid={`template-pending-badge-${t.id}`}>+{t.pending_fields.length}</span>}'''),
])
ed('frontend/src/lib/api.js',[('  checklists: () => http.get("/checklists").then((r) => r.data),\n','')])
ed('backend/visit_templates.py',[
('''        spec = await specialty_of(owner)
        docs = await tdb.visit_templates.find().to_list(None)
        old_prima''','''        try:
            await _upgrade(owner)
        except Exception:
            logger.exception("Aggiornamento modelli non riuscito: verrà ritentato")
            await db.users.update_one({"_id": ObjectId(owner)}, {"$unset": {"templates_v": ""}})

    async def _upgrade(owner):
        spec = await specialty_of(owner)
        docs = await tdb.visit_templates.find().to_list(None)
        old_prima'''),
])
p='backend/live_checklist.py'; s=open(p).read()
a=s.index('def _f(fid'); b=s.index('SECTION = {')
s=s[:a]+s[b:]
a=s.index('    @r.get("/checklists")'); b=s.index('    async def detect(')
s=s[:a]+s[b:]
s=s.replace('GROUP_OF = {"Anamnesi": "anamnesi", "Motivo e sintomi": "sintomi", "Parametri": "parametri_vitali", "Esame obiettivo": "esame_obiettivo",\n            "Valutazione": "altro", "Terapia e indicazioni": "altro", "Certificato": "altro"}\n','')
open(p,'w').write(s)
print('ok')
