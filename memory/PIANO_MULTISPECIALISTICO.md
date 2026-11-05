# Piano MantMed multispecialistico (approvato nelle scelte, NON avviato — attendere il via dell'utente)

Scelte utente:
- Specialità principale + secondarie nel profilo; visita parte col modulo principale, cambiabile da menu; ogni visita salva module_id+version; paziente unico, storia unificata.
- Base fissa non eliminabile (motivo, anamnesi, esame obiettivo, diagnosi, terapia); personalizzazioni sopra il modulo (aggiungi/riordina/nascondi facoltativi); modelli visita esistenti → personalizzazioni Pediatria; MantAI compila anche i campi personalizzati; "Ripristina modello predefinito".
- Adulti account proprio; minori fino a 2 tutori con account proprio; a 18 anni accesso tutori chiuso + invito al paziente; tutore legale/AdS adulti con documento di nomina; delega familiare con consenso revocabile; note/sezioni "riservate" mai visibili a tutori/portale; audit di ogni accesso.
- Studi illimitati (predisposto limite per piano): nome, indirizzo, telefono, orari/giorni, durata, intestazione+logo per studio, listino, metodi pagamento; agenda tutti gli studi a colori o filtro; cassa per studio + totale.
- Un passaggio alla volta, backup prima di ogni modifica dati, nessuna pubblicazione fino a fine verifica.

Passaggi: 1 Base+moduli+migrazione Pediatria · 2 Cardiologia/Dermatologia/Ginecologia + MantAI + personalizzazioni · 3 Specialità in registrazione/profilo + menu modulo in visita · 4 Pazienti/tutori/deleghe/riservato/18 anni · 5 Studi configurabili (agenda, cassa, listino, intestazioni) · 6 Test completo, landing, preparazione pubblicazione.
Backup: mongodump --uri "$MONGO_URL" --db mantmed --out /app/backups/<data>_passo<N>; ripristino mongorestore --drop.
