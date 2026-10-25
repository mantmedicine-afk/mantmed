export const UPDATED = "giugno 2026";

export const PROVIDERS = [
  ["OpenAI", "Trascrizione vocale (Whisper) e generazione di testi clinici e riassunti (modelli GPT)", "Audio cifrato della visita, testo della trascrizione, contenuti della nota", "Possibile trasferimento extra-UE con Clausole Contrattuali Standard"],
  ["Emergent", "Gateway di accesso ai modelli AI, hosting dell'applicazione, database e archiviazione dei file", "Tutti i dati gestiti dalla piattaforma, in forma cifrata ove indicato", "Possibile trasferimento extra-UE con Clausole Contrattuali Standard"],
  ["Postmark", "Invio di email transazionali (codici di verifica, notifiche, promemoria)", "Indirizzo email, nome, contenuto del messaggio (senza dati clinici)", "Possibile trasferimento extra-UE con Clausole Contrattuali Standard"],
  ["Stripe", "Gestione dei pagamenti delle licenze e dei servizi", "Dati di fatturazione e di pagamento (i dati della carta sono trattati direttamente da Stripe)", "Possibile trasferimento extra-UE con Clausole Contrattuali Standard"],
  ["Anthropic", "MantAI Risposte: classificazione dei messaggi del portale e preparazione di bozze di risposta (modelli Claude)", "Testo del messaggio e degli ultimi messaggi del thread, età del bambino e base di conoscenza dello studio, con nomi e recapiti sostituiti da segnaposto", "Possibile trasferimento extra-UE con Clausole Contrattuali Standard"],
];

export const SECTIONS = [
  ["titolari", "Titolare e responsabile del trattamento", [
    "Per i dati clinici dei pazienti (cartelle, referti, registrazioni delle visite) il titolare del trattamento è lo studio medico o il professionista sanitario che utilizza MantMed.",
    "MantMed — {{Ragione sociale}}, {{Sede legale}}, P.IVA {{Partita IVA}} — agisce come responsabile del trattamento ai sensi dell'art. 28 GDPR per conto dello studio, e come titolare per i dati degli account dei professionisti (registrazione, licenza, fatturazione).",
    "Contatto privacy: {{Email privacy}}. Responsabile della protezione dei dati (DPO), se nominato: {{Nome e contatto DPO}}.",
  ]],
  ["dati", "Quali dati trattiamo", [
    "Dati anagrafici e di contatto di medici, genitori e tutori; dati anagrafici e sanitari dei pazienti (anche minori) inseriti dallo studio.",
    "Registrazioni audio delle visite, solo quando il medico avvia la registrazione e dopo l'acquisizione del consenso.",
    "Dati tecnici necessari alla sicurezza: indirizzo IP, registri di accesso, sessioni.",
  ]],
  ["finalita", "Finalità e basi giuridiche", [
    "Cura del paziente e gestione della documentazione clinica: art. 9, par. 2, lett. h) GDPR (finalità di diagnosi e cura sotto la responsabilità di un professionista soggetto a segreto professionale).",
    "Consultazione di referti e riassunti nel Portale Paziente: consenso esplicito del genitore o tutore, art. 9, par. 2, lett. a) GDPR.",
    "Gestione dell'account e della licenza: esecuzione del contratto, art. 6, par. 1, lett. b). Sicurezza e prevenzione degli abusi: legittimo interesse, art. 6, par. 1, lett. f). Obblighi fiscali: art. 6, par. 1, lett. c).",
  ]],
  ["mantai", "MantAI e intelligenza artificiale", [
    "MantAI è il motore di MantMed, basato su modelli di AI avanzati di fornitori selezionati che agiscono come sub-responsabili del trattamento.",
    "MantAI trascrive le visite, propone una bozza di nota clinica e rielabora i referti in linguaggio semplice. Non prende decisioni: ogni contenuto è una bozza che il medico rivede, corregge e firma. Non avvengono decisioni basate unicamente su trattamenti automatizzati ai sensi dell'art. 22 GDPR.",
    "I dati inviati ai fornitori AI sono usati solo per fornire il servizio richiesto e non per addestrare i modelli, secondo i termini contrattuali dei fornitori.",
  ]],
  ["mantai-risposte", "MantAI Risposte (messaggi del portale)", [
    "Se lo studio attiva la funzione, MantAI classifica i messaggi inviati dalle famiglie tramite il Portale Paziente (amministrativo o clinico) e prepara bozze di risposta. Finalità: supportare lo studio nella gestione delle comunicazioni non urgenti. La messaggistica non è un canale per le urgenze: per situazioni urgenti occorre telefonare allo studio e, in emergenza, chiamare il 112/118.",
    "Le risposte su temi clinici sono sempre riviste e approvate dal medico prima dell'invio e riportano la dicitura \"Risposta preparata con l'assistenza di MantAI e verificata dal Dott./Dott.ssa\". Possono essere inviate automaticamente solo risposte amministrative basate esclusivamente sulle informazioni inserite dallo studio, con la dicitura \"Risposta automatica di MantAI\". La conferma di ricezione e l'avviso sulle urgenze sono testi fissi, non generati dall'AI.",
    "Al fornitore AI, che agisce come sub-responsabile del trattamento ai sensi dell'art. 28 GDPR, vengono inviati solo il messaggio corrente, al massimo gli ultimi 5 messaggi della conversazione, l'età del bambino e la base di conoscenza dello studio; nomi, codice fiscale, email e telefono sono sostituiti da segnaposto. Le bozze sono cifrate e quelle scartate vengono cancellate dopo 30 giorni. Ogni azione è registrata nel registro attività dello studio.",
    "Per informazioni o per opporsi a questo trattamento può rivolgersi allo studio medico titolare o scrivere a {{Email privacy}}.",
  ]],
  ["conservazione", "Conservazione", [
    "Registrazioni audio: cifrate all'arrivo e cancellate dopo la trascrizione; eventuali frammenti residui sono eliminati entro 24 ore.",
    "Documentazione clinica: conservata per il tempo stabilito dallo studio titolare secondo la normativa sanitaria applicabile.",
    "Dati dell'account: per la durata del rapporto e successivamente per i termini previsti dagli obblighi di legge.",
  ]],
  ["sicurezza", "Misure di sicurezza", [
    "Connessione cifrata (HTTPS), audio cifrato con AES-256-GCM, note cliniche cifrate nel database e dati separati per ciascuno studio.",
    "Accesso protetto con password robuste, blocco dopo tentativi ripetuti, verifica in due passaggi facoltativa e chiusura automatica della sessione per inattività.",
  ]],
  ["diritti", "I suoi diritti", [
    "Può chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati e opporsi al trattamento (artt. 15–21 GDPR), e revocare in ogni momento il consenso senza pregiudicare la liceità del trattamento precedente.",
    "Per i dati clinici si rivolga allo studio medico titolare; per gli altri dati scriva a {{Email privacy}}. Ha inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).",
  ]],
];
