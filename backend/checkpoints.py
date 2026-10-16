YN = [("si", "Sì", True), ("a_volte", "A volte", False), ("no", "No", False)]
NY = [("no", "No", True), ("a_volte", "A volte", False), ("si", "Sì", False)]


def q(qid, area, text, tip, opts=YN):
    return {"id": qid, "area": area, "text": text, "tip": tip,
            "options": [{"value": v, "label": l, "ok": ok} for v, l, ok in opts]}


BANDS = [
    {"id": "0-6m", "label": "Primi 6 mesi", "from": 0, "to": 6, "next": "Bilancio di salute del 6° mese", "questions": [
        q("sorriso", "Sviluppo", "Sorride in risposta al vostro sorriso?", "Il sorriso sociale compare entro i 2-3 mesi: segnalarlo se assente."),
        q("sguardo", "Sviluppo", "Segue con lo sguardo un oggetto o il vostro volto?", "Valutare la visione alla prossima visita."),
        q("capo", "Sviluppo", "Tiene sollevato il capo quando è a pancia in giù?", "Proporre qualche minuto di 'tummy time' sorvegliato ogni giorno."),
        q("supino", "Sicurezza", "Dorme sempre a pancia in su, nel suo lettino?", "La posizione supina riduce il rischio di SIDS."),
        q("vitd", "Alimentazione", "Assume regolarmente la vitamina D?", "Confermare la profilassi con vitamina D come indicato dal pediatra."),
        q("fumo", "Sicurezza", "L'ambiente di casa è libero dal fumo?", "Il fumo passivo aumenta il rischio di infezioni respiratorie e SIDS."),
    ]},
    {"id": "6-12m", "label": "6 – 12 mesi", "from": 6, "to": 12, "next": "Bilancio di salute del 12° mese", "questions": [
        q("seduto", "Sviluppo", "Sta seduto senza appoggio?", "Da rivalutare se non acquisito entro i 9 mesi."),
        q("lallazione", "Linguaggio", "Fa lallazione (\"ba-ba\", \"ma-ma\")?", "Stimolare con lettura ad alta voce e canzoni."),
        q("nome", "Relazione", "Si gira quando lo chiamate per nome?", "Segnale importante da approfondire se assente."),
        q("svezzamento", "Alimentazione", "Lo svezzamento procede con alimenti vari?", "Introdurre gradualmente nuovi alimenti e consistenze."),
        q("seggiolino", "Sicurezza", "Viaggia sempre nel seggiolino in senso contrario di marcia?", "Rivedere l'uso corretto del seggiolino auto."),
        q("schermi", "Stile di vita", "È tenuto lontano da TV, tablet e smartphone?", "Sotto i 2 anni si consiglia di evitare gli schermi.", ),
    ]},
    {"id": "1-3a", "label": "1 – 3 anni", "from": 12, "to": 36, "next": "Bilancio di salute successivo (24-36 mesi)", "questions": [
        q("cammina", "Sviluppo", "Cammina da solo?", "Da approfondire se non cammina autonomamente entro i 18 mesi."),
        q("parole", "Linguaggio", "Usa parole o piccole frasi adatte all'età?", "Leggere insieme ogni giorno e valutare il linguaggio in visita."),
        q("indica", "Relazione", "Indica con il dito per mostrarvi qualcosa che lo interessa?", "L'indicare 'per condividere' è una tappa chiave: segnalarlo se assente."),
        q("gioco", "Relazione", "Gioca imitando voi o altri bambini?", "Favorire il gioco condiviso e simbolico."),
        q("schermi", "Stile di vita", "Il tempo davanti agli schermi è inferiore a 1 ora al giorno?", "Limitare gli schermi e privilegiare gioco e movimento."),
        q("verdura", "Alimentazione", "Mangia frutta e verdura ogni giorno?", "Proporre porzioni piccole e ripetute senza forzare."),
        q("sonno", "Sonno", "Dorme bene la maggior parte delle notti?", "Una routine serale costante aiuta il sonno."),
    ]},
    {"id": "3-6a", "label": "3 – 6 anni", "from": 36, "to": 72, "next": "Bilancio di salute dei 5-6 anni", "questions": [
        q("amici", "Relazione", "Gioca volentieri con i coetanei?", "Valutare l'inserimento alla scuola dell'infanzia."),
        q("linguaggio", "Linguaggio", "Il suo linguaggio è comprensibile anche agli estranei?", "Valutare l'eventuale invio logopedico."),
        q("sfinteri", "Sviluppo", "Ha raggiunto il controllo diurno della pipì?", "Approfondire se dopo i 4 anni persistono perdite diurne."),
        q("movimento", "Stile di vita", "Fa almeno 1-2 ore di gioco attivo al giorno?", "Il gioco all'aperto favorisce crescita e sonno."),
        q("schermi", "Stile di vita", "Gli schermi restano sotto 1 ora al giorno?", "Stabilire regole chiare e momenti senza schermi."),
        q("denti", "Salute orale", "Lava i denti due volte al giorno?", "Programmare la prima visita odontoiatrica se non ancora fatta."),
        q("vista", "Sviluppo", "Vede bene da lontano (riconosce oggetti e persone)?", "Programmare uno screening visivo."),
    ]},
    {"id": "6-11a", "label": "6 – 11 anni", "from": 72, "to": 144, "next": "Bilancio di salute successivo (8-10 anni)", "questions": [
        q("scuola", "Scuola", "Va volentieri a scuola senza difficoltà particolari?", "Approfondire eventuali difficoltà di apprendimento o attenzione."),
        q("sport", "Stile di vita", "Fa almeno 60 minuti di attività fisica al giorno?", "Incoraggiare sport o gioco attivo quotidiano."),
        q("schermi", "Stile di vita", "Gli schermi ricreativi restano sotto le 2 ore al giorno?", "Concordare in famiglia regole sull'uso dei dispositivi."),
        q("sonno", "Sonno", "Dorme almeno 9 ore per notte?", "Evitare schermi un'ora prima di dormire."),
        q("colazione", "Alimentazione", "Fa colazione ogni mattina?", "Una colazione regolare migliora energia e concentrazione."),
        q("bullismo", "Benessere emotivo", "Vi è mai sembrato preoccupato per episodi con i compagni?", "Esplorare con delicatezza eventuali episodi di bullismo.", NY),
    ]},
    {"id": "12-18a", "label": "12 – 18 anni", "from": 144, "to": 228, "next": "Bilancio adolescenziale annuale", "questions": [
        q("umore", "Benessere emotivo", "Nelle ultime 2 settimane si è sentito spesso giù o senza speranza?", "Valutare l'umore in un colloquio dedicato.", NY),
        q("interesse", "Benessere emotivo", "Ha perso interesse per attività che prima gli piacevano?", "Segnale da approfondire insieme al ragazzo.", NY),
        q("sonno", "Sonno", "Dorme almeno 8 ore per notte?", "Regolarità del sonno e niente schermi a letto."),
        q("sport", "Stile di vita", "Pratica attività fisica regolare?", "Incoraggiare uno sport gradito."),
        q("fumo", "Rischi", "Fuma sigarette, svapa o beve alcolici?", "Colloquio motivazionale sui rischi di fumo e alcol.", NY),
        q("corpo", "Benessere emotivo", "Esprime preoccupazioni eccessive per peso o aspetto fisico?", "Monitorare rapporto con il cibo e immagine corporea.", NY),
    ]},
]


def band_for(months: float):
    for b in BANDS:
        if b["from"] <= months < b["to"]:
            return b
    return BANDS[-1]


def evaluate(band, answers: dict):
    flags, areas = [], {}
    answered = 0
    ok_count = 0
    for qu in band["questions"]:
        val = answers.get(qu["id"])
        opt = next((o for o in qu["options"] if o["value"] == val), None)
        if not opt:
            continue
        answered += 1
        a = areas.setdefault(qu["area"], {"area": qu["area"], "ok": 0, "total": 0})
        a["total"] += 1
        if opt["ok"]:
            ok_count += 1
            a["ok"] += 1
        else:
            flags.append({"id": qu["id"], "area": qu["area"], "question": qu["text"], "answer": opt["label"], "tip": qu["tip"],
                          "level": "attenzione" if val == "a_volte" else "approfondire"})
    score = round(100 * ok_count / answered) if answered else 0
    status = "ottimo" if score >= 85 else "buono" if score >= 65 else "da approfondire"
    return {"score": score, "status": status, "answered": answered, "total": len(band["questions"]),
            "areas": list(areas.values()), "flags": flags}
