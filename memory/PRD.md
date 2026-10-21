# Auscula — Dashboard medico specialista (tablet)

## Original problem statement
Crea la schermata della dashboard per un medico specialista su tablet. Deve mostrare l'agenda del giorno divisa per studi (es. Studio Centro, Studio Provincia), l'elenco dei pazienti in attesa e un grande pulsante centrale 'Avvia Consultazione / Registrazione'. Design pulito, medico, nei toni del blu notte e bianco.

User choices: dati salvati in DB con demo modificabili; pulsante = trascrizione automatica AI con modello standard unico; nessun login; tablet orizzontale.

## Architecture
- FastAPI + MongoDB (collections: appointments, waiting, consultations), seed idempotente all'avvio
- Whisper (whisper-1) per trascrizione audio; gpt-5.6-terra per compilare la nota clinica standard (Anamnesi, Esame obiettivo, Diagnosi, Terapia, Follow-up) — Emergent LLM key
- React + Tailwind + framer-motion + lenis; font Instrument Serif / Geist / Geist Mono

## Personas
- Medico specialista che lavora su due studi con un tablet in orizzontale

## Implemented (2026-10-15)
- Top bar con logo Auscula (SVG + favicon), data/ora, medico; marquee di stato
- Hero con reveal riga per riga, contatori visite/attesa
- Agenda per studio (tab Studio Centro / Provincia), CRUD appuntamenti
- Pazienti in attesa: tempo d'attesa live, priorità, chiama in studio, modifica/elimina/aggiungi
- Pulsante centrale con tilt 3D + anelli → overlay consultazione: selezione paziente, registrazione microfono (timer, waveform, pausa), Whisper → nota clinica standard modificabile (salva/copia/stampa); fallback trascrizione incollata
- Note cliniche di oggi riapribili

## Implemented (2026-10-16)
- Login protetto JWT (cookie httpOnly, refresh, blocco dopo 5 tentativi), account medico unico da .env, nessuna registrazione pubblica; tutte le API protette; logout in top bar; nome medico dinamico

## Implemented (2026-10-16, pediatria)
- Cartella pediatrica per Dott.ssa Tiziana Foti in 5 schede: 01 Anamnesi (fisiologica, allattamento, svezzamento), 02 Motivo e sintomi, 03 Esame obiettivo (TORL, torace/auscultazione, addome), 04 Crescita (età, sesso, peso, altezza, circ. cranica, percentili manuali, BMI auto), 05 Diagnosi e terapia con calcolatore dosi mg/kg (mg/dose, ml/dose, mg/die, dose max)
- L'AI compila tutte le schede dalla trascrizione; i farmaci vengono estratti solo se prescritti a voce
- Copia/stampa della cartella completa

## Implemented (2026-10-16, referto PDF)
- Pulsante "Genera Referto PDF" nella schermata fine visita: salva e scarica con un click (GET /api/consultations/{id}/pdf, reportlab)
- PDF A4 boutique: header blu notte con monogramma A/M + "MantMed", intestazione medico/studio (placeholder), sezioni 01–05, tabella prescrizione con dosi calcolate, box data/timbro/firma, footer GDPR + n. referto
- Font incorporati in backend/fonts (Instrument Serif, Liberation Sans)

## Implemented (2026-10-16, MantMed pediatria)
- Rebrand completo in MantMed (monogramma A/M animato, favicon, titoli, login)
- Dati demo pediatrici (seed v2): 11 pazienti con data di nascita, agenda per studio, sala d'attesa, storico misure e visite tra i due studi
- Percentili OMS automatici (LMS, who_lms.json: WHO 0–5 anni + Reference 2007 peso 5–10a / altezza 5–19a) nella scheda 4 e nel passaporto
- Passaporto Sanitario Dinamico: anagrafica, allergie, sincronizzazione per studio, grafico di crescita con curve OMS, tabella misure, aggiunta misure, visite con PDF
- Check-point di Benessere: micro-questionari per 6 fasce d'età, punteggio, aree, segnalazioni con consigli, storico

## Implemented (2026-10-16, referto ufficiale v2)
- Referto PDF: header blu notte #0A192F con monogramma A-M platino, dati medico (nome, specializzazione, n. iscrizione Ordine, indirizzo, contatti da backend/.env), dati paziente (nome, cognome, codice fiscale, data di nascita, data visita), sezioni cliniche, footer luogo/data/timbro/firma digitale-autografa + GDPR
- Campo codice fiscale nel passaporto paziente (validazione 16 caratteri)
- Pulsante "Genera & Scarica Referto PDF" nella schermata di fine visita

