import os, re, subprocess
os.chdir('/app')
def ed(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p,a[:70]); s=s.replace(a,b)
    open(p,'w').write(s)
ed('backend/server.py',[
('''def _norm_name(t: str) -> str:
    return " ".join(_fold(t).split())''','''def _norm_name(t: str) -> str:
    """Nome confrontabile: senza prefisso di relazione ('Mamma: …'), accenti e spazi doppi."""
    return " ".join(_fold((t or "").split(":", 1)[-1]).split())'''),
('''    if body.on:
        upd = {"obscured": True, "portal_published": False, "fse": {**(doc.get("fse") or {}), "status": "oscurato"}}
    else:
        pat = patient_out(await tdb.patients.find_one({"_id": oid(doc["patient_id"])})) if doc.get("patient_id") else {}
        upd = {"obscured": False, "fse": fse_mod.on_signed({**doc, "obscured": False}, pat) if doc.get("signed_at") else None}''','''    if body.on:
        prev = {k: v for k, v in (doc.get("fse") or {}).items() if k != "prev"}
        upd = {"obscured": True, "portal_published": False, "portal_was_published": bool(doc.get("portal_published")),
               "fse": {**prev, "status": "oscurato", "prev": prev}}
    else:
        prev = (doc.get("fse") or {}).get("prev") or {}
        pat = patient_out(await tdb.patients.find_one({"_id": oid(doc["patient_id"])})) if doc.get("patient_id") else {}
        if prev.get("status") in ("inviato", "accettato", "errore"):
            new = prev  # esito già ottenuto: nessun secondo invio
        else:
            new = fse_mod.on_signed({**doc, "obscured": False, "fse": prev}, pat) if doc.get("signed_at") else (prev or None)
        upd = {"obscured": False, "fse": new, "portal_published": bool(doc.get("portal_was_published"))}'''),
])
ed('backend/fse.py',[
('''    now = _now()
    f = dict(fse)
''','''    now = _now()
    f = dict(fse)
    if f.get("status") == "in_coda" and not patient.get("fse_consent_at"):  # consenso revocato: l'invio si ferma
        f.update(status="non_inviato", reason="Consenso all'alimentazione del FSE revocato")
        return f
'''),
])
ed('frontend/src/components/dash/KindConsents.jsx',[
('const KindForm = ({ patient, k, onSaved, onCancel }) => {\n  const [f, setF] = useState({ signer_name: patient.guardian || "",','''const plain = (t = "") => t.split(":").pop().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/\\s+/g, " ").trim();

const KindForm = ({ patient, k, onSaved, onCancel }) => {
  const [f, setF] = useState({ signer_name: (patient.guardian || "").split(":").pop().trim(),'''),
('const differs = patient.guardian && f.signer_name.trim().toLowerCase() !== patient.guardian.trim().toLowerCase();','const differs = patient.guardian && f.signer_name.trim().length > 1 && plain(f.signer_name) !== plain(patient.guardian);'),
('${p[k.field] ? "bg-[var(--sel)] text-[var(--ok)]" : "bg-[var(--raised)] text-[var(--fg2)]"}','${p[k.field] ? "bg-[var(--sel)] text-[var(--ok)]" : "border border-[var(--hair)] bg-[var(--surface)] text-[var(--fg2)]"}'),
])
ed('frontend/src/components/dash/Passport.jsx',[
('''  const [tab, setTab] = useState("panoramica");''','''  const [tab, setTabState] = useState(() => sessionStorage.getItem(`passport-tab-${patientId}`) || "panoramica");
  const setTab = (t) => { sessionStorage.setItem(`passport-tab-${patientId}`, t); setTabState(t); };'''),
])
out=subprocess.run(['grep','-rn','Passaporto sanitario','frontend/src/components','--include=*.jsx'],capture_output=True,text=True).stdout
print(out[:1500])
