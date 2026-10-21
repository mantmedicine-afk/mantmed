import { AudioLines, CalendarDays, FolderOpen, PersonStanding, Sparkles, Stethoscope, Store, Users } from "lucide-react";

export const DOCTOR_STEPS = [
  {
    to: "/app", targets: ["agenda-panel"], icon: CalendarDays, kicker: "Benvenuto su MantMed", title: "La sua giornata, in un colpo d'occhio",
    text: "La Dashboard riunisce l'Agenda del giorno divisa per sede, la sala d'attesa e il prossimo paziente.",
    points: ["Scelga lo studio dalle schede in alto per vedere solo le sue visite", "Il pulsante + aggiunge un appuntamento; tocchi una visita per modificarla o annullarla", "Le prenotazioni pagate dal Portale Paziente compaiono con \"Pagato online\""],
  },
  {
    to: "/app", targets: ["consult-hub"], icon: AudioLines, kicker: "MantAI", title: "Parli con il paziente, MantAI scrive",
    text: "Da \"Avvia Consultazione\" scelga il paziente e attivi la registrazione: MantAI trascrive la visita e la struttura in nota clinica in tempo reale.",
    points: ["Anamnesi, esame obiettivo, diagnosi e terapia compilati secondo il suo modello", "Meno tastiera, più contatto visivo con la famiglia", "Ogni nota è una bozza: la rivede e la firma prima del referto PDF"],
  },
  {
    to: "/app/visite", targets: ["visits-page"], icon: PersonStanding, kicker: "Bodychart Interattivo", title: "Annotazioni anatomiche in pochi tocchi",
    text: "Apra una visita e scelga \"Bodychart\" per segnare lesioni, dolori o reperti direttamente sulla figura anatomica.",
    points: ["Zoom sulle regioni del corpo e marcatori colorati per categoria", "Foto allegate al singolo punto per documentare l'evoluzione", "Storico per confrontare le visite nel tempo"],
  },
  {
    to: "/app/impostazioni?sezione=vetrina", targets: ["account-section-vetrina"], icon: Store, kicker: "Vetrina e fatturazione", title: "Si faccia trovare, incassi senza pensieri",
    text: "Nella Vetrina Pubblica pubblichi foto, presentazione, servizi e disponibilità: le famiglie la trovano nella rete MantMed e prenotano online.",
    points: ["Attivi \"Pubblica\" e condivida il link della sua vetrina", "In Fatturazione & Tessera Sanitaria trova incassi, ricevute ed export per il commercialista"],
    extra: { to: "/app/cassa", label: "Apri Fatturazione & TS" },
  },
];

export const PATIENT_STEPS = [
  {
    to: "/portale", targets: ["portal-overview", "portal-no-children"], icon: Users, kicker: "Benvenuto nella sua Area Riservata", title: "Tutta la salute della famiglia, in un posto",
    text: "Qui trova i suoi figli e familiari collegati, il medico curante e i prossimi appuntamenti.",
    points: ["Ogni figlio viene collegato in automatico con codice fiscale ed email comunicati allo studio", "Può collegare un altro figlio dal modulo \"Collega\"", "Gestisca familiari e consensi da Impostazioni › Nucleo familiare"],
  },
  {
    to: "/portale/documenti", targets: ["documents-area"], icon: FolderOpen, kicker: "Visite e documenti", title: "Referti e ricevute sempre a portata di mano",
    text: "Nell'Area Riservata consulta lo storico delle visite e scarica i documenti in PDF.",
    points: ["Referti, bilanci di salute e terapie scaricabili con un tocco", "Ricevute sanitarie dei pagamenti online pronte per la detrazione", "Consensi firmati e documenti condivisi dallo studio"],
  },
  {
    to: "/portale", targets: ["portal-simple-box"], icon: Sparkles, kicker: "In parole semplici", title: "La diagnosi, spiegata con chiarezza",
    text: "Dopo ogni visita MantAI rielabora il referto firmato dal medico: cosa è emerso, cosa fare a casa, quando tornare.",
    points: ["Tocchi le parole del referto per leggerne la spiegazione", "Non sostituisce il medico: per dubbi scriva allo studio"],
  },
  {
    to: "/portale/trova-specialista", targets: ["specialists-directory"], icon: Stethoscope, kicker: "Trova Specialista", title: "La rete MantMed, a portata di prenotazione",
    text: "Cerchi uno specialista per nome o disciplina, apra la sua vetrina e scelga uno slot libero per richiedere l'appuntamento.",
    points: ["Disponibilità visibili fino a 8 settimane", "Per domande usi la chat in \"Messaggi con lo Studio\""],
    extra: { to: "/portale/messaggi", label: "Apri i Messaggi" },
  },
];
