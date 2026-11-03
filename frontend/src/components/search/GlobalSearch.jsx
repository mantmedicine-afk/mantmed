import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { Search, User, FileText, CalendarClock, Loader2, CornerDownLeft, ReceiptText, LayoutTemplate, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api";

const ACTIONS = [
  { id: "ricevuta", label: "Nuova ricevuta", sub: "Cassa · incassi e ricevute", to: "/app/cassa", icon: ReceiptText, keys: ["ricev", "cassa", "incass", "fattur"] },
  { id: "modello", label: "Nuovo modello di visita", sub: "Modelli e bilanci di salute", to: "/app/impostazioni?sezione=modelli", icon: LayoutTemplate, keys: ["model", "bilanc", "templat"] },
  { id: "strumenti", label: "Strumenti", sub: "Statistiche, Tessera Sanitaria, GDPR, vetrina", to: "/app/strumenti", icon: Wrench, keys: ["strument", "statist", "tessera", "gdpr", "vetrin"] },
];

const GROUP = "px-1 pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-slate-500";
const EMPTY = { patients: [], reports: [], appointments: [] };
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const dShort = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const dAppt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const age = (b) => {
  if (!b) return "";
  const m = Math.floor((Date.now() - new Date(b)) / (30.4375 * 864e5));
  return m < 24 ? `${m} mesi` : `${Math.floor(m / 12)} anni`;
};
const fold = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Evidenzia le parole cercate nel testo (senza HTML iniettato). */
const Hl = ({ text, q }) => {
  const words = fold(q).split(/\s+/).filter((w) => w.length > 1);
  if (!text || !words.length) return text || null;
  const f = fold(text);
  const marks = [];
  words.forEach((w) => { let i = f.indexOf(w); while (i >= 0) { marks.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } });
  if (!marks.length) return text;
  marks.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  marks.forEach(([a, b], k) => {
    if (a < pos) return;
    out.push(text.slice(pos, a), createElement("mark", { key: k, className: "rounded bg-[#DCE6FF] px-0.5 text-night" }, text.slice(a, b)));
    pos = b;
  });
  out.push(text.slice(pos));
  return out;
};

const ResultRow = ({ value, onSelect, icon: Icon, title, suffix, sub, meta, testId, q, hlSub = false }) => (
  <Command.Item value={value} onSelect={onSelect} className="group flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-night data-[selected=true]:bg-night data-[selected=true]:text-white" data-testid={testId}>
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F1F4FA] text-night group-data-[selected=true]:bg-white/10 group-data-[selected=true]:text-white"><Icon size={16} /></span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium"><Hl text={title} q={q} />{suffix && <span className="font-normal opacity-70"> · {suffix}</span>}</span>
      {sub && <span className="block truncate text-xs text-slate-500 group-data-[selected=true]:text-slate-300">{hlSub ? <Hl text={sub} q={q} /> : sub}</span>}
    </span>
    {meta && <span className="shrink-0 text-xs text-slate-500 group-data-[selected=true]:text-slate-300">{meta}</span>}
    <CornerDownLeft size={14} className="hidden shrink-0 opacity-60 group-data-[selected=true]:block" />
  </Command.Item>
);

/**
 * Ricerca globale (pulsante nella top bar + Cmd/Ctrl+K): pazienti, referti passati (testo delle diagnosi), appuntamenti futuri.
 * onPatient(id), onReport(id), onAppointment(appt) gestiscono la navigazione.
 */
