// DATI DI PROVA (mock): pazienti reali, ma richiami e date dei bilanci non vengono dalle cartelle
const FALLBACK = [["Giulia Ferrara", 4], ["Leonardo Russo", 11], ["Sofia Marino", 14], ["Tommaso Greco", 70], ["Aurora Romano", 135]];
const MILESTONES = [[1, "1° mese"], [3, "3 mesi"], [6, "6 mesi"], [9, "9 mesi"], [12, "12 mesi"], [18, "18 mesi"], [36, "2-3 anni"], [66, "5-6 anni"], [108, "8-10 anni"], [150, "11-14 anni"]];

const vaccineFor = (m) => (m < 3 ? "Esavalente · 1ª dose" : m < 5 ? "Esavalente · 2ª dose" : m < 11 ? "Esavalente · 3ª dose" : m < 13 ? "Meningococco B · richiamo" : m < 16 ? "MPRV · 1ª dose" : m < 84 ? "DTPa-IPV · richiamo + MPRV 2ª dose" : m < 132 ? "dTpa · richiamo" : "HPV · 1ª dose");

const ageMonths = (b, now) => { const d = new Date(`${b}T12:00:00`); return (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth() - (now.getDate() < d.getDate() ? 1 : 0); };
const iso = (d) => d.toLocaleDateString("sv-SE");
const plusDays = (t, n) => iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));

const people = (patients, now) => {
  const real = patients.filter((p) => p.birth_date).map((p) => ({ name: p.name, id: p.id, m: ageMonths(p.birth_date, now) }));
  return real.length ? real : FALLBACK.map(([name, m]) => ({ name, id: null, m }));
};

export const demoVaccines = (patients, now = new Date()) => {
  const left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const list = people(patients, now).slice(0, 8);
  return list.map((p, i) => ({ id: `vac-${i}`, name: p.name, patient_id: p.id, vaccine: vaccineFor(p.m), date: plusDays(now, Math.round((left * i) / Math.max(list.length - 1, 1))) }));
};

const addMonths = (b, m) => { const d = new Date(`${b}T12:00:00`); d.setMonth(d.getMonth() + m); return d; };

// Prossimo bilancio di ogni paziente alla sua data reale: entro 14 giorni, altrimenti i 3 più vicini
export const demoBilanci = (patients, now = new Date()) => {
  const list = patients.filter((p) => p.birth_date).map((p) => {
    const next = MILESTONES.find(([m]) => addMonths(p.birth_date, m) >= now);
    return next && { name: p.name, patient_id: p.id, age: next[1], when: addMonths(p.birth_date, next[0]) };
  }).filter(Boolean).sort((x, y) => x.when - y.when);
  const soon = list.filter((b) => b.when - now <= 14 * 86400000);
  return (soon.length >= 3 ? soon.slice(0, 5) : list.slice(0, 3)).map((b, i) => ({ ...b, id: `bil-${i}`, date: iso(b.when) }));
};

export const shortDate = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

export const PILLS = [
  ["Febbre: si tratta il disagio, non il numero. Paracetamolo o ibuprofene solo se il bambino sta male, mai alternati di routine.", "Linee guida SIP sulla febbre"],
  ["Sotto i 3 mesi una temperatura ≥ 38 °C richiede sempre una valutazione medica rapida.", "NICE NG143"],
  ["Nanna sicura: sempre a pancia in su, materasso rigido, niente paracolpi o cuscini nella culla nel primo anno.", "Ministero della Salute · SIDS"],
  ["Vitamina D: 400 UI al giorno nel primo anno di vita, indipendentemente dal tipo di allattamento.", "Consensus SIP 2015"],
  ["Allattamento esclusivo raccomandato fino a circa 6 mesi, poi complementare alla prima alimentazione.", "OMS"],
  ["Autosvezzamento e svezzamento tradizionale sono entrambi validi: conta introdurre gli alimenti senza ritardare gli allergeni.", "SIGENP"],
  ["Introdurre presto arachide e uovo (dai 4-6 mesi) riduce il rischio di allergia, anche nei bambini a rischio.", "Studio LEAP · EAACI"],
  ["Niente miele prima dei 12 mesi: rischio di botulismo infantile.", "Ministero della Salute"],
  ["Bronchiolite: lavaggi nasali e idratazione. Salbutamolo e cortisonici non sono raccomandati di routine.", "Consensus intersocietaria italiana"],
  ["Otite media acuta non complicata sopra i 2 anni: si può proporre la vigile attesa per 48-72 ore.", "Linee guida SIP otite"],
  ["Faringite: il tampone rapido per lo streptococco evita antibiotici inutili nelle forme virali.", "Linee guida SIP faringotonsillite"],
  ["Amoxicillina resta la prima scelta nella polmonite acquisita in comunità del bambino sano.", "Linee guida SIP/SITIP"],
  ["Gastroenterite: soluzioni reidratanti orali a piccoli sorsi; ripresa precoce dell'alimentazione abituale.", "ESPGHAN"],
  ["Gli schermi sotto i 2 anni andrebbero evitati; tra 2 e 5 anni massimo un'ora al giorno con un adulto.", "SIP · Documento schermi"],
  ["Lettura condivisa ad alta voce fin dai primi mesi favorisce linguaggio e relazione.", "Nati per Leggere"],
  ["Seggiolino in senso contrario di marcia il più a lungo possibile, almeno fino ai 15 mesi.", "Regolamento ECE R129"],
  ["Esposizione solare: niente sole diretto sotto i 6 mesi; poi protezione alta e ombra nelle ore centrali.", "SIP · Pediatria preventiva"],
  ["Un singolo episodio di convulsione febbrile semplice non richiede EEG né terapia di profilassi.", "LICE · SIP"],
  ["Dermatite atopica: emollienti tutti i giorni, anche nelle fasi di benessere, sono la base della terapia.", "SIDerP"],
  ["Croup: desametasone orale in dose singola anche nelle forme lievi riduce ricorsi e ricoveri.", "Cochrane Review"],
  ["Ferro: nei nati pretermine o di basso peso è raccomandata la supplementazione dal primo mese.", "SIN · SIP"],
  ["La tosse nel bambino non va trattata con codeina o sedativi della tosse sotto i 12 anni.", "AIFA"],
  ["Il calendario vaccinale prevede la vaccinazione antinfluenzale per tutti i bambini tra 6 mesi e 6 anni.", "Ministero della Salute · Circolare influenza"],
  ["Anticorpo monoclonale contro l'RSV disponibile per i neonati nella loro prima stagione epidemica.", "Ministero della Salute"],
  ["Stitichezza funzionale: macrogol è il trattamento di prima linea, anche per lunghi periodi.", "ESPGHAN/NASPGHAN"],
  ["Sonno: tra 1 e 2 anni servono 11-14 ore nelle 24 ore, sonnellini compresi.", "American Academy of Sleep Medicine"],
  ["Attività fisica: almeno 60 minuti al giorno di movimento moderato-vigoroso dai 5 anni in su.", "OMS"],
  ["Acqua come bevanda principale: succhi e bevande zuccherate vanno evitati nei primi anni.", "SIP · Nutrizione"],
  ["Ogni bilancio di salute è l'occasione per verificare il libretto vaccinale e recuperare le dosi mancanti.", "PNPV 2023-2025"],
  ["Screening uditivo e visivo neonatale: verificare sempre l'esito nel primo bilancio.", "DPCM LEA"],
];

export const pillOfDay = (d = new Date()) => {
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return PILLS[day % PILLS.length];
};
