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

## Implemented (2026-10-21, Firma elettronica: backend, PDF firmati, archivio)
- backend/signed_docs.py + signed_pdf.py: POST /api/signatures (medico) e POST /api/portal/signatures (genitore) ricevono firma PNG, paziente, documento (consenso_privacy), firmatario, clausole, ora dispositivo; il server aggiunge marca temporale, IP reale (netutil.client_ip: X-Forwarded-For letto da destra saltando Cloudflare/Google/reti private), user-agent, codice firmatario FIR-… (HMAC)
- PDF reportlab protetto da modifiche (StandardEncryption canModify=0, solo stampa/copia), template ufficiale con intestazione medico, informativa (testo ora dal backend GET /signatures/template), dichiarazioni, riquadro firma, box "Dati di firma elettronica" (n. documento, modello, marca temporale, IP, dispositivo, canale, codice firmatario, SHA-256 dei dati firmati); PDF generato prima di revocare i consensi precedenti
- Archivio: collezione signed_docs (PDF + firmatario + IP + UA cifrati AES-256, file_sha256 in chiaro per verifica), consents.document_id; revoca consenso/condivisione → documento "non più valido"
- Accesso: GET /api/patients/{pid}/documents, /api/documents/{id}/pdf (owner_ids), /api/portal/documents/{id}/pdf (figli collegati), portal/me children[].documents + consent_at; GET /api/patients/{pid}/consent-form.pdf modulo cartaceo stampabile
- Verifica pubblica /verifica (SHA-256 calcolato nel browser) → POST /api/public/verify (limite 30/ora per IP, collezione verify_hits TTL)
- Consenso di condivisione tra specialisti: PDF archiviato e collegato a tutte le cartelle dei medici coinvolti (network.create_share)
- Firma del medico: Area Riservata > "Firma per i referti" (GET/PUT/DELETE /api/settings/signature, cifrata) apposta su ogni referto PDF con data e ora
- Portale: banner "Consenso informato da firmare" + "Firma ora" (PortalConsentDialog) per ogni cartella senza consenso; tab Consensi con documenti firmati scaricabili
- Testato iteration_19 (backend 15/15 tests/test_signed_docs.py, frontend 100%); fix: IP non falsificabile, revoca senza immagine firma, generazione atomica, rate limit su Mongo, canvas robusto, conferma rimozione firma medico

## Implemented (2026-10-21, Trascrizione asincrona Whisper + IA)
- POST /api/consultations/start (multipart: metadati + audio o trascrizione): crea subito la visita status "processing" e avvia il job in background (asyncio task con riferimento forte); audio cifrato AES-GCM in GridFS "consult_audio", job in consult_jobs (TTL 7 giorni, pulizia audio ogni 6h); ripresa automatica dei job dopo riavvio
- run_consult_job: Whisper (filtro allucinazioni/silenzio) → LLM → unione con crescita/farmaci del medico (concorrenza ottimistica campo rev) → status "ready" | "failed" con messaggio in italiano
- GET /api/consultations/{id}, POST /api/consultations/{id}/retry (anche con {transcript} incollata), PATCH con growth_only durante l'elaborazione; PDF / invio genitori / pubblicazione portale → 409 finché non è pronta; in "failed" il medico può compilare a mano e salvare
- Frontend: lib/processing.jsx (ProcessingProvider, polling 2s, pill "Elaborazione referto in corso…" in alto a destra, toast "Referto pronto" con Apri / errore con Riprova, in basso a destra); "Termina e trascrivi" apre subito la cartella della visita: campi IA con shimmer, poi riempiti con animazione; Bodychart, Cassa, Crescita (autosalvataggio), "Dati anagrafici" (PatientDialog) usabili subito; banner errore con Incolla trascrizione / Riprova
- Testato iteration_20-21 (backend 24/24 test async, frontend 100%)

