# Piano MantMed multispecialistico (approvato nelle scelte, NON avviato — attendere il via dell'utente)

Scelte utente:
- Specialità principale + secondarie nel profilo; visita parte col modulo principale, cambiabile da menu; ogni visita salva module_id+version; paziente unico, storia unificata.
- Base fissa non eliminabile (motivo, anamnesi, esame obiettivo, diagnosi, terapia); personalizzazioni sopra il modulo (aggiungi/riordina/nascondi facoltativi); modelli visita esistenti → personalizzazioni Pediatria; MantAI compila anche i campi personalizzati; "Ripristina modello predefinito".
- Adulti account proprio; minori fino a 2 tutori con account proprio; a 18 anni accesso tutori chiuso + invito al paziente; tutore legale/AdS adulti con documento di nomina; delega familiare con consenso revocabile; note/sezioni "riservate" mai visibili a tutori/portale; audit di ogni accesso.
- Studi illimitati (predisposto limite per piano): nome, indirizzo, telefono, orari/giorni, durata, intestazione+logo per studio, listino, metodi pagamento; agenda tutti gli studi a colori o filtro; cassa per studio + totale.
- Un passaggio alla volta, backup prima di ogni modifica dati, nessuna pubblicazione fino a fine verifica.

Passaggi: 1 Base+moduli+migrazione Pediatria · 2 Cardiologia/Dermatologia/Ginecologia + MantAI + personalizzazioni · 3 Specialità in registrazione/profilo + menu modulo in visita · 4 Pazienti/tutori/deleghe/riservato/18 anni · 5 Studi configurabili (agenda, cassa, listino, intestazioni) · 6 Test completo, landing, preparazione pubblicazione.
Backup: mongodump --uri "$MONGO_URL" --db mantmed --out /app/backups/<data>_passo<N>; ripristino mongorestore --drop.

Modifiche dell'utente al piano (vincolanti):
- Nuovi moduli (Cardiologia, Dermatologia, Ginecologia): NESSUN calcolo clinico (niente punteggi di rischio, allarmi, soglie, diagnosi o dosaggi suggeriti); solo documentazione. Calcolo dosi resta solo in Pediatria.
- Passo 2: inviare l'elenco dei campi per modulo e ATTENDERE approvazione esplicita prima di implementare.
- Prima del passo 4: confermare per iscritto se in PRODUZIONE ci sono solo dati di prova o persone reali (chiedere al deployer/debug o all'utente).
- Passo 6: NIENTE landing né informative; solo test completo + istruzioni backup.

Stato:
- Passo 1 COMPLETATO 2026-11-05 (in attesa verifica utente). Backup: /app/backups/2026-11-05_passo1 (in .gitignore).
  backend/specialty_modules.py (catalogo base + pediatria v1 + generale), ClinicalNote.modulo {id, versione, campi} con validator upgrade_note (lettura retrocompatibile),
  migrazione run_module_migration all'avvio (note_schema=2 su consultations, module_id su visit_templates, db.meta note_schema), GET /api/specialty-modules,
  report.py/provenance.py/pediatric.js/NoteEditor aggiornati. Verifica: scripts/verify_module_migration.py <db_backup_ripristinato> → 50 visite, 0 differenze. Test iteration_70 100%.
  Fix extra: contrasto pulsanti accent nell'overlay visita (theme.css).
  Nota: il campo base "esame obiettivo" generico arriva al passo 2 insieme ai nuovi moduli.
