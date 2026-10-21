import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, MonitorSmartphone, Mail, LogOut, Loader2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { TwoFactorCard } from "@/components/dash/Security";
import { Card, Field, SaveBtn, inp, day } from "./ui";

const device = (ua) => {
  if (!ua) return "Dispositivo non identificato";
  const os = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Dispositivo";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua.split("/")[0];
  return `${br} · ${os}`;
};
const ago = (iso) => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const PasswordCard = ({ data }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card id="account-password" icon={KeyRound} title="Password" text={data.password_changed_at ? `Ultima modifica il ${day(data.password_changed_at)}.` : "Usi una password lunga e diversa da quelle di altri servizi."}
      action={<button onClick={() => setOpen(true)} className="h-10 rounded-full bg-night px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5" data-testid="account-change-password-btn">Cambia password</button>}>
      <ChangePasswordDialog open={open} onClose={() => setOpen(false)} />
      <p className="text-xs text-slate-600">Ha dimenticato la password? Usi "Password dimenticata?" nella pagina di accesso.</p>
    </Card>
  );
};

const EmailCard = ({ data, onSaved }) => {
  const [f, setF] = useState({ email: data.email, password: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await api.changeEmail(f.email, f.password); onSaved({ ...data, email: r.email }); setF({ email: r.email, password: "" }); toast.success("Email di accesso aggiornata"); } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <Card id="account-email" icon={Mail} title="Email di accesso" text="Per cambiarla confermi con la password. Avviseremo anche il vecchio indirizzo.">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email"><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inp} data-testid="account-email-input" /></Field>
        <Field label="Password attuale"><input type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" className={inp} data-testid="account-email-password" /></Field>
        <div className="sm:col-span-2"><SaveBtn busy={busy} disabled={f.email.trim().toLowerCase() === data.email || !f.password} testId="account-email-save">Aggiorna email</SaveBtn></div>
      </form>
    </Card>
  );
};

const Sessions = () => {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.sessions().then(setItems).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  const act = async (id) => {
    setBusy(id);
    try { const r = id === "all" ? await api.closeOtherSessions() : await api.endSession(id); toast.success(`${r?.closed ?? 0} sessioni chiuse`); load(); } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  const list = Array.isArray(items) ? items : [];
  return (
    <Card id="account-sessions" icon={MonitorSmartphone} title="Sessioni attive" text="Dispositivi su cui il suo account è aperto. Le sessioni si chiudono anche da sole dopo un periodo di inattività."
      action={list.length > 1 && <button onClick={() => act("all")} disabled={!!busy} className="h-10 rounded-full border border-slate-200 px-4 text-sm font-medium text-night hover:border-night" data-testid="account-sessions-close-others">Chiudi le altre</button>}>
      {items === null ? <Loader2 className="animate-spin text-night" /> : (
        <ul className="divide-y divide-slate-100">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`account-session-${s.id}`}>
              <div className="min-w-0"><div className="text-sm font-medium text-night">{device(s.device)} {s.current && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Questo dispositivo</span>}</div>
                <div className="text-xs text-slate-600">Accesso {ago(s.created_at)} · ultima attività {ago(s.last_seen)}{s.ip ? ` · IP ${s.ip}` : ""}</div></div>
              {!s.current && <button onClick={() => act(s.id)} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-medium text-rose-700 hover:border-rose-300" data-testid={`account-session-end-${s.id}`}>{busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} Disconnetti</button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export const SecuritySection = ({ data, onSaved }) => {
  const { user } = useAuth();
  return (
    <div className="space-y-5">
      <PasswordCard data={data} />
      <EmailCard data={data} onSaved={onSaved} />
      {user && <div className="[&>section]:rounded-[28px]"><TwoFactorCard /></div>}
      <Sessions />
    </div>
  );
};
