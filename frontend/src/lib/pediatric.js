import { isStructured, structuredTabs, moduleOf, visibleFields, valueText, structuredText } from "./modules";

const ALLERGIE = ["allergie", "Allergie e intolleranze", "Come riferite"];
const FARMACI = ["farmaci_in_uso", "Farmaci in uso", "Come riferiti"];
const EO = ["esame_obiettivo", "Esame obiettivo generale (condizioni generali)", ""];
export const TABS = [
  { id: "anamnesi", n: "01", label: "Anamnesi", fields: [["anamnesi_fisiologica", "Fisiologica", "Gravidanza, parto, sviluppo psicomotorio, vaccinazioni"], ["allattamento", "Allattamento", "Materno, artificiale, misto · durata"], ["svezzamento", "Svezzamento", "Età d'inizio, alimenti introdotti, tolleranza"], ALLERGIE, FARMACI] },
  { id: "motivo", n: "02", label: "Motivo e sintomi", fields: [["motivo_visita", "Motivo della visita", ""], ["sintomi", "Sintomi", "Esordio, durata, febbre, andamento"]] },
  { id: "esame", n: "03", label: "Esame obiettivo", fields: [EO, ["torl", "TORL", "Otoscopia, faringe, rinofaringe, linfonodi"], ["torace_auscultazione", "Torace · Auscultazione", "MV, rumori aggiunti, toni cardiaci"], ["addome", "Addome", "Trattabilità, organomegalie, dolorabilità"]] },
  { id: "crescita", n: "04", label: "Crescita", fields: [] },
  { id: "terapia", n: "05", label: "Diagnosi e terapia", fields: [["diagnosi", "Diagnosi", ""], ["terapia", "Terapia e indicazioni", ""], ["follow_up", "Follow-up", ""]] },
];

export const MODULE_KEYS = new Set(["allattamento", "svezzamento", "torl", "torace_auscultazione", "addome"]);
export const getField = (note, k) => (MODULE_KEYS.has(k) ? note?.modulo?.campi?.[k] ?? note?.[k] : note?.[k]);
export const setField = (n, k, v) => (MODULE_KEYS.has(k) ? { ...n, modulo: { ...(n.modulo ?? { id: "pediatria", versione: 1 }), campi: { ...(n.modulo?.campi ?? {}), [k]: v } } } : { ...n, [k]: v });

export const isPediatric = (note) => (note?.modulo?.id ? note.modulo.id === "pediatria" : !note?.specialita || /pediatr|neonatolog/i.test(note.specialita));

// Struttura neutrale per le altre specializzazioni: campi comuni + voci specialistiche generate dall'IA (note.sezioni)
const SPECIALIST_TABS = [
  { id: "anamnesi", n: "01", label: "Anamnesi", group: "anamnesi", fields: [["anamnesi_fisiologica", "Anamnesi", "Patologica remota e prossima, familiarità"], ALLERGIE, FARMACI] },
  { id: "motivo", n: "02", label: "Motivo e sintomi", group: "sintomi", fields: [["motivo_visita", "Motivo della visita", ""], ["sintomi", "Sintomi", "Esordio, durata, caratteristiche"]] },
  { id: "esame", n: "03", label: "Esame obiettivo", group: "esame_obiettivo", fields: [EO] },
  { id: "crescita", n: "04", label: "Parametri", group: "parametri_vitali", fields: [] },
  { id: "terapia", n: "05", label: "Diagnosi e terapia", group: "altro", fields: [["diagnosi", "Diagnosi", ""], ["terapia", "Terapia e indicazioni", ""], ["follow_up", "Follow-up", ""]] },
];
const PED_GROUPS = { anamnesi: "anamnesi", motivo: "sintomi", esame: "esame_obiettivo", crescita: "parametri_vitali", terapia: "altro" };
// Personalizzazione salvata nella visita: campi del modulo nascosti (se vuoti) e riordinati
const applyLayout = (fields, note) => {
  const hid = note?.modulo?.nascosti ?? [];
  const order = note?.modulo?.ordine ?? [];
  const mods = fields.filter(([k]) => MODULE_KEYS.has(k) && !(hid.includes(k) && !String(getField(note, k) ?? "").trim()))
    .sort((a, b) => (order.includes(a[0]) ? order.indexOf(a[0]) : 99) - (order.includes(b[0]) ? order.indexOf(b[0]) : 99));
  let i = 0;
  return fields.flatMap((f) => (MODULE_KEYS.has(f[0]) ? (i < mods.length ? [mods[i++]] : []) : [f])).concat(mods.slice(i));
};
export const tabsFor = (note, cat) => {
  if (isStructured(note)) return structuredTabs(moduleOf(cat, note), note);
  return isPediatric(note) ? TABS.map((t) => ({ ...t, group: PED_GROUPS[t.id], fields: applyLayout(t.fields, note) })) : SPECIALIST_TABS;
};

