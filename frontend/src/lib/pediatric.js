export const TABS = [
  { id: "anamnesi", n: "01", label: "Anamnesi", fields: [["anamnesi_fisiologica", "Fisiologica", "Gravidanza, parto, sviluppo psicomotorio, vaccinazioni"], ["allattamento", "Allattamento", "Materno, artificiale, misto · durata"], ["svezzamento", "Svezzamento", "Età d'inizio, alimenti introdotti, tolleranza"]] },
  { id: "motivo", n: "02", label: "Motivo e sintomi", fields: [["motivo_visita", "Motivo della visita", ""], ["sintomi", "Sintomi", "Esordio, durata, febbre, andamento"]] },
  { id: "esame", n: "03", label: "Esame obiettivo", fields: [["torl", "TORL", "Otoscopia, faringe, rinofaringe, linfonodi"], ["torace_auscultazione", "Torace · Auscultazione", "MV, rumori aggiunti, toni cardiaci"], ["addome", "Addome", "Trattabilità, organomegalie, dolorabilità"]] },
  { id: "crescita", n: "04", label: "Crescita", fields: [] },
  { id: "terapia", n: "05", label: "Diagnosi e terapia", fields: [["diagnosi", "Diagnosi", ""], ["terapia", "Terapia e indicazioni", ""], ["follow_up", "Follow-up", ""]] },
];

const filled = (v) => Boolean(v && String(v).trim() && String(v).trim() !== "Non riportato");

export const tabDone = (tab, note) => {
  if (tab.id === "crescita") return Boolean(note?.crescita?.peso_kg);
  return tab.fields.some(([k]) => filled(note?.[k]));
};

export const bmi = (g) => (g?.peso_kg && g?.altezza_cm ? g.peso_kg / (g.altezza_cm / 100) ** 2 : null);

export const doseFor = (d, peso) => {
  if (!peso || !d?.mg_kg_dose) return null;
  const raw = d.mg_kg_dose * peso;
  const mg = d.max_mg_dose ? Math.min(raw, d.max_mg_dose) : raw;
  return {
    mg,
    capped: Boolean(d.max_mg_dose && raw > d.max_mg_dose),
    ml: d.concentrazione_mg_ml ? mg / d.concentrazione_mg_ml : null,
    daily: d.dosi_giorno ? mg * d.dosi_giorno : null,
  };
};

const r1 = (n) => (n == null ? "—" : (Math.round(n * 10) / 10).toLocaleString("it-IT"));
export { r1 };

export const noteToText = (c, note) => {
  const g = note?.crescita ?? {};
  const block = (t, rows) => `${t.toUpperCase()}\n${rows.filter(Boolean).join("\n")}`;
  const txt = (k, l) => `${l}: ${note?.[k] || "—"}`;
  const drugs = (note?.farmaci ?? []).map((d) => {
    const x = doseFor(d, g.peso_kg);
    return `• ${d.nome}${x ? ` — ${r1(x.mg)} mg/dose${x.ml ? ` (${r1(x.ml)} ml)` : ""}${d.dosi_giorno ? ` × ${d.dosi_giorno}/die` : ""}${d.giorni ? ` per ${d.giorni} gg` : ""}` : ""}${d.note ? ` · ${d.note}` : ""}`;
  });
  return [
    `${c.patient_name} — ${new Date(c.created_at).toLocaleString("it-IT")}`,
    block("1. Anamnesi", [txt("anamnesi_fisiologica", "Fisiologica"), txt("allattamento", "Allattamento"), txt("svezzamento", "Svezzamento")]),
    block("2. Motivo della visita e sintomi", [txt("motivo_visita", "Motivo"), txt("sintomi", "Sintomi")]),
    block("3. Esame obiettivo", [txt("torl", "TORL"), txt("torace_auscultazione", "Torace/Auscultazione"), txt("addome", "Addome")]),
    block("4. Parametri di crescita", [`Età: ${g.eta_mesi ?? "—"} mesi · Sesso: ${g.sesso || "—"}`, `Peso: ${g.peso_kg ?? "—"} kg (${g.percentile_peso || "—"}) · Altezza: ${g.altezza_cm ?? "—"} cm (${g.percentile_altezza || "—"})`, `Circ. cranica: ${g.circonferenza_cranica_cm ?? "—"} cm (${g.percentile_cc || "—"}) · BMI: ${r1(bmi(g))}`]),
    block("5. Diagnosi e terapia", [txt("diagnosi", "Diagnosi"), txt("terapia", "Terapia"), ...drugs, txt("follow_up", "Follow-up")]),
  ].join("\n\n");
};
