import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { SignatureField } from "@/components/signature/SignaturePadModal";

export const KINDS = [
  { kind: "fse", title: "Alimentazione del Fascicolo Sanitario Elettronico", short: "Consenso FSE", field: "fse_consent_at" },
  { kind: "passaporto", title: "Passaporto sanitario / Medicina di squadra", short: "Consenso Passaporto", field: "passport_consent_at" },
];

export const ConsentBadges = ({ p, onOpen }) => (
  <>
    {KINDS.map((k) => (
      <button key={k.kind} onClick={onOpen} className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${p[k.field] ? "bg-[var(--sel)] text-[var(--ok)]" : "border border-[var(--hair)] bg-[var(--surface)] text-[var(--fg2)]"}`} data-testid={`passport-consent-badge-${k.kind}`}>
        {p[k.field] ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />} {k.short} {p[k.field] ? "valido" : "assente"}
      </button>
    ))}
  </>
);

export const MismatchNote = ({ c }) => c.signer_mismatch ? (
  <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[var(--late)]" data-testid={`consent-mismatch-${c.id}`}><AlertTriangle size={13} /> Il firmatario non corrisponde al genitore in anagrafica</div>
) : null;

const plain = (t = "") => t.split(":").pop().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const KindForm = ({ patient, k, onSaved, onCancel }) => {
  const [f, setF] = useState({ signer_name: (patient.guardian || "").split(":").pop().trim(), signer_relation: "Genitore", method: "firma_tablet", signature: null });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.consentKind(patient.id, k.kind, f); toast.success("Consenso registrato"); onSaved(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const differs = patient.guardian && f.signer_name.trim().length > 1 && plain(f.signer_name) !== plain(patient.guardian);
  return (
    <div className="mt-4 space-y-3" data-testid={`consent-kind-form-${k.kind}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={f.signer_name} onChange={(e) => setF({ ...f, signer_name: e.target.value })} placeholder="Nome e cognome di chi firma" className="rounded-xl border border-[var(--hair)] px-3 py-2.5 text-sm" data-testid={`consent-kind-signer-${k.kind}`} />
        <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className="rounded-xl border border-[var(--hair)] px-3 py-2.5 text-sm" data-testid={`consent-kind-method-${k.kind}`}>
          <option value="firma_tablet">Firma su tablet</option><option value="modulo_cartaceo">Modulo cartaceo</option>
        </select>
      </div>
      {differs && <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--late)]" data-testid={`consent-kind-mismatch-${k.kind}`}><AlertTriangle size={13} /> Il firmatario non corrisponde al genitore in anagrafica ({patient.guardian})</p>}
      {f.method === "firma_tablet" && <SignatureField value={f.signature} onChange={(v) => setF({ ...f, signature: v })} />}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || f.signer_name.trim().length < 2 || (f.method === "firma_tablet" && !f.signature)} className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50" data-testid={`consent-kind-save-${k.kind}`}>Registra consenso</button>
        <button onClick={onCancel} className="rounded-full border border-[var(--hair)] px-5 py-2.5 text-sm">Annulla</button>
      </div>
    </div>
  );
};

export const KindConsents = ({ patient, items, onChange, revoke }) => {
  const [open, setOpen] = useState("");
  return KINDS.map((k) => {
    const list = items.filter((c) => c.kind === k.kind);
    return (
      <div key={k.kind} className="rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5" data-testid={`consent-kind-${k.kind}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Consenso separato</div>
            <div className="font-display text-xl text-[var(--fg)]">{k.title}</div>
            <div className="text-sm text-[var(--fg2)]" data-testid={`consent-kind-status-${k.kind}`}>{patient[k.field] ? `Valido dal ${new Date(patient[k.field]).toLocaleDateString("it-IT")}` : "Non registrato"}</div>
          </div>
          {!open && <button onClick={() => setOpen(k.kind)} className="rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-semibold text-[var(--fg)]" data-testid={`consent-kind-register-${k.kind}`}>{patient[k.field] ? "Aggiorna" : "Registra"}</button>}
        </div>
        {open === k.kind && <KindForm patient={patient} k={k} onCancel={() => setOpen("")} onSaved={() => { setOpen(""); onChange(); }} />}
        {list.length > 0 && <ul className="mt-3 divide-y divide-[var(--sel)] text-sm" data-testid={`consent-kind-history-${k.kind}`}>
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="text-[var(--fg)]">{c.signer_name} · {c.method === "firma_tablet" ? "firma su tablet" : "modulo cartaceo"} · {new Date(c.signed_at).toLocaleDateString("it-IT")}</span><MismatchNote c={c} /></span>
              {c.revoked_at ? <span className="text-xs text-[var(--fg2)]">Revocato il {new Date(c.revoked_at).toLocaleDateString("it-IT")}</span>
                : <button onClick={() => revoke(c.id)} className="text-xs font-medium text-[var(--alert)] hover:underline" data-testid={`consent-revoke-${c.id}`}>Revoca</button>}
            </li>
          ))}
        </ul>}
      </div>
    );
  });
};
