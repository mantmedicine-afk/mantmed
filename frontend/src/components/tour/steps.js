import { AudioLines, CalendarDays, FolderOpen, MessagesSquare, PersonStanding, ShieldCheck, Sparkles, Stethoscope, Store, Users } from "lucide-react";

export const DOCTOR_STEPS = [
  {
    video: "doctor-1", to: "/app", targets: ["next-patient-card"], icon: CalendarDays, kicker: "Oggi", title: "La giornata parte dal prossimo paziente",
    text: "All'apertura vede subito il prossimo paziente con età, orario e motivo. Sotto: agenda dello studio, sala d'attesa e il riquadro «Da fare».",
    points: ["Nell'agenda scelga lo studio dalle schede in alto", "Tocchi il nome del prossimo paziente per aprirne la scheda", "Statistiche e metriche sono in Strumenti › Statistiche"],
  },
  {
    video: "doctor-2", to: "/app", targets: ["start-consultation-btn"], icon: AudioLines, kicker: "MantAI", title: "Parli con il paziente, MantAI scrive",
    text: "Un solo pulsante, «Inizia visita»: MantAI trascrive e prepara la bozza della nota, sempre etichettata. Lei la rilegge con «Rivedi e firma».",
    points: ["Anamnesi, esame obiettivo, diagnosi e terapia compilati secondo il suo modello", "Meno tastiera, più contatto visivo con la famiglia", "Ogni nota è una bozza: la rivede e la firma prima del referto PDF"],
  },
  {
    video: "doctor-3", to: "/app/pazienti", targets: ["patients-page"], icon: PersonStanding, kicker: "Scheda paziente", title: "Tutto il paziente in un posto",
    text: "Nella scheda: panoramica, visite e referti, bilanci, bodychart, passaporto sanitario, documenti e Squadra. Con Ctrl/Cmd+K trova un paziente anche per codice fiscale.",
    points: ["La Bodychart della scheda mostra il confronto tra visite e le foto di ogni reperto", "«Inizia visita» è anche in testa alla scheda", "Le allergie sono sempre in evidenza nell'intestazione"],
  },
  {
    video: "doctor-4", to: "/app", targets: ["todo-box"], icon: ShieldCheck, kicker: "Da fare", title: "Note da firmare e messaggi, a un clic",
    text: "Il riquadro «Da fare» mostra solo ciò che aspetta lei: note da firmare, messaggi, richieste dal portale. Ogni voce porta direttamente all'azione.",
    points: ["«Rivedi e firma» apre la nota in bozza con l'etichetta MantAI", "I messaggi portano alla conversazione con la famiglia", "La Medicina di Squadra è nella scheda di ogni paziente"],
  },
  {
    video: "doctor-5", to: "/app/strumenti", targets: ["tools-page"], icon: Store, kicker: "Cassa e Strumenti", title: "Il resto, quando serve",
    text: "In Cassa: ricevute e incassi. In Strumenti: statistiche, modelli di visita e bilanci, Tessera Sanitaria, esportazioni, pannello GDPR e vetrina.",
    points: ["In Cassa trova incassi, ricevute ed esportazione per il commercialista", "La vetrina pubblica e il pannello GDPR sono in Strumenti"],
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