const filled = (v) => Boolean(v && String(v).trim() && String(v).trim() !== "Non riportato");

export const tabDone = (tab, note, cat) => {
  if (isStructured(note) && visibleFields(moduleOf(cat, note), note, tab.mgroup).some((f) => filled(valueText(f, note.modulo?.campi?.[f.key])))) return true;
  if (tab.id === "crescita") return Boolean(note?.crescita?.peso_kg) || (note?.sezioni ?? []).some((x) => x.gruppo === tab.group && filled(x.testo));
  return tab.fields.some(([k]) => filled(getField(note, k))) || (note?.sezioni ?? []).some((x) => x.gruppo === tab.group && filled(x.testo));
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

export const noteToText = (c, note, cat) => {
  if (isStructured(note)) return structuredText(c, note, moduleOf(cat, note));
  const g = note?.crescita ?? {};
  const block = (t, rows) => `${t.toUpperCase()}\n${rows.filter(Boolean).join("\n")}`;
  const txt = (k, l) => `${l}: ${getField(note, k) || "—"}`;
  const drugs = (note?.farmaci ?? []).map((d) => {
    const x = doseFor(d, g.peso_kg);
    return `• ${d.nome}${x ? ` — ${r1(x.mg)} mg/dose${x.ml ? ` (${r1(x.ml)} ml)` : ""}${d.dosi_giorno ? ` × ${d.dosi_giorno}/die` : ""}${d.giorni ? ` per ${d.giorni} gg` : ""}` : ""}${d.note ? ` · ${d.note}` : ""}`;
  });
  const sez = (...gs) => (note?.sezioni ?? []).filter((x) => gs.includes(x.gruppo)).map((x) => `${x.titolo}: ${x.testo || "—"}`);
  if (!isPediatric(note)) {
    return [
      `${c.patient_name} — ${new Date(c.created_at).toLocaleString("it-IT")} · ${note.specialita}`,
      block("1. Anamnesi", [txt("anamnesi_fisiologica", "Anamnesi"), ...sez("anamnesi")]),
      block("2. Motivo della visita e sintomi", [txt("motivo_visita", "Motivo"), txt("sintomi", "Sintomi"), ...sez("sintomi")]),
      block("3. Esame obiettivo", sez("esame_obiettivo")),
      ...(sez("parametri_vitali").length ? [block("Parametri vitali", sez("parametri_vitali"))] : []),
      block("4. Diagnosi e terapia", [txt("diagnosi", "Diagnosi"), txt("terapia", "Terapia"), ...drugs, ...sez("altro"), txt("follow_up", "Follow-up")]),
    ].join("\n\n");
  }
  return [
    `${c.patient_name} — ${new Date(c.created_at).toLocaleString("it-IT")}`,
    block("1. Anamnesi", [txt("anamnesi_fisiologica", "Fisiologica"), txt("allattamento", "Allattamento"), txt("svezzamento", "Svezzamento"), ...sez("anamnesi")]),
    block("2. Motivo della visita e sintomi", [txt("motivo_visita", "Motivo"), txt("sintomi", "Sintomi"), ...sez("sintomi")]),
    block("3. Esame obiettivo", [txt("torl", "TORL"), txt("torace_auscultazione", "Torace/Auscultazione"), txt("addome", "Addome"), ...sez("esame_obiettivo", "altro")]),
    block("4. Parametri di crescita", [`Età: ${g.eta_mesi ?? "—"} mesi · Sesso: ${g.sesso || "—"}`, `Peso: ${g.peso_kg ?? "—"} kg (${g.percentile_peso || "—"}) · Altezza: ${g.altezza_cm ?? "—"} cm (${g.percentile_altezza || "—"})`, `Circ. cranica: ${g.circonferenza_cranica_cm ?? "—"} cm (${g.percentile_cc || "—"}) · BMI: ${r1(bmi(g))}`, ...sez("parametri_vitali")]),
    block("5. Diagnosi e terapia", [txt("diagnosi", "Diagnosi"), txt("terapia", "Terapia"), ...drugs, txt("follow_up", "Follow-up")]),
  ].join("\n\n");
};