## Implemented (2026-10-21, Prompt IA per specializzazione + visite lunghe + promemoria firma)
- structure_note legge la specializzazione del medico (users.profile.specialty, fallback DOCTOR_SPECIALTY) → system prompt "Sei un assistente medico specializzato in …"; Pediatria mantiene il modello pediatrico (TORL, allattamento, svezzamento, percentili OMS); altre branche: campi comuni + ClinicalNote.sezioni [{gruppo anamnesi|sintomi|esame_obiettivo|altro, titolo, testo}]; note.specialita salvata dall'avvio della visita
- PDF/Copia/Stampa e NoteEditor dinamici (voci modificabili, aggiungi/rimuovi; Parametri adulto = peso/altezza/BMI; farmaci testuali per adulti; Cassa "Visita specialistica di …")
- Visite lunghe: useRecorder ruota il MediaRecorder ogni 10 minuti (parti autonome), POST /api/consultations/audio-parts per parte (≤25 MB, cifrata GridFS), /start con part_ids (max 12 ≈ 2 h, parti riservate a una sola visita, 409 se riusate); job trascrive in ordine con contesto della parte precedente, ai_step mostrato nella pillola, ripresa dalle parti già trascritte
- Promemoria firma medico: banner in dashboard + link sotto "Genera Referto PDF" verso Impostazioni > Firma per i referti (la Dott.ssa Foti deve disegnarla lei)
- Medico demo Cardiologia: cardiologo.demo@example.com / Cardio-Demo-2026; testato iteration_22 (backend 36/36, frontend 100%)

