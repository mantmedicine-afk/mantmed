import { useState } from "react";
import { toast } from "sonner";
import { FileCheck2, FileDown, Loader2, ShieldCheck, Fingerprint } from "lucide-react";
import { errMsg } from "@/lib/api";

const CHANNEL = { studio_tablet: "Firmato su tablet in studio", portale: "Firmato dal Portale", cartaceo: "Modulo cartaceo" };

export const fmtDateTime = (iso) => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Elenco "Consensi / Documenti" firmati elettronicamente. download(id) scarica il PDF protetto. */
export const SignedDocsList = ({ docs, download, empty = "Nessun documento firmato.", testId = "signed-docs" }) => {
  const [busy, setBusy] = useState(null);
  const get = async (id) => {
    setBusy(id);
    try { await download(id); } catch (e) { toast.error(errMsg(e)); }
    setBusy(null);
  };
  if (!docs?.length) return <p className="rounded-2xl border border-dashed border-[var(--hair)] p-4 text-sm text-[var(--fg2)]" data-testid={`${testId}-empty`}>{empty}</p>;
  return (
    <ul className="space-y-2" data-testid={testId}>
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-4" data-testid={`${testId}-item-${d.id}`}>
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${d.revoked_at ? "bg-[var(--raised)] text-[var(--fg2)]" : "bg-[var(--accent)] text-[var(--ink)]"}`}><FileCheck2 size={18} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--fg)]">{d.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.revoked_at ? "bg-[var(--raised)] text-[var(--fg2)]" : "bg-[var(--sel)] text-[var(--ok)]"}`} data-testid={`${testId}-status-${d.id}`}>
                  {d.revoked_at ? `Non più valido dal ${new Date(d.revoked_at).toLocaleDateString("it-IT")}` : "Valido"}
                </span>
              </div>
              <div className="text-sm text-[var(--fg2)]">{d.signer_name} · {CHANNEL[d.channel] || d.channel} · {fmtDateTime(d.signed_at)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--fg2)]">
                <span>{d.code}</span>
                <span className="flex items-center gap-1" title={`SHA-256 ${d.file_sha256}`}><Fingerprint size={11} /> {d.file_sha256.slice(0, 16)}…</span>
                <span className="flex items-center gap-1"><ShieldCheck size={11} /> protetto da modifiche</span>
              </div>
            </div>
          </div>
          <button onClick={() => get(d.id)} disabled={busy === d.id} className="flex h-10 items-center gap-2 rounded-full border border-[var(--hair)] px-4 text-sm font-medium text-[var(--fg)] hover:border-[var(--accent)] disabled:opacity-60" data-testid={`${testId}-download-${d.id}`}>
            {busy === d.id ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF firmato
          </button>
        </li>
      ))}
    </ul>
  );
};
