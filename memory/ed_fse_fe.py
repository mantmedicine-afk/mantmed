import os
os.chdir('/app/frontend/src')
def ed(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p,a[:70]); s=s.replace(a,b)
    open(p,'w').write(s)
ed('lib/api.js',[
('  uploadAudioPart: (blob, i) => {','''  consentKind: (pid, kind, b) => http.post(`/patients/${pid}/consents/${kind}`, b).then((r) => r.data),
  fseRetry: (cid) => http.post(`/consultations/${cid}/fse/retry`).then((r) => r.data),
  obscureReport: (cid, on) => http.post(`/consultations/${cid}/obscure`, { on }).then((r) => r.data),
  fsePending: () => http.get("/fse/pending").then((r) => r.data),
  uploadAudioPart: (blob, i) => {'''),
])
ed('components/dash/PatientDialog.jsx',[
('guardian_email: "", allergies:','guardian_email: "", guardian_fiscal_code: "", allergies:'),
('guardian: f.guardian, guardian_email: mail,','guardian: f.guardian, guardian_fiscal_code: (f.guardian_fiscal_code || "").trim().toUpperCase(), guardian_email: mail,'),
('''          <Field label="Genitore / tutore"><Input value={f.guardian} onChange={set("guardian")} placeholder="es. Mamma: Nome Cognome" data-testid="patient-guardian-input" /></Field>''','''          <Field label="Genitore / tutore"><Input value={f.guardian} onChange={set("guardian")} placeholder="es. Nome Cognome" data-testid="patient-guardian-input" /></Field>
          <Field label="Codice fiscale del genitore / tutore (per il FSE)"><Input value={f.guardian_fiscal_code ?? ""} onChange={set("guardian_fiscal_code")} maxLength={16} className="font-mono uppercase" data-testid="patient-guardian-cf-input" /></Field>'''),
])
ed('components/dash/Passport.jsx',[
('const TABS = [["panoramica", "Panoramica"], ["visite", "Visite e referti"], ["bilanci", "Bilanci"], ["bodychart", "Bodychart"], ["crescita", "Passaporto sanitario"], ["privacy", "Documenti"], ["rete", "Squadra"]];',
 'const TABS = [["panoramica", "Panoramica"], ["visite", "Visite e referti"], ["crescita", "Crescita"], ["bilanci", "Bilanci"], ["bodychart", "Bodychart"], ["privacy", "Documenti e consensi"], ["rete", "Squadra"], ["passaporto", "Passaporto e FSE"]];'),
('import { BodychartHistory } from "@/components/bodychart/BodychartHistory";','import { BodychartHistory } from "@/components/bodychart/BodychartHistory";\nimport { ReportStates } from "./ReportStates";\nimport { KindConsents, ConsentBadges, MismatchNote } from "./KindConsents";\nimport { PassportFseTab } from "./PassportFseTab";'),
('''{p.consent_at ? "Consenso privacy valido" : "Consenso privacy mancante"}</button>''','''{p.consent_at ? "Consenso privacy valido" : "Consenso privacy mancante"}</button>
                  <ConsentBadges p={p} onOpen={() => setTab("privacy")} />'''),
('{tab === "visite" && <Visits items={data.consultations ?? []} payments={data.payments ?? []} onOpen={onOpenVisit} />}','{tab === "visite" && <Visits items={data.consultations ?? []} payments={data.payments ?? []} onOpen={onOpenVisit} onChanged={load} />}'),
('{tab === "privacy" && <ConsentsTab patient={p} items={data.consents ?? []} onChange={load} />}','{tab === "privacy" && <ConsentsTab patient={p} items={data.consents ?? []} onChange={load} />}\n              {tab === "passaporto" && <PassportFseTab data={data} onEdit={onEdit} onTab={setTab} />}'),
('const Visits = ({ items, payments = [], onOpen }) => {','const Visits = ({ items, payments = [], onOpen, onChanged }) => {'),
('''              <AILabel provenance={c.ai_provenance} view="doctor" className="mt-2" testId={`passport-visit-ai-label-${c.id}`} />''','''              <AILabel provenance={c.ai_provenance} view="doctor" className="mt-2" testId={`passport-visit-ai-label-${c.id}`} />
              <ReportStates c={c} onChanged={onChanged} />'''),
('              <PortalToggle c={c} />\n',''),
('{c.clinic || "Consultazione libera"}','{c.clinic || "Sede da indicare"}'),
('''      {items.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5 text-sm" data-testid={`consent-row-${c.id}`}>''','''      {items.filter((c) => !c.kind || c.kind === "privacy").map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5 text-sm" data-testid={`consent-row-${c.id}`}>'''),
('''            <div className="text-[var(--fg2)]">{c.version} · {new Date(c.signed_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} · email {c.email_reports ? "sì" : "no"}</div>''','''            <div className="text-[var(--fg2)]">{c.version} · {new Date(c.signed_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} · email {c.email_reports ? "sì" : "no"}</div>
            <MismatchNote c={c} />'''),
('''      <div className="pt-3">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">''','''      <KindConsents patient={patient} items={items} onChange={onChange} revoke={revoke} />
      <div className="pt-3">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">'''),
])
s=open('components/dash/Passport.jsx').read()
a=s.index('const PortalToggle = '); b=s.index('const Visits = ')
s=s[:a]+s[b:]
open('components/dash/Passport.jsx','w').write(s)
print('ok')
