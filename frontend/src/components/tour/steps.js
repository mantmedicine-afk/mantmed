import { AudioLines, CalendarDays, Compass, FolderOpen, LayoutGrid, ListChecks, MessagesSquare, PersonStanding, Sparkles, Stethoscope, Store, Users } from "lucide-react";

const nav = (id, mobile = id) => [`sidebar-link-${id}`, `bottom-link-${mobile}`];

export const DOCTOR_STEPS = [
  {
    video: "doctor-1", to: "/app", targets: ["sidebar-nav", "bottom-nav"], icon: LayoutGrid, kicker: "Menu", title: "Tutto il menu nella barra in alto",
    text: "Home, Pazienti, Messaggi, Cassa e Area personale sono nella barra orizzontale in cima alla pagina. Su smartphone li trova nella barra in basso e in «Altro».",
    points: ["La voce attiva è evidenziata in bianco", "Il numero rosso indica i messaggi da leggere", "A destra: «Cos'è MantAI», il punto interrogativo per il tour, la modalità notte e l'orologio"],
  },
  {
    video: "doctor-1", to: "/app", targets: ["oggi-next-bar"], icon: CalendarDays, kicker: "Home", title: "La giornata parte dal prossimo paziente",
    text: "Sotto il grande pulsante «Avvia MantAI» trova il prossimo paziente con età e orario. «Apri cartella» apre subito la sua scheda.",
    points: ["Filtri l'agenda per studio con Tutti / Centro / Provincia", "L'anello che pulsa indica che è tutto pronto per registrare"],
  },
  {
    video: "doctor-2", to: "/app", targets: ["oggi-next-start-btn"], icon: AudioLines, kicker: "MantAI", title: "Parli con il paziente, MantAI scrive",
    text: "Un solo pulsante rotondo, «Avvia MantAI», già sul prossimo paziente: MantAI trascrive e prepara la bozza della nota, sempre etichettata. Lei la rilegge con «Rivedi e firma».",
    points: ["Anamnesi, esame obiettivo, diagnosi e terapia compilati secondo il suo modello", "Ogni nota è una bozza: la rivede e la firma prima del referto PDF"],
  },
  {
    video: "doctor-4", to: "/app", targets: ["oggi-summary"], icon: ListChecks, kicker: "Riepilogo", title: "La giornata in tre numeri",
    text: "Visite di oggi, note da firmare e messaggi da leggere: ogni riquadro porta direttamente all'azione.",
    points: ["«Visite di oggi» scorre fino all'agenda", "«Note da firmare» apre la prima nota in bozza"],
  },
  {
    video: "doctor-1", to: "/app", targets: ["oggi-agenda"], icon: CalendarDays, kicker: "Agenda", title: "Le visite di oggi, studio per studio",
    text: "L'agenda raggruppa le visite per studio. La linea «Ora» separa le visite passate da quelle in arrivo; tocchi una riga per aprire il dettaglio nel pannello laterale.",
    points: ["Il puntino verde indica una visita fatta, quello ambra una visita in programma", "Il puntino terracotta accanto al nome segnala le allergie"],
  },
  {
    video: "doctor-3", to: "/app", targets: nav("pazienti"), icon: PersonStanding, kicker: "Pazienti", title: "Tutto il paziente in un posto",
    text: "In Pazienti trova l'archivio e la scheda di ogni bambino: visite e referti, bilanci, bodychart, passaporto sanitario, documenti e Squadra.",
    points: ["Con Ctrl/Cmd+K trova un paziente anche per codice fiscale", "Le allergie sono sempre in evidenza nell'intestazione della scheda"],
  },
  {
    video: "doctor-4", to: "/app", targets: nav("messaggi"), icon: MessagesSquare, kicker: "Messaggi", title: "I pazienti, a un messaggio di distanza",
    text: "In Messaggi legge e risponde a pazienti e tutori, con le bozze di risposta preparate da MantAI e le richieste di appuntamento dal portale.",
    points: ["Le risposte MantAI sono bozze: le rivede prima dell'invio"],
  },
  {
    video: "doctor-5", to: "/app", targets: [...nav("area-personale"), "bottom-link-altro"], icon: Store, kicker: "Area personale", title: "Il resto, quando serve",
    text: "L'Area personale raccoglie tutto in riquadri: profilo professionale con vetrina e firma, orari, modelli e bilanci, statistiche, Tessera Sanitaria, esportazioni, GDPR e assistenza.",
    points: ["In Cassa trova incassi, ricevute ed esportazione per il commercialista", "Tocchi un riquadro per aprirne la sezione"],
  },
  {
    to: "/app", targets: ["tour-open-button", "tour-open-button-mobile"], icon: Compass, kicker: "Guida", title: "Rivedere la guida",
    text: "Il punto interrogativo nella barra in alto riapre questo tour quando vuole. Accanto trova l'icona della modalità notte.",
    points: ["Dal menu profilo cambia password e gestisce sicurezza e 2FA", "La barra chiara mostra la sua città con il meteo attuale"],
  },
];

