import { useEffect, useState } from "react";
import { AudioLines, BookOpenText, Eye, FileSignature, KeyRound, Lock, ShieldCheck, Sparkles, Tags, Trash2, UserCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LabelPill, VARIANTS } from "./aiLabels";

const ROLE = {
  doctor: {
    tab: "Per il medico", icon: AudioLines,
    lead: "Lei parla con il paziente, MantAI scrive.",
    points: [
      ["Note strutturate dalla voce", "La conversazione della visita diventa una cartella clinica ordinata: anamnesi, esame obiettivo, diagnosi e terapia, secondo il modello che sceglie."],
      ["Meno tempo alla tastiera", "La compilazione si riduce a una rilettura: il tempo risparmiato torna alla visita."],
      ["Contatto visivo con il paziente", "Niente schermo tra lei e la famiglia: lo sguardo resta su chi ha davanti."],
      ["Lei ha sempre l'ultima parola", "Ogni nota è una bozza: la rivede, la corregge e la firma prima che diventi un referto."],
    ],
  },
  patient: {
    tab: "Per la famiglia", icon: BookOpenText,
    lead: "Referti e bilanci di salute, spiegati con parole chiare.",
    points: [
      ["In parole semplici", "MantAI rielabora il referto firmato dal medico in un riassunto comprensibile: cosa è emerso, cosa fare a casa, quando tornare."],
      ["Le parole difficili, spiegate", "I termini medici del referto hanno una breve spiegazione, a portata di tocco."],
      ["Bilanci di salute più chiari", "I controlli di crescita diventano facili da leggere e da seguire nel tempo."],
      ["Non sostituisce il medico", "È un aiuto alla lettura: per dubbi o decisioni il riferimento resta sempre il suo medico."],
    ],
  },
};

const SAFETY = [
  [Lock, "Audio cifrato", "Le registrazioni vengono cifrate (AES-256-GCM) appena arrivano sui nostri server."],
  [Trash2, "Audio non conservato", "Dopo la trascrizione l'audio viene cancellato; eventuali frammenti residui sono eliminati entro 24 ore."],
  [KeyRound, "Cartelle cifrate e separate", "Note cliniche cifrate nel database e dati isolati per ogni studio: ciascun medico accede solo ai propri pazienti."],
  [UserCheck, "Fornitori selezionati", "MantAI si basa su modelli di AI avanzati di fornitori selezionati, che agiscono come responsabili del trattamento (art. 28 GDPR)."],
  [ShieldCheck, "GDPR e segreto professionale", "I dati sanitari sono trattati solo per la cura del paziente, con il consenso raccolto dallo studio e nel rispetto del segreto medico."],
  [FileSignature, "Controllo umano", "I contenuti clinici (note, referti, risposte su temi di salute) arrivano alla famiglia solo dopo la revisione e la firma del medico. Le risposte pratiche automatiche e le spiegazioni semplificate sono sempre etichettate."],
];

const RoleView = ({ role }) => (
  <div className="grid gap-3 sm:grid-cols-2" data-testid={`mantai-view-${role}`}>
    <p className="font-display text-2xl leading-snug text-night sm:col-span-2">{ROLE[role].lead}</p>
    {ROLE[role].points.map(([t, d]) => (
      <div key={t} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-night">{t}</div>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{d}</p>
      </div>
    ))}
  </div>
);

const Safety = () => (
  <section className="mt-8 rounded-[24px] bg-night p-5 text-white sm:p-7" data-testid="mantai-safety">
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3]"><ShieldCheck size={14} /> Sicurezza, privacy e conformità</div>
    <h3 className="mt-2 font-display text-2xl sm:text-3xl">I suoi dati restano <span className="italic text-[#C9CCD3]">protetti.</span></h3>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {SAFETY.map(([Icon, t, d]) => (
        <div key={t} className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10"><Icon size={16} /></span>
          <div><div className="text-sm font-semibold">{t}</div><p className="mt-0.5 text-sm leading-relaxed text-slate-300">{d}</p></div>
        </div>
      ))}
    </div>
  </section>
);

const Recognize = () => (
  <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6" data-testid="mantai-labels-info">
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#3B6CF6]"><Tags size={13} /> Come riconosci i contenuti AI</div>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Ogni testo scritto o elaborato da MantAI porta un'etichetta con una frase sempre visibile, nell'area del medico, nel Portale, nei PDF e nelle email. Le etichette non si possono nascondere dalle impostazioni.</p>
    <ul className="mt-4 grid gap-3">
      {Object.entries(VARIANTS).map(([k, v]) => (
        <li key={k} className="grid gap-1.5 rounded-2xl bg-[#F4F5F7] p-3 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-center sm:gap-4" data-testid={`mantai-label-example-${k}`}>
          <LabelPill variant={k} reviewer="Dott.ssa Rossi" />
          <p className="text-sm leading-relaxed text-slate-600">{v.info}</p>
        </li>
      ))}
    </ul>
    <p className="mt-3 text-xs leading-relaxed text-slate-500">Nei referti PDF redatti con MantAI il piè di pagina lo indica e il file contiene una marcatura leggibile dai programmi (tipo di contenuto e medico revisore).</p>
  </section>
);