## Implemented (2026-10-16, dati reali + invio email)
- Dati reali Dott.ssa Tiziana Foti nel referto (titoli, iscrizione OMCeO Reggio Calabria n. 4582, indirizzi Via Roma 12 RC / Via Pozzicello 59 Gallico, tel, email) da backend/.env
- Login medico migrato a medico@mantmed.it
- Tabella crescita PDF riprogettata (Parametro/Valore/Percentile OMS/z-score + BMI), tabella farmaci con dose e volume allineati a destra
- Invio referto ai genitori via email (Resend gestito Emergent, PDF allegato, reply-to studio): POST /api/consultations/{id}/send-report, email genitore nel passaporto

## Implemented (2026-10-16, registro cassa)
- Registro cassa rapido nella schermata di fine visita: importo, prestazione, metodo Contanti/POS/Bonifico, annulla; collegato a visita e paziente (badge nel passaporto)
- Contatore "Incassato oggi" nell'hero; sezione Riepilogo giornaliero con totale, per metodo, per studio, movimenti, selezione data, stampa ed export CSV per commercialista (separatore ;, decimali italiani)
- API: POST/GET/DELETE /api/payments, GET /api/payments/export (giornata Europe/Rome)

## Implemented (2026-10-16, GDPR e sicurezza)
- Crittografia applicativa AES-256-GCM (crypto.py, chiave DATA_ENCRYPTION_KEY in .env) dei campi sanitari in patients, consultations, measurements, checkpoints, waiting, appointments, payments, consents; migrazione automatica all'avvio
- Header di sicurezza (HSTS, nosniff, X-Frame DENY, no-referrer, no-store sulle API)
- Consenso informato: firma su tablet o modulo cartaceo, versione informativa, revoca, storico nel passaporto (tab Privacy); visita bloccata senza consenso (412), email referti solo con consenso specifico; visita libera richiede conferma consenso cartaceo
- Registro accessi (audit) crittografato: accesso passaporto, PDF, email, consensi
- Pannello "Sicurezza e GDPR" (icona scudo in top bar): stato crittografia, transito, regione DB (attualmente USA/India piattaforma, non UE), consensi, audit, guida MongoDB Atlas UE (DATA_REGION), adempimenti del titolare
- NOTA: Emergent non consente la scelta della regione né è certificato GDPR/AGID (verificato con supporto)

## Implemented (2026-10-16, login sicuro)
- Nuova pagina di accesso blu notte #0A192F con monogramma A-M platino, validazione in tempo reale email/password, mostra/nascondi password
- Sessioni server-side (collezione sessions, sid nel JWT) con chiusura per inattività (SESSION_IDLE_MINUTES=10) + avviso 60 s "Sei ancora qui?" + ping attività
- Blocco 15 min dopo 5 tentativi errati con conteggio tentativi rimasti (anche per codice 2FA)
- 2FA TOTP reale (pyotp, QR code) opzionale, attivabile/disattivabile dal pannello Sicurezza e GDPR; segreto crittografato AES-256

## Implemented (2026-10-18, Task 4.1 Feedback e Beta Testing)
- Pulsante "Feedback Beta" in top bar + modale (stelle 1-5, area: Trascrizione/Wispr Flow, PDF, Agenda Multi-Studio, Cassa, Altro, note libere) con ringraziamento boutique; testo crittografato AES-256 (collezione feedback)
- Sezione "Metriche di utilizzo" dopo la Cassa: referti generati, PDF scaricati/inviati, tempo medio risparmiato (stima 12 min manuali − generazione AI − revisione fino a salvataggio/PDF/email, max 20 min), segnalazioni, voto medio, referti 14 giorni, per area, ultime segnalazioni; toggle "I miei dati"/"Tutti i tester"
- Consultations ora salvano doctor_id, ai_sec, finalized_at, pdf_exports; API GET /api/beta/metrics, POST /api/beta/feedback (backend/beta.py)
- Testato: testing agent iteration_1 100% backend+frontend