export const GlobalSearch = ({ onPatient, onReport, onAppointment }) => {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const ctrl = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (!open) { setQ(""); setRes(EMPTY); } }, [open]);

  useEffect(() => {
    const term = q.trim();
    ctrl.current?.abort();
    if (term.length < 2) { setRes(EMPTY); setLoading(false); return undefined; }
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    const t = setTimeout(() => {
      api.search(term, c.signal).then((r) => { if (!c.signal.aborted) { setRes(r); setLoading(false); } }).catch(() => { if (!c.signal.aborted) setLoading(false); });
    }, 160);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);

  const go = useCallback((fn) => { setOpen(false); setTimeout(fn, 0); }, []);
  const total = res.patients.length + res.reports.length + res.appointments.length;
  const term = q.trim();

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-500 transition-colors hover:border-night hover:text-night lg:w-[340px] lg:px-4" data-testid="global-search-trigger" aria-label="Cerca pazienti, referti e appuntamenti">
        <Search size={16} className="shrink-0" />
        <span className="hidden flex-1 truncate text-left lg:block">Cerca pazienti, referti, appuntamenti…</span>
        <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 lg:block">{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12vh] w-[calc(100vw-1.5rem)] max-w-2xl translate-y-0 gap-0 overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-[0_30px_80px_-20px_rgba(10,25,47,0.45)] [&>button]:hidden" data-testid="global-search-dialog" data-lenis-prevent>
          <DialogTitle className="sr-only">Ricerca globale</DialogTitle>
          <DialogDescription className="sr-only">Cerca pazienti, referti passati e appuntamenti futuri</DialogDescription>
          <Command shouldFilter={false} loop className="flex max-h-[70vh] min-w-0 flex-col">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5">
              {loading ? <Loader2 size={18} className="shrink-0 animate-spin text-slate-400" /> : <Search size={18} className="shrink-0 text-slate-400" />}
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Paziente (nome o codice fiscale), diagnosi, azione…" className="h-16 w-full bg-transparent text-base text-night outline-none placeholder:text-slate-400" data-testid="global-search-input" />
              <kbd className="hidden rounded-md border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 sm:block">Esc</kbd>
            </div>
            <Command.List className="overflow-y-auto overscroll-contain p-2">
              {term.length < 2 && <div className="px-4 py-8 text-center text-sm text-slate-500" data-testid="global-search-hint">Scriva almeno 2 lettere. Cerca nei nomi dei pazienti, nel testo delle diagnosi dei referti e negli appuntamenti futuri.</div>}
              {term.length >= 2 && !loading && total === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500" data-testid="global-search-empty">Nessun risultato per “{term}”.</div>}
              {ACTIONS.filter((a) => term.length < 2 || fold(a.label).includes(fold(term)) || a.keys.some((k) => fold(term).includes(k))).length > 0 && (
                <Command.Group heading="Azioni" className={GROUP} data-testid="global-search-group-actions">
                  {ACTIONS.filter((a) => term.length < 2 || fold(a.label).includes(fold(term)) || a.keys.some((k) => fold(term).includes(k))).map((a) => (
                    <ResultRow key={a.id} value={`a-${a.id}`} icon={a.icon} onSelect={() => go(() => nav(a.to))} testId={`global-search-action-${a.id}`} title={a.label} sub={a.sub} />
                  ))}
                </Command.Group>
              )}
              {res.patients.length > 0 && (
                <Command.Group heading="Pazienti" className={GROUP} data-testid="global-search-group-patients">
                  {res.patients.map((p) => (
                    <ResultRow key={p.id} value={`p-${p.id}`} icon={User} onSelect={() => go(() => onPatient(p.id))} testId={`global-search-patient-${p.id}`}
                      q={term} title={p.name} sub={[age(p.birth_date), p.consent ? "consenso valido" : "consenso da registrare"].filter(Boolean).join(" · ")} meta="Apri cartella" />
                  ))}
                </Command.Group>
              )}
              {res.reports.length > 0 && (
                <Command.Group heading="Referti passati" className={GROUP} data-testid="global-search-group-reports">
                  {res.reports.map((r) => (
                    <ResultRow key={r.id} value={`r-${r.id}`} icon={FileText} onSelect={() => go(() => onReport(r.id))} testId={`global-search-report-${r.id}`}
                      q={term} hlSub title={r.patient_name} suffix={r.motivo || "Visita"}
                      sub={r.diagnosi ? `Diagnosi: ${r.diagnosi}` : "Diagnosi non riportata"} meta={dShort(r.created_at)} />
                  ))}
                </Command.Group>
              )}
              {res.appointments.length > 0 && (
                <Command.Group heading="Appuntamenti futuri" className={GROUP} data-testid="global-search-group-appointments">
                  {res.appointments.map((a) => (
                    <ResultRow key={a.id} value={`a-${a.id}`} icon={CalendarClock} onSelect={() => go(() => onAppointment(a))} testId={`global-search-appt-${a.id}`}
                      q={term} title={a.patient_name} sub={[a.visit_type, a.clinic].filter(Boolean).join(" · ")} meta={`${dAppt(a.date)} · ${a.time}`} />
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500">
              <span><kbd className="font-mono">↑↓</kbd> per scegliere</span><span><kbd className="font-mono">↵</kbd> per aprire</span><span className="ml-auto">I dati clinici restano cifrati: la ricerca avviene solo sui suoi pazienti</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
};
