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

## Backlog
- P1: percentili automatici con curve OMS, storico crescita del paziente, dati demo pediatrici in agenda/sala d'attesa, rinomina brand in "MantMed"
- P1 (prec.): storico paziente, export PDF dedicato, recupero password
- P2: agenda multi-giorno, trascrizione in streaming durante la registrazione
