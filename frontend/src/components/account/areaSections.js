import { Stethoscope, CalendarClock, LayoutTemplate, HeartPulse, Sparkles, BellRing, ShieldCheck, BarChart3, CreditCard, Download, FileLock2, MessageSquarePlus } from "lucide-react";

export const AREA_GROUPS = ["Profilo", "Studio e agenda", "Documenti", "Strumenti", "Account"];

export const AREA_SECTIONS = [
  { id: "profilo", group: "Profilo", icon: Stethoscope, title: "Profilo professionale", short: "Dati, vetrina pubblica e firma", text: "Dati per referti e ricevute, vetrina pubblica e firma dei referti." },
  { id: "orari", group: "Studio e agenda", icon: CalendarClock, title: "Orari e disponibilità", short: "Sedi, orari e assenze", text: "Sedi, orari, assenze e slot prenotabili dal portale." },
  { id: "modelli", group: "Studio e agenda", icon: LayoutTemplate, title: "Modelli di visita", short: "I modelli che MantAI compila", text: "Crei e modifichi i modelli che MantAI compila." },
  { id: "bilanci", group: "Studio e agenda", icon: HeartPulse, title: "Bilanci di salute", short: "Modelli di bilancio per età", text: "I modelli di bilancio per età, nello stesso archivio dei modelli." },
  { id: "tessera-sanitaria", group: "Documenti", icon: CreditCard, title: "Tessera Sanitaria", short: "Invio spese al Sistema TS", text: "Invio delle spese sanitarie al Sistema TS." },
  { id: "esportazioni", group: "Documenti", icon: Download, title: "Esportazioni", short: "Registro cassa e copia dati", text: "Registro cassa per il commercialista e copia dei dati (GDPR)." },
  { id: "statistiche", group: "Strumenti", icon: BarChart3, title: "Statistiche", short: "Visite, attesa e incassi", text: "Visite, sala d'attesa, incassi e metriche di utilizzo." },
  { id: "mantai-risposte", group: "Strumenti", icon: Sparkles, title: "MantAI Risposte", short: "Bozze di risposta alle famiglie", text: "Bozze di risposta ai messaggi delle famiglie." },
  { id: "notifiche", group: "Account", icon: BellRing, title: "Notifiche e avvisi", short: "Quali avvisi ricevere", text: "Quali avvisi ricevere e come." },
  { id: "sicurezza", group: "Account", icon: ShieldCheck, title: "Sicurezza e accesso", short: "Password, 2FA e sessioni", text: "Password, verifica in due passaggi e sessioni attive." },
  { id: "gdpr", group: "Account", icon: FileLock2, title: "Sicurezza e GDPR", short: "Registro, consensi e conservazione", text: "Registro attività, cifratura, consensi e conservazione." },
  { id: "feedback", group: "Account", icon: MessageSquarePlus, title: "Feedback e assistenza", short: "Segnali un problema o un'idea", text: "Segnali un problema o proponga un miglioramento." },
];

export const areaMenu = () => AREA_GROUPS.map((g) => ({
  title: g,
  links: AREA_SECTIONS.filter((s) => s.group === g).map((s) => ({ id: s.id, label: s.title, desc: s.short, icon: s.icon, to: `/app/area-personale?sezione=${s.id}` })),
}));
