import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Phone, MapPin, BadgeCheck, Ban } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const BADGE = { pending: ["In attesa di approvazione", "bg-amber-100 text-amber-900"], active: ["Licenza attiva", "bg-emerald-100 text-emerald-900"], suspended: ["Sospeso", "bg-slate-200 text-slate-700"] };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "—");

const DoctorCard = ({ d, onStatus, busy }) => {
  const [label, cls] = BADGE[d.status] ?? BADGE.active;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid={`admin-doctor-${d.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-medium text-night">{d.name}{d.founder && <span className="ml-2 rounded-full bg-night px-2 py-0.5 text-[10px] font-semibold text-white">Studio fondatore</span>}</div>
          <div className="text-sm text-slate-600">{d.specialty || "—"}{d.order_number ? ` · Ordine n. ${d.order_number}` : ""}</div></div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${cls}`} data-testid={`admin-doctor-status-${d.id}`}>{label}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-night sm:grid-cols-3">
        <a href={`mailto:${d.email}`} className="flex items-center gap-1.5 truncate hover:underline"><Mail size={13} /> {d.email}</a>
        <span className="flex items-center gap-1.5"><Phone size={13} /> {d.phone || "—"}</span>
        <span className="flex items-center gap-1.5 truncate"><MapPin size={13} /> {d.studio_address || "—"}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>Registrato {day(d.created_at)} · Approvato {day(d.approved_at)} · {d.patients} pazienti</span>
        {!d.founder && (
          <div className="flex gap-2">
            {d.status !== "active" && <button disabled={busy} onClick={() => onStatus(d, "active")} className="flex h-9 items-center gap-1.5 rounded-full bg-night px-4 text-xs font-semibold text-white disabled:opacity-50" data-testid={`admin-doctor-approve-${d.id}`}>{busy ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />} {d.status === "pending" ? "Approva e attiva licenza" : "Riattiva"}</button>}
            {d.status !== "suspended" && <button disabled={busy} onClick={() => onStatus(d, "suspended")} className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-xs font-medium text-night hover:border-night disabled:opacity-50" data-testid={`admin-doctor-suspend-${d.id}`}><Ban size={13} /> {d.status === "pending" ? "Rifiuta" : "Sospendi"}</button>}
          </div>
        )}
      </div>
    </div>
  );
};

export const DoctorsPanel = () => {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    api.adminDoctors().then(setItems).catch(() => setItems([]));
  }, []);
  const onStatus = async (d, status) => {
    setBusy(d.id);
    try {
      await api.setDoctorStatus(d.id, status);
      setItems((xs) => xs.map((x) => (x.id === d.id ? { ...x, status, approved_at: x.approved_at || (status === "active" ? new Date().toISOString() : null) } : x)));
      toast.success(status === "active" ? "Licenza attivata: il medico riceve un'email" : "Account sospeso");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  if (!items) return <Loader2 className="mt-6 animate-spin text-night" />;
  const pending = items.filter((d) => d.status === "pending").length;
  return (
    <div className="mt-8" data-testid="admin-doctors">
      <p className="text-sm text-slate-600" data-testid="admin-doctors-summary">{items.length} medici · <strong className="text-night">{pending} in attesa di approvazione</strong>. Ogni medico approvato ha uno studio separato con i propri pazienti.</p>
      <div className="mt-4 space-y-2">{items.map((d) => <DoctorCard key={d.id} d={d} onStatus={onStatus} busy={busy === d.id} />)}</div>
    </div>
  );
};