export const MantAIDialog = ({ open, onOpenChange, view = "doctor" }) => {
  const [role, setRole] = useState(view);
  useEffect(() => { if (open) setRole(view); }, [open, view]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="z-[60]" onEscapeKeyDown={(e) => e.stopPropagation()} className="z-[60] max-h-[92vh] max-w-3xl overflow-y-auto rounded-[28px] border-slate-200 bg-[#F4F5F7] p-5 sm:p-8" data-testid="mantai-dialog">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#3B6CF6]"><Sparkles size={14} /> Intelligenza artificiale di MantMed</div>
        <DialogTitle className="font-display text-4xl font-normal leading-tight text-night sm:text-5xl">Cos'è <span className="italic text-slate-500">MantAI</span></DialogTitle>
        <DialogDescription className="max-w-2xl text-base leading-relaxed text-slate-600">
          MantAI è l'assistente vocale e clinico integrato in MantMed: trascrive le visite, organizza i dati clinici e aiuta a spiegare i referti. È il motore di MantMed, basato su modelli di AI avanzati di fornitori selezionati, sempre sotto il controllo del medico.
        </DialogDescription>
        <div className="mt-6 inline-flex w-fit justify-self-start rounded-full border border-slate-200 bg-white p-1" role="tablist">
          {Object.entries(ROLE).map(([k, r]) => (
            <button key={k} role="tab" aria-selected={role === k} onClick={() => setRole(k)} data-testid={`mantai-tab-${k}`}
              className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-colors ${role === k ? "bg-night text-white" : "text-slate-600 hover:text-night"}`}>
              <r.icon size={15} /> {r.tab}
            </button>
          ))}
        </div>
        <div className="mt-5"><RoleView role={role} /></div>
        <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6" data-testid="mantai-replies-info">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#3B6CF6]"><Sparkles size={13} /> MantAI Risposte</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Se lo studio lo attiva, MantAI legge i messaggi inviati dal portale e prepara una bozza di risposta. Le risposte su temi di salute <strong className="text-night">non partono mai senza l'approvazione del medico</strong> e riportano "verificata dal Dott./Dott.ssa". Solo le informazioni pratiche (orari, prenotazioni, costi) possono ricevere una "Risposta automatica di MantAI", basata esclusivamente su quanto indicato dallo studio. I messaggi non sono un canale per le urgenze: per situazioni urgenti telefoni allo studio e in emergenza chiami il 112/118. Prima dell'elaborazione nomi e recapiti vengono sostituiti da segnaposto.</p>
        </section>
        <Recognize />
        <Safety />
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-slate-500"><Eye size={13} className="mt-0.5 shrink-0" /> <span>Per esercitare i diritti previsti dal GDPR (accesso, rettifica, cancellazione) può rivolgersi allo studio medico, titolare del trattamento dei dati clinici. <a href="/privacy#fornitori" target="_blank" rel="noreferrer" className="font-medium text-[#3B6CF6] underline underline-offset-2" data-testid="mantai-privacy-link">Informativa privacy completa ed elenco dei fornitori AI</a></span></p>
      </DialogContent>
    </Dialog>
  );
};

const TRIGGERS = {
  sidebar: ({ mini, onClick }) => (
    <button onClick={onClick} title={mini ? "Cos'è MantAI" : undefined} aria-label="Cos'è MantAI" data-testid="mantai-sidebar-btn"
      className={`mb-2 flex h-11 items-center gap-2 rounded-2xl text-sm text-[#C9CCD3] transition-colors hover:bg-white/10 hover:text-white ${mini ? "justify-center" : "px-3.5"}`}>
      <Sparkles size={19} />{!mini && "Cos'è MantAI"}
    </button>
  ),
  banner: ({ onClick }) => (
    <button onClick={onClick} data-testid="mantai-banner-btn" className="group flex w-full items-center gap-4 rounded-[24px] border border-[#0A192F]/10 bg-white p-4 text-left transition-shadow hover:shadow-md sm:p-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFF9E6] text-[#B7791F]"><Sparkles size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block font-medium text-night">Chi scrive "In parole semplici"?</span><span className="block text-sm text-[#0A192F]/60">È MantAI, l'assistente di MantMed: scopra come funziona e come protegge i suoi dati.</span></span>
      <span className="hidden text-sm font-medium text-[#3B6CF6] group-hover:underline sm:block">Cos'è MantAI</span>
    </button>
  ),
  link: ({ onClick }) => (
    <button onClick={onClick} className="font-medium underline underline-offset-2 hover:opacity-80" data-testid="mantai-link-btn">Come funziona</button>
  ),
  icon: ({ onClick }) => (
    <button onClick={onClick} data-testid="mantai-info-btn" className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-white hover:text-white">
      <Sparkles size={13} /> Cos'è MantAI
    </button>
  ),
};

export const MantAIButton = ({ variant, view, mini }) => {
  const [open, setOpen] = useState(false);
  const Trigger = TRIGGERS[variant];
  return <><Trigger mini={mini} onClick={() => setOpen(true)} /><MantAIDialog open={open} onOpenChange={setOpen} view={view} /></>;
};
