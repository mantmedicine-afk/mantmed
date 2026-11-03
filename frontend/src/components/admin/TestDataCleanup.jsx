import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, FlaskConical } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api, errMsg } from "@/lib/api";

const Stat = ({ label, value, testid }) => (
  <div className="rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-4" data-testid={testid}>
    <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)]">{label}</div>
    <div className="mt-1 font-display text-4xl text-[var(--fg)]">{value}</div>
  </div>
);

export const TestDataCleanup = () => {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState([]);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => api.testDataPreview().then((d) => { setData(d); setSel(d.all_ids); }).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);

  if (!data) return <Loader2 className="animate-spin text-[var(--fg2)]" data-testid="cleanup-loading" />;
  const visits = data.test_named + data.accounts.filter((a) => sel.includes(a.id)).reduce((s, a) => s + a.consultations, 0);
  const toggle = (id) => setSel((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const purge = async () => {
    setBusy(true);
    try {
      const r = await api.purgeTestData(sel);
      toast.success(`Eliminate ${r.consultations} visite, ${r.patients} pazienti e ${r.appointments} appuntamenti di prova`);
      setAsk(false);
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <section data-testid="cleanup-panel">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><FlaskConical size={13} /> Manutenzione database</div>
      <h1 className="mt-1 font-display text-4xl text-[var(--fg)] sm:text-5xl">Pulizia <span className="italic text-[var(--fg2)]">dati di prova</span></h1>
      <p className="mt-3 max-w-2xl text-sm text-[var(--fg2)]">Elimina le visite degli account demo selezionati e quelle di pazienti con nomi di prova (es. «TEST_», «Test», «Prova»), insieme ad audio, body chart e misurazioni collegate. Gli account demo restano attivi.</p>
      <div className="mt-6 space-y-2" data-testid="cleanup-accounts">
        {data.accounts.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent)]">
            <span className="flex items-center gap-3"><input type="checkbox" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} className="h-4 w-4 accent-[var(--accent)]" data-testid={`cleanup-account-${a.email}`} /><span className="text-sm text-[var(--fg)]">{a.email}</span></span>
            <span className="text-sm text-[var(--fg2)]" data-testid={`cleanup-count-${a.email}`}>{a.consultations} visite</span>
          </label>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visite con nome di prova" value={data.test_named} testid="cleanup-stat-named" />
        <Stat label="Pazienti di prova" value={data.patients} testid="cleanup-stat-patients" />
        <Stat label="Appuntamenti di prova" value={data.appointments} testid="cleanup-stat-appointments" />
        <Stat label="Visite da eliminare (max)" value={visits} testid="cleanup-stat-total" />
      </div>
      <button onClick={() => setAsk(true)} disabled={!visits && !data.patients && !data.appointments} className="mt-6 flex h-11 items-center gap-2 rounded-full bg-[var(--alert)] px-5 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-red-800 disabled:opacity-40" data-testid="cleanup-open-btn"><Trash2 size={15} /> Pulisci dati di prova</button>
      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent className="rounded-3xl" data-testid="cleanup-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl font-normal text-[var(--fg)]">Confermi la cancellazione?</AlertDialogTitle>
            <AlertDialogDescription>Verranno eliminate definitivamente fino a {visits} visite, {data.patients} pazienti e {data.appointments} appuntamenti di prova. L'operazione non è reversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cleanup-cancel-btn">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); purge(); }} disabled={busy} className="bg-[var(--alert)] hover:bg-red-800" data-testid="cleanup-confirm-btn">{busy ? <Loader2 size={15} className="animate-spin" /> : "Elimina"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