export const PATIENT_STEPS = [
  {
    video: "patient-1", to: "/portale", targets: ["sidebar-nav", "bottom-nav"], icon: LayoutGrid, kicker: "Menu", title: "Tutto il menu nella barra in alto",
    text: "Home, Appuntamenti, Documenti, Messaggi, Trova specialista e Impostazioni sono nella barra orizzontale in cima alla pagina. Su smartphone li trova nella barra in basso e in «Altro».",
    points: ["La voce attiva è evidenziata in bianco", "«Cos'è MantAI» spiega come funziona l'assistente"],
  },
  {
    video: "patient-1", to: "/portale", targets: ["portal-overview", "portal-no-children"], icon: Users, kicker: "Benvenuto nella sua Area Riservata", title: "Tutta la salute della famiglia, in un posto",
    text: "Qui trova i suoi figli e familiari collegati, il medico curante e i prossimi appuntamenti.",
    points: ["Ogni figlio viene collegato in automatico con codice fiscale ed email comunicati allo studio", "Può collegare un altro figlio dal modulo \"Collega\""],
  },
  {
    video: "patient-3", to: "/portale", targets: ["portal-simple-box", "portal-overview", "portal-no-children"], icon: Sparkles, kicker: "In parole semplici", title: "La diagnosi, spiegata con chiarezza",
    text: "Dopo ogni visita MantAI rielabora il referto firmato dal medico: cosa è emerso, cosa fare a casa, quando tornare.",
    points: ["Tocchi le parole del referto per leggerne la spiegazione", "Non sostituisce il medico: per dubbi scriva allo studio"],
  },
  {
    video: "patient-2", to: "/portale", targets: nav("appuntamenti"), icon: CalendarDays, kicker: "Appuntamenti", title: "Le visite in programma",
    text: "In Appuntamenti vede le visite prenotate e le richieste inviate allo studio.",
    points: ["Riceve una notifica quando lo studio conferma"],
  },
  {
    video: "patient-2", to: "/portale", targets: nav("documenti"), icon: FolderOpen, kicker: "Documenti", title: "Referti e ricevute sempre a portata di mano",
    text: "In Documenti consulta lo storico delle visite e scarica i documenti in PDF.",
    points: ["Referti, bilanci di salute, prescrizioni e terapie scaricabili in PDF", "Ricevute sanitarie dei pagamenti online pronte per la detrazione"],
  },
  {
    video: "patient-5", to: "/portale", targets: nav("messaggi"), icon: MessagesSquare, kicker: "Messaggi", title: "Lo studio, a un messaggio di distanza",
    text: "Scriva allo studio da Messaggi: riceverà una notifica quando il medico risponde.",
    points: ["Allegati e storico delle conversazioni sempre disponibili"],
  },
  {
    video: "patient-4", to: "/portale", targets: [...nav("trova-specialista"), "bottom-link-altro"], icon: Stethoscope, kicker: "Trova specialista", title: "La rete MantMed, a portata di prenotazione",
    text: "Cerchi uno specialista per nome o disciplina, apra la sua vetrina e scelga uno slot libero per richiedere l'appuntamento.",
    points: ["Calendario delle disponibilità fino a 8 settimane"],
  },
  {
    to: "/portale", targets: ["portal-profile-btn"], icon: Compass, kicker: "Profilo", title: "Rivedere la guida",
    text: "Dal menu profilo gestisce account e password e può rivedere questo tour quando vuole con «Rivedi tour».",
    points: ["Per problemi con l'app usi \"Feedback e assistenza\" in Impostazioni"],
  },
];
