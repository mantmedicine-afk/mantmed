import { AudioLines, CalendarDays, FolderOpen, MessagesSquare, PersonStanding, ShieldCheck, Sparkles, Stethoscope, Store, Users } from "lucide-react";

export const DOCTOR_STEPS = [
  {
    video: "doctor-1", to: "/app", targets: ["agenda-panel"], icon: CalendarDays, kicker: "Benvenuto su MantMed", title: "La sua giornata, in un colpo d'occhio",
    text: "La Dashboard riunisce l'Agenda del giorno divisa per sede, la sala d'attesa e il prossimo paziente.",
    points: ["Scelga lo studio dalle schede in alto per vedere solo le sue visite", "Il pulsante + aggiunge un appuntamento; tocchi una visita per modificarla o annullarla", "Le prenotazioni pagate dal Portale Paziente compaiono con \"Pagato online\""],
  },
  {
    video: "doctor-2", to: "/app", targets: ["consult-hub"], icon: AudioLines, kicker: "MantAI", title: "Parli con il paziente, MantAI scrive",
    text: "Da \"Avvia Consultazione\" scelga il paziente e attivi la registrazione: MantAI trascrive la visita e la struttura in nota clinica in tempo reale.",
    points: ["Anamnesi, esame obiettivo, diagnosi e terapia compilati secondo il suo modello", "Meno tastiera, più contatto visivo con la famiglia", "Ogni nota è una bozza: la rivede e la firma prima del referto PDF"],
  },
  {
    video: "doctor-3", to: "/app/visite", targets: ["visit-row-*", "visits-page"], icon: PersonStanding, kicker: "Bodychart Interattivo", title: "Annotazioni anatomiche in pochi tocchi",
    text: "Apra una visita e scelga \"Bodychart\" per segnare lesioni, dolori o reperti direttamente sulla figura anatomica.",
    points: ["Zoom sulle regioni del corpo e pin colorati per categoria (lesione, dolore, cicatrice…)", "Su tablet scatti una foto e la alleghi al singolo pin per documentare l'evoluzione", "Storico per confrontare le visite nel tempo"],
  },
  {
    video: "doctor-4", to: "/app/pazienti", targets: ["team-network-search"], icon: ShieldCheck, kicker: "Medicina di Squadra", title: "Cartelle collegate, con il consenso del genitore",
    text: "Cerchi un paziente seguito da un collega con il codice fiscale: con la delega firmata dal genitore vede referti, visite e bilanci della squadra.",
    points: ["Badge verde \"Consenso Privacy Attivo\" quando la delega è valida", "Senza delega invii una \"Richiesta di autorizzazione\" al Portale Paziente", "Note di squadra condivise e ogni accesso registrato nel log GDPR"],
  },
  {
    video: "doctor-5", to: "/app/impostazioni?sezione=vetrina", targets: ["account-section-vetrina"], icon: Store, kicker: "Vetrina e fatturazione", title: "Si faccia trovare, incassi senza pensieri",
    text: "Nella Vetrina Pubblica pubblichi foto, presentazione, servizi e disponibilità: le famiglie la trovano nella rete MantMed e prenotano online.",
    points: ["Attivi \"Pubblica\" e condivida il link della sua vetrina", "In Fatturazione & Tessera Sanitaria trova incassi, ricevute ed export per il commercialista"],
    extra: { to: "/app/cassa", label: "Apri Fatturazione & TS" },
  },
];

export const PATIENT_STEPS = [
  {
    video: "patient-1", to: "/portale", targets: ["portal-overview", "portal-no-children"], icon: Users, kicker: "Benvenuto nella sua Area Riservata", title: "Tutta la salute della famiglia, in un posto",
    text: "Qui trova i suoi figli e familiari collegati, il medico curante e i prossimi appuntamenti.",
    points: ["Ogni figlio viene collegato in automatico con codice fiscale ed email comunicati allo studio", "Può collegare un altro figlio dal modulo \"Collega\"", "Gestisca familiari e consensi da Impostazioni › Nucleo familiare"],
  },
  {
    video: "patient-2", to: "/portale/documenti", targets: ["documents-area"], icon: FolderOpen, kicker: "Visite e documenti", title: "Referti e ricevute sempre a portata di mano",
    text: "Nell'Area Riservata consulta lo storico delle visite e scarica i documenti in PDF.",
    points: ["Referti, bilanci di salute, prescrizioni e terapie scaricabili in PDF", "Ricevute sanitarie dei pagamenti online pronte per la detrazione", "Consensi firmati e documenti condivisi dallo studio"],
  },
  {
    video: "patient-3", to: "/portale", targets: ["portal-simple-box"], icon: Sparkles, kicker: "In parole semplici", title: "La diagnosi, spiegata con chiarezza",
    text: "Dopo ogni visita MantAI rielabora il referto firmato dal medico: cosa è emerso, cosa fare a casa, quando tornare.",
    points: ["Tocchi le parole del referto per leggerne la spiegazione", "Non sostituisce il medico: per dubbi scriva allo studio"],
  },
  {
    video: "patient-4", to: "/portale/trova-specialista", targets: ["specialists-directory"], icon: Stethoscope, kicker: "Trova Specialista", title: "La rete MantMed, a portata di prenotazione",
    text: "Cerchi uno specialista per nome o disciplina, apra la sua vetrina con la copertina dello studio e scelga uno slot libero per richiedere l'appuntamento.",
    points: ["Copertina, presentazione e servizi di ogni studio", "Calendario delle disponibilità fino a 8 settimane"],
  },
  {
    video: "patient-5", to: "/portale/messaggi", targets: ["portal-messages", "messages-page"], icon: MessagesSquare, kicker: "Messaggi e supporto", title: "Lo studio, a un messaggio di distanza",
    text: "Scriva allo studio dalla chat \"Messaggi con lo Studio\": riceverà una notifica quando il medico risponde.",
    points: ["Allegati e storico delle conversazioni sempre disponibili", "Per problemi con l'app usi \"Feedback e assistenza\" in Impostazioni"],
    extra: { to: "/portale/impostazioni", label: "Apri Feedback e assistenza" },
  },
];
