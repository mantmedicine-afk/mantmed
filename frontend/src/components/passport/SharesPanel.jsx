import { useState } from "react";
import { toast } from "sonner";
import { QrCode, Ban, History, Link2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { ShareResult, SCOPES } from "./ShareDialog";
import { Label, Empty, card, day } from "./ui";

const time = (iso) => `${day(iso)} alle ${new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
const ACTION = { apertura: "ha aperto il passaporto", referto_pdf: "ha scaricato un referto PDF", importazione: "ha importato i dati nella sua cartella MantMed" };

const ShareRow = ({ s, pid, onChange }) => {
  const [qr, setQr] = useState(false);
  const [ask, setAsk] = useState(false);
  const revoke = async () => { try { await api.revokePassportShare(pid, s.id); toast.success("Accesso revocato"); onChange(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <li className="rounded-2xl bg-[var(--raised)] p-4" data-testid={`share-row-${s.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="font-medium text-[var(--fg)]">{SCOPES[s.scope]}{s.allow_import ? " · importazione consentita" : ""}</div><div className="text-xs text-[var(--fg2)]">Creata il {time(s.created_at)} · scade il {time(s.expires_at)}</div></div>
        <div className="flex gap-2">
          <button onClick={() => setQr((q) => !q)} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] px-3 text-xs font-medium text-[var(--fg)]" data-testid={`share-show-${s.id}`}><QrCode size={13} /> {qr ? "Chiudi" : "QR e codice"}</button>
          {ask ? <button onClick={revoke} className="h-9 rounded-full bg-[var(--alert)] px-3 text-xs font-semibold text-[var(--ink)]" data-testid={`share-revoke-confirm-${s.id}`}>Confermi revoca</button>
            : <button onClick={() => setAsk(true)} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--alert)] px-3 text-xs font-semibold text-[var(--alert)]" data-testid={`share-revoke-${s.id}`}><Ban size={13} /> Revoca</button>}
        </div>
      </div>
      {qr && <div className="mt-4"><ShareResult s={s} /></div>}
    </li>
  );
};

export const SharesPanel = ({ pid, shares, log, onChange }) => {
  const active = shares.filter((s) => s.status === "active");
  const ended = shares.filter((s) => s.status !== "active").slice(0, 5);
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="passport-shares-panel">
      <section className={card}>
        <Label icon={Link2}>Condivisioni attive</Label>
        {active.length ? <ul className="mt-3 space-y-2" data-testid="passport-shares-active">{active.map((s) => <ShareRow key={s.id} s={s} pid={pid} onChange={onChange} />)}</ul>
          : <div className="mt-3"><Empty text="Nessuna condivisione attiva." testId="passport-shares-empty" /></div>}
        {ended.length > 0 && <ul className="mt-3 space-y-1 text-xs text-[var(--fg2)]" data-testid="passport-shares-ended">{ended.map((s) => <li key={s.id}>{SCOPES[s.scope]} del {day(s.created_at)} · {s.status === "revoked" ? `revocata il ${day(s.revoked_at)}` : "scaduta"}</li>)}</ul>}
      </section>
      <section className={card}>
        <Label icon={History}>Registro accessi</Label>
        {log.length ? <ul className="mt-3 divide-y divide-[var(--sel)]" data-testid="passport-access-log">{log.map((a) => (
          <li key={a.id} className="py-2 text-sm" data-testid={`passport-access-${a.id}`}>
            <div className="text-[var(--fg)]"><b>{a.viewer_name || "Medico"}</b>{a.mantmed_doctor ? " (medico MantMed)" : ""} {ACTION[a.action] ?? a.action}</div>
            <div className="text-xs text-[var(--fg2)]">{time(a.at)} · condivisione "{SCOPES[a.share_scope]}" del {day(a.share_created_at)}</div>
          </li>
        ))}</ul> : <div className="mt-3"><Empty text="Nessun accesso finora." testId="passport-access-empty" /></div>}
      </section>
    </div>
  );
};