## Implemented (2026-10-21, Ricerca globale + Riepilogo paziente + dicitura)
- GET /api/search?q= (medico): pazienti (nome normalizzato senza accenti, tutte le parole, o CF esatto via cf_hash), referti passati (diagnosi/motivo/nome dopo decifratura, ultimi 600), appuntamenti futuri (non annullati/completati); max 8 per gruppo; GET /api/consultations?patient_id= per lo storico completo nella cartella
- GlobalSearch (components/search): pulsante nella top bar + Cmd/Ctrl+K da ovunque, gruppi Pazienti / Referti passati / Appuntamenti futuri, evidenziazione, navigazione tastiera; paziente → cartella, referto → visita, appuntamento → cartella o agenda (chiude l'overlay se aperto). Nota: il componente riga non deve chiamarsi "Item" (ricorsione del plugin visual-edits con Command.Item)
- ClinicalNote.riepilogo: generato in parallelo alla cartella (asyncio.gather), per genitori (pediatria) o paziente; card "In parole semplici" nel NoteEditor (Copia, Rigenera via POST /api/consultations/{id}/summary); inserito nell'email del referto e nel Portale
- "Invia al paziente" / testi email per medici non pediatri
- Testato iteration_23 (backend 28/28, frontend ok; fix successivi: ricerca pazienti per parole/accenti, patient_id appuntamento, overlay chiuso, cartella con tutte le visite, top bar mobile)

## Backlog
- P1: percentili automatici con curve OMS, storico crescita del paziente, dati demo pediatrici in agenda/sala d'attesa, rinomina brand in "MantMed"
- P1 (prec.): storico paziente, export PDF dedicato
- P2: agenda multi-giorno, trascrizione in streaming durante la registrazione
- P2 (pagamenti): rimborso/storno manuale dal medico, export ricevute per Sistema Tessera Sanitaria, selettore data shadcn nel portale
- P2 (rete): tipi visita della dashboard medico (AppointmentDialog) allineati all'elenco prestazioni del medico; aggiornamento sedi in dashboard senza ricaricare la pagina
- Test legacy test_portal_flow.py dipendono da account TEST eliminati (429 per blocco tentativi): da rigenerare

## 2026-06 Pulizia Dati Prova (Founder)
- /admin tab "Dati di prova": GET /api/admin/test-data (anteprima), POST /api/admin/test-data/purge {owner_ids}
- Elimina visite degli account demo selezionati (DOCTOR_EMAIL + @example.com) e visite/pazienti/appuntamenti con nomi TEST_/Test/Prova + audio, job, body chart, misure, notifiche, consensi. Account demo mantenuti. Solo ruolo admin (403 altrimenti). File: backend/cleanup.py, frontend/src/components/admin/TestDataCleanup.jsx

## 2026-06 Modelli Visita (multi-modello)
- backend/visit_templates.py: libreria 13 specialità (8-10 campi: anamnesi mirata / parametri_vitali / esame obiettivo) + generazione IA per altre (cache db.visit_template_bases) + fallback generico. CRUD /api/visit-templates (GET seed atomico "Prima visita", /base, POST, PUT, DELETE 400 se ultimo)
- /consultations/start e /consultations accettano template_id: la visita salva template_id/name/fields, note.sezioni precompilate; LLM riceve campi_modello numerati e map_fields li riporta in ordine
- Pediatria: cartella standard invariata + campi modello come voci extra. Nuovo gruppo parametri_vitali (tab Crescita/Parametri, PDF sezione 04, copia testo)
- UI: Impostazioni > Modelli Visita (crea, rinomina, duplica, elimina, ripristina base, campi con riordino, avviso modifiche non salvate); selettore modello nell overlay consultazione
- Test: iteration_24 (19 backend + frontend OK)

## 2026-06 Feedback e assistenza via email
- FeedbackDialog unico (medico + portale): tipi feedback / supporto / segnalazione; stelle obbligatorie solo per feedback; aree specifiche per portale paziente; info tecniche automatiche per segnalazioni; schermata conferma + errore con Riprova (client_id idempotente)
- backend beta.submit_feedback: salva in db.feedback (email_sent flag) e invia email a ADMIN_EMAIL (mantmedicine@gmail.com) con oggetto descrittivo, nome/cognome/ruolo/email, area, messaggio, data-ora Europe/Rome; reply-to = email utente. Endpoint /api/beta/feedback e /api/portal/feedback
- Test: iteration_25 OK

## 2026-06 Bilanci di salute pediatrici
- visit_templates.BILANCI: 10 bilanci (1m,3m,6m,9m,12m,18m,2-3a,5-6a,8-10a,11-14a) 10-13 campi, age_from/age_to in mesi; import automatico una sola volta per pediatri (users.bilanci_seeded_at), eliminabili; GET/POST /api/visit-templates/bilanci per reimportare; indice unico (owner_id,bilancio)
- Settings: righe Modelli / Bilanci di salute, BilanciDialog con anteprima; Overlay: bilancio consigliato per eta (badge), preselezionato solo se motivo contiene "bilancio"
- Test: iteration_26 OK, fix post-test applicati (ordinamento, preselezione, grammatica)

## 2026-06 Questionario pre-visita + Inbox Founder
- backend/previsit.py: GET/POST /api/portal/checkpoint(s) per genitori (source portale, ricompilazione entro 30gg aggiorna senza duplicare, avviso al medico); latest_previsit (30gg) salvato su consultation.previsit (cifrato) quando il modello e un bilancio; previsit_prompt passato all IA ("riferito dai genitori")
- UI: PrevisitCard nel Portale (wizard CheckpointWizard con load/send), PrevisitPanel nella cartella
- backend/support_inbox.py: /api/admin/feedback (list, patch status/nota, reply -> salva prima, poi email; reply_email_sent), /api/support/replies + read per avviso in app
- UI: Admin tab "Feedback e assistenza" (SupportInbox/SupportRow), SupportReplies in Dashboard e Portale
- Test: iteration_27 + fix post-test (risposta salvata anche se email fallisce, testo non perso, etichette, allineamenti)

## 2026-06 Rifinitura presentazione: Panoramica, Vetrina, Trova Specialista
- backend/showcase.py: Object Storage Emergent (foto/copertina, db.files soft-delete), /api/showcase (GET/PUT, image upload/delete), /api/public/doctors, /api/public/doctors/{slug}, /api/public/files/{id}; slug generati allo startup
- /api/portal/children/{pid}/simple: "In parole semplici" (diagnosi, cosa fare, quando tornare, glossario) IA con cache su consultation.simple (cifrata, invalidata al PATCH)
- UI: PortalOverview (copertina saluto, SimpleBox, DoctorCard), sezione Portale Trova Specialista + dialog Vetrina con prenotazione (RequestDialog doctorId), pagina pubblica /medico/:slug, Area Riservata > Vetrina pubblica con anteprima dal vivo; sfondo Portale caldo #FBF8F3
- Test: iteration_28 (19/19 backend, frontend ok) + fix layout editor prestazioni

## 2026-06 I miei Documenti e Visite + Trova Specialista arricchito
- backend/portal_docs.py: /api/portal/children/{pid}/therapy (+/pdf promemoria terapia, non sostituisce ricetta), referti aggregati per stesso CF tra medici collegati
- UI: sezione Portale /portale/documenti (DocumentsArea: tab visite/prescrizioni/ricevute, per anno, totale spese sanitarie), voce nel menu profilo; /portale/referti e /ricevute reindirizzano
- Trova Specialista: card con bio breve, 3 prestazioni, Visualizza profilo / Richiedi visita, filtri per specialita
- Demo: pubblicati nel Portale 2 referti di Aurora (otite + bilancio 5 anni)
- Test: iteration_29 OK

## 2026-06 Area Riservata completa + disponibilita
- Portale /portale/documenti = "Area Riservata": tab Visite, Bilanci di salute (prossimo bilancio, questionario pre-visita, bilanci, check-point), Prescrizioni, Ricevute, Famiglia e Consensi (dati figlio, medici, consensi attivi + storico, documenti firmati, condivisione, collega figlio; revoca solo tramite studio)
- /api/public/doctors/{slug}/availability: primi 6 orari liberi in 14 giorni per prestazione/studio; Availability in Vetrina (Portale e pagina pubblica); clic -> RequestDialog precompilato (preset), anche dalla pagina pubblica via ?slot=
- Test: iteration_30 OK + fix (scroll tab attivo, DlBtn, slot preservato, storico consensi, testi per genere)

## 2026-06 Calendario visuale disponibilita
- /api/public/doctors/{slug}/week?start=&service=&clinic= (lun-dom, 8 settimane, giorni passati vuoti)
- WeekCalendar.jsx dentro Availability: 7 colonne scorrevoli su desktop, striscia giorni + swipe su mobile; clic orario -> prenotazione precompilata. Verificato con screenshot desktop/mobile

## 2026-06 Bodychart potenziato
- Zoom anatomici (ZOOMS viewBox animato con framer-motion), vista Cavo orale (20/32 denti), categorie a colori (+controllo verde)
- Foto sui pin: POST /api/consultations/{cid}/bodychart/photos, GET /api/bodychart-photos/{fid} (solo medico, object storage); PUT filtra id foto non validi e marca orfane is_deleted
- Storico: timeline, confronto affiancato 2 visite, galleria foto cronologica; "Riporta marcatori visita precedente" come Controllo
- Test: iteration_31 OK + fix (validazione foto, carry-over una volta e solo da visite precedenti, etichette cavo orale, X lightbox, scroll editor su mobile)

## 2026-06 · Refactor avvio / registrazione / autenticazione (iteration_32 PASS)
- Avvio: verifica sessione con timeout 12s, splash MantMed (auth-loading, messaggio "connessione lenta" dopo 4s), schermata BootError con "Riprova" su rete/5xx; nessun flash del login per utenti loggati
- Registrazione medico/paziente: validazione live per campo (nome, email, telefono, CF con carattere di controllo, password con barra di forza, conferma), errori inline, errori server mappati sul campo, consensi con errore inline, focus sul primo campo errato
- Nuovo GET /api/register/email-available (30 richieste/10 min per IP): "Email già registrata" all'uscita dal campo
- Regole password uniformi: 10 caratteri + lettera + numero + carattere speciale (backend _strong)
- Codice di verifica: errore inline, reinvio con countdown 60s
- Post-login: toast "Bentornato", reindirizzamento automatico all'area del ruolo (/app, /portale, /admin); utenti loggati in area sbagliata reindirizzati automaticamente (WrongArea rimossa)
- Parent signup: schermata "Account attivo" + toast + redirect a /portale senza refresh
- Backlog: CORS_ORIGINS='*' con credenziali (preesistente) da restringere ai domini reali in produzione

## 2026-06 · Fix "Avvia Consultazione / Inizia registrazione" (iteration_33 PASS)
- Errori inline accanto al pulsante (consult-start-error) oltre al toast; stato "In attesa del microfono…" con timeout 20s
- Messaggi specifici: permesso negato, anteprima in iframe che blocca il microfono, nessun microfono, microfono occupato, contesto non sicuro
- Anelli animati non intercettano più i clic; consenso cartaceo azzerato a ogni nuova consultazione

## 2026-06 · Prova microfono (iteration_34 PASS)
- Pulsante "Prova microfono e livello audio" nella preparazione consultazione: indicatore livello in tempo reale, giudizio basso/buono/alto, scelta del microfono (salvata in localStorage 'mantmed-mic' e usata per la registrazione)

## 2026-06 · Modale "Cos'è MantAI" (iteration_35 + fix verificati)
- components/mantai/MantAI.jsx: MantAIDialog (schede Per il medico / Per la famiglia, sezione Sicurezza) + MantAIButton (varianti sidebar, banner, icon)
- Accessi: voce sidebar (medico e portale), banner sotto "In parole semplici" nel portale, pulsante nella preparazione consultazione
- Testo: "basato su modelli di AI avanzati di fornitori selezionati, responsabili del trattamento (art. 28 GDPR)"; nessuna dichiarazione su localizzazione UE o certificazioni
- Fix: dialog z-[60] sopra il drawer mobile, Esc chiude solo il dialog, scheda torna alla vista di default a ogni apertura

## 2026-06 · Pagina /privacy (iteration_36 PASS)
- pages/Privacy.jsx + components/privacy/content.js: informativa artt. 13-14, titolari/responsabili, basi giuridiche, MantAI (art. 22), fornitori (OpenAI, Emergent, Postmark, Stripe) con "possibile trasferimento extra-UE con SCC", conservazione, sicurezza, diritti
- Segnaposto "[da completare: …]" per ragione sociale, sede, P.IVA, email privacy, DPO (da sostituire in content.js)
- Avviso "Bozza da validare con DPO" visibile solo agli admin
- Link: finestra MantAI (/privacy#fornitori), footer landing, pagine di registrazione

## 2026-06 · Tour guidato ampliato (iteration_37 + fix spotlight verificato)
- components/tour/GuidedTour.jsx (riusabile), steps.js (DOCTOR_STEPS / PATIENT_STEPS, 4 passi + "Tutto pronto"), useTour.js (avvio automatico se tour_done false, Salta = visto)
- Ogni passo naviga alla sezione e evidenzia l'elemento reale; link extra (Fatturazione & TS, Messaggi); tastiera ← → Esc
- Riavvio: medico TopBar + Impostazioni; portale icona in header + Impostazioni
- Fix backend: POST /api/onboarding/tour spostato su public_api (prima 403 per i genitori)
- Rimosso vecchio components/dash/OnboardingTour.jsx

## 2026-06 · Medicina di Squadra (iteration_38 PASS + fix)
- backend/team.py: team_grants (pending/active/revoked/denied, firma sigillata), team_notes (cifrate), team_access_log; migrazione share_consents -> deleghe individuali (vecchie revocate)
- Medico: /api/team/search (CF), /team/patients/{pid}, /team/view/{ref} (+request con cooldown 24h dopo rifiuto/revoca, notes, reports/{cid}/pdf); audit medicina_squadra_* agli owner
- Genitore: /api/portal/team, /grants (firma), /grants/{id}/revoke, /deny; notifica kind "team"
- UI: NetworkSearch (Pazienti), TeamPanel (cartella + passaporto tab "Medicina di squadra"), portale tab "Condivisione" (TeamSharing) con richieste, accessi, registro
- Rimossi NetworkSharing.jsx e LinkedSpecialists.jsx
- Test: backend/tests/test_team_medicine.py (21 pass); dati team di test ripuliti

## 2026-06 · Tour completo v2 (iteration_39 PASS + rifiniture)
- 5 passi per ruolo: medico +Medicina di Squadra (team-network-search), Bodychart con pin/foto tablet; paziente +prescrizioni, copertine, passo 5 Messaggi e supporto (link Feedback)
- TOUR_VERSION=2 in auth.py: chi aveva visto il tour v1 lo rivede una volta
- Rifiniture: card compatta su mobile ("Più dettagli"), card a sinistra se il target è a destra, target prefisso (visit-row-*), toast chiusi all'apertura, pulsante tour visibile anche su mobile nell'area medico

## 2026-06 · Video nel tour (iteration_40 + fix verificati)
- 10 clip reali registrate con Playwright sull'app demo: /app/frontend/public/tour/{doctor,patient}-{1..5}.{webm,mp4,jpg} (~2.9 MB totali, 9-12s, senza audio)
- Generatore: /app/scripts/record_tour_videos.py (venv /tmp/pwenv con playwright + imageio-ffmpeg; da rilanciare se cambia l'interfaccia)
- components/tour/TourVideo.jsx: anteprima in loop nella scheda (≥640px), autoplay disattivato con saveData/rete cellulare; su telefono solo poster, il video si carica al tocco; schermo intero con controlli; frecce/Esc non muovono il tour mentre il video è a schermo intero

## 2026-06 · MantAI Risposte (iteration_41 + fix verificati via curl)
- backend/ai_replies.py (Claude Opus 5.5 via Emergent key): classificazione AI + regex urgenza (prudenza urgenza>clinico>amministrativo), bozze cifrate (ai_reply_drafts), ai_reply_settings/ai_knowledge_base per sede, messaggio urgenza fisso, invio automatico amministrativo solo da KB (tutte le sedi), pseudonimizzazione (CF/email/tel poi nomi, cognome condiviso), audit mantai_* con message_id/actor_id, scartate cancellate dopo 30gg
- messaging.py: add_message a livello modulo, HOOKS parent_message/doctor_reply, messaggi from="system", ai_label, stato thread "in_attesa", campi ai_* nel thread lato medico
- UI: DoctorMessages tab "Coda risposte" (ReplyQueue.jsx), banner urgenza, badge, toast; Impostazioni › MantAI Risposte (AiRepliesSection.jsx); portale etichette + "Come funziona"; MantAI dialog sezione; /privacy sezione + fornitore Anthropic
- Stato demo: funzione DISATTIVATA su entrambe le sedi (default)

## 2026-06 · MantAI Risposte v2 – messaggistica NON per urgenze (iteration_42 PASS + fix UI)
- Solo 2 categorie (clinico/amministrativo; dubbio -> clinico; regex urgenza forza clinico + urgent_hint nella bozza)
- Rimossi: messaggio automatico di urgenza, thread rossi, email urgenza, contatore urgent
- Avviso fisso urgenze (notice_text per sede, [telefono studio] <- KB phone, fallback telefono profilo) sempre visibile sopra il campo di scrittura del portale (Conversation + NewThreadDialog) anche a funzione spenta: GET /api/portal/ai-notice
- Conferma ricezione fissa con telefono e 112/118 (anche se l'AI fallisce); migrazione urgenza->clinico all'avvio
- Stato demo: funzione disattivata, telefono KB vuoto. Nota: il portale demo contiene molte conversazioni TEST_ create dai test

## Implemented (2026-10-26, Etichettatura e tracciabilità contenuti AI — ai_provenance)
- backend/provenance.py: make/reviewed/log (registro GDPR, etichette italiane)/present (nome revisore Dott./Dott.ssa dal profilo)/pending_fields (indicatori per campo da ai_snapshot cifrato)/mark_pdf (Keywords + XMP mantai:*)/ProvenanceGuard (403 se il body JSON/form contiene la chiave ai_provenance o ai_snapshot)/migrate (idempotente all'avvio)
- Consultations: ai_provenance {ai_generated, tipo nota_clinica|bilancio, modello, generated_at, stato_revisione, reviewed_by, reviewed_at, modificato_dal_medico, parti:{trascrizione, riassunto_famiglia, spiegazione_semplice}}; ai_snapshot cifrato; out() espone ai_fields_pending
- POST /api/consultations/{id}/sign = unico punto di revisione; invio email e pubblicazione nel portale bloccati (409) finché una nota MantAI è in bozza
- PDF referto: piè di pagina AI solo per note AI (verificata o BOZZA), metadati ai_assisted/tipo/reviewed_by; nessuna dicitura per note non AI/non determinabili
- MantAI Risposte: provenance su bozze (bozza), approvate (verificato, modificato=edited), automatiche (invio_automatico); messaggi con ai_provenance
- Email/notifiche: riga "Contiene una spiegazione generata da MantAI" / "risposta automatica di MantAI" ecc.
- Frontend: components/mantai/AILabel.jsx (+aiLabels.jsx, SimpleSummary.jsx), SignNote.jsx in NoteEditor (banner bozza, firma con responsabilità, indicatori per campo e pallino sulle schede), etichette in Passaporto, Coda risposte, Conversazioni, Portale (Documenti, Referti, In parole semplici sempre aperto), Medicina di squadra; "Cos'è MantAI" sezione "Come riconosci i contenuti AI"; privacy aggiornata; CompliancePanel etichette nuove azioni
- Migrazione: 22 consultazioni AI certe (ai_sec>0), 15 non determinabili, 9 messaggi, 19 bozze, 2 spiegazioni semplici
- Traduzioni: solo variante etichetta (funzione non esistente)
- Test: iteration_43 (backend 15/15, frontend A–G ok), tests in backend/tests/test_ai_provenance.py

## Backlog
- P2: copia di contenuti AI in note di squadra con provenienza (oggi non esiste un flusso di copia)
- P2: funzione traduzione referto (etichetta già pronta)

## Implemented (2026-10-27, Profili social in vetrina)
- backend/social_links.py: normalize() (https obbligatorio, domini ufficiali, max 300, no javascript:/data:/credenziali/porte, @nomeutente -> URL; LinkedIn -> /in/), public_links()
- backend/showcase.py: users.showcase.social_links [{piattaforma,url,visibile,ordine}], GET/PUT /api/showcase/social-links (solo utente loggato, 422 {message, errors}), full() espone solo visibili ordinati; audit 'vetrina_social_aggiornati'
- frontend: lib/socialLinks.js (stessa validazione), account/SocialLinksEditor.jsx (validazione live, anteprima, Apri per verificare, Mostra in vetrina, frecce ordine, avviso modifiche non salvate, nota deontologica), showcase/SocialRow.jsx (icone tonde navy/argento, link diretti target _blank rel noopener noreferrer nofollow, tooltip; TikTok e X SVG inline)
- Rotta pubblica esistente: /medico/:slug
- Test: iteration_44 backend+frontend 100%

## Implemented (2026-10-27, Bodychart v3 — approvati punti 2,3,5,6,7,9)
- Viste di dettaglio (head, ears, mouth, hand_palm, hand_back, foot_back, foot_sole) in components/bodychart/Details.jsx, lenti (hotspots) sulla figura intera
- Inserimento rapido: PinSheet (categoria, descrizione, cm, descrittore, stato, foto, un solo Salva; Esc/Invio), spostamento solo con pressione prolungata 450 ms + trascinamento (BodyCanvas), autosalvataggio 600 ms
- Stato per reperto + lesion_id persistente tra visite; GET /api/patients/{pid}/bodychart-lesions; Confronta con selettori data e pannelli SVG dal vivo; galleria foto per reperto affiancabile
- MantAI: POST /consultations/{cid}/bodychart/suggest (LLM su vocabolario REGIONS, cache per hash nota), .../suggest/{regione}/handled; i pin proposed non vengono mai salvati; checkbox "Includi la bodychart nel referto PDF" alla firma (PUT /bodychart/report)
- Foto: bodychart_media.process_photo (EXIF rimossi, JPEG 2048 + miniatura 360, AES-256-GCM), HEIC via pillow-heif; zone intime -> 428 senza doppia conferma, reserved=true; PUT forza reserved per pin spostati in zona intima; audit completo con dedupe 10 min sulle consultazioni
- Non approvati: figure per età, aree, visibilità per pin alla famiglia, punto prestazioni. Medicina di Squadra invariata (nessun accesso alla bodychart)
- Test: iteration_45/46 (31/31 backend), tests/test_bodychart_v3.py

## Implemented (2026-11-03, Oggi + MantAI + Portale minimal)
- components/mantai/MantAILogo.jsx (MantAIMark + wordmark); usato nel grande pulsante centrale "Inizia visita" (Today.jsx NextPatient centrato) e nel pulsante "Cos'è MantAI" della sidebar
- Fix iteration_47: TopBar senza clipping 768–1920 (logo duplicato rimosso, orologio/nome da xl, feedback/sicurezza da lg), waiting-panel senza h-full, griglia Oggi 7/5 da xl, ombra drawer solo se aperto
- Portale Famiglia: header chiaro, menu semplificato (Home, Appuntamenti, Documenti, Messaggi, Trova specialista, Impostazioni in basso; etichette brevi su mobile), copertina chiara, sfondi #FBFBF8/#F2F2EF
- Test: iteration_48 frontend 100%
- Backlog: rigenerare immagini anteprima del tour Portale (mostrano ancora il vecchio stile scuro)

## Implemented (2026-11-03, nuova schermata Oggi)
- components/oggi/ (OggiScreen, Panels, AgendaList, data.js): intestazione + filtro Tutti/Centro/Provincia, barra sottile "Prossimo paziente" (Cartella / Inizia visita con logo MantAI), dettaglio visita selezionata, Da fare (note da firmare, messaggi, richieste portale se presenti), agenda raggruppata per studio con linea "Ora", puntini stato/allergie, legenda, navigazione da tastiera
- Su richiesta utente: stessa shell/palette/font delle altre sezioni (niente palette grigio/cammello, niente top bar o tab bar dedicate). Sala d'attesa e ticker rimossi da Oggi; Richieste dal portale spostate in /app/messaggi
- Inizia visita apre la vera ConsultationOverlay (consenso + registrazione)
- Pagine pubbliche: lasciate invariate su richiesta
- Test: iteration_49 frontend OK

## Implemented (2026-11-03, barra di navigazione orizzontale)
- AppShell: su computer/tablet (>=768px) il menu laterale è ora una barra orizzontale scura in cima (TopNav), stesse voci e ordine, contenuto a tutta larghezza; etichette da 1280px, solo icone sotto; pulsante "Riduci barra" da 1280px. Telefono invariato (barra in basso + menu a scomparsa). Vale per Area Medico e Portale Famiglia
- Test: iteration_50 frontend OK

## Implemented (2026-11-03, testi identità e login)
- Login medici: link "Sei un genitore? Accedi all'area pazienti" → /portale (solo login medico/account, non portale/admin); sottotitolo "Workspace clinico · Pediatria specialistica"
- Registrazione genitore: etichette "Nome/Cognome del genitore / tutore", placeholder aggiornati (campi backend invariati)
- index.html: nuovo title e meta description; Logo.jsx sottotitolo aggiornato (componente oggi non usato)
- Test: iteration_51 OK (1440 + 375)

## Implemented (2026-11-03, tour guidato per la barra in alto)
- steps.js: tour medico 9 passi (menu, prossimo paziente, Inizia visita, Da fare, Agenda, Pazienti, Messaggi, Cassa/Strumenti, profilo) e famiglia 8 passi; target sulla barra in alto (desktop/tablet) o bottom-nav (mobile); niente sala d'attesa; video mantenuti
- GuidedTour: fumetto posizionato accanto all'elemento (sotto/sopra/lato, fallback in basso) sempre dentro lo schermo; testo scorrevole, pulsanti sempre visibili; target invisibili/fuori schermo ignorati
- ProfileMenu: voce "Rivedi tour" (Area Medico e Portale); avvio automatico al primo accesso invariato
- Test: iteration_52 (bug 768px risolto dopo, verificato con screenshot)

## Implemented (2026-11-03, export commercialista in PDF)
- backend/cash_pdf.py + GET /api/payments/export ora restituisce PDF A4 (intestazione medico/periodo/data generazione, tabella Data·Ora·Paziente·Prestazione·Studio·Metodo·Importo, riepilogo per metodo + totale, "Pagina X di Y"); nome file MantMed_commercialista_YYYY-MM.pdf (mese intero) / _YYYY-MM-DD.pdf (giorno) / _start_end.pdf
- CSV rimosso; pulsanti giorno e mese "Esporta PDF"; test aggiornati (test_onboarding_tour.py export)
- Nota: la landing cita ancora "export CSV" (non modificata su richiesta)

## 2026-06 Fix tema
- ConsultationOverlay: sfondo theme-bar (scuro in giorno/notte), campi input/textarea leggibili (regola CSS per input su superfici scure), pulsanti primari su --accent
- AppShell: nav orizzontale senza scrollbar/striscia (overflow-y-hidden, webkit-scrollbar nascosta)
- Backlog: placeholder giorno, --ok su --sel, box annidati PortalOverview, tour-video-expand notte

## 2026-06 Area personale e barre
- Impostazioni -> Area personale (/app/area-personale) a riquadri (DoctorArea.jsx); Profilo professionale unisce profilo+vetrina+firma; Strumenti eliminata (redirect da /app/impostazioni e /app/strumenti)
- Barra scura: ? tour, modalita' notte, orologio HH:MM:SS; barra chiara: meteo Open-Meteo (posizione browser + Nominatim, fallback citta' studio), solo profilo ed Esci
- Oggi -> Home; tour aggiornato
- Backlog: video tour con nuova interfaccia, Esc su pannello GDPR

## 2026-06 Nuova Home medico
- Pulsante rotondo Inizia visita (anello che pulsa, apre la visita sul prossimo paziente), riga Prossimo + Apri cartella
- Riepilogo a 3 riquadri (visite/note/messaggi), agenda a tutta larghezza con linea Ora per studio, dettaglio visita in pannello laterale
- Overlay visita: card 'Paziente selezionato' con Cambia
- Backlog: anteprime video tour aggiornate

## 2026-06 Home a due colonne
- Pulsante 240/180px 'Avvia MantAI' con logo bianco (public/mantmed-logo-white.png), logo anche nella barra in alto; rinominato ovunque
- Colonna destra sticky: riepilogo compatto, Vaccinazioni in scadenza (MOCK homeDemo.js, Vedi tutte in pannello), Bilanci di salute da programmare (date reali da data di nascita, Prenota apre AppointmentDialog con data), Pillola del giorno (30 consigli a rotazione)
- Linea Ora unica; legenda 'Allergie' con puntino rosso; AppointmentDialog ora ha il campo Data

## 2026-06 Home a tre colonne
- Rimossi vaccinazioni/bilanci/pillola; layout agenda | pulsante+card prossimo paziente (sticky) | riepilogo + Vera Health (link esterno, nessun dato inviato)
- Card prossimo paziente con tempo mancante o ritardo aggiornato ogni 30s

## 2026-06 Rifiniture Home/barre
- Tolto Esci dalla barra grigia (resta in barra blu e nel menu mobile), tolto pulsante 'Riduci barra'; tooltip su Cos'e' MantAI
- Colonne centrale e destra sticky su desktop; riepilogo 72px con numeri grandi; Vera Health con icona; motivo troncato su una riga