## Implemented (2026-10-18, database UE)
- Dati dell'anteprima migrati (già cifrati AES-256) nel cluster MongoDB Atlas eu-central-1 (Francoforte), DB "mantmed"
- Produzione https://med-tablet-agenda.emergent.host collegata ad Atlas UE (System keys MONGO_URL/DB_NAME impostate dall'utente, DATA_REGION=eu-central-1); verificato: login+2FA, 11 pazienti, pannello GDPR "MongoDB Atlas · eu-central-1 · UE" (testing agent iteration_2, sola lettura)
- Pannello GDPR: la regione è mostrata solo se il DB è Atlas

## Implemented (2026-10-18, Task 4.2 Landing page)
- Landing pubblica su "/" (blu notte #0A192F, platino): header con logo A-M + "Accedi", hero, vantaggi (bento 5 funzioni), Sicurezza & GDPR con formulazione prudente (no "conformità totale"), modulo contatti, footer
- Dashboard e login spostati su "/app" (react-router), rotte sconosciute → "/"
- Modulo contatti: nome, email, specializzazione, città, tipo (beta/commerciale), messaggio, consenso; honeypot + limite 5/ora per IP; salvataggio cifrato (collezione leads) ed email di avviso a STUDIO_EMAIL
- Dashboard: sezione "Richieste dai medici" con stato Nuova/Contattato/Archiviata (GET/PATCH /api/leads, POST pubblico /api/public/leads)
- Testato: iteration_3 100%

## Implemented (2026-10-18, Pannello Founder)
- Account admin (ADMIN_EMAIL/ADMIN_PASSWORD in backend/.env, seed all'avvio) con RBAC: API cliniche solo ruolo doctor, /api/admin/leads solo admin
- Lead rimossi dalla dashboard medico; nuovo Pannello Founder su /admin: KPI (totali, nuove, contattati, attivati, conversione), filtri stato/tipo, ricerca, export CSV, dettaglio con stato Nuova/Contattato/Attivato/Archiviata (date), nota interna cifrata, 2FA attivabile
- Email di avviso nuove richieste solo a ADMIN_EMAIL
- Testato: iteration_4 (fix: /api/auth/me spostato su router pubblico autenticato)

## Implemented (2026-10-18, Registrazioni Medici e Pazienti)
- Landing: fascia "Registrati come Medico" / "Registrati come Paziente / Genitore", link "Area pazienti"; link registrazione anche nel login
- /registrati/medico (nome, cognome, specializzazione, n. iscrizione Ordine, email, telefono, sede, password) e /registrati/paziente (nome, cognome, CF del bambino, email, cellulare, password, informativa + consenso dati sanitari v1.0); verifica email con codice a 6 cifre (15 min, 5 tentativi)
- Medici: stato pending → approvazione in /admin "Medici e licenze" (approva/rifiuta/sospendi, email di attivazione); ogni medico ha uno studio separato (multi-tenant owner_id via backend/tenancy.py, migrazione automatica dei dati esistenti alla Dott.ssa Foti); intestazione referto da profilo
- Portale Paziente /portale (ruolo parent): collegamento automatico figlio solo se CF (indice HMAC cf_hash) + email genitore coincidono; più figli; referti solo se inviati via email o "Pubblica nel portale" (toggle nel passaporto); consensi firmati; appuntamenti; download PDF con audit
- Testato: iteration_5 + verifica manuale pubblicazione/PDF portale

## Implemented (2026-10-18, Richieste appuntamento e Invito portale)
- Appuntamenti con data (agenda = oggi; legacy senza data = oggi; GET /api/appointments/upcoming per "Prossimi giorni")
- Portale: "Richiedi appuntamento" (figlio, studio, prestazione, data/ora, nota cifrata) → collezione appt_requests; max 5 in attesa per genitore
- Dashboard medico: sezione "Richieste di appuntamento" (conferma con data/ora modificabili → appuntamento in agenda; rifiuta) + "Prossimi giorni"; email automatica al genitore; stato nel portale
- Passaporto: "Invita Genitore al Portale" → email con link personale 7 giorni (/registrati/paziente?invito=…) che precompila email e CF (GET /api/register/invite/{token}); richiede email genitore e CF nel passaporto
- Codice in backend/portal_flow.py; test helper tests/invite_token.py; testato iteration_6 100%

## Implemented (2026-10-18, Orari liberi e promemoria)
- backend/scheduling.py: orari per studio (default Centro lun-ven 9-13, Provincia lun-ven 15-19; nuovi medici 9-18) e durate (45/30/20/20) salvati su users.schedule; GET/PUT /api/settings/schedule; pannello "Orari studio" nella dashboard
- GET /api/portal/slots: slot da 15 min dentro l'orario, durata prestazione, senza sovrapposizioni con appuntamenti del giorno (tutti gli studi) e richieste in attesa; oggi solo da +1h; la richiesta fuori slot → 409; conferma usa la durata impostata
- Promemoria email 24h prima: cron piattaforma .emergent/crons.yml ogni 15 min → POST /api/cron/visit-reminders (Bearer WEBHOOK_CRON_SECRET, idempotenza X-Webhook-Id in cron_runs, lavoro in background); campi reminder_sent_at (reset su cambio data/ora); testo "da portare" per prestazione
- Nota: indirizzi @example.com rifiutati dal provider email (undeliverable) → promemoria non marcato; consegna verificata con delivered@resend.dev
- Testato iteration_7 100%

## Implemented (2026-10-18, Annulla visita)
- Portale: "Annulla visita" su visite programmate fino a 12 ore prima (motivo facoltativo; dopo: messaggio con telefono dello studio, 409 lato server); "Ritira richiesta" sulle richieste in attesa
- Stato appuntamento "annullato" (cancelled_by genitore, cancel_reason cifrato), slot liberato, email di conferma al genitore, audit; dashboard medico: "Annullate dal genitore · ultimi 7 giorni" (GET /api/appointments/cancellations), agenda con stato Annullato, "Prossimi giorni" esclude annullate
- Promemoria 24h con link "Gestisci o annulla la visita" → /portale?visita=<id> (apre la visita con il box di annullamento)
- Fix: decifratura visit_type nel promemoria e negli annullamenti; Literal status include "annullato"
- Testato iteration_8 + regressione tests/test_cancel_visit.py 12/12

## Implemented (2026-10-18, Pagamento Online)
- Stripe Checkout (sandbox reclamabile, test mode; modalità imposte: "Stripe calcola soltanto", codice medico esente → 0 €; EUR forzato) · billing.py, receipt.py
- Portale: scelta "Paga Online ora" (carta/Apple Pay/Google Pay, prezzo + bollo 2 € sopra 77,47 €) o "Paga in Studio" (flusso richiesta esistente). Online: slot bloccato 35 min, al pagamento appuntamento creato subito "Confermato & Pagato" senza approvazione; annullo checkout libera lo slot
- Fulfil idempotente (webhook /api/stripe/webhook + polling /api/portal/checkout/{sid}): appuntamento paid_online, incasso automatico nel Registro Cassa metodo "Pagamento Digitale / Online", ricevuta numerata per medico/anno (n/AAAA), email al genitore
- Ricevuta sanitaria PDF (dati fiscali medico, CF paziente, esenzione IVA art.10 n.18, bollo) da Portale (tab Ricevute) e dal Registro Cassa
- Annullamento genitore ≥12h di visita pagata → rimborso Stripe completo automatico, riga negativa "Rimborso" in cassa, ricevuta segnata come stornata; incassi online non eliminabili a mano (409)
- Medico: "Orari e tariffe" con listino per prestazione e dati fiscali (intestatario, CF, P.IVA, domicilio, nota). Online attivo solo con tariffa > 0 e CF o P.IVA
- Testato iteration_9 (15/15 backend, frontend OK) · tests/test_online_payment.py

## Implemented (2026-10-18, Tour Iniziale e report mensile)
- OnboardingTour.jsx: tour a 3 step con riflettore (Agenda e Sedi · Trascrizione Ambientale AI · Cassa e Commercialista), card blu notte/platino, Avanti/Indietro/Salta Tour/"Inizia a usare MantMed", Esc chiude; bottom sheet su mobile
- Apertura automatica al primo accesso del medico (users.tour_completed_at assente); completamento salvato con POST /api/onboarding/tour; /auth/me espone tour_done; pulsante "Rivedi Tour" nell'intestazione
- Registro Cassa: "Report mensile per il commercialista" (selettore mese → CSV del mese con incassi in studio, online e rimborsi)
- Testato iteration_10 (7/7 backend, frontend 100%) · tests/test_onboarding_tour.py; tour del medico demo reimpostato per la prova



## Implemented (2026-10-18, Rete Multispecialistica)
- Pannello Founder: "Aggiungi specialista alla rete" (nome, specializzazione, email, telefono, Ordine, sedi) → utente doctor status "invited", email con link /attiva?token (7 gg, invio in background), "Reinvia invito", interruttore "Nella rete" (in_network; studio fondatore incluso di default) · network.py, AddSpecialist.jsx, Activate.jsx
- Ogni medico configura in autonomia sedi (nome/indirizzo), orari per sede, elenco prestazioni proprio (nome, durata, tariffa) e dati fiscali; il pediatra parte con le 4 prestazioni storiche (services_of migra durations/prices)
- Portale: "Scegli Specialista / Medico" (GET /api/portal/network) → sedi, prestazioni e slot solo di quel medico (slots?doctor_id=); prima prenotazione presso nuovo specialista crea la cartella del bambino con soli dati anagrafici (child_at, dedup per cf_hash); pagamenti/cassa/ricevute separati per medico
- Consenso di rete: il genitore sceglie gli specialisti, legge l'informativa e firma con il dito (share_consents, firma e testo cifrati, revocabile, audit); passaporto medico: tab "Specialisti Collegati" con riepilogo (ultima diagnosi, terapia, ultime misure) e referti PDF in sola lettura
- Testato iteration_11 (15/15 backend, frontend 100%); test legacy di orari/pagamenti/annullamenti aggiornati al nuovo formato

## Implemented (2026-10-20, Comunicazioni e Notifiche con lo Studio)
- Richiesta utente: "Comunicazioni e Notifiche con lo Studio" nel portale paziente: centro messaggi (chat/ticket) con stato Inviato/Letto/Risposto, notifiche in tempo reale (campanella con badge) per nuovo referto, nuovo bilancio di salute, risposta del medico, promemoria appuntamenti imminenti; richieste rapide precompilate (certificato idoneità sportiva, ricetta ripetibile). Scelte: risposta dal medico in nuova sezione "Messaggi" della dashboard; conversazione separata per ogni coppia figlio-specialista; aggiornamento automatico ogni 20 s (polling); nessuna email, solo notifiche nel portale
- Backend messaging.py: collezioni threads/messages/notifications (oggetto, testo, campi, titoli cifrati AES-256), API /api/portal/threads*, /api/portal/notifications(+/read), /api/messages/summary|threads*; promemoria oggi/domani generati in modo idempotente; hook notify_parents su invio referto, pubblicazione nel portale (deduplicata per referto) e nuovo bilancio di salute; limite 15 nuove conversazioni/giorno; audit
- Portale: campanella con badge e menu notifiche (click → apre conversazione o tab del figlio), banner promemoria, sezione Messaggi e richieste con 4 richieste rapide, elenco + conversazione (responsive, tasto indietro su mobile), "Bilanci di salute" nella tab Referti
- Dashboard medico: sezione "Messaggi dalle famiglie" (filtri Tutte/Da rispondere/Risposte) e icona messaggi con badge in TopBar
- Testato iteration_12 (6/6 pytest test_messaging.py, frontend 1440/390 OK)

## Implemented (2026-10-20, Password dimenticata)
- Richiesta utente: recupero/reset password per Portale Paziente e Portale Medico/Operatore: link "Password dimenticata?" sotto il login, schermata "Recupera password" (email o Codice Fiscale) con "Invia link di ripristino" e messaggio generico, token temporaneo via email, pagina nuova password con validazione in tempo reale e conferma. Scelte: link valido 30 minuti; il genitore può usare il CF del figlio (link all'email del genitore collegato), i medici l'email; dopo il reset si chiudono tutte le sessioni e la 2FA resta attiva
- Backend password_reset.py: POST /api/auth/password/forgot (risposta sempre generica, 10 richieste/ora per IP, max 3 link per account ogni 30 min, solo account attivi), GET /api/auth/password/reset/{token} (email mascherata, ruolo), POST /api/auth/password/reset (min 10 caratteri con lettere, numeri e carattere speciale; token monouso salvato come hash SHA-256, TTL index; link costruito dall'host della richiesta, non da input del client; sessioni eliminate, blocchi login azzerati, email di conferma, audit)
- Frontend: ForgotStep.jsx dentro la card di login (/app, /portale, /admin), pagina /reimposta-password (ResetPassword.jsx) con barra di robustezza, regole live, conferma, mostra/nascondi; il successo rimanda all'area corretta
- Test helper: python tests/reset_token.py <email> [minuti]. Testato iteration_13 (backend 7/7, frontend 100%)

## Implemented (2026-10-20, Cambio password dal profilo)
- Richiesta utente: "Aggiungi nel profilo di medici e genitori la possibilità di cambiare password conoscendo quella attuale"
- Menu profilo (ProfileMenu.jsx): chip medico in TopBar (nome, email, Cambia password, Sicurezza e 2FA, Esci) e pulsante profilo nel Portale Paziente; ChangePasswordDialog.jsx con password attuale, nuova (regole live condivise in PasswordRules.jsx) e conferma
- POST /api/auth/password/change: verifica password attuale con blocco 15 min dopo 5 errori, nuova password robusta e diversa, sessione corrente mantenuta, altre sessioni chiuse, 2FA invariata, email di conferma, audit
- Seed medico/admin: la password da .env non sovrascrive più una password cambiata dall'utente (password_changed_at)
- Testato iteration_14 (backend 100%, frontend 100%)
## Implemented (2026-10-20, Area Riservata / Gestione Account)
- Richiesta utente: sezione "Area Riservata / Gestione Account" per Portale Paziente e Portale Medico/Operatore, adattata al ruolo, accessibile dal clic sul nome/avatar in alto a destra, responsive mobile/tablet. Scelte: SMS mostrato "in arrivo"; email del genitore attive di default solo per gli appuntamenti; cancellazione = disattivazione immediata + avviso a medico e MantMed, cartelle conservate; ferie/assenze bloccano gli orari nel portale e sono segnalate in dashboard
- Pagina /area-riservata (Account.jsx, components/account/*): Genitore → Dati personali (nome, cognome, CF, indirizzo, telefono cifrati), Nucleo familiare (figli collegati, aggiungi con CF, "Richiedi modifica" che apre una conversazione con lo studio), Sicurezza (password, email di accesso con conferma password, 2FA, sessioni attive), Notifiche (Email/In-App per appuntamenti, referti, messaggi; SMS in arrivo), Privacy (consensi, export JSON art. 15/20, cancellazione). Medico → Profilo professionale (titolo, nome, specializzazione, Albo, indirizzo studio, telefono, email contatto, usati nell'intestazione dei referti), Orari e disponibilità (ScheduleDialog + ferie/assenze), Notifiche (email per prenotazioni, disdette, messaggi; in-app sempre attive), Sicurezza
- Backend account.py: /api/account (GET, profile/parent, profile/doctor, email, notifications, sessions, sessions/close-others, absences, export, delete); preferenze rispettate in notify_parents, email appuntamenti (portal_flow, promemoria cron) e avvisi email al medico (richieste, pagamenti online, disdette, messaggi); free_slots esclude i giorni di assenza; stato "deactivated" bloccato al login; sessioni con dispositivo/IP; flag founder esplicito nel seed (nome/password modificati dall'utente non più sovrascritti)
- Testato iteration_15 (backend 8/8, frontend 100%)


## Implemented (2026-10-20, Bodychart Interattivo)
- Richiesta utente: "Bodychart Interattivo (Mappa Corporea)" nella scheda visita del medico: sagome Frontale/Posteriore/Laterale (bambino o adulto), marcatori per categoria con colori (Lesione, Trauma/Contusione, Dolore, Eruzione/Dermatite, Punto di controllo/Nevo) e note brevi, penna ed evidenziatore a mano libera, "Salva Bodychart nella Visita" con istantanea collegata al report, storico delle visite precedenti, touch-friendly. Scelte: pagina nel referto PDF (anche inviato/pubblicato) solo con "Includi nel referto"; famiglie vedono sempre il bodychart accanto al referto pubblicato; laterale destra e sinistra
- Frontend: components/bodychart/* (BodychartEditor a tutto schermo, BodyCanvas con pointer events e touch-action none, sagome SVG vettoriali parametriche in lib/bodychart.js, Tools, storico, snapshot PNG 4 viste via renderToStaticMarkup+canvas), pulsante "Bodychart" con contatore in NoteEditor, PortalBodychart nel Portale
- Backend bodychart.py: GET/PUT/DELETE /api/consultations/{cid}/bodychart, GET /api/patients/{pid}/bodycharts, GET /api/bodycharts/{id}, GET /api/portal/reports/{cid}/bodychart (solo referti inviati/pubblicati); marcatori, tratti e istantanea cifrati AES-256; report.py bodychart_page (immagine + legenda) quando include_in_report
- Testato iteration_16 (backend 3/3, frontend 100%)
- Nota: la 2FA del medico demo risulta disattivata dopo i test (segreto non recuperabile): va riattivata dall'Area riservata


## Implemented (2026-10-20, Sidebar di navigazione)
- Richiesta utente: barra laterale fissa a sinistra per medici e pazienti con voci per ruolo (Medico: Dashboard/Agenda, Pazienti & Cartelle Cliniche, Messaggi/Chat, Bodychart/Visite, Fatturazione & Tessera Sanitaria, Impostazioni Account; Paziente: Panoramica/Famiglia, Appuntamenti, Referti & Bilanci di Salute, Messaggi con lo Studio, Ricevute e Pagamenti, Impostazioni/Feedback), collassabile con hamburger su tablet/mobile, stato attivo evidente. Scelte: ogni voce apre una pagina separata; nuova pagina Pazienti con cartella (visite + storico bodychart); Fatturazione = Registro Cassa + riquadro "Invio al Sistema TS: in arrivo"
- AppShell.jsx (sidebar fissa ≥1024px, drawer con hamburger sotto 1024px, badge messaggi), sections.jsx (PageTitle, VisitsList, PatientFolder, TsCard, SettingsExtras); rotte /app/:sezione? e /portale/:sezione?; Account embedded nelle Impostazioni; /area-riservata reindirizza; notifiche portale navigano alla pagina giusta; feedback anche per i genitori (POST /api/portal/feedback)
- Testato iteration_17 (frontend 100%)


## Implemented (2026-10-20, Barra compatta)
- Richiesta utente: "Aggiungi un pulsante per ridurre la barra laterale alle sole icone e lasciare più spazio all'agenda su tablet"
- AppShell: pulsante "Riduci barra" / espandi (sidebar-collapse-btn) sopra il profilo; modalità compatta 84px solo icone con etichetta come tooltip e per screen reader, badge sull'icona, indicatore attivo; scelta ricordata per browser (localStorage mantmed.sidebar.mini); transizione fluida di larghezza e del contenuto. Verificato con screenshot a 1180px






## Implemented (2026-10-21, Ripristino ambiente + Pad di Firma Digitale)
- Codice importato dallo ZIP (FANCULO-main); .env ricreati (DATA_ENCRYPTION_KEY e JWT_SECRET originali forniti dall'utente, STUDIO_PHONE 0965 371313; STRIPE_WEBHOOK_SECRET ancora vuoto); DB locale riseminato + genitore demo genitore.demo@example.com
- components/signature/SignaturePadModal.jsx: modale "Firma del Genitore / Tutore" / "Firma Consenso", canvas senza librerie (pointer events + coalesced events, tratto variabile per pressione pennino e velocità, curve quadratiche, HiDPI, ResizeObserver con replay), campo nome firmatario, data/ora sotto la firma, Pulisci / Riscrivi, Conferma Firma con validazione (vuoto, troppo corta, nome); output PNG base64 ritagliato e trasparente; SignatureField con anteprima e "Rifirma"
- Usato nel consenso informato del Passaporto (ConsentDialog) e nel consenso di rete del Portale (NetworkSharing); testato iteration_18 (100%, desktop/tablet/mobile touch)

## Backlog
- P1: percentili automatici con curve OMS, storico crescita del paziente, dati demo pediatrici in agenda/sala d'attesa, rinomina brand in "MantMed"
- P1 (prec.): storico paziente, export PDF dedicato
- P2: agenda multi-giorno, trascrizione in streaming durante la registrazione
- P2 (pagamenti): rimborso/storno manuale dal medico, export ricevute per Sistema Tessera Sanitaria, selettore data shadcn nel portale
- P2 (rete): tipi visita della dashboard medico (AppointmentDialog) allineati all'elenco prestazioni del medico; aggiornamento sedi in dashboard senza ricaricare la pagina
- Test legacy test_portal_flow.py dipendono da account TEST eliminati (429 per blocco tentativi): da rigenerare
