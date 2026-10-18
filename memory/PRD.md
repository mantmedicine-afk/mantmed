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

## Backlog
- P1: percentili automatici con curve OMS, storico crescita del paziente, dati demo pediatrici in agenda/sala d'attesa, rinomina brand in "MantMed"
- P1 (prec.): storico paziente, export PDF dedicato, recupero password
- P2: agenda multi-giorno, trascrizione in streaming durante la registrazione
